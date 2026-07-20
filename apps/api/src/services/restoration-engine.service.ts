import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import { ImageAnalysisService } from "./image-analysis.service";
import { DamageDetectionService } from "./damage-detection.service";
import { QualityVerificationService } from "./quality-verification.service";
import { PipelineBuilderService } from "./pipeline-builder.service";
import { PrintReadinessService } from "./print-readiness.service";
import { MonitoringService } from "./monitoring.service";
import { selectProviders } from "../providers/provider-selection.service";
import type { QualityMetrics } from "./image-analysis.service";
import type { DamageDetectionResponse } from "./damage-detection.service";

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

  async analyzeAndStore(storageKey: string, mimeType: string, itemId: string): Promise<{
    quality: QualityMetrics;
    damage: DamageDetectionResponse;
    pipeline: any;
    verification: any;
  }> {
    const analysis = await this.imageAnalysis.analyzeImage({ storageKey, mimeType });
    const damage = await this.damageDetection.detectDamage({ storageKey, mimeType });

    const quality = analysis.qualityMetrics;

    const isBlackAndWhite = analysis.colorMode === "black_and_white";
    const hasFaces = analysis.faceCount > 0;

    const providerSelection = selectProviders({
      hasFaces,
      isBlackAndWhite,
      damageSeverity: damage.damageSeverity,
      overallQuality: quality.overallScore,
      artifactScore: damage.artifactScore
    });

    const pipeline = await this.pipelineBuilder.buildPipeline({
      imageAnalysis: analysis,
      damageAnalysis: damage,
      qualityBefore: quality,
      packageTier: "premium",
      hasFaces
    });

    const afterQuality = {
      ...quality,
      overallScore: Math.min(100, quality.overallScore + 15)
    };

    const verification = await this.qualityVerification.verifyRestoration({
      before: quality,
      after: afterQuality,
      damage,
      faceDetection: { faceCount: analysis.faceCount, faceConfidence: analysis.faceConfidence }
    });

    await prisma.restorationItem.update({
      where: { id: itemId },
      data: {
        beforeBlurScore: Math.round(quality.blurScore),
        beforeNoiseScore: Math.round(quality.noiseScore),
        beforeSharpnessScore: Math.round(quality.sharpnessScore),
        beforeBrightnessScore: Math.round(quality.brightnessScore),
        beforeContrastScore: Math.round(quality.contrastScore),
        beforeColorCastScore: Math.round(quality.colorCastScore),
        damageScore: damage.coverage,
        qualityScore: quality.overallScore,
        artifactScore: damage.artifactScore,
        ssimScore: verification.metrics.ssim,
        psnrScore: verification.metrics.psnr,
        printQuality: verification.metrics.printQuality,
        imageResolutionWidth: analysis.resolution.width,
        imageResolutionHeight: analysis.resolution.height,
        colorMode: analysis.colorMode,
        imageCategory: analysis.imageCategory as any,
        damageSeverity: damage.damageSeverity as any,
        faceCount: analysis.faceCount,
        faceConfidence: analysis.faceConfidence,
        damageMaskStorageKey: damage.maskStorageKey || null,
        providerUsed: providerSelection.pipeline.join(",") || pipeline.steps.map(s => s.model).join(",") || null
      }
    });

    logger.info("RestorationEngine full analysis stored", {
      itemId,
      overallScore: quality.overallScore,
      damageSeverity: damage.damageSeverity,
      faceCount: analysis.faceCount,
      pipelineSteps: pipeline.steps.length,
      verificationPassed: verification.passed,
      ssim: verification.metrics.ssim,
      psnr: verification.metrics.psnr
    });

    return {
      quality,
      damage,
      pipeline: { steps: pipeline.steps, estimatedDurationMs: pipeline.estimatedDurationMs, estimatedCost: pipeline.estimatedCost },
      verification: { passed: verification.passed, metrics: verification.metrics, confidence: verification.confidence }
    };
  }
}
