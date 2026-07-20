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

export class QualityVerificationService {
  constructor(private readonly config: AppConfig) {}

  async verifyRestoration(request: QualityVerificationRequest): Promise<QualityVerificationResponse> {
    // Placeholder — implementation in Sprint 2
    void request;
    throw new Error("QualityVerificationService.verifyRestoration not yet implemented");
  }
}
