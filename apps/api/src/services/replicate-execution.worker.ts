// R9.2-P3A-REPLICATE-ONCE-MASTER-WORKER
//
// Internal, non-routed worker that takes ONE already-existing, server-created
// `ReplicateExecution` row and drives it to a permanent master:
//
//   load context -> verify the whole paid chain -> atomically claim
//   (QUEUED -> PROCESSING) -> EXACTLY ONE Replicate provider call ->
//   validate the returned bytes -> upload EXACTLY ONE permanent master
//   object -> commit completion metadata (RestorationMaster VALIDATED +
//   ReplicateExecution SUCCEEDED).
//
// Deliberate non-goals of this packet (do not add them here):
//   * It never CREATES a ReplicateExecution, RestorationMaster,
//     RestorationEntitlement, PaymentAttempt, or FixedOrder.
//   * It never builds a Sharp digital variant (`ImageVariant`), grants a
//     `DigitalEntitlement`/`PrintEntitlement`, or touches fulfilment.
//   * It is not exported from any controller/route/queue processor. No public,
//     customer, or admin HTTP surface can reach it. Activating live customer
//     processing is a separate, later, authorized packet.
//   * It never routes to RunPod: the provider selection is asserted to be
//     "replicate" before anything is claimed, and there is no fallback,
//     retry, or second dispatch anywhere in this file.
//
// Privacy: no log line, error message, or persisted `failureReason` produced
// here contains image bytes, base64, a signed URL, a storage key, a token, a
// credential, or a raw provider response. Failures are recorded as fixed
// reason CODES from `ReplicateExecutionFailureCode` only.
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import { detectImageMime, type SupportedDownloadMime } from "../utils/image-binary";
import {
  assertFirstRestorationExecutionEligible,
  validateMarketCurrencyPair,
  validateOneCallExecutionClaim,
  type FixedOrderCurrency,
  type FixedOrderType,
  type Market
} from "../domain/fixedOrder/fixedOrderGuards";
import type { ProviderExecutionPort } from "../restoration-providers/pipeline/RestorationExecutionPorts";
import type { RestorationProviderSelection } from "../restoration-providers/pipeline/RestorationProviderRouter";
import type { PipelineResult } from "../restoration-providers/pipeline/PipelineOrchestrator";
import type { StorageService } from "./storage.service";

// ---------------------------------------------------------------------------
// Output bounds
// ---------------------------------------------------------------------------

/**
 * The provider OUTPUT is not subject to the 10 MB free-upload input cap
 * (`MAX_DRAFT_UPLOAD_BYTES`): a restored master is an upscaled, re-encoded
 * image and is legitimately larger than the customer's input. It still needs
 * a hard ceiling so a malformed/hostile provider response can never be
 * buffered, hashed, or uploaded unbounded. 40 MB is 4x the input cap and
 * comfortably above any real CodeFormer/Flux master.
 */
export const MAX_MASTER_OUTPUT_BYTES = 40 * 1024 * 1024;

/**
 * Pixel budget is deliberately the SAME 30 MP bound used for uploads
 * (`MAX_DRAFT_UPLOAD_PIXELS`): the restoration pipeline does not enlarge
 * beyond that, and a decoded pixel count above it indicates a decompression
 * bomb rather than a legitimate master.
 */
export const MAX_MASTER_OUTPUT_PIXELS = 30_000_000;

// ---------------------------------------------------------------------------
// Outcomes / reason codes (privacy-safe, fixed vocabulary)
// ---------------------------------------------------------------------------

export type ReplicateExecutionOutcome =
  | "NOT_FOUND"
  | "INELIGIBLE"
  | "PROVIDER_NOT_AUTHORIZED"
  | "CLAIM_LOST"
  | "SOURCE_UNAVAILABLE"
  | "PROVIDER_FAILED"
  | "VALIDATION_FAILED"
  | "UPLOAD_FAILED"
  | "COMMIT_FAILED_COMPENSATED"
  | "COMMIT_FAILED_ORPHAN_NEEDS_CLEANUP"
  | "SUCCEEDED";

