import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { FlatLayService, type FlatLayInput, type FlatLayOutput } from "../services/creative-studio/flat-lay";
import { LifestyleSceneService, type LifestyleSceneInput, type LifestyleSceneOutput } from "../services/creative-studio/lifestyle-scene";
import { AppError, toErrorMessage } from "../utils/errors";

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const decodeBase64Input = (input: string) => {
  const cleaned = input.trim();
  const base64 = cleaned.includes(",") ? cleaned.slice(cleaned.indexOf(",") + 1) : cleaned;
  return Buffer.from(base64, "base64");
};

export class CreativeController {
  private readonly flatLayService = new FlatLayService();
  private readonly lifestyleSceneService = new LifestyleSceneService();

  constructor(private readonly config: AppConfig) {}

  createFlatLay = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
      }

      const payload = req.body;
      const fileName = String(payload.fileName || "flat-lay.png").trim();
      const contentType = String(payload.contentType || "image/png").trim().toLowerCase();
      const bodyBase64 = String(payload.bodyBase64 || "").trim();
      const template = payload.template as any;
      const background = payload.background as "white" | "marble" | "wood" | "ecommerce";
      const orderId = payload.orderId as string | undefined;

      if (!bodyBase64) {
        throw new AppError("bodyBase64 is required", 400, "NO_IMAGE");
      }

      if (!SUPPORTED_IMAGE_MIME_TYPES.has(contentType)) {
        throw new AppError("Unsupported image type", 415, "UNSUPPORTED_IMAGE_TYPE");
      }

      const body = decodeBase64Input(bodyBase64);
      if (body.length === 0) {
        throw new AppError("Uploaded file is empty", 400, "EMPTY_FILE");
      }
      if (body.length > MAX_IMAGE_BYTES) {
        throw new AppError("Image exceeds size limit of 20 MB", 413, "IMAGE_TOO_LARGE");
      }

      const input: FlatLayInput = {
        body,
        contentType,
        fileName,
        template,
        background,
        orderId
      };

      const result = await this.flatLayService.generate(input);

      res.status(200).json({
        success: true,
        data: {
          requestId: result.requestId,
          contentType: result.contentType,
          fileName: result.fileName,
          durationMs: result.durationMs
        }
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
        return;
      }
      res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
    }
  };

  createLifestyleScene = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
      }

      const payload = req.body;
      const fileName = String(payload.fileName || "lifestyle-scene.png").trim();
      const contentType = String(payload.contentType || "image/png").trim().toLowerCase();
      const bodyBase64 = String(payload.bodyBase64 || "").trim();
      const template = payload.template as "home" | "office" | "luxury" | "outdoor";
      const orderId = payload.orderId as string | undefined;

      if (!bodyBase64) {
        throw new AppError("bodyBase64 is required", 400, "NO_IMAGE");
      }

      if (!SUPPORTED_IMAGE_MIME_TYPES.has(contentType)) {
        throw new AppError("Unsupported image type", 415, "UNSUPPORTED_IMAGE_TYPE");
      }

      const body = decodeBase64Input(bodyBase64);
      if (body.length === 0) {
        throw new AppError("Uploaded file is empty", 400, "EMPTY_FILE");
      }
      if (body.length > MAX_IMAGE_BYTES) {
        throw new AppError("Image exceeds size limit of 20 MB", 413, "IMAGE_TOO_LARGE");
      }

      const input: LifestyleSceneInput = {
        body,
        contentType,
        fileName,
        template,
        orderId
      };

      const result = await this.lifestyleSceneService.generate(input);

      res.status(200).json({
        success: true,
        data: {
          requestId: result.requestId,
          contentType: result.contentType,
          fileName: result.fileName,
          durationMs: result.durationMs
        }
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
        return;
      }
      res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
    }
  };
}