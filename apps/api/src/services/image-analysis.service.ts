import { StorageService } from "./storage.service";
import type { AppConfig } from "../config/env";
import { RetinaFaceService } from "./retina-face.service";
import { logger } from "../utils/logger";

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

function toGrayScale(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export class ImageAnalysisService {
  private readonly storage: StorageService;
  private readonly retinaFace: RetinaFaceService;

  constructor(private readonly config: AppConfig) {
    this.storage = new StorageService(config);
    this.retinaFace = new RetinaFaceService(config);
  }

  async analyzeImage(request: ImageAnalysisRequest): Promise<ImageAnalysisResponse> {
    const startTime = Date.now();
    const { body } = await this.storage.downloadFile(request.storageKey);

    const { width, height } = this.parseDimensions(body, request.mimeType);

    const pixels = this.extractPixelData(body, width, height);

    const qualityMetrics = this.computeQualityMetrics(pixels, width, height);
    const colorMode = this.detectColorMode(pixels);
    const overallScore = this.computeOverallScore(qualityMetrics);

    const faceResult = await this.retinaFace.detectFaces({ storageKey: request.storageKey, mimeType: request.mimeType });

    const imageCategory = this.classifyImageCategory(colorMode === "black_and_white", faceResult.faceCount);

    const processingTimeMs = Date.now() - startTime;

    return {
      resolution: { width, height },
      colorMode,
      faceCount: faceResult.faceCount,
      faceConfidence: faceResult.faceConfidence,
      imageCategory,
      qualityMetrics: { ...qualityMetrics, overallScore },
      processingTimeMs
    };
  }

  private parseDimensions(body: Buffer, mimeType: string): { width: number; height: number } {
    if (mimeType === "image/png" && body.length > 24) {
      const width = body.readUInt32BE(16);
      const height = body.readUInt32BE(20);
      if (width > 0 && height > 0 && width < 100000 && height < 100000) {
        return { width, height };
      }
    }
    if ((mimeType === "image/jpeg" || mimeType === "image/jpg") && body.length > 2) {
      let offset = 2;
      while (offset + 8 < body.length) {
        if (body[offset] === 0xFF && body[offset + 1] === 0xC0) {
          const h = body.readUInt16BE(offset + 5);
          const w = body.readUInt16BE(offset + 7);
          if (w > 0 && h > 0 && w < 100000 && h < 100000) {
            return { width: w, height: h };
          }
        }
        const segLen = body.readUInt16BE(offset + 2);
        if (segLen < 2) break;
        offset += segLen + 2;
        if (offset >= body.length) break;
      }
    }

    const approxSide = Math.round(Math.sqrt(body.length / 3));
    return { width: approxSide, height: approxSide };
  }

  private extractPixelData(body: Buffer, width: number, height: number): Uint8Array {
    const totalPixels = Math.min(width * height, 200000);
    const pixelData = new Uint8Array(totalPixels * 3);

    if (body.length >= totalPixels * 3 + 54) {
      const bmpOffset = body.readUInt32LE(10);
      const rowSize = Math.ceil(width * 3 / 4) * 4;
      let pixelIdx = 0;
      for (let y = height - 1; y >= 0 && pixelIdx < totalPixels * 3; y--) {
        for (let x = 0; x < width && pixelIdx < totalPixels * 3; x++) {
          const src = bmpOffset + y * rowSize + x * 3;
          if (src + 2 < body.length) {
            pixelData[pixelIdx++] = body[src + 2];
            pixelData[pixelIdx++] = body[src + 1];
            pixelData[pixelIdx++] = body[src];
          }
        }
      }
      if (pixelIdx > 0) return pixelData.subarray(0, pixelIdx);
    }

    const step = Math.max(1, Math.floor(body.length / (totalPixels * 3)));
    let pixelIdx = 0;
    for (let i = 54; i + 2 < body.length && pixelIdx < totalPixels * 3; i += step * 3) {
      pixelData[pixelIdx++] = body[i];
      pixelData[pixelIdx++] = body[i + 1];
      pixelData[pixelIdx++] = body[i + 2];
    }

    return pixelData.subarray(0, pixelIdx > 0 ? pixelIdx : 3);
  }

  private computeQualityMetrics(
    pixels: Uint8Array,
    _width: number,
    _height: number
  ): Omit<QualityMetrics, "overallScore"> {
    if (pixels.length < 6) {
      return { blurScore: 50, noiseScore: 50, sharpnessScore: 50, brightnessScore: 50, contrastScore: 50, colorCastScore: 50 };
    }

    const pixelCount = pixels.length / 3;
    let sumR = 0, sumG = 0, sumB = 0;
    let sumGray = 0;
    let maxDiff = 0;
    let prevGray = toGrayScale(pixels[0], pixels[1], pixels[2]);
    let totalEdge = 0;

    for (let i = 0; i < pixelCount; i++) {
      const r = pixels[i * 3];
      const g = pixels[i * 3 + 1];
      const b = pixels[i * 3 + 2];
      const gray = toGrayScale(r, g, b);

      sumR += r; sumG += g; sumB += b;
      sumGray += gray;

      const edge = Math.abs(gray - prevGray);
      totalEdge += edge;
      if (edge > maxDiff) maxDiff = edge;
      prevGray = gray;
    }

    const avgGray = sumGray / pixelCount;
    const avgR = sumR / pixelCount;
    const avgG = sumG / pixelCount;
    const avgB = sumB / pixelCount;

    let variance = 0;
    for (let i = 0; i < pixelCount; i++) {
      const gray = toGrayScale(pixels[i * 3], pixels[i * 3 + 1], pixels[i * 3 + 2]);
      variance += (gray - avgGray) ** 2;
    }
    variance /= pixelCount;
    const stdDev = Math.sqrt(variance);

    const avgEdge = totalEdge / pixelCount;

    const blurScore = clamp(Math.min(100, (avgEdge / 30) * 100));
    const noiseScore = clamp(Math.min(100, (stdDev / 40) * 100));
    const sharpnessScore = clamp(Math.min(100, (maxDiff / 255) * 100));
    const brightnessScore = clamp((avgGray / 255) * 100);
    const contrastScore = clamp((stdDev / 127) * 100);
    const colorCastScore = clamp(
      (Math.abs(avgR - avgG) + Math.abs(avgG - avgB) + Math.abs(avgB - avgR)) / (255 * 3) * 100
    );

    return { blurScore, noiseScore, sharpnessScore, brightnessScore, contrastScore, colorCastScore };
  }

  private computeOverallScore(metrics: Omit<QualityMetrics, "overallScore">): number {
    const weighted =
      metrics.sharpnessScore * 0.20 +
      metrics.blurScore * 0.15 +
      (100 - metrics.noiseScore) * 0.15 +
      metrics.brightnessScore * 0.10 +
      metrics.contrastScore * 0.15 +
      (100 - metrics.colorCastScore) * 0.10 +
      metrics.sharpnessScore * 0.15;
    return clamp(Math.round(weighted));
  }

  private detectColorMode(pixels: Uint8Array): "color" | "black_and_white" {
    const pixelCount = Math.min(pixels.length / 3, 5000);
    let colorDeviation = 0;

    for (let i = 0; i < pixelCount; i++) {
      const r = pixels[i * 3];
      const g = pixels[i * 3 + 1];
      const b = pixels[i * 3 + 2];
      colorDeviation += Math.abs(r - g) + Math.abs(g - b) + Math.abs(b - r);
    }

    const avgDeviation = colorDeviation / pixelCount;
    return avgDeviation < 15 ? "black_and_white" : "color";
  }

  private classifyImageCategory(isBw: boolean, faceCount: number): ImageCategory {
    if (isBw) return "BLACK_WHITE";
    if (faceCount >= 3) return "GROUP_PHOTO";
    if (faceCount >= 2) return "WEDDING";
    if (faceCount === 1) return "PORTRAIT";
    if (faceCount > 0) return "FACE";
    return "GENERAL";
  }
}