/** Persisted verbatim into `ReplicateExecution.failureReason`. Codes only -- never free-form provider text. */
export type ReplicateExecutionFailureCode =
  | "SOURCE_UNAVAILABLE"
  | "PROVIDER_CALL_FAILED"
  | "OUTPUT_VALIDATION_FAILED"
  | "MASTER_UPLOAD_FAILED"
  | "COMMIT_FAILED_ORPHAN_DELETED"
  | "COMMIT_FAILED_ORPHAN_NEEDS_CLEANUP";

export interface ReplicateExecutionWorkerResult {
  outcome: ReplicateExecutionOutcome;
  executionId: string;
  /** Present only for INELIGIBLE; a short, non-sensitive explanation of which chain invariant failed. */
  ineligibleReasons?: string[];
  /** Present only for SUCCEEDED. */
  master?: {
    restorationMasterId: string;
    sha256: string;
    width: number;
    height: number;
    contentType: SupportedDownloadMime;
    providerRequestRef: string;
  };
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

export type ReplicateExecutionStatusValue = "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
export type RestorationMasterStatusValue = "NOT_STARTED" | "PROCESSING" | "VALIDATED" | "FAILED";
export type RestorationEntitlementStatusValue = "GRANTED" | "CONSUMED" | "REVOKED";

export interface ReplicateExecutionContext {
  executionId: string;
  executionStatus: ReplicateExecutionStatusValue;
  idempotencyKey: string;
  restorationMasterId: string;
  masterStatus: RestorationMasterStatusValue;
  masterStorageKey: string | null;
  restorationEntitlementId: string;
  entitlementStatus: RestorationEntitlementStatusValue;
  order: {
    id: string;
    type: string;
    status: string;
    market: string;
    currency: string;
  };
  paymentAttemptStatus: string | null;
  draft: {
    id: string;
    originalStorageKey: string;
    originalMimeType: string | null;
  } | null;
}

export interface CommitMasterParams {
  executionId: string;
  restorationMasterId: string;
  storageKey: string;
  sha256: string;
  width: number;
  height: number;
  contentType: string;
  providerRequestRef: string;
}

export interface ReplicateExecutionRepositoryPort {
  /** Reads the full execution -> master -> entitlement -> order chain. Returns null when the execution does not exist. */
  loadContext(executionId: string): Promise<ReplicateExecutionContext | null>;
  /**
   * Atomic, all-or-nothing claim. MUST be a single conditional update
   * guarded on `status = QUEUED` and MUST return the number of rows it
   * actually transitioned (0 or 1). Exactly one concurrent caller can see 1.
   */
  claimQueued(executionId: string, startedAt: Date): Promise<number>;
  /** Marks master VALIDATED + execution SUCCEEDED in one transaction. Only ever called after a successful upload. */
  commitSuccess(params: CommitMasterParams): Promise<void>;
  /** Marks master FAILED + execution FAILED with a fixed reason code. Never records a partial/valid master. */
  markFailed(executionId: string, restorationMasterId: string, code: ReplicateExecutionFailureCode): Promise<void>;
}

export interface MasterUploadResult {
  key: string;
}

export interface MasterPersistencePort {
  /** Downloads the customer's source image for the provider call. */
  downloadSource(storageKey: string): Promise<Buffer>;
  /** Uploads EXACTLY ONE permanent master object under a server-generated key. */
  uploadMaster(params: { restorationMasterId: string; body: Buffer; contentType: string }): Promise<MasterUploadResult>;
  /** Bounded compensation for an orphaned object. Exactly one attempt; never retried. */
  deleteObject(storageKey: string): Promise<void>;
}

export interface ReplicateExecutionWorkerDeps {
  repository: ReplicateExecutionRepositoryPort;
  persistence: MasterPersistencePort;
  /** The Replicate-only provider seam (`RestorationProviderRouter` in production). Called at most once. */
  providerExecutor: ProviderExecutionPort;
  /**
   * Mirrors AppConfig.restorationProvider. Anything other than "replicate" or
   * "mock" fails closed before any claim. Production topology is unaffected
   * by the "mock" allowance: `p4b-worker-runner-main.ts` (the only process
   * that ever drives this worker in production) refuses to start unless this
   * value is exactly "replicate", so a live deployment can never construct
   * this worker with "mock" in the first place. "mock" exists only so
   * `p4b-worker-runner-mock-local.ts` -- a separate, non-production,
   * triple-guarded process -- can drive the identical claim/eligibility/
   * completion logic against the mock provider for a disposable local E2E
   * harness, without duplicating this file.
   */
  providerSelection: RestorationProviderSelection;
}

// ---------------------------------------------------------------------------
// Output validation (reuses the Audit-A magic-byte detector; no duplication)
// ---------------------------------------------------------------------------

export class ReplicateOutputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplicateOutputValidationError";
  }
}

