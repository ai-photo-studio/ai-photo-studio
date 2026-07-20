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

export type AnalysisPhase = "before" | "after";

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

  async analyzeAndStore(
    storageKey: string,
    mimeType: string,
    itemId: string,
    phase: AnalysisPhase = "before"
  ): Promise<{
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

    if (phase === "after") {
      // After-analysis: store real quality metrics in after columns
      // Fetch before quality for comparison
      const item = await prisma.restorationItem.findUnique({ where: { id: itemId } });

      const beforeQuality: QualityMetrics = {
        blurScore: item?.beforeBlurScore ?? quality.blurScore,
        noiseScore: item?.beforeNoiseScore ?? quality.noiseScore,
        sharpnessScore: item?.beforeSharpnessScore ?? quality.sharpnessScore,
        brightnessScore: item?.beforeBrightnessScore ?? quality.brightnessScore,
        contrastScore: item?.beforeContrastScore ?? quality.contrastScore,
        colorCastScore: item?.beforeColorCastScore ?? quality.colorCastScore,
        overallScore: item?.qualityScore ?? quality.overallScore
      };

      const verification = await this.qualityVerification.verifyRestoration({
        before: beforeQuality,
        after: quality,
        damage,
        faceDetection: { faceCount: analysis.faceCount, faceConfidence: analysis.faceConfidence }
      });

      // Compute regression detection
      const regressions: string[] = [];
      if (quality.sharpnessScore < (item?.beforeSharpnessScore ?? quality.sharpnessScore) - 10) {
        regressions.push(`Sharpness: ${item?.beforeSharpnessScore ?? '?'}→${Math.round(quality.sharpnessScore)}`);
      }
      if (quality.blurScore < (item?.beforeBlurScore ?? quality.blurScore) - 10) {
        regressions.push(`Blur: ${item?.beforeBlurScore ?? '?'}→${Math.round(quality.blurScore)}`);
      }
      if ((analysis.resolution.width * analysis.resolution.height) < ((item?.imageResolutionWidth ?? 0) * (item?.imageResolutionHeight ?? 0)) * 0.5) {
        regressions.push(`Resolution: lost detail`);
      }
      const qualityRegressionStage = regressions.length > 0 ? "RESTORATION_PIPELINE" : null;
      const qualityRegressionDetail = regressions.length > 0 ? regressions.join("; ") : null;

      await prisma.restorationItem.update({
        where: { id: itemId },
        data: {
          afterBlurScore: Math.round(quality.blurScore),
          afterNoiseScore: Math.round(quality.noiseScore),
          afterSharpnessScore: Math.round(quality.sharpnessScore),
          afterBrightnessScore: Math.round(quality.brightnessScore),
          afterContrastScore: Math.round(quality.contrastScore),
          afterColorCastScore: Math.round(quality.colorCastScore),
          afterQualityScore: quality.overallScore,
          ssimScore: verification.metrics.ssim,
          psnrScore: verification.metrics.psnr,
          printQuality: verification.metrics.printQuality,
          qualityRegressionStage,
          qualityRegressionDetail
        }
      });

      logger.info("RestorationEngine after-quality stored", {
        itemId,
        beforeOverall: beforeQuality.overallScore,
        afterOverall: quality.overallScore,
        blurImprovement: Math.round(quality.blurScore - beforeQuality.blurScore),
        sharpnessImprovement: Math.round(quality.sharpnessScore - beforeQuality.sharpnessScore),
        ssim: verification.metrics.ssim,
        psnr: verification.metrics.psnr,
        verificationPassed: verification.passed
      });

      return {
        quality,
        damage,
        pipeline: { steps: pipeline.steps, estimatedDurationMs: pipeline.estimatedDurationMs, estimatedCost: pipeline.estimatedCost },
        verification: { passed: verification.passed, metrics: verification.metrics, confidence: verification.confidence }
      };
    }

    // Before-analysis: store quality metrics and run pipeline verification
    // Use synthetic after-quality for pipeline-level verification only
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

    logger.info("RestorationEngine before-quality stored", {
      itemId,
      overallScore: quality.overallScore,
      damageSeverity: damage.damageSeverity,
      faceCount: analysis.faceCount,
      pipelineSteps: pipeline.steps.length,
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
