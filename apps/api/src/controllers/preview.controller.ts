import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { BackgroundRemoverService } from "../services/background-remover.service";
import { PreviewQuotaService } from "../services/preview-quota.service";
import { verifyToken } from "../middleware/auth.middleware";
import { AppError, toErrorMessage } from "../utils/errors";
import { prisma } from "../db/prisma";

type WebPreviewPayload = {
  fileName?: string;
  contentType?: string;
  previewClientId?: string;
  selectedActions?: string[];
};

type BackgroundRemovalPreviewPayload = WebPreviewPayload & {
  bodyBase64?: string;
};

export class PreviewController {
  private readonly previewQuotaService = new PreviewQuotaService();
  private readonly backgroundRemover: BackgroundRemoverService;

  constructor(private readonly config: AppConfig) {
    this.backgroundRemover = new BackgroundRemoverService(config);
  }

  unlimitedWebPreview = async (req: Request, res: Response): Promise<void> => {
    try {
      const payload = (req.body || {}) as WebPreviewPayload;

      const user = this.resolveOptionalUser(req);

      let customerId: string | undefined;
      if (user?.sub) {
        const userWithCustomer = await prisma.user.findUnique({
          where: { id: user.sub },
          select: { customerId: true }
        });
        customerId = userWithCustomer?.customerId ?? undefined;
      }

      const result = await this.previewQuotaService.getUnlimitedWebPreview({
        userId: user?.sub,
        customerId,
        previewClientId: payload.previewClientId,
        ipAddress: this.getRequestIp(req),
        userAgent: req.headers["user-agent"] ? String(req.headers["user-agent"]) : undefined,
        fileName: payload.fileName,
        contentType: payload.contentType
      });

      res.status(201).json({ success: true, data: result });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
        return;
      }
      res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
    }
  };

  removeBackgroundPreview = async (req: Request, res: Response): Promise<void> => {
    try {
      const payload = (req.body || {}) as BackgroundRemovalPreviewPayload;
      if (!payload.bodyBase64) {
        throw new AppError("Image bodyBase64 is required", 400, "IMAGE_REQUIRED");
      }

      const output = await this.backgroundRemover.productTransparent({
        body: Buffer.from(payload.bodyBase64, "base64"),
        contentType: payload.contentType || "image/png",
        fileName: payload.fileName || "background-removed.png"
      });

      res.status(201).json({
        success: true,
        data: {
          fileName: output.fileName,
          contentType: output.contentType,
          bodyBase64: output.body.toString("base64"),
          disabledPreviewLimit: true
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

  private resolveOptionalUser(req: Request) {
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith("bearer ")) return null;

    const token = header.slice(7).trim();
    try {
      return verifyToken(this.config, token);
    } catch {
      return null;
    }
  }

  private getRequestIp(req: Request) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      return forwarded.split(",")[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded[0]) {
      return forwarded[0].trim();
    }
    return req.ip || req.socket.remoteAddress || undefined;
  }
}
