import type { RestorationRequest } from "../interfaces/IRestorationProvider";
import type { PipelineResult, PipelineTier } from "./PipelineOrchestrator";
import type { UploadFileResult } from "../../services/storage.service";

/**
 * Seam boundary for the restoration execution pipeline.
 *
 * PipelineOrchestrator only ever decides which provider(s) run for a tier.
 * Everything downstream of "did the provider return bytes" — validating
 * those bytes, persisting them to R2, and mutating the database to
 * COMPLETED — is expressed as ports here so a future authorized provider
 * router can be substituted for ProviderExecutionPort without touching
 * validation, persistence, or completion semantics.
 */

export class RestorationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestorationValidationError";
  }
}

/** Provider execution boundary. Default implementation delegates to PipelineOrchestrator (Replicate). */
export interface ProviderExecutionPort {
  execute(request: RestorationRequest, tier: PipelineTier): Promise<PipelineResult>;
}

export interface ValidatedRestorationOutput {
  image: Buffer;
  contentType: string;
  width: number | null;
  height: number | null;
}

/** Output validation boundary. Must throw RestorationValidationError on invalid output. */
export interface OutputValidationPort {
  validate(result: PipelineResult): Promise<ValidatedRestorationOutput>;
}

export type FinalVariantName = "master" | "2hd" | "4hd";

export interface FinalVariant {
  body: Buffer;
  width: number | null;
  height: number | null;
  contentType: string;
}

/** Builds the persisted output variants from a validated master image. Pure transform, no I/O. */
export interface FinalVariantsBuilderPort {
  buildVariants(validated: ValidatedRestorationOutput): Promise<Record<FinalVariantName, FinalVariant>>;
}

export interface FinalUploadParams {
  itemId: string;
  variant: FinalVariantName;
  fileName: string;
  body: Buffer;
  contentType: string;
}

/** R2 persistence boundary for finalized restoration output only. */
export interface FinalPersistencePort {
  uploadFinal(params: FinalUploadParams): Promise<UploadFileResult>;
}

export interface CompletionMutationParams {
  itemId: string;
  orderId: string | null;
  finalStorageKey: string;
  metadataPatch: Record<string, unknown>;
  afterQualityScore: number;
  providerUsed: string;
  processingStage: string;
  totalDurationMs: number;
}

/** Database status-mutation boundary. Must only ever be called after validated R2 persistence. */
export interface CompletionRepositoryPort {
  markCompleted(params: CompletionMutationParams): Promise<void>;
}
