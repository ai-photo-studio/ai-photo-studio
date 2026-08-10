// R9.2-P4A-VERIFIED-PAYMENT-EXECUTION-QUEUE
//
// Internal, non-routed transaction boundary that turns ALREADY-VERIFIED
// payment evidence into a QUEUED `ReplicateExecution` row that the existing
// P3A worker (`replicate-execution.worker.ts`) can later claim. This file
// NEVER calls Replicate, R2, Bank Alfalah, or any network endpoint -- it only
// reads and writes Postgres rows inside one `prisma.$transaction`.
//
// ---------------------------------------------------------------------------
// TRUST BOUNDARY (read before calling this from anywhere)
// ---------------------------------------------------------------------------
// `applyVerifiedPaymentEvidence` is a plain exported async function. It is
// deliberately:
//   * NOT registered on any Express router (see `apps/api/src/routes/*`).
//   * NOT imported by any controller (see `apps/api/src/controllers/*`).
//   * NOT reachable by a browser payment return, a client-supplied request
//     body, an admin action, or manual evidence entry of any kind.
//
// The ONLY intended caller is a future, separately authorized trusted gateway
// adapter that has ALREADY verified a Bank Alfalah callback/return signature
// and normalized it into `VerifiedPaymentEvidence` before calling this
// function directly, in-process. This module does not (and cannot) verify a
// bank signature itself -- it deliberately contains zero Bank Alfalah
// protocol knowledge. Its only security property is: every field it is given
// is checked against the DB row it claims to describe, and nothing is ever
// marked verified on a mismatch. The absence of any HTTP entry point is the
// actual trust boundary; the type signature is documentation, not enforcement.
//
// `p4a-payment-verified-execution-queue.service.test.ts` proves this
// boundary two ways: (1) a static scan of every controller/route file for a
// reference to this module (must be zero), and (2) that calling this
// function with attacker-shaped normalized evidence (mismatched amount,
// mismatched provider reference, wrong currency, disallowed state) is
// rejected and writes nothing -- i.e. even if something someday *did* wire a
// route to this function, client-controlled fields alone cannot forge a
// verified payment.
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import {
  assertFirstRestorationExecutionEligible,
  computeReplicateExecutionIdempotencyKey,
  validateIntegerMinorAmount,
  validateMarketCurrencyPair,
  type FixedOrderCurrency,
  type FixedOrderType,
  type Market
} from "../domain/fixedOrder/fixedOrderGuards";

// ---------------------------------------------------------------------------
// Input contract
// ---------------------------------------------------------------------------

/**
 * Normalized, already-verified payment evidence. Every field here is
 * expected to have been extracted from a cryptographically/protocol-verified
 * gateway callback by the (not-yet-built) trusted adapter -- this module adds
 * no bank-specific verification of its own; it only checks internal
 * consistency against the FixedOrder/PaymentAttempt rows already in Postgres.
 */
export interface VerifiedPaymentEvidence {
  fixedOrderId: string;
  paymentAttemptId: string;
  /** Must match `PaymentAttempt.provider`. No default -- the caller must state it explicitly. */
  provider: string;
  /** Opaque gateway event id, used only to build `dedupeHash`; never parsed. */
  providerEventId: string;
  /** Opaque gateway transaction/reference id. Must match `PaymentAttempt.providerRef` once set. */
  providerRef: string;
  amountMinor: bigint;
  currency: FixedOrderCurrency;
  /**
   * Content-derived idempotency key for the `PaymentEvent` row, e.g.
   * `sha256(provider + providerEventId + fixedOrderId + amountMinor)`. Two
   * calls with the same evidence MUST produce the same `dedupeHash`; this is
   * what makes replay and real concurrency converge on one row via the
   * database's own unique constraint instead of application-level locking.
   */
  dedupeHash: string;
}

export type PaymentEvidenceOutcome =
  | "APPLIED"
  | "ORDER_NOT_FOUND"
  | "ATTEMPT_NOT_FOUND"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "PROVIDER_REFERENCE_MISMATCH"
  | "PROVIDER_MISMATCH"
  | "ATTEMPT_STATE_NOT_PERMITTED"
  | "ORDER_NOT_ELIGIBLE"
  | "INVALID_EVIDENCE_SHAPE";

