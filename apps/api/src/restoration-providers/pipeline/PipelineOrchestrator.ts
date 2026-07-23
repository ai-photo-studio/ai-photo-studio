import type { IRestorationProvider, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";
import { FluxRestoreProvider } from "../providers/FluxRestoreProvider";
import { ReplicatePipelineProvider } from "../providers/ReplicatePipelineProvider";
import { UnifiedLocalRestorationProvider } from "../providers/UnifiedLocalRestorationProvider";
import type { AppConfig } from "../../config/env";
import { logger } from "../../utils/logger";

export type PipelineTier = "light" | "hd" | "premium" | "replicate";

export interface PipelineStep {
  provider: IRestorationProvider;
  label: string;
}

export interface PipelineConfig {
  tier: PipelineTier;
  steps: PipelineStep[];
}

export interface PipelineResult {
  final: RestorationResult;
  intermediateResults: RestorationResult[];
  totalProcessingTimeMs: number;
  totalEstimatedCost: number;
  totalActualCost: number;
  tier: PipelineTier;
}

/**
 * OPS-116 Production Pipeline Orchestrator.
 *
 * Feature flag: RESTORATION_PIPELINE
 *   replicate (default) → ReplicatePipelineProvider (3 Replicate calls)
 *   hybrid              → OPS-108 mode (flux via Replicate, local via RunPod)
 *   local               → local-only postprocessing
 *
 * The OPS-109 proven commercial pipeline is restored as the default 'replicate' tier.
 * RunPod-based local stages (hybrid) are marked LEGACY_LOCAL_PIPELINE.
 */
export class PipelineOrchestrator {
  private readonly configPipelines: Map<PipelineTier, PipelineConfig> = new Map();
  private readonly config: AppConfig;
  private readonly pipelineMode: "replicate" | "hybrid" | "local";

  constructor(config: AppConfig) {
    this.config = config;
    this.pipelineMode = config.restorationPipeline || "replicate";
    this.buildDefaultPipelines();
  }

  private buildDefaultPipelines(): void {
    const apiKey = this.config.REPLICATE_API_TOKEN;

    // OPS-109 proven commercial pipeline: 3 sequential Replicate calls
    // LEGACY_LOCAL_PIPELINE: RunPod-based UnifiedLocalRestorationProvider is not used
    const replicatePipeline = new ReplicatePipelineProvider(apiKey);

    // LEGACY_LOCAL_PIPELINE: kept for rollback, disabled by default
    const unifiedLocal = new UnifiedLocalRestorationProvider(this.config);
    const fluxRestore = new FluxRestoreProvider(apiKey);

    // Replicate tier (DEFAULT) — OPS-109 commercial quality
    this.configPipelines.set("replicate", {
      tier: "replicate",
      steps: [
        { provider: replicatePipeline, label: "replicate-pipeline" },
      ],
    });

    // Light: FLUX Restore only (single Replicate call)
    // LEGACY_LOCAL_PIPELINE: preserved for backward compatibility
    this.configPipelines.set("light", {
      tier: "light",
      steps: [
        { provider: fluxRestore, label: "flux-restore" },
      ],
    });

    // HD: FLUX Restore (Replicate) → unified-local postprocessing
    // LEGACY_LOCAL_PIPELINE: RunPod-based
    this.configPipelines.set("hd", {
      tier: "hd",
      steps: [
        { provider: fluxRestore, label: "flux-restore" },
        { provider: unifiedLocal, label: "unified-local-postprocessing" },
      ],
    });

    // Premium: same as HD
    // LEGACY_LOCAL_PIPELINE: RunPod-based
    this.configPipelines.set("premium", {
      tier: "premium",
      steps: [
        { provider: fluxRestore, label: "flux-restore" },
        { provider: unifiedLocal, label: "unified-local-postprocessing" },
      ],
    });
  }

  registerPipeline(config: PipelineConfig): void {
    this.configPipelines.set(config.tier, config);
  }

  async execute(
    request: RestorationRequest,
    tier?: PipelineTier
  ): Promise<PipelineResult> {
    const effectiveTier = tier || this.getDefaultTier();
    const pipeline = this.configPipelines.get(effectiveTier);
    if (!pipeline) {
      throw new Error(`Unknown pipeline tier: ${effectiveTier}`);
    }

    const startTime = Date.now();
    const intermediateResults: RestorationResult[] = [];
    let currentRequest = { ...request };

    logger.info("OPS-116 pipeline execution started", {
      mode: this.pipelineMode,
      tier: effectiveTier,
      steps: pipeline.steps.map((s) => s.label).join(" → "),
    });

    let lastResult: RestorationResult | null = null;

    for (let i = 0; i < pipeline.steps.length; i++) {
      const step = pipeline.steps[i];
      const stepStartTime = Date.now();

      logger.info("Pipeline step", { step: i, label: step.label });

      try {
        const result = await step.provider.restore(currentRequest);
        const stepTime = Date.now() - stepStartTime;

        intermediateResults.push(result);

        currentRequest = {
          ...currentRequest,
          image: result.image,
          contentType: result.contentType || currentRequest.contentType,
        };

        lastResult = result;

        logger.info("Pipeline step completed", {
          step: i,
          label: step.label,
          stepTimeMs: stepTime,
          cost: result.actualCost ?? result.estimatedCost,
        });
      } catch (err) {
        logger.error("Pipeline step failed", {
          step: i,
          label: step.label,
          error: err instanceof Error ? err.message : String(err),
        });

        if (lastResult) {
          logger.warn("Pipeline continuing with last successful result", { step: i });
          break;
        }
        throw err;
      }
    }

    if (!lastResult) {
      throw new Error("Pipeline produced no result");
    }

    const totalProcessingTimeMs = Date.now() - startTime;
    const totalEstimatedCost = intermediateResults.reduce((sum, r) => sum + r.estimatedCost, 0);
    const totalActualCost = intermediateResults.reduce(
      (sum, r) => sum + (r.actualCost ?? r.estimatedCost),
      0
    );

    return {
      final: lastResult,
      intermediateResults,
      totalProcessingTimeMs,
      totalEstimatedCost: Math.round(totalEstimatedCost * 100000) / 100000,
      totalActualCost: Math.round(totalActualCost * 100000) / 100000,
      tier: effectiveTier,
    };
  }

  /**
   * Get the default tier based on the RESTORATION_PIPELINE feature flag.
   */
  getDefaultTier(): PipelineTier {
    if (this.pipelineMode === "replicate") return "replicate";
    if (this.pipelineMode === "hybrid") return "hd";
    if (this.pipelineMode === "local") return "light";
    return "replicate";
  }

  async executeAll(
    request: RestorationRequest,
    tiers?: PipelineTier[]
  ): Promise<Map<PipelineTier, PipelineResult>> {
    const targetTiers = tiers ?? (["replicate"] as PipelineTier[]);
    const results = new Map<PipelineTier, PipelineResult>();

    for (const tier of targetTiers) {
      try {
        const result = await this.execute(request, tier);
        results.set(tier, result);
      } catch (err) {
        logger.error("Pipeline tier failed", {
          tier,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  getPipeline(tier: PipelineTier): PipelineConfig | undefined {
    return this.configPipelines.get(tier);
  }

  getAllPipelines(): PipelineConfig[] {
    return Array.from(this.configPipelines.values());
  }
}
