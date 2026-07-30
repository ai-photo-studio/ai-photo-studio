import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { AppError, toErrorMessage } from "../utils/errors";
import { RestorationService } from "../services/restoration.service";
import { RestorationEngineService } from "../services/restoration-engine.service";
import { StorageService } from "../services/storage.service";
import { logger } from "../utils/logger";
import { matchesGuestOwnershipToken, readGuestOwnershipToken } from "../utils/guest-ownership";
import { extensionForMime, validateDownloadImage } from "../utils/image-binary";

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_WEB_IMAGE_BYTES = 10 * 1024 * 1024;

const decodeBase64Input = (input: string) => {
  const cleaned = input.trim();
  const base64 = cleaned.includes(",") ? cleaned.slice(cleaned.indexOf(",") + 1) : cleaned;
  return Buffer.from(base64, "base64");
};

export class RestorationController {
  private readonly restoration: RestorationService;
  private readonly engine: RestorationEngineService;
  private readonly storage: StorageService;

  constructor(private readonly config: AppConfig) {
    this.restoration = new RestorationService(config);
    this.engine = new RestorationEngineService(config);
    this.storage = new StorageService(config);
  }

  createOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, notes } = req.body ?? {};

      const order = await this.restoration.createOrder({
        userId: req.user?.sub,
        title: title || "Photo Restoration",
        notes
      });

      res.status(201).json({ success: true, data: order });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const order = await this.restoration.getOrderView(id);
      this.ensureOrderAccess(order, req);
      res.json({ success: true, data: order });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  listOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = this.requireUser(req);
      const orders = await this.restoration.listOrders(user.sub);
      res.json({ success: true, data: orders });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  addItem = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { fileName, contentType, bodyBase64 } = req.body ?? {};

      if (!fileName || !bodyBase64) {
        throw new AppError("fileName and bodyBase64 are required", 400, "INVALID_REQUEST");
      }

      const mimeType = String(contentType || "").trim().toLowerCase();
      if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
        throw new AppError("Unsupported image type. Use JPEG, PNG, or WebP", 415, "UNSUPPORTED_IMAGE_TYPE");
      }

      const body = decodeBase64Input(bodyBase64);
      if (body.length === 0) {
        throw new AppError("Uploaded file is empty", 400, "EMPTY_FILE");
      }
      if (body.length > MAX_WEB_IMAGE_BYTES) {
        throw new AppError("Image exceeds size limit of 10 MB", 413, "IMAGE_TOO_LARGE");
      }

      const order = await this.restoration.getOrder(id);
      this.ensureOrderAccess(order, req);

      const uploadResult = await this.storage.uploadOriginal({
        fileName,
        body,
        contentType: mimeType
      });

      const item = await this.restoration.addItem({
        restorationOrderId: id,
        originalStorageKey: uploadResult.key,
        mimeType,
        width: 0,
        height: 0,
        fileSizeBytes: body.length
      });

      res.status(201).json({
        success: true,
        data: {
          item,
          upload: {
            storageKey: uploadResult.key,
            url: uploadResult.url,
            expiresAt: uploadResult.expiresAt
          }
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  runQualityAnalysis = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, itemId } = req.params;

      const order = await this.restoration.getOrder(id);
      this.ensureOrderAccess(order, req);
      const item = order.items.find((i: { id: string }) => i.id === itemId);
      if (!item) throw new AppError("Restoration item not found", 404, "RESTORATION_ITEM_NOT_FOUND");

      const analysis = await this.engine.analyzeAndStore(item.originalStorageKey, item.mimeType || "image/jpeg", itemId);

      res.json({
        success: true,
        data: {
          quality: analysis.quality,
          damage: analysis.damage,
          pipeline: analysis.pipeline,
          verification: analysis.verification
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  generatePreview = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, itemId } = req.params;

      const order = await this.restoration.getOrder(id);
      this.ensureOrderAccess(order, req);
      const item = order.items.find((i: { id: string }) => i.id === itemId);
      if (!item) throw new AppError("Restoration item not found", 404, "RESTORATION_ITEM_NOT_FOUND");
      if (!item.finalStorageKey && item.status !== "COMPLETED") {
        throw new AppError("Restoration must be completed first", 400, "RESTORATION_NOT_COMPLETED");
      }

      const storageKey = item.finalStorageKey || item.originalStorageKey;
      const preview = await this.restoration.generatePreview(storageKey, itemId);

      res.json({
        success: true,
        data: preview
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  approveItem = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, itemId } = req.params;
      const { approved, notes } = req.body ?? {};

      const order = await this.restoration.getOrder(id);
      this.ensureOrderAccess(order, req);
      const item = order.items.find((i: { id: string }) => i.id === itemId);
      if (!item) throw new AppError("Restoration item not found", 404, "RESTORATION_ITEM_NOT_FOUND");

      if (approved) {
        await this.restoration.updateItemStatus(itemId, "APPROVED");
      } else {
        await this.restoration.updateItemStatus(itemId, "REJECTED");
      }

      res.json({
        success: true,
        data: { approved: !!approved, notes }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getDownload = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, itemId } = req.params;
      const item = await this.restoration.getOrder(id);
      this.ensureOrderAccess(item, req);
      const restorationItem = item.items.find((i: { id: string }) => i.id === itemId);
      if (!restorationItem) throw new AppError("Restoration item not found", 404, "RESTORATION_ITEM_NOT_FOUND");

      if (!restorationItem.previewStorageKey && restorationItem.status !== "COMPLETED") {
        throw new AppError("Restoration not yet completed", 400, "RESTORATION_NOT_COMPLETED");
      }

       const download = await this.restoration.resolveDownload(itemId, req.body?.tier || req.query.tier as string | undefined, this.config.allowUnpaidDownloads);
       const file = await this.restoration.downloadFile(download.storageKey);
       const validated = await validateDownloadImage(file.body);
       const safeStem = download.fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]/g, "_");
       const safeName = `${safeStem}.${extensionForMime(validated.mimeType)}`;
       res.setHeader("Content-Type", validated.mimeType);
       res.setHeader("Content-Length", String(file.body.length));
       res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
       res.setHeader("Cache-Control", "private, no-store");
       res.status(200).send(file.body);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  processItem = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id, itemId } = req.params;
      logger.info("E2E: processItem controller START", { itemId, orderId: id });

      const order = await this.restoration.getOrder(id);
      this.ensureOrderAccess(order, req);
      const item = order.items.find((i: { id: string }) => i.id === itemId);
      if (!item) throw new AppError("Restoration item not found", 404, "RESTORATION_ITEM_NOT_FOUND");

      // Payment gate: only process items after payment approval.
      // In demo mode (no payment gateway connected), accept PENDING status as well.
      if (order.status !== "APPROVED" && order.status !== "COMPLETED" && order.status !== "PENDING") {
        throw new AppError("Payment and review must be completed before processing", 402, "PAYMENT_REQUIRED");
      }

      void this.restoration.processItem(itemId).catch(async (error) => {
        logger.error("E2E: processItem CONTROLLER CATCH — restoration failed", {
          itemId,
          error: toErrorMessage(error)
        });
        try {
          const { prisma } = await import("../db/prisma");
          await prisma.restorationItem.update({
            where: { id: itemId },
            data: {
              status: "FAILED",
              errorMessage: toErrorMessage(error),
              processingStage: "RESTORATION_FAILED"
            }
          });
        } catch (dbErr) {
          logger.error("E2E: Failed to mark item FAILED from controller", {
            itemId, error: toErrorMessage(dbErr)
          });
        }
      });

      res.json({
        success: true,
        data: { message: "Restoration processing started" }
      });
      logger.info("E2E: processItem controller END — response sent", { itemId });
    } catch (error) {
      logger.error("E2E: processItem controller EXCEPTION", { itemId: req.params.itemId, error: toErrorMessage(error) });
      this.handleError(res, error);
    }
  };

  private requireUser(req: Request) {
    if (!req.user) {
      throw new AppError("Not authenticated", 401, "UNAUTHORIZED");
    }
    return req.user;
  }

  private ensureOrderAccess(order: { userId: string | null; guestOwnershipTokenHash?: string | null }, req: Request) {
    if (req.user?.sub && order.userId) {
      if (req.user.sub !== order.userId) {
        throw new AppError("Order does not belong to the current user", 403, "FORBIDDEN");
      }
      return;
    }

    const guestToken = readGuestOwnershipToken(req.headers as Record<string, unknown>);
    if (guestToken && matchesGuestOwnershipToken(order.guestOwnershipTokenHash, guestToken)) {
      return;
    }

    if (req.user?.sub && !order.userId) {
      return;
    }

    throw new AppError("Guest ownership token is required", 401, "UNAUTHORIZED");
  }

  private handleError(res: Response, error: unknown) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
  }
}