/** Per-item result of applying verified payment evidence to one FixedOrderItem. */
export interface AppliedItemResult {
  fixedOrderItemId: string;
  restorationEntitlementId: string;
  restorationMasterId: string;
  replicateExecutionId: string;
}

export interface PaymentEvidenceResult {
  outcome: PaymentEvidenceOutcome;
  /** Non-sensitive explanation; present for every non-APPLIED outcome. */
  reason?: string;
  /**
   * Present only for APPLIED (including converged-duplicate/converged-race
   * replays). R9.5-P5P: one order may have 1-10 items, each independently
   * restored -- `items` holds exactly one entry per eligible
   * `FixedOrderItem`, in the same order `FixedOrder.items` was read. A
   * legacy single-item order still produces a one-element array; there is
   * no longer a singular top-level `restorationEntitlementId`/etc.
   */
  applied?: {
    fixedOrderId: string;
    paymentAttemptId: string;
    paymentEventId: string;
    items: AppliedItemResult[];
  };
}

/** `PaymentAttempt` statuses in which fresh verification evidence may legitimately be applied. */
const PRE_VERIFIED_ATTEMPT_STATES: readonly string[] = [
  "CREATED",
  "REDIRECT_READY",
  "CUSTOMER_RETURNED",
  "CALLBACK_PENDING",
  "AUTHORIZED"
];

// ---------------------------------------------------------------------------
// Shape validation (defends against manual/attacker-shaped input reaching
// this function even in a future misconfiguration -- see trust boundary note above)
// ---------------------------------------------------------------------------