export interface ValidatedMasterOutput {
  contentType: SupportedDownloadMime;
  width: number;
  height: number;
  sha256: string;
}

const ORIENTATION_SWAPS_DIMENSIONS = new Set([5, 6, 7, 8]);

/**
 * Validates the DECODED provider output before anything is written anywhere:
 * non-empty, byte-size cap, magic-byte format check (never the provider's
 * declared content type), real `sharp` decode, orientation-corrected
 * dimensions, per-page pixel budget, and a SHA-256 computed over the exact
 * bytes that will be uploaded. The message text is a fixed phrase -- it never
 * embeds bytes, base64, or provider payload text.
 */
export async function validateReplicateMasterOutput(body: Buffer): Promise<ValidatedMasterOutput> {
  if (!body || body.length === 0) {
    throw new ReplicateOutputValidationError("provider output is empty");
  }
  if (body.length > MAX_MASTER_OUTPUT_BYTES) {
    throw new ReplicateOutputValidationError("provider output exceeds the permitted master byte size");
  }

  const contentType = detectImageMime(body);
  if (!contentType) {
    throw new ReplicateOutputValidationError("provider output is not a recognized JPEG/PNG/WebP image");
  }

  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(body).metadata();
  } catch {
    throw new ReplicateOutputValidationError("provider output could not be decoded");
  }

  let width = metadata.width;
  let height = metadata.height;
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new ReplicateOutputValidationError("provider output has no usable dimensions");
  }
  if (metadata.orientation && ORIENTATION_SWAPS_DIMENSIONS.has(metadata.orientation)) {
    [width, height] = [height, width];
  }

  const pages = typeof metadata.pages === "number" && Number.isFinite(metadata.pages) && metadata.pages > 1 ? metadata.pages : 1;
  if (width * height * pages > MAX_MASTER_OUTPUT_PIXELS) {
    throw new ReplicateOutputValidationError("provider output exceeds the permitted master pixel budget");
  }

  const sha256 = createHash("sha256").update(body).digest("hex");
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new ReplicateOutputValidationError("provider output hash is malformed");
  }

  return { contentType, width, height, sha256 };
}

// ---------------------------------------------------------------------------
// Eligibility (pure; reuses the P0A fixed-order guards)
// ---------------------------------------------------------------------------

/** FixedOrder statuses that genuinely mean "payment verified, restoration may run". */
const EXECUTION_ELIGIBLE_ORDER_STATUSES: readonly string[] = ["PAYMENT_VERIFIED", "LOCKED"];

/** The only PaymentAttempt status that means the customer actually paid. */
const PAID_ATTEMPT_STATUS = "PAID";

/** A master that is already VALIDATED (or FAILED) must never be re-executed. */
const EXECUTABLE_MASTER_STATUSES: readonly RestorationMasterStatusValue[] = ["NOT_STARTED", "PROCESSING"];

