import type { IRestorationProvider, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";
import type { AppConfig } from "../../config/env";
import { ReplicatePipelineProvider } from "../providers/ReplicatePipelineProvider";
import { DryRunRestorationProvider } from "../providers/DryRunRestorationProvider";
import { ReplayRestorationProvider } from "../providers/ReplayRestorationProvider";
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
 * Phase 1 Replicate-only restoration orchestrator.
 * Production is Flux followed by one GFPGAN scale=1 pass. The quarantined unified-local provider is intentionally not imported or selectable.
 */
export class PipelineOrchestrator {
  private readonly configPipelines: Map<PipelineTier, PipelineConfig> = new Map();
  private readonly config: AppConfig;
  private readonly pipelineMode: "replicate" | "hybrid" | "local";

  constructor(config: AppConfig) {
    this.config = config;
    this.pipelineMode = config.restorationReplayMode || config.restorationDryRun ? "local" : (config.restorationPipeline || "replicate");
    this.buildDefaultPipelines();
  }

  private buildDefaultPipelines(): void {
    const apiKey = this.config.REPLICATE_API_TOKEN;
    const dryRunProvider = new DryRunRestorationProvider();
    const replayProvider = new ReplayRestorationProvider(this.config);
    const replicatePipeline = new ReplicatePipelineProvider(apiKey);

    if (this.config.restorationReplayMode) {
      this.configPipelines.set("replicate", { tier: "replicate", steps: [{ provider: replayProvider, label: "replay" }] });
      this.configPipelines.set("light", { tier: "light", steps: [{ provider: replayProvider, label: "replay" }] });
      this.configPipelines.set("hd", { tier: "hd", steps: [{ provider: replayProvider, label: "replay" }] });
      this.configPipelines.set("premium", { tier: "premium", steps: [{ provider: replayProvider, label: "replay" }] });
      return;
    }
    if (this.config.restorationDryRun) {
      this.configPipelines.set("replicate", {
        tier: "replicate",
        steps: [{ provider: dryRunProvider, label: "dry-run" }]
      });
      this.configPipelines.set("light", {
        tier: "light",
        steps: [{ provider: dryRunProvider, label: "dry-run" }]
      });
      this.configPipelines.set("hd", {
        tier: "hd",
        steps: [{ provider: dryRunProvider, label: "dry-run" }]
      });
      this.configPipelines.set("premium", {
        tier: "premium",
        steps: [{ provider: dryRunProvider, label: "dry-run" }]
      });
      return;
    }

    // Replicate tier (default): two AI predictions.
    this.configPipelines.set("replicate", {
      tier: "replicate",
      steps: [{ provider: replicatePipeline, label: "replicate-pipeline" }]
    });

    // Light: FLUX Restore only (single Replicate call)
    this.configPipelines.set("light", {
      tier: "light",
      steps: [{ provider: replicatePipeline, label: "replicate-pipeline" }]
    });

    // HD remains the production Replicate lane; structural inpainting is not selectable.
    this.configPipelines.set("hd", {
      tier: "hd",
      steps: [{ provider: replicatePipeline, label: "replicate-pipeline" }]
    });

    // Premium: same as HD
    this.configPipelines.set("premium", {
      tier: "premium",
      steps: [{ provider: replicatePipeline, label: "replicate-pipeline" }]
    });
  }

  registerPipeline(config: PipelineConfig): void {
    this.configPipelines.set(config.tier, config);
  }

  async execute(request: RestorationRequest, tier?: PipelineTier): Promise<PipelineResult> {
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
    return this.config.restorationDryRun ? "replicate" : "replicate";
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