function validateEvidenceShape(evidence: VerifiedPaymentEvidence): string | null {
  if (!evidence || typeof evidence !== "object") return "evidence must be an object";
  if (typeof evidence.fixedOrderId !== "string" || evidence.fixedOrderId.trim().length === 0) {
    return "fixedOrderId is required";
  }
  if (typeof evidence.paymentAttemptId !== "string" || evidence.paymentAttemptId.trim().length === 0) {
    return "paymentAttemptId is required";
  }
  if (typeof evidence.provider !== "string" || evidence.provider.trim().length === 0) {
    return "provider is required";
  }
  if (typeof evidence.providerEventId !== "string" || evidence.providerEventId.trim().length === 0) {
    return "providerEventId is required";
  }
  if (typeof evidence.providerRef !== "string" || evidence.providerRef.trim().length === 0) {
    return "providerRef is required";
  }
  if (typeof evidence.dedupeHash !== "string" || evidence.dedupeHash.trim().length === 0) {
    return "dedupeHash is required";
  }
  if (evidence.currency !== "PKR" && evidence.currency !== "USD") {
    return "currency must be PKR or USD";
  }
  try {
    validateIntegerMinorAmount(evidence.amountMinor);
  } catch (err) {
    return err instanceof Error ? err.message : "amountMinor is invalid";
  }
  if (!(evidence.amountMinor > 0n)) {
    return "amountMinor must be a positive integer";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Unique-constraint / race classification
// ---------------------------------------------------------------------------

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// ---------------------------------------------------------------------------
// Core transaction
// ---------------------------------------------------------------------------

async function runOnce(evidence: VerifiedPaymentEvidence): Promise<PaymentEvidenceResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.fixedOrder.findUnique({
      where: { id: evidence.fixedOrderId },
      include: { paymentAttempt: true, items: { include: { restorationEntitlement: true }, orderBy: { createdAt: "asc" } } }
    });
    if (!order) {
      return { outcome: "ORDER_NOT_FOUND", reason: "fixed order does not exist" };
    }

    const attempt = order.paymentAttempt;
    if (!attempt || attempt.id !== evidence.paymentAttemptId) {
      return { outcome: "ATTEMPT_NOT_FOUND", reason: "payment attempt does not exist for this order" };
    }

    if (attempt.provider !== evidence.provider) {
      return { outcome: "PROVIDER_MISMATCH", reason: "evidence provider does not match the recorded attempt provider" };
    }
    if (attempt.amountMinor !== evidence.amountMinor) {
      return { outcome: "AMOUNT_MISMATCH", reason: "evidence amount does not match the recorded attempt amount" };
    }
    if (attempt.currency !== evidence.currency) {
      return { outcome: "CURRENCY_MISMATCH", reason: "evidence currency does not match the recorded attempt currency" };
    }
    if (attempt.providerRef && attempt.providerRef !== evidence.providerRef) {
      return {
        outcome: "PROVIDER_REFERENCE_MISMATCH",
        reason: "evidence provider reference does not match the previously recorded attempt reference"
      };
    }

    // Idempotent replay of an evidence set that was already fully applied:
    // same dedupeHash, attempt already PAID. Converge without re-mutating.
    const existingEvent = await tx.paymentEvent.findUnique({ where: { dedupeHash: evidence.dedupeHash } });
    const alreadyApplied = attempt.status === "PAID" && existingEvent !== null;

    if (!alreadyApplied && !PRE_VERIFIED_ATTEMPT_STATES.includes(attempt.status)) {
      return {
        outcome: "ATTEMPT_STATE_NOT_PERMITTED",
        reason: `payment attempt is in state ${attempt.status}, which does not permit new verification evidence`
      };
    }

    try {
      validateMarketCurrencyPair(order.market as Market, order.currency as FixedOrderCurrency);
      // R9.5-P5P: order-type eligibility is still checked once for the whole
      // order (a type that can never own a restoration cannot own one no
      // matter how many items it has); per-item existing-entitlement replay
      // detection now happens inside the loop below, one item at a time.
      assertFirstRestorationExecutionEligible(order.type as FixedOrderType, { existingEntitlementId: null });
    } catch (err) {
      if (!alreadyApplied) {
        return {
          outcome: "ORDER_NOT_ELIGIBLE",
          reason: err instanceof Error ? err.message : "order is not eligible for a restoration execution"
        };
      }
    }
    if (order.items.length === 0) {
      return { outcome: "ORDER_NOT_ELIGIBLE", reason: "order has no items to restore" };
    }
    // R9.5-P5P: every item must resolve to a source image before ANY item is
    // processed -- fail closed on the whole order rather than partially
    // activate some items and silently skip others.
    for (const item of order.items) {
      if (!item.sourceDraftId && !order.sourceDraftId) {
        return { outcome: "ORDER_NOT_ELIGIBLE", reason: `item ${item.id} has no source draft to restore` };
      }
    }

    // ---- All checks passed. Append the deduplicated PaymentEvent row. ----
    const paymentEvent = await tx.paymentEvent.upsert({
      where: { dedupeHash: evidence.dedupeHash },
      create: {
        paymentAttemptId: attempt.id,
        provider: evidence.provider,
        providerEventId: evidence.providerEventId,
        dedupeHash: evidence.dedupeHash,
        verified: true,
        matchResult: "MATCH",
        processedAt: new Date()
      },
      update: {}
    });

    // ---- Mark the attempt verified and set the provider reference (first time only). ----
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "PAID",
        providerRef: attempt.providerRef ?? evidence.providerRef
      }
    });

    // ---- Lock/finalize the FixedOrder. ----
    await tx.fixedOrder.update({
      where: { id: order.id },
      data: {
        status: "LOCKED",
        lockedAt: order.lockedAt ?? new Date()
      }
    });

    // ---- One order-level verified-PAID event activates EVERY eligible item:
    // create-or-reuse exactly one RestorationEntitlement/RestorationMaster/
    // QUEUED ReplicateExecution PER ITEM, never per order. Sequential (not
    // Promise.all) inside the one transaction -- each item's chain is
    // independent, so one item's upsert failing never corrupts another's
    // identity, and the deterministic per-item keys make every upsert here
    // safe to repeat on retry/duplicate callback/concurrent racer. ----
    const items: AppliedItemResult[] = [];
    for (const item of order.items) {
      const draftId = item.sourceDraftId ?? order.sourceDraftId!;
      const entitlement = await tx.restorationEntitlement.upsert({
        where: { fixedOrderItemId: item.id },
        create: { fixedOrderId: order.id, fixedOrderItemId: item.id, draftId, status: "GRANTED" },
        update: {}
      });
      const master = await tx.restorationMaster.upsert({
        where: { restorationEntitlementId: entitlement.id },
        create: { restorationEntitlementId: entitlement.id, status: "NOT_STARTED" },
        update: {}
      });
      const idempotencyKey = computeReplicateExecutionIdempotencyKey(master.id);
      const execution = await tx.replicateExecution.upsert({
        where: { restorationMasterId: master.id },
        create: { restorationMasterId: master.id, idempotencyKey, status: "QUEUED" },
        update: {}
      });
      items.push({
        fixedOrderItemId: item.id,
        restorationEntitlementId: entitlement.id,
        restorationMasterId: master.id,
        replicateExecutionId: execution.id
      });
    }

    return {
      outcome: "APPLIED",
      applied: {
        fixedOrderId: order.id,
        paymentAttemptId: attempt.id,
        paymentEventId: paymentEvent.id,
        items
      }
    };
  });
}