export function computeExecutionIneligibilityReasons(ctx: ReplicateExecutionContext): string[] {
  const reasons: string[] = [];

  if (ctx.executionStatus !== "QUEUED") {
    reasons.push(`execution status ${ctx.executionStatus} is not eligible for dispatch`);
  }
  if (!EXECUTABLE_MASTER_STATUSES.includes(ctx.masterStatus)) {
    reasons.push(`restoration master status ${ctx.masterStatus} is not eligible for dispatch`);
  }
  if (ctx.entitlementStatus !== "GRANTED") {
    reasons.push(`restoration entitlement status ${ctx.entitlementStatus} is not GRANTED`);
  }

  // Add-on order types (DIGITAL_UPGRADE / PRINT_ADD_ON) can never own a first
  // restoration execution. `existingEntitlementId: null` is correct here: the
  // entitlement being executed is this execution's OWN entitlement, and we are
  // only asking the type question, not the create-a-second question.
  try {
    assertFirstRestorationExecutionEligible(ctx.order.type as FixedOrderType, { existingEntitlementId: null });
  } catch (err) {
    reasons.push(err instanceof Error ? err.message : "order type is not eligible for restoration execution");
  }

  if (!EXECUTION_ELIGIBLE_ORDER_STATUSES.includes(ctx.order.status)) {
    reasons.push(`fixed order status ${ctx.order.status} is not a verified-payment status`);
  }
  if (ctx.paymentAttemptStatus !== PAID_ATTEMPT_STATUS) {
    reasons.push(`payment attempt status ${ctx.paymentAttemptStatus ?? "MISSING"} is not ${PAID_ATTEMPT_STATUS}`);
  }

  try {
    validateMarketCurrencyPair(ctx.order.market as Market, ctx.order.currency as FixedOrderCurrency);
  } catch {
    reasons.push(`invalid market/currency pairing: market=${ctx.order.market} currency=${ctx.order.currency}`);
  }

  // The one-call idempotency key must be exactly the deterministic key derived
  // from this master -- a mismatch means something tried to mint a second,
  // different execution for the same master.
  try {
    validateOneCallExecutionClaim(ctx.restorationMasterId, {
      restorationMasterId: ctx.restorationMasterId,
      idempotencyKey: ctx.idempotencyKey
    });
  } catch (err) {
    reasons.push(err instanceof Error ? err.message : "execution idempotency claim is invalid");
  }

  if (ctx.masterStorageKey) {
    reasons.push("restoration master already has a persisted object; a second master is not permitted");
  }
  if (!ctx.draft || !ctx.draft.originalStorageKey) {
    reasons.push("restoration entitlement has no source draft image");
  }

  return reasons;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export class ReplicateExecutionWorker {
  constructor(private readonly deps: ReplicateExecutionWorkerDeps) {}

  /**
   * Processes ONE already-existing execution id. Never creates an execution.
   * Returns a truthful outcome; it throws only for programmer errors, never
   * to signal a business failure, and it NEVER reports success unless the
   * completion commit actually succeeded.
   */
  async processReplicateExecution(executionId: string): Promise<ReplicateExecutionWorkerResult> {
    if (typeof executionId !== "string" || executionId.trim().length === 0) {
      throw new TypeError("executionId is required");
    }

    // Invariant: this worker only ever runs against "replicate" (production)
    // or "mock" (disposable local E2E harness only -- see the deps doc
    // comment above). Assert BEFORE any claim so a misconfigured selection
    // can never consume a queued execution.
    if (this.deps.providerSelection !== "replicate" && this.deps.providerSelection !== "mock") {
      logger.warn("P3A worker refused: provider selection is not replicate or mock", {
        executionId,
        providerSelection: this.deps.providerSelection
      });
      return { outcome: "PROVIDER_NOT_AUTHORIZED", executionId };
    }

    const ctx = await this.deps.repository.loadContext(executionId);
    if (!ctx) {
      logger.warn("P3A worker: execution not found", { executionId });
      return { outcome: "NOT_FOUND", executionId };
    }

    const ineligibleReasons = computeExecutionIneligibilityReasons(ctx);
    if (ineligibleReasons.length > 0) {
      // No claim, no provider call, and no status mutation: an ineligible
      // execution is left exactly as it was found.
      logger.warn("P3A worker: execution is not eligible for dispatch", {
        executionId,
        reasonCount: ineligibleReasons.length
      });
      return { outcome: "INELIGIBLE", executionId, ineligibleReasons };
    }

    // Atomic, all-or-nothing claim. Exactly one concurrent caller observes 1.
    const claimed = await this.deps.repository.claimQueued(executionId, new Date());
    if (claimed !== 1) {
      logger.info("P3A worker: claim lost, another worker owns this execution", { executionId });
      return { outcome: "CLAIM_LOST", executionId };
    }

    const draft = ctx.draft as NonNullable<ReplicateExecutionContext["draft"]>;

    let sourceBytes: Buffer;
    try {
      sourceBytes = await this.deps.persistence.downloadSource(draft.originalStorageKey);
    } catch {
      await this.failClosed(ctx, "SOURCE_UNAVAILABLE");
      return { outcome: "SOURCE_UNAVAILABLE", executionId };
    }

    // ---- EXACTLY ONE provider call. No retry, no fallback, no second tier.
    let pipelineResult: PipelineResult;
    try {
      pipelineResult = await this.deps.providerExecutor.execute(
        {
          image: sourceBytes,
          contentType: draft.originalMimeType ?? "image/jpeg",
          fileName: `restoration-master-${ctx.restorationMasterId}.jpg`
        },
        "replicate"
      );
    } catch {
      await this.failClosed(ctx, "PROVIDER_CALL_FAILED");
      return { outcome: "PROVIDER_FAILED", executionId };
    }

    let validated: ValidatedMasterOutput;
    try {
      validated = await validateReplicateMasterOutput(pipelineResult.final?.image as Buffer);
    } catch {
      await this.failClosed(ctx, "OUTPUT_VALIDATION_FAILED");
      return { outcome: "VALIDATION_FAILED", executionId };
    }

    // ---- Validation passed: upload EXACTLY ONE permanent master object.
    let upload: MasterUploadResult;
    try {
      upload = await this.deps.persistence.uploadMaster({
        restorationMasterId: ctx.restorationMasterId,
        body: pipelineResult.final.image,
        contentType: validated.contentType
      });
    } catch {
      await this.failClosed(ctx, "MASTER_UPLOAD_FAILED");
      return { outcome: "UPLOAD_FAILED", executionId };
    }

    const providerRequestRef = deriveProviderRequestRef(pipelineResult);

    // ---- Commit only after BOTH validation and upload succeeded.
    try {
      await this.deps.repository.commitSuccess({
        executionId,
        restorationMasterId: ctx.restorationMasterId,
        storageKey: upload.key,
        sha256: validated.sha256,
        width: validated.width,
        height: validated.height,
        contentType: validated.contentType,
        providerRequestRef
      });
    } catch {
      // The object is in storage but the DB never recorded it. Bounded
      // compensation: exactly ONE delete attempt, never retried. Either way
      // this returns a failure -- success is never reported.
      let compensated = false;
      try {
        await this.deps.persistence.deleteObject(upload.key);
        compensated = true;
      } catch {
        compensated = false;
      }
      const code: ReplicateExecutionFailureCode = compensated
        ? "COMMIT_FAILED_ORPHAN_DELETED"
        : "COMMIT_FAILED_ORPHAN_NEEDS_CLEANUP";
      await this.failClosed(ctx, code);
      logger.error("P3A worker: completion commit failed after upload", { executionId, compensated });
      return {
        outcome: compensated ? "COMMIT_FAILED_COMPENSATED" : "COMMIT_FAILED_ORPHAN_NEEDS_CLEANUP",
        executionId
      };
    }

    logger.info("P3A worker: master persisted", {
      executionId,
      restorationMasterId: ctx.restorationMasterId,
      width: validated.width,
      height: validated.height,
      contentType: validated.contentType
    });

    return {
      outcome: "SUCCEEDED",
      executionId,
      master: {
        restorationMasterId: ctx.restorationMasterId,
        sha256: validated.sha256,
        width: validated.width,
        height: validated.height,
        contentType: validated.contentType,
        providerRequestRef
      }
    };
  }

  /** Records the fixed failure code. A failure here is logged, never rethrown as false success. */
  private async failClosed(ctx: ReplicateExecutionContext, code: ReplicateExecutionFailureCode): Promise<void> {
    try {
      await this.deps.repository.markFailed(ctx.executionId, ctx.restorationMasterId, code);
    } catch {
      logger.error("P3A worker: failed to record execution failure state", { executionId: ctx.executionId, code });
    }
  }
}

/** Provider reference is an opaque id/name only -- never a URL, payload, or credential. */
export function deriveProviderRequestRef(result: PipelineResult): string {
  const final = result.final;
  const requestId = typeof final?.requestId === "string" ? final.requestId.trim() : "";
  if (requestId) return requestId.slice(0, 128);
  const name = typeof final?.providerName === "string" ? final.providerName.trim() : "";
  return (name || "replicate").slice(0, 128);
}

// ---------------------------------------------------------------------------
// Default (production-shaped) adapters. Constructed by nothing in this packet.
// ---------------------------------------------------------------------------

export class PrismaReplicateExecutionRepository implements ReplicateExecutionRepositoryPort {
  async loadContext(executionId: string): Promise<ReplicateExecutionContext | null> {
    const row = await prisma.replicateExecution.findUnique({
      where: { id: executionId },
      include: {
        restorationMaster: {
          include: {
            restorationEntitlement: {
              include: {
                draft: true,
                fixedOrder: { include: { paymentAttempt: true } }
              }
            }
          }
        }
      }
    });
    if (!row) return null;

    const master = row.restorationMaster;
    const entitlement = master.restorationEntitlement;
    const order = entitlement.fixedOrder;
    const draft = entitlement.draft;

    return {
      executionId: row.id,
      executionStatus: row.status as ReplicateExecutionStatusValue,
      idempotencyKey: row.idempotencyKey,
      restorationMasterId: master.id,
      masterStatus: master.status as RestorationMasterStatusValue,
      masterStorageKey: master.storageKey,
      restorationEntitlementId: entitlement.id,
      entitlementStatus: entitlement.status as RestorationEntitlementStatusValue,
      order: {
        id: order.id,
        type: order.type,
        status: order.status,
        market: order.market,
        currency: order.currency
      },
      paymentAttemptStatus: order.paymentAttempt?.status ?? null,
      draft: draft
        ? { id: draft.id, originalStorageKey: draft.originalStorageKey, originalMimeType: draft.originalMimeType }
        : null
    };
  }

  /**
   * The atomic claim. A single conditional `updateMany` guarded on
   * `status: "QUEUED"` compiles to one `UPDATE ... WHERE id = $1 AND status =
   * 'QUEUED'`, which Postgres serializes per row: concurrent callers produce
   * exactly one `count === 1` and the rest see `count === 0`.
   */
  async claimQueued(executionId: string, startedAt: Date): Promise<number> {
    const result = await prisma.replicateExecution.updateMany({
      where: { id: executionId, status: "QUEUED" },
      data: { status: "PROCESSING", startedAt }
    });
    return result.count;
  }

  async commitSuccess(params: CommitMasterParams): Promise<void> {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.restorationMaster.update({
        where: { id: params.restorationMasterId },
        data: {
          storageKey: params.storageKey,
          sha256: params.sha256,
          width: params.width,
          height: params.height,
          contentType: params.contentType,
          status: "VALIDATED",
          validatedAt: now
        }
      });
      await tx.replicateExecution.update({
        where: { id: params.executionId },
        data: {
          status: "SUCCEEDED",
          outputSha256: params.sha256,
          providerRequestRef: params.providerRequestRef,
          failureReason: null,
          completedAt: now
        }
      });
    });
  }

  async markFailed(
    executionId: string,
    restorationMasterId: string,
    code: ReplicateExecutionFailureCode
  ): Promise<void> {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.restorationMaster.update({
        where: { id: restorationMasterId },
        data: { status: "FAILED" }
      });
      await tx.replicateExecution.update({
        where: { id: executionId },
        data: { status: "FAILED", failureReason: code, completedAt: now }
      });
    });
  }
}

export class R2MasterPersistence implements MasterPersistencePort {
  constructor(private readonly storage: StorageService) {}

  async downloadSource(storageKey: string): Promise<Buffer> {
    const result = await this.storage.downloadFile(storageKey);
    return result.body;
  }

  /**
   * Server-generated key only. Mirrors `StorageService.uploadOriginal`'s
   * pattern exactly: the caller supplies a prefix + file name, and
   * `buildStorageKey` inside StorageService adds the timestamp/uuid and
   * sanitizes the name. No client-supplied name ever reaches this.
   */
  async uploadMaster(params: { restorationMasterId: string; body: Buffer; contentType: string }): Promise<MasterUploadResult> {
    const extension = params.contentType === "image/png" ? "png" : params.contentType === "image/webp" ? "webp" : "jpg";
    const result = await this.storage.uploadFile({
      keyPrefix: "finals",
      fileName: `restoration-master-${params.restorationMasterId}-${randomUUID()}.${extension}`,
      body: params.body,
      contentType: params.contentType
    });
    return { key: result.key };
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.storage.deleteFile(storageKey);
  }
}
