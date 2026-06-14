import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { FlatLayService, type FlatLayInput } from "../services/creative-studio/flat-lay";
import { LifestyleSceneService, type LifestyleSceneInput } from "../services/creative-studio/lifestyle-scene";
import { VirtualModelService, type VirtualModelInput } from "../services/creative-studio/virtual-model";
import { VideoPrepService, type VideoPrepInput } from "../services/creative-studio/video-prep";
import { AppError, toErrorMessage } from "../utils/errors";
import { CustomerService } from "../services/customer.service";
import { SubscriptionService } from "../services/subscription.service";

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const SUPPORTED_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const decodeBase64Input = (input: string) => {
  const cleaned = input.trim();
  const base64 = cleaned.includes(",") ? cleaned.slice(cleaned.indexOf(",") + 1) : cleaned;
  return Buffer.from(base64, "base64");
};

export class CreativeController {
  private readonly flatLayService: FlatLayService;
  private readonly lifestyleSceneService: LifestyleSceneService;
  private readonly virtualModelService: VirtualModelService;
  private readonly videoPrepService: VideoPrepService;
  private readonly customerService = new CustomerService();
  private readonly subscriptionService = new SubscriptionService();

  constructor(private readonly config: AppConfig) {
    this.flatLayService = new FlatLayService(config);
    this.lifestyleSceneService = new LifestyleSceneService(config);
    this.virtualModelService = new VirtualModelService(config);
    this.videoPrepService = new VideoPrepService(config);
  }

  private async reserveCredit(userId: string): Promise<void> {
    const walletOverview = await this.customerService.getWalletOverview(userId);
    const hasSubscriptionCredits = walletOverview.activeSubscription &&
      walletOverview.activeSubscription.monthlyCreditLimit -
      walletOverview.activeSubscription.monthlyCreditsUsed -
      walletOverview.activeSubscription.monthlyCreditsReserved > 0;

    if (hasSubscriptionCredits && walletOverview.activeSubscription) {
      await this.subscriptionService.reserveUsage({
        subscriptionId: walletOverview.activeSubscription.id,
        amount: 1,
        referenceType: "creative_job",
        referenceId: `creative-${Date.now()}`,
        note: "Reserved for creative generation"
      });
      return;
    }

    if (walletOverview.summary.availableBalance > 0) {
      const { WalletService } = await import("../services/wallet.service");
      const walletService = new WalletService();
      const wallet = await walletService.getOrCreateWallet(userId);
      await walletService.reserveCredits({
        walletId: wallet.id,
        amount: 1,
        referenceType: "creative_job",
        referenceId: `creative-${Date.now()}`,
        note: "Reserved for creative generation"
      });
    }
  }

  createFlatLay = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
      }

      await this.reserveCredit(userId);

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

      await this.reserveCredit(userId);

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

  createVirtualModel = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
      }

      await this.reserveCredit(userId);

      const payload = req.body;
      const fileName = String(payload.fileName || "virtual-model.png").trim();
      const contentType = String(payload.contentType || "image/png").trim().toLowerCase();
      const bodyBase64 = String(payload.bodyBase64 || "").trim();
      const template = payload.template as "male" | "female" | "mannequin";
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

      const input: VirtualModelInput = {
        body,
        contentType,
        fileName,
        template,
        orderId
      };

      const result = await this.virtualModelService.generate(input);

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

  createVideoPrep = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
      }

      await this.reserveCredit(userId);

      const payload = req.body;
      const fileName = String(payload.fileName || "video.mp4").trim();
      const contentType = String(payload.contentType || "video/mp4").trim().toLowerCase();
      const bodyBase64 = String(payload.bodyBase64 || "").trim();
      const template = payload.template as "rotation" | "zoom" | "showcase";
      const orderId = payload.orderId as string | undefined;

      if (!bodyBase64) {
        throw new AppError("bodyBase64 is required", 400, "NO_IMAGE");
      }

      if (!SUPPORTED_VIDEO_MIME_TYPES.has(contentType)) {
        throw new AppError("Unsupported video type", 415, "UNSUPPORTED_VIDEO_TYPE");
      }

      const body = decodeBase64Input(bodyBase64);
      if (body.length === 0) {
        throw new AppError("Uploaded file is empty", 400, "EMPTY_FILE");
      }
      if (body.length > MAX_VIDEO_BYTES) {
        throw new AppError("Video exceeds size limit of 100 MB", 413, "VIDEO_TOO_LARGE");
      }

      const input: VideoPrepInput = {
        body,
        contentType,
        fileName,
        template,
        orderId
      };

      const result = await this.videoPrepService.prepare(input);

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

  private handleError(res: Response, error: unknown) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
  }
}