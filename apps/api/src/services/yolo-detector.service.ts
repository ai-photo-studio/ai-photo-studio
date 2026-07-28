import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import type { BoundingBox, CropCoordinates, ImageAnalysis, QualityScores } from "../providers/provider.interface";
import type { ServiceHealth } from "./service-health.types";

export type YoloDetectInput = {
  body: Buffer;
  contentType?: string;
  fileName?: string;
  marginPct?: number;
  canvasWidth?: number;
  canvasHeight?: number;
};

export type YoloDetectResult = {
  requestId: string;
  detection: {
    label: string;
    confidence: number;
    productDetected: boolean;
    boundingBox: BoundingBox;
    cropCoordinates: CropCoordinates;
    sourceDimensions: {
      width: number;
      height: number;
    };
    canvasDimensions: {
      width: number;
      height: number;
    };
  };
  quality: QualityScores;
  images: {
    contentType: string;
    fileName: string;
    croppedImageBase64: string;
    centeredImageBase64: string;
  };
};

type DetectResponseEnvelope = {
  success?: boolean;
  data?: YoloDetectResult;
  message?: string;
};

export class YoloDetectorService {
  constructor(private readonly config: AppConfig) {}

  async detect(input: YoloDetectInput): Promise<YoloDetectResult> {
    const baseUrl = this.config.YOLO_DETECTOR_URL.trim();
    if (!baseUrl) {
      throw new AppError("YOLO detector service is not configured", 503, "YOLO_DETECTOR_UNAVAILABLE");
    }

    const url = new URL(`${baseUrl.replace(/\/$/, "")}/detect`);
    if (typeof input.marginPct === "number") {
      url.searchParams.set("marginPct", String(input.marginPct));
    }
    if (typeof input.canvasWidth === "number") {
      url.searchParams.set("canvasWidth", String(input.canvasWidth));
    }
    if (typeof input.canvasHeight === "number") {
      url.searchParams.set("canvasHeight", String(input.canvasHeight));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": input.contentType || "application/octet-stream",
        "X-File-Name": input.fileName || "upload.jpg"
      },
      body: input.body as unknown as BodyInit
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn("YOLO detector request failed", { status: response.status });
      throw new AppError(`YOLO detector failed: ${body.slice(0, 200)}`, 502, "YOLO_DETECTOR_FAILED");
    }

    const json = (await response.json()) as DetectResponseEnvelope;
    const data = json.data;
    if (!data) {
      throw new AppError("YOLO detector returned no data", 502, "YOLO_DETECTOR_EMPTY");
    }
    return data;
  }

  async health(): Promise<ServiceHealth> {
    const baseUrl = this.config.YOLO_DETECTOR_URL.trim();
    if (!baseUrl) {
      return { healthy: false, status: "unconfigured", message: "YOLO_DETECTOR_URL is not configured", checkedAt: new Date().toISOString() };
    }

    try {
      const endpoint = `${baseUrl.replace(/\/$/, "")}/health`;
      const response = await fetch(endpoint, { method: "GET" });
      if (!response.ok) {
        const body = await response.text();
        return { healthy: false, status: "error", endpoint, statusCode: response.status, message: body.slice(0, 200), checkedAt: new Date().toISOString() };
      }
      return { healthy: true, status: "ok", endpoint, checkedAt: new Date().toISOString() };
    } catch (error) {
      return {
        healthy: false,
        status: "error",
        endpoint: `${baseUrl.replace(/\/$/, "")}/health`,
        message: error instanceof Error ? error.message : String(error),
        checkedAt: new Date().toISOString()
      };
    }
  }
}

export const toImageAnalysis = (result: YoloDetectResult): ImageAnalysis => ({
  requestId: result.requestId,
  label: result.detection.label,
  productDetected: result.detection.productDetected,
  confidence: result.detection.confidence,
  boundingBox: result.detection.boundingBox,
  cropCoordinates: result.detection.cropCoordinates,
  sourceDimensions: result.detection.sourceDimensions,
  canvasDimensions: result.detection.canvasDimensions,
  quality: result.quality
});
