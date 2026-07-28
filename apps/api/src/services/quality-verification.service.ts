import type { AppConfig } from "../config/env";
import type { DamageDetectionResponse } from "./damage-detection.service";
import type { ImageAnalysisResponse } from "./image-analysis.service";

export interface QualityVerificationRequest {
  before: ImageAnalysisResponse["qualityMetrics"];
  after: ImageAnalysisResponse["qualityMetrics"];
  damage: DamageDetectionResponse;
  faceDetection: { faceCount: number; faceConfidence: number };
}

export interface QualityVerificationResponse {
  passed: boolean;
  metrics: VerificationMetrics;
  warnings: string[];
  failures: string[];
  confidence: number;
}

export interface VerificationMetrics {
  ssim: number;
  psnr: number;
  blurImprovement: number;
  noiseReduction: number;
  sharpnessImprovement: number;
  brightnessDelta: number;
  contrastImprovement: number;
  colorCastImprovement: number;
  damageReduction: number;
  artifactScore: number;
  printQuality: number;
  overallQuality: number;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

const SCORE_WEIGHTS = {
  blur: 0.15,
  noise: 0.15,
  sharpness: 0.20,
  brightness: 0.10,
  contrast: 0.15,
  colorCast: 0.10,
  overall: 0.15
};

export class QualityVerificationService {
  constructor(private readonly config: AppConfig) {}

  async verifyRestoration(request: QualityVerificationRequest): Promise<QualityVerificationResponse> {
    const before = request.before;
    const after = request.after;

    const ssim = this.calculateSSIM(before, after);
    const psnr = this.calculatePSNR(ssim);
    const blurImprovement = after.blurScore - before.blurScore;
    const noiseReduction = before.noiseScore - after.noiseScore;
    const sharpnessImprovement = after.sharpnessScore - before.sharpnessScore;
    const brightnessDelta = after.brightnessScore - before.brightnessScore;
    const contrastImprovement = after.contrastScore - before.contrastScore;
    const colorCastImprovement = before.colorCastScore - after.colorCastScore;

    const damageReduction = request.damage.coverage > 0
      ? Math.round(Math.max(0, request.damage.coverage * 0.3))
      : 0;

    const artifactScore = request.damage.artifactScore;
    const printQuality = this.calculatePrintQuality(after);
    const overallQuality = this.calculateOverallQuality(after);

    const confidence = this.calculateConfidence(before, after);

    const failures: string[] = [];
    const warnings: string[] = [];

    if (overallQuality < 50) failures.push(`Overall quality too low: ${overallQuality} < 50`);
    if (after.blurScore < 30) failures.push(`Blur score too low: ${after.blurScore} < 30`);
    if (after.sharpnessScore < 40) failures.push(`Sharpness score too low: ${after.sharpnessScore} < 40`);
    if (artifactScore > 25) failures.push(`Artifact score too high: ${artifactScore} > 25`);
    if (request.faceDetection.faceCount > 0 && request.faceDetection.faceConfidence < 0.6) {
      warnings.push(`Face confidence low: ${request.faceDetection.faceConfidence}`);
    }

    if (blurImprovement < -10) warnings.push(`Blur regressed by ${Math.abs(blurImprovement)} points`);
    if (sharpnessImprovement < -15) warnings.push(`Sharpness regressed by ${Math.abs(sharpnessImprovement)} points`);
    if (overallQuality < 70) warnings.push(`Overall quality ${overallQuality} below 70 threshold`);

    const passed = failures.length === 0;

    return {
      passed,
      metrics: {
        ssim: Math.round(ssim * 1000) / 1000,
        psnr: Math.round(psnr * 10) / 10,
        blurImprovement,
        noiseReduction,
        sharpnessImprovement,
        brightnessDelta,
        contrastImprovement,
        colorCastImprovement,
        damageReduction,
        artifactScore,
        printQuality,
        overallQuality
      },
      warnings,
      failures,
      confidence
    };
  }

  private calculateSSIM(before: ImageAnalysisResponse["qualityMetrics"], after: ImageAnalysisResponse["qualityMetrics"]): number {
    const scoreBefore = before.overallScore / 100;
    const scoreAfter = after.overallScore / 100;
    const ux = scoreBefore;
    const uy = scoreAfter;
    const sigmax = before.sharpnessScore / 100;
    const sigmay = after.sharpnessScore / 100;
    const sigmaxy = ((scoreBefore + scoreAfter) / 2) / 100;
    const c1 = 0.01, c2 = 0.03;
    const numerator = (2 * ux * uy + c1) * (2 * sigmaxy + c2);
    const denominator = (ux * ux + uy * uy + c1) * (sigmax * sigmax + sigmay * sigmay + c2);
    return denominator > 0 ? numerator / denominator : 0;
  }

  private calculatePSNR(ssim: number): number {
    const mse = (1 - ssim) * 255 * 255;
    if (mse <= 0) return 50;
    return 10 * Math.log10((255 * 255) / mse);
  }

  private calculatePrintQuality(metrics: ImageAnalysisResponse["qualityMetrics"]): number {
    return clamp(Math.round(
      metrics.sharpnessScore * 0.30 +
      metrics.contrastScore * 0.25 +
      metrics.blurScore * 0.25 +
      metrics.brightnessScore * 0.20
    ));
  }

  private calculateOverallQuality(metrics: ImageAnalysisResponse["qualityMetrics"]): number {
    return clamp(Math.round(
      metrics.blurScore * 0.15 +
      metrics.noiseScore * 0.15 +
      metrics.sharpnessScore * 0.20 +
      metrics.brightnessScore * 0.10 +
      metrics.contrastScore * 0.15 +
      metrics.colorCastScore * 0.10 +
      metrics.overallScore * 0.15
    ));
  }

  private calculateConfidence(
    before: ImageAnalysisResponse["qualityMetrics"],
    after: ImageAnalysisResponse["qualityMetrics"]
  ): number {
    let confidence = 0;
    confidence += (1 - before.blurScore / 100) * SCORE_WEIGHTS.blur;
    confidence += (1 - before.noiseScore / 100) * SCORE_WEIGHTS.noise;
    confidence += (after.sharpnessScore / 100) * SCORE_WEIGHTS.sharpness;
    confidence += (after.brightnessScore / 100) * SCORE_WEIGHTS.brightness;
    confidence += (after.contrastScore / 100) * SCORE_WEIGHTS.contrast;
    confidence += (1 - after.colorCastScore / 100) * SCORE_WEIGHTS.colorCast;
    confidence += (Math.min(after.overallScore, before.overallScore) / 100) * SCORE_WEIGHTS.overall;
    return Math.round(confidence * 1000) / 10;
  }
}
