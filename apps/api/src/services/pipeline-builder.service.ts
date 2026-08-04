import type { AppConfig } from "../config/env";
import type { DamageDetectionResponse } from "./damage-detection.service";
import type { ImageAnalysisResponse } from "./image-analysis.service";

export interface PipelineBuildRequest {
  imageAnalysis: ImageAnalysisResponse;
  damageAnalysis: DamageDetectionResponse;
  qualityBefore: ImageAnalysisResponse["qualityMetrics"];
  packageTier: "basic" | "premium" | "enterprise";
  hasFaces: boolean;
}

export interface PipelineStep {
  model: string;
  priority: number;
  scale?: number;
  maskKey?: string;
  confidenceThreshold?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface PipelineBuildResponse {
  steps: PipelineStep[];
  skipReason?: string;
  estimatedDurationMs: number;
  estimatedCost: number;
}

export class PipelineBuilderService {
  constructor(private readonly config: AppConfig) {}

  async buildPipeline(_request: PipelineBuildRequest): Promise<PipelineBuildResponse> {
    return {
      steps: [{
        model: "replicate-pipeline",
        priority: 1
      }],
      skipReason: undefined,
      estimatedDurationMs: 60_000,
      estimatedCost: 0.019
    };
  }
}
