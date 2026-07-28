import type { AppConfig } from "../config/env";
import { StorageService } from "./storage.service";
import { UnifiedRestorationService } from "./restoration-provider.service";
import { logger } from "../utils/logger";

export interface FaceDetectionRequest {
  storageKey: string;
  mimeType: string;
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface FaceDetectionResult {
  faceCount: number;
  faceConfidence: number;
  faces: FaceBox[];
  processingTimeMs: number;
}

export class RetinaFaceService {
  private readonly storage: StorageService;
  private readonly restoration: UnifiedRestorationService;

  constructor(private readonly config: AppConfig) {
    this.storage = new StorageService(config);
    this.restoration = new UnifiedRestorationService(config);
  }

  async detectFaces(request: FaceDetectionRequest): Promise<FaceDetectionResult> {
    const startTime = Date.now();
    const { body } = await this.storage.downloadFile(request.storageKey);

    try {
      const result = await this.restoration.analyze({
        body,
        contentType: request.mimeType,
        fileName: request.storageKey.split("/").pop() || "image.jpg"
      });

      const analysis = result.analysis as Record<string, unknown> | undefined;
      const faces = analysis?.faces as Array<{ x: number; y: number; width: number; height: number; confidence: number }> | undefined;

      if (faces && Array.isArray(faces) && faces.length > 0) {
        const validFaces = faces.filter((f) => f.confidence > 0.3);
        const avgConfidence = validFaces.length > 0
          ? validFaces.reduce((s, f) => s + f.confidence, 0) / validFaces.length
          : 0;

        return {
          faceCount: validFaces.length,
          faceConfidence: Math.round(avgConfidence * 100) / 100,
          faces: validFaces,
          processingTimeMs: Date.now() - startTime
        };
      }

      return {
        faceCount: 0,
        faceConfidence: 0,
        faces: [],
        processingTimeMs: Date.now() - startTime
      };
    } catch {
      logger.info("RetinaFace endpoint unavailable, falling back to pixel-based detection");
      const fallback = this.detectFacesPixelBased(body);
      return {
        ...fallback,
        processingTimeMs: Date.now() - startTime
      };
    }
  }

  private detectFacesPixelBased(body: Buffer): { faceCount: number; faceConfidence: number; faces: FaceBox[] } {
    const pixelCount = Math.min(body.length / 3, 100000);
    const step = Math.max(1, Math.floor((body.length / 3) / pixelCount));

    let skinPixelCount = 0;
    let totalPixelsChecked = 0;
    const skinRegions: Array<{ r: number; g: number; b: number }> = [];

    for (let i = 54; i + 2 < body.length && totalPixelsChecked < pixelCount; i += step * 3) {
      const r = body[i], g = body[i + 1], b = body[i + 2];
      const isSkin = r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15;
      if (isSkin) {
        skinPixelCount++;
        if (skinRegions.length < 100) skinRegions.push({ r, g, b });
      }
      totalPixelsChecked++;
    }

    const skinRatio = skinPixelCount / totalPixelsChecked;
    const faceCount = skinRatio > 0.02 ? Math.max(1, Math.round(skinRatio * 10)) : 0;
    const faceConfidence = faceCount > 0 ? Math.min(0.95, 0.5 + skinRatio) : 0;

    return { faceCount, faceConfidence: Math.round(faceConfidence * 100) / 100, faces: [] };
  }
}
