import type { AppConfig } from "../config/env";

export interface ImageAnalysisRequest {
  storageKey: string;
  mimeType: string;
}

export interface ImageAnalysisResponse {
  resolution: { width: number; height: number };
  colorMode: "color" | "black_and_white";
  faceCount: number;
  faceConfidence: number;
  imageCategory: ImageCategory;
  qualityMetrics: QualityMetrics;
  processingTimeMs: number;
}

export interface QualityMetrics {
  blurScore: number;
  noiseScore: number;
  sharpnessScore: number;
  brightnessScore: number;
  contrastScore: number;
  colorCastScore: number;
  overallScore: number;
}

export type ImageCategory =
  | "FACE" | "DOCUMENT" | "LANDSCAPE" | "PORTRAIT"
  | "BLACK_WHITE" | "COLOR" | "WEDDING" | "GROUP_PHOTO" | "GENERAL";

export class ImageAnalysisService {
  constructor(private readonly config: AppConfig) {}

  async analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysisResponse> {
    // Placeholder — implementation in Sprint 2
    void request;
    throw new Error("ImageAnalysisService.analyzeImage not yet implemented");
  }
}
