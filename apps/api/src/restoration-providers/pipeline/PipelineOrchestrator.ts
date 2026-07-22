import type { IRestorationProvider, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";
import { FluxRestoreProvider } from "../providers/FluxRestoreProvider";
import { GFPGANProvider } from "../providers/GFPGANProvider";
import { DDColorProvider } from "../providers/DDColorProvider";
import { NAFNetProvider } from "../providers/NAFNetProvider";
import { OpenAIProvider } from "../providers/OpenAIProvider";
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
 * Modernized restoration pipeline orchestrator (OPS-96).
 *
 * Pipeline definitions:
 *
 * Light:
 *   GPT Image 1.5 (OpenAI)
 *
 * HD:
 *   FLUX Restore → GFPGAN → Real-ESRGAN (via existing services)
 *
 * Premium:
 *   FLUX Restore → GFPGAN → Real-ESRGAN → DDColor → GPT Image 2 (OpenAI)
 *
 * The pipeline is configurable via the PipelineBuilder.
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
    const gfpgan = new GFPGANProvider(this.config.REPLICATE_API_TOKEN);
    const ddcolor = new DDColorProvider(this.config.REPLICATE_API_TOKEN);
    const openai = new OpenAIProvider(this.config);

    // Light: GPT Image 1.5 (single provider, lowest cost)
    this.configPipelines.set("light", {
      tier: "light",
      steps: [
        { provider: openai, label: "openai-gpt-image-1.5" },
      ],
    });

    // HD: FLUX Restore → GFPGAN (face enhancement) → (Real-ESRGAN handled by existing infra)
    this.configPipelines.set("hd", {
      tier: "hd",
      steps: [
        { provider: fluxRestore, label: "flux-restore" },
        { provider: gfpgan, label: "gfpgan-face-enhance" },
      ],
    });

    // Premium: FLUX Restore → GFPGAN → DDColor → GPT Image 2
    this.configPipelines.set("premium", {
      tier: "premium",
      steps: [
        { provider: fluxRestore, label: "flux-restore" },
        { provider: gfpgan, label: "gfpgan-face-enhance" },
        { provider: ddcolor, label: "ddcolor-colorization" },
        { provider: openai, label: "openai-gpt-image-2" },
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
