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

  async buildPipeline(request: PipelineBuildRequest): Promise<PipelineBuildResponse> {
    // Placeholder — implementation in Sprint 3
    void request;
    throw new Error("PipelineBuilderService.buildPipeline not yet implemented");
  }
}