/**
 * Reads back the state after a losing racer's transaction aborted on a
 * unique-constraint conflict. The winning transaction is all-or-nothing (a
 * single `prisma.$transaction`), so if ANY unique constraint inside it was
 * hit by a concurrent caller, the row that "won" necessarily committed the
 * complete chain. This function re-verifies the evidence against what is now
 * persisted (never trusts the conflict alone) before reporting APPLIED.
 */
async function convergeAfterConflict(evidence: VerifiedPaymentEvidence): Promise<PaymentEvidenceResult> {
  const order = await prisma.fixedOrder.findUnique({
    where: { id: evidence.fixedOrderId },
    include: {
      paymentAttempt: true,
      items: {
        orderBy: { createdAt: "asc" },
        include: { restorationEntitlement: { include: { restorationMaster: { include: { replicateExecution: true } } } } }
      }
    }
  });

  const attempt = order?.paymentAttempt;
  const event = await prisma.paymentEvent.findUnique({ where: { dedupeHash: evidence.dedupeHash } });

  const attemptConverged =
    order &&
    attempt &&
    attempt.id === evidence.paymentAttemptId &&
    attempt.status === "PAID" &&
    attempt.amountMinor === evidence.amountMinor &&
    attempt.currency === evidence.currency &&
    event;

  // Every item must have converged its own complete chain -- one item still
  // missing its entitlement/master/execution means the winning transaction
  // has not finished, not that this item is exempt.
  const items: AppliedItemResult[] = [];
  let allItemsConverged = Boolean(attemptConverged) && order!.items.length > 0;
  if (attemptConverged) {
    for (const item of order.items) {
      const entitlement = item.restorationEntitlement;
      const master = entitlement?.restorationMaster;
      const execution = master?.replicateExecution;
      if (!entitlement || !master || !execution) {
        allItemsConverged = false;
        break;
      }
      items.push({
        fixedOrderItemId: item.id,
        restorationEntitlementId: entitlement.id,
        restorationMasterId: master.id,
        replicateExecutionId: execution.id
      });
    }
  }

  if (!attemptConverged || !allItemsConverged) {
    // The conflict was not caused by our own concurrent evidence (e.g. a
    // genuinely different unrelated write raced on some other row) --
    // surface this as a hard failure rather than silently reporting success.
    throw new Error(
      "p4a-payment-verified-execution-queue: unique-constraint conflict did not resolve to a converged applied state"
    );
  }

  return {
    outcome: "APPLIED",
    applied: {
      fixedOrderId: order!.id,
      paymentAttemptId: attempt!.id,
      paymentEventId: event!.id,
      items
    }
  };
}

/**
 * Applies already-verified payment evidence and, in one transaction, marks
 * the payment verified and enqueues exactly one `ReplicateExecution` row
 * (QUEUED) for the existing P3A worker to later claim. See the file-level
 * trust-boundary comment: this function must never be reachable from an
 * HTTP route, controller, or client-controlled input path.
 *
 * Never calls Replicate, R2, or any network endpoint.
 */
export async function applyVerifiedPaymentEvidence(evidence: VerifiedPaymentEvidence): Promise<PaymentEvidenceResult> {
  const shapeError = validateEvidenceShape(evidence);
  if (shapeError) {
    return { outcome: "INVALID_EVIDENCE_SHAPE", reason: shapeError };
  }

  try {
    return await runOnce(evidence);
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return await convergeAfterConflict(evidence);
    }
    throw err;
  }
}
