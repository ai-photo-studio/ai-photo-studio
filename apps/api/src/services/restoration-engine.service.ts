import type { AppConfig } from "../config/env";
import { ImageAnalysisService } from "./image-analysis.service";
import { DamageDetectionService } from "./damage-detection.service";
import { QualityVerificationService } from "./quality-verification.service";
import { PipelineBuilderService } from "./pipeline-builder.service";
import { PrintReadinessService } from "./print-readiness.service";
import { MonitoringService } from "./monitoring.service";

/**
 * RestorationEngineService — Sprint 1 skeleton only.
 * This service will orchestrate the full restoration pipeline in Sprint 2+.
 * For now it only wires the sub-services; no existing restoration logic is replaced.
 */
export class RestorationEngineService {
  public readonly imageAnalysis: ImageAnalysisService;
  public readonly damageDetection: DamageDetectionService;
  public readonly qualityVerification: QualityVerificationService;
  public readonly pipelineBuilder: PipelineBuilderService;
  public readonly printReadiness: PrintReadinessService;
  public readonly monitoring: MonitoringService;

  constructor(private readonly config: AppConfig) {
    this.imageAnalysis = new ImageAnalysisService(config);
    this.damageDetection = new DamageDetectionService(config);
    this.qualityVerification = new QualityVerificationService(config);
    this.pipelineBuilder = new PipelineBuilderService(config);
    this.printReadiness = new PrintReadinessService(config);
    this.monitoring = new MonitoringService(config);
  }

  /**
   * Placeholder — no functional behavior in Sprint 1.
   * Will be implemented in Sprint 2+ to orchestrate the full pipeline.
   */
  async processRestoration(_params: { storageKey: string; mimeType: string }): Promise<void> {
    void _params;
    // Not implemented — existing restoration service continues to handle processing
  }
}
