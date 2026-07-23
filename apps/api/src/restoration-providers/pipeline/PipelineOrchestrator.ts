import type { IRestorationProvider, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";
import { FluxRestoreProvider } from "../providers/FluxRestoreProvider";
import { UnifiedLocalRestorationProvider } from "../providers/UnifiedLocalRestorationProvider";
import type { AppConfig } from "../../config/env";
import { logger } from "../../utils/logger";

export type PipelineTier = "light" | "hd" | "premium";

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
 * OPS-108 Hybrid Production Pipeline.
 *
 * Replicate is used ONLY for flux-kontext-apps/restore-image.
 * All remaining stages execute locally:
 *   Damage Analysis (local)
 *   Decision Engine
 *   FLUX Restore (Replicate)
 *   GFPGAN (local)
 *   Real-ESRGAN (local)
 *   DDColor (local, conditional — grayscale only)
 *   LaMa (local, conditional — scratch > threshold)
 *   Quality Validation
 *
 * CodeFormer is removed from production routing.
 * DDColor is removed from default routing (grayscale only).
 */
export class PipelineOrchestrator {
  private readonly configPipelines: Map<PipelineTier, PipelineConfig> = new Map();
  private readonly config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.buildDefaultPipelines();
  }

  private buildDefaultPipelines(): void {
    const fluxRestore = new FluxRestoreProvider(this.config.REPLICATE_API_TOKEN);
    const unifiedLocal = new UnifiedLocalRestorationProvider(this.config);

    // Light: FLUX Restore only (single Replicate call)
    this.configPipelines.set("light", {
      tier: "light",
      steps: [
        { provider: fluxRestore, label: "flux-restore" },
      ],
    });

    // HD: FLUX Restore (Replicate) → GFPGAN (local) → Real-ESRGAN (local)
    this.configPipelines.set("hd", {
      tier: "hd",
      steps: [
        { provider: fluxRestore, label: "flux-restore" },
        { provider: unifiedLocal, label: "unified-local-postprocessing" },
      ],
    });

    // Premium: FLUX Restore (Replicate) → GFPGAN (local) → Real-ESRGAN (local)
    // DDColor and LaMa are handled conditionally inside UnifiedLocalRestorationProvider
    this.configPipelines.set("premium", {
      tier: "premium",
      steps: [
        { provider: fluxRestore, label: "flux-restore" },
        { provider: unifiedLocal, label: "unified-local-postprocessing" },
      ],
    });
  }

  /**
   * Register or override a pipeline configuration.
   */
  registerPipeline(config: PipelineConfig): void {
    this.configPipelines.set(config.tier, config);
  }

  /**
   * Execute a pipeline tier against a single image.
   * Each step feeds its output as the next step's input.
   */
  async execute(
    request: RestorationRequest,
    tier: PipelineTier
  ): Promise<PipelineResult> {
    const pipeline = this.configPipelines.get(tier);
    if (!pipeline) {
      throw new Error(`Unknown pipeline tier: ${tier}`);
    }

    const startTime = Date.now();
    const intermediateResults: RestorationResult[] = [];
    let currentRequest = { ...request };

    logger.info("Pipeline execution started", { tier, steps: pipeline.steps.map((s) => s.label).join(" → ") });

    let lastResult: RestorationResult | null = null;

    for (let i = 0; i < pipeline.steps.length; i++) {
      const step = pipeline.steps[i];
      const stepStartTime = Date.now();

      logger.info("Pipeline step", { step: i, label: step.label });

      try {
        const result = await step.provider.restore(currentRequest);
        const stepTime = Date.now() - stepStartTime;

        intermediateResults.push(result);

        // Feed output as input for the next step
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

        // If a step fails, propagate the last successful result if available
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
      tier,
    };
  }

  /**
   * Execute multiple tiers in parallel for benchmarking.
   */
  async executeAll(
    request: RestorationRequest,
    tiers?: PipelineTier[]
  ): Promise<Map<PipelineTier, PipelineResult>> {
    const targetTiers = tiers ?? (["light", "hd", "premium"] as PipelineTier[]);
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
