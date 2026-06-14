import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { isPreviewLimitDisabled, PreviewQuotaService } from "../services/preview-quota.service";
import { verifyToken } from "../middleware/auth.middleware";
import { AppError, toErrorMessage } from "../utils/errors";
import { prisma } from "../db/prisma";

type WebPreviewPayload = {
  fileName?: string;
  contentType?: string;
  previewClientId?: string;
};

export class PreviewController {
  private readonly previewQuotaService = new PreviewQuotaService();

  constructor(private readonly config: AppConfig) {}

  claimWebPreview = async (req: Request, res: Response): Promise<void> => {
    try {
      const payload = (req.body || {}) as WebPreviewPayload;

      if (isPreviewLimitDisabled()) {
        res.status(201).json({
          success: true,
          data: {
            scopeType: "guest",
            limit: -1,
            used: 0,
            remaining: -1,
            isTestAccount: false,
            disabled: true
          }
        });
        return;
      }

      const user = this.resolveOptionalUser(req);

      let customerId: string | undefined;
      if (user?.sub) {
        const userWithCustomer = await prisma.user.findUnique({
          where: { id: user.sub },
          select: { customerId: true }
        });
        customerId = userWithCustomer?.customerId ?? undefined;
      }

      const result = await this.previewQuotaService.claimWebPreview({
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
