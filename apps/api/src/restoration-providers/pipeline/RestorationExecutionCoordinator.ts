import type { RestorationRequest } from "../interfaces/IRestorationProvider";
import type { PipelineResult, PipelineTier } from "./PipelineOrchestrator";
import type {
  CompletionRepositoryPort,
  FinalPersistencePort,
  FinalVariantsBuilderPort,
  OutputValidationPort,
  ProviderExecutionPort,
  ValidatedRestorationOutput
} from "./RestorationExecutionPorts";
import type { UploadFileResult } from "../../services/storage.service";

export interface RestorationExecutionCoordinatorPorts {
  providerExecutor: ProviderExecutionPort;
  outputValidator: OutputValidationPort;
  variantsBuilder: FinalVariantsBuilderPort;
  finalPersistence: FinalPersistencePort;
  completionRepository: CompletionRepositoryPort;
}

export interface RunToCompletionParams {
  request: RestorationRequest;
  tier: PipelineTier;
  itemId: string;
  orderId: string | null;
  existingMetadata: Record<string, unknown>;
  qualityOverallScore: number;
  dryRun: boolean;
  /** Epoch ms the caller's duration window started at; defaults to Date.now() when omitted. */
  startedAt?: number;
  /** Fires once the provider result is validated, before persistence. Used for progress bookkeeping only. */
  onValidated?: (pipelineResult: PipelineResult) => Promise<void>;
}

export interface RunToCompletionResult {
  pipelineResult: PipelineResult;
  validatedOutput: ValidatedRestorationOutput;
  masterUpload: UploadFileResult;
  fourHdUpload: UploadFileResult;
  twoHdUpload: UploadFileResult;
  providersUsed: string[];
  providerUsedName: string;
  totalDurationMs: number;
}

/**
 * Restoration execution boundary. Enforces one fixed order and nothing else:
 *   execute -> validate -> build variants -> persist to R2 -> mark COMPLETED.
 * Each step's port is independently substitutable/mockable. A failure at any
 * step propagates immediately — there is no catch here, so no step after a
 * failure ever runs (no upload after a bad provider/validation result, no
 * DB completion after a failed upload) and no fallback between providers is
 * attempted.
 */
export class RestorationExecutionCoordinator {
  constructor(private readonly ports: RestorationExecutionCoordinatorPorts) {}

  async runToCompletion(params: RunToCompletionParams): Promise<RunToCompletionResult> {
    const start = params.startedAt ?? Date.now();

    const pipelineResult = await this.ports.providerExecutor.execute(params.request, params.tier);
    const validatedOutput = await this.ports.outputValidator.validate(pipelineResult);

    if (params.onValidated) {
      await params.onValidated(pipelineResult);
    }

    const variants = await this.ports.variantsBuilder.buildVariants(validatedOutput);

    const masterUpload = await this.ports.finalPersistence.uploadFinal({
      itemId: params.itemId,
      variant: "master",
      fileName: `master-restoration-${params.itemId}-${Date.now()}.jpg`,
      body: variants.master.body,
      contentType: variants.master.contentType
    });
    const fourHdUpload = await this.ports.finalPersistence.uploadFinal({
      itemId: params.itemId,
      variant: "4hd",
      fileName: `4hd-restoration-${params.itemId}-${Date.now()}.jpg`,
      body: variants["4hd"].body,
      contentType: variants["4hd"].contentType
    });
    const twoHdUpload = await this.ports.finalPersistence.uploadFinal({
      itemId: params.itemId,
      variant: "2hd",
      fileName: `2hd-restoration-${params.itemId}-${Date.now()}.jpg`,
      body: variants["2hd"].body,
      contentType: variants["2hd"].contentType
    });

    const totalDurationMs = Date.now() - start;
    const providersUsed = pipelineResult.final.stages;
    const providerUsedName = pipelineResult.final.providerName;
    const afterQualityScore =
      params.qualityOverallScore < 50 ? params.qualityOverallScore + 30 : Math.min(100, params.qualityOverallScore + 10);

    const metadataPatch = {
      ...params.existingMetadata,
      dryRun: params.dryRun || undefined,
      restorationOutputs: {
        master: {
          key: masterUpload.key,
          width: variants.master.width,
          height: variants.master.height,
          contentType: variants.master.contentType
        },
        variants: {
          "4hd": {
            key: fourHdUpload.key,
            width: variants["4hd"].width,
            height: variants["4hd"].height,
            contentType: variants["4hd"].contentType,
            interpolated: false
          },
          "2hd": {
            key: twoHdUpload.key,
            width: variants["2hd"].width,
            height: variants["2hd"].height,
            contentType: variants["2hd"].contentType,
            interpolated: false
          }
        }
      }
    };

    await this.ports.completionRepository.markCompleted({
      itemId: params.itemId,
      orderId: params.orderId,
      finalStorageKey: masterUpload.key,
      metadataPatch,
      afterQualityScore,
      providerUsed: `${providerUsedName ?? "unknown"}:${providersUsed.join(",")}`,
      processingStage: "RESTORATION_PREVIEW",
      totalDurationMs
    });

    return {
      pipelineResult,
      validatedOutput,
      masterUpload,
      fourHdUpload,
      twoHdUpload,
      providersUsed,
      providerUsedName,
      totalDurationMs
    };
  }
}
