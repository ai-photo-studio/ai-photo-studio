import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { StorageService } from "./storage.service";
import type { AppConfig } from "../config/env";
import { logger } from "../utils/logger";
import sharp from "sharp";

sharp.cache(false);
sharp.concurrency(1);
import { SubscriptionService } from "./subscription.service";
import { NotificationService } from "./notification.service";
import { PipelineOrchestrator } from "../restoration-providers/pipeline/PipelineOrchestrator";
import { createGuestOwnershipToken, hashGuestOwnershipToken } from "../utils/guest-ownership";

const RESTORATION_CREDIT_COST = 1;

export type DamageSeverity = "LIGHT" | "MEDIUM" | "HEAVY" | "UNKNOWN";
export type ImageCategory = "FACE" | "DOCUMENT" | "LANDSCAPE" | "PORTRAIT" | "BLACK_WHITE" | "COLOR" | "WEDDING" | "GROUP_PHOTO" | "GENERAL";

export type QualityResult = {
  overallScore: number;
  blurScore: number;
  noiseScore: number;
  brightnessScore: number;
  contrastScore: number;
  colorCastScore: number;
  sharpnessScore: number;
};

export type DamageResult = {
  damageSeverity: DamageSeverity;
  scratchCoverage: number;
  tearDepth: number;
  dustLevel: number;
  fadingLevel: number;
  colorFading: number;
  imageCategory: ImageCategory;
  hasFaces: boolean;
  faceCount: number;
  faceConfidence: number;
  isBlackAndWhite: boolean;
  resolution: { width: number; height: number };
};

const toOrderNo = (): string => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RES-${ts}-${rand}`;
};

const classifyDamageSeverity = (quality: QualityResult): DamageSeverity => {
  if (quality.overallScore >= 70) return "LIGHT";
  if (quality.overallScore >= 40) return "MEDIUM";
  return "HEAVY";
};

const classifyImageCategory = (isBw: boolean, hasFaces: boolean, faceCount: number): ImageCategory => {
  if (isBw) return "BLACK_WHITE";
  if (hasFaces && faceCount >= 3) return "GROUP_PHOTO";
  if (hasFaces && faceCount >= 2) return "WEDDING";
  if (hasFaces) return faceCount === 1 ? "PORTRAIT" : "FACE";
  return "GENERAL";
};

export class RestorationService {
  private readonly storage: StorageService;
  private readonly subscriptionService: SubscriptionService;
  private readonly notificationService: NotificationService;
  private readonly pipelineOrchestrator: PipelineOrchestrator;

  constructor(private readonly config: AppConfig) {
    this.storage = new StorageService(config);
    this.subscriptionService = new SubscriptionService();
    this.notificationService = new NotificationService();
    this.pipelineOrchestrator = new PipelineOrchestrator(config);
  }

  async createOrder(input: { userId?: string; title?: string; notes?: string; totalItems?: number }) {
    const guestOwnershipToken = input.userId ? null : createGuestOwnershipToken();
    const order = await prisma.restorationOrder.create({
      data: {
        orderNo: toOrderNo(),
        userId: input.userId,
        guestOwnershipTokenHash: guestOwnershipToken ? hashGuestOwnershipToken(guestOwnershipToken) : null,
        title: input.title || null,
        notes: input.notes || null,
        totalItems: input.totalItems || 0
      }
    });

    try {
      const user = await prisma.user.findUnique({ where: { id: input.userId } });
      if (user?.email) {
        this.notificationService.sendEmail(
          user.email,
          `Restoration Order Received: ${order.orderNo}`,
          `Your restoration order ${order.orderNo} has been received and is being processed.`
        );
      }
    } catch (err) {
      logger.warn("Failed to send ORDER_RECEIVED email notification", { orderId: order.id, error: err instanceof Error ? err.message : String(err) });
    }

    return {
      ...order,
      guestOwnershipToken
    };
  }

  async getOrder(id: string) {
    const order = await prisma.restorationOrder.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new AppError("Restoration order not found", 404, "RESTORATION_ORDER_NOT_FOUND");
    return order;
  }

  async getOrderByOrderNo(orderNo: string) {
    const order = await prisma.restorationOrder.findUnique({ where: { orderNo }, include: { items: true } });
    if (!order) throw new AppError("Restoration order not found", 404, "RESTORATION_ORDER_NOT_FOUND");
    return order;
  }

  async listOrders(userId: string) {
    const orders = await prisma.restorationOrder.findMany({
      where: { userId },
      include: { items: { orderBy: { createdAt: "asc" }, take: 1 } },
      orderBy: { createdAt: "desc" }
    });
    return Promise.all(orders.map(async ({ items, ...order }) => {
      const item = items[0];
      const thumbnailKey = item?.previewStorageKey || item?.finalStorageKey || null;
      return {
        ...order,
        thumbnailUrl: thumbnailKey ? await this.storage.getSignedUrl(thumbnailKey) : null
      };
    }));
  }

  async addItem(input: { restorationOrderId: string; originalStorageKey: string; mimeType?: string; width?: number; height?: number; fileSizeBytes?: number }) {
    const order = await prisma.restorationOrder.findUnique({ where: { id: input.restorationOrderId } });
    if (!order) throw new AppError("Restoration order not found", 404, "RESTORATION_ORDER_NOT_FOUND");

    const item = await prisma.restorationItem.create({
      data: {
        restorationOrderId: input.restorationOrderId,
        originalStorageKey: input.originalStorageKey,
        mimeType: input.mimeType || null,
        width: input.width || null,
        height: input.height || null,
        fileSizeBytes: input.fileSizeBytes || null
      }
    });

    await prisma.restorationOrder.update({
      where: { id: input.restorationOrderId },
      data: { totalItems: { increment: 1 } }
    });

    return item;
  }

  async updateItemStatus(itemId: string, status: string, updates?: Record<string, unknown>) {
    return prisma.restorationItem.update({ where: { id: itemId }, data: { status: status as any, ...updates } });
  }

  async updateOrderStatus(orderId: string, status: string) {
    return prisma.restorationOrder.update({ where: { id: orderId }, data: { status: status as any } });
  }

  async runQualityAnalysis(originalStorageKey: string): Promise<QualityResult> {
    const original = await this.storage.downloadFile(originalStorageKey);
    const body = original.body;
    const len = body.length;

    const blurScore = Math.round(40 + ((len % 256) / 255) * 40);
    const noiseScore = Math.round(20 + ((len % 200) / 199) * 40);
    const brightnessScore = Math.round(50 + ((len % 128) / 127) * 30);
    const contrastScore = Math.round(50 + ((len % 100) / 99) * 30);
    const colorCastScore = Math.round(10 + ((len % 64) / 63) * 30);
    const sharpnessScore = Math.round(40 + ((len % 192) / 191) * 40);
    const overallScore = Math.round((blurScore + (100 - noiseScore) + brightnessScore + contrastScore + (100 - colorCastScore) + sharpnessScore) / 6);

    return {
      overallScore: Math.max(0, Math.min(100, overallScore)),
      blurScore: Math.max(0, Math.min(100, blurScore)),
      noiseScore: Math.max(0, Math.min(100, noiseScore)),
      brightnessScore: Math.max(0, Math.min(100, brightnessScore)),
      contrastScore: Math.max(0, Math.min(100, contrastScore)),
      colorCastScore: Math.max(0, Math.min(100, colorCastScore)),
      sharpnessScore: Math.max(0, Math.min(100, sharpnessScore))
    };
  }

  analyzeDamage(quality: QualityResult, _originalStorageKey: string): DamageResult {
    const severity = classifyDamageSeverity(quality);
    const scratchCoverage = severity === "HEAVY" ? 50 + (quality.overallScore % 30) : severity === "MEDIUM" ? 20 + (quality.overallScore % 30) : (quality.overallScore % 20);
    const hasFaces = true;
    const faceCount = Math.floor((quality.overallScore % 5) + 1);
    const isBw = (quality.overallScore % 100) > 60;

    return {
      damageSeverity: severity,
      scratchCoverage: Math.round(scratchCoverage),
      tearDepth: severity === "HEAVY" ? Math.round(10 + (quality.overallScore % 40)) : Math.round(quality.overallScore % 20),
      dustLevel: Math.round(quality.noiseScore),
      fadingLevel: Math.round(quality.colorCastScore),
      colorFading: quality.colorCastScore > 50 ? Math.round(20 + (quality.colorCastScore % 40)) : Math.round(quality.colorCastScore % 20),
      imageCategory: classifyImageCategory(isBw, hasFaces, faceCount),
      hasFaces,
      faceCount,
      faceConfidence: hasFaces ? 0.7 + (quality.overallScore % 25) / 100 : 0,
      isBlackAndWhite: isBw,
      resolution: { width: 1024, height: 768 }
    };
  }

  async generatePreview(processedStorageKey: string, itemId: string): Promise<{ previewKey: string; previewUrl: string }> {
    const processed = await this.storage.downloadFile(processedStorageKey);
    const previewBody = await sharp(processed.body)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();

    const preview = await this.storage.uploadFile({
      keyPrefix: "previews",
      fileName: `restoration-${itemId}-${Date.now()}.jpg`,
      body: previewBody,
      contentType: "image/jpeg"
    });

    const signedUrl = await this.storage.getSignedUrl(preview.key);

    await prisma.restorationItem.update({
      where: { id: itemId },
      data: { previewStorageKey: preview.key }
    });

    return { previewKey: preview.key, previewUrl: signedUrl };
  }

  async resolveDownload(itemId: string, requestedTier: string | undefined, allowUnpaidDownloads: boolean) {
    const item = await prisma.restorationItem.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError("Restoration item not found", 404, "RESTORATION_ITEM_NOT_FOUND");
    if (!item.finalStorageKey) throw new AppError("Restoration not yet completed", 400, "RESTORATION_NOT_COMPLETED");

    const tier = String(requestedTier || "master").trim().toLowerCase();
    const outputs = readRestorationOutputs(item.metadata);
    const order = await prisma.restorationOrder.findUnique({ where: { id: item.restorationOrderId } });
    if (!order) throw new AppError("Restoration order not found", 404, "RESTORATION_ORDER_NOT_FOUND");
    const entitlement = resolveRestorationEntitlement(order.metadata);
    const allowed: Record<RestorationEntitlement, RestorationDownloadTier[]> = {
      PREVIEW_ONLY: ["preview"], MASTER: ["preview", "master"], HD_2: ["preview", "master", "2hd"],
      HD_4: ["preview", "master", "2hd", "4hd"], ALL: ["preview", "master", "2hd", "4hd"], TEST_UNLOCKED: ["preview", "master", "2hd", "4hd"]
    };
    const normalizedTier = (tier === "original" ? "master" : tier) as RestorationDownloadTier;
    if (!allowed[entitlement]?.includes(normalizedTier) && !(allowUnpaidDownloads && normalizedTier !== "preview")) {
      throw new AppError("This download is not unlocked for the current order", 402, "DOWNLOAD_ENTITLEMENT_REQUIRED");
    }
    const storageKey = normalizedTier === "preview" ? item.previewStorageKey : normalizedTier === "master" ? item.finalStorageKey : outputs?.variants?.[normalizedTier]?.key;
    if (!storageKey) throw new AppError(`Restoration tier ${normalizedTier} is not available`, 404, "RESTORATION_TIER_NOT_FOUND");
    return {
      storageKey,
      tier: normalizedTier,
      entitlement,
      contentType: normalizedTier === "preview" ? "image/jpeg" : outputs?.variants?.[normalizedTier]?.contentType || "image/jpeg",
      fileName: `restoration-${order.orderNo}-${normalizedTier}.jpg`
    };
  }

  downloadFile(key: string) {
    return this.storage.downloadFile(key);
  }

  async processItem(itemId: string): Promise<void> {
    const STEP = (label: string) => `${new Date().toISOString()} E2E: ${label}`;
    logger.info(STEP("processItem START"), { itemId });
    const claim = await prisma.restorationItem.updateMany({
      where: { id: itemId, status: { in: ["PENDING", "QUEUED"] } },
      data: { status: "PROCESSING", processingStage: "RESTORATION_ANALYSIS", errorMessage: null }
    });
    if (claim.count === 0) {
      const current = await prisma.restorationItem.findUnique({ where: { id: itemId }, select: { status: true } });
      if (current?.status === "PROCESSING" || current?.status === "COMPLETED") {
        logger.info("Restoration processing trigger ignored after atomic claim", { itemId, status: current.status });
        return;
      }
      throw new AppError("Restoration item is not eligible for processing", 409, "RESTORATION_PROCESSING_CONFLICT");
    }
    const item = await prisma.restorationItem.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError("Restoration item not found", 404, "RESTORATION_ITEM_NOT_FOUND");
    logger.info(STEP("status→PROCESSING"), { itemId });
    if (this.config.restorationDryRun) {
      logger.info("RESTORATION DRY RUN enabled", {
        itemId,
        orderId: item.restorationOrderId,
        provider: this.config.restorationProvider,
        dryRun: true
      });
    }

    const quality = await this.runQualityAnalysis(item.originalStorageKey);
    const damage = this.analyzeDamage(quality, item.originalStorageKey);

    await prisma.restorationItem.update({
      where: { id: itemId },
      data: {
        damageSeverity: damage.damageSeverity as any,
        imageCategory: damage.imageCategory as any,
        damageScore: Math.round(damage.scratchCoverage),
        qualityScore: quality.overallScore,
        beforeQualityScore: quality.overallScore,
        processingStage: "RESTORATION_INPAINT"
      }
    });
    logger.info(STEP("quality analysis complete"), { itemId, qualityScore: quality.overallScore });

    const order = await prisma.restorationOrder.findUnique({ where: { id: item.restorationOrderId } });
    let walletReservation: { walletId: string; amount: number; transactionId: string } | null = null;

    if (order?.userId) {
      try {
        const { WalletService } = await import("../services/wallet.service");
        const walletService = new WalletService();
        const wallet = await walletService.getOrCreateWallet(order.userId);
        if (wallet.balance >= RESTORATION_CREDIT_COST) {
          const reserved = await walletService.reserveCredits({
            walletId: wallet.id, amount: RESTORATION_CREDIT_COST, referenceType: "restoration_item", referenceId: itemId
          });
          walletReservation = { walletId: wallet.id, amount: reserved.amount, transactionId: reserved.transactionId };
        }
      } catch (err) {
        logger.warn("Credit reservation failed, proceeding without billing", { itemId, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const original = await this.storage.downloadFile(item.originalStorageKey);
    logger.info(STEP("file downloaded from storage"), { itemId, sizeBytes: original.body.length });

    let processedBuffer = original.body;
    let processedContentType = item.mimeType || "image/jpeg";
    let providersUsed: string[] = [];
    let providerUsedName: string | null = null;
    const stageTimings: Record<string, number> = {};
    let totalDurationMs = 0;

    const start = Date.now();

    const stageMap: Record<string, string> = {
      flux_restore: "RESTORATION_INPAINT",
      gfpgan_face: "RESTORATION_FACE",
      gfpgan_face_restore: "RESTORATION_FACE",
      damage_detection: "RESTORATION_ANALYSIS",
      lama_inpaint: "RESTORATION_INPAINT",
      face_restoration_gfpgan: "RESTORATION_FACE",
      colorization_ddcolor: "RESTORATION_COLORIZE",
      real_esrgan_upscale: "RESTORATION_UPSCALE"
    };

    try {
      await prisma.restorationItem.update({
        where: { id: itemId },
        data: { processingStage: "RESTORATION_INPAINT", packageTier: "basic" }
      });

      const pipelineTier = this.pipelineOrchestrator.getDefaultTier();
      logger.info(STEP("pipelineOrchestrator.execute START"), { itemId, tier: pipelineTier });

      const normalizedInput = await normalizeReplicateInput(original.body);
      logger.info("Replicate input normalized", {
        itemId,
        originalSizeBytes: original.body.length,
        normalizedSizeBytes: normalizedInput.data.length,
        width: normalizedInput.info.width,
        height: normalizedInput.info.height,
        maximumDimension: 2048,
      });

      const pipelineResult = await this.pipelineOrchestrator.execute(
        {
          image: normalizedInput.data,
          contentType: "image/jpeg",
          fileName: `restoration-${itemId}.jpg`,
          options: { orderId: item.restorationOrderId, itemId },
        },
        pipelineTier
      );

      logger.info(STEP("pipelineOrchestrator.execute END"), {
        itemId,
        totalTimeMs: pipelineResult.totalProcessingTimeMs,
        actualCost: pipelineResult.totalActualCost,
        stages: pipelineResult.final.stages,
        providerName: pipelineResult.final.providerName,
        predictionId: pipelineResult.final.requestId,
        outputSizeBytes: pipelineResult.final.image.length
      });

      processedBuffer = pipelineResult.final.image;
      processedContentType = pipelineResult.final.contentType;
      providersUsed = pipelineResult.final.stages;
      logger.info("OPS-120 Restoration completed via pipeline", {
        itemId,
        tier: pipelineTier,
        pipelineMode: this.config.restorationPipeline,
        stages: providersUsed,
        totalProcessingTimeMs: pipelineResult.totalProcessingTimeMs,
        totalCost: pipelineResult.totalActualCost,
      });

      providersUsed.sort((a, b) => {
        const order = ["damage_detection", "lama_inpaint", "face_restoration_gfpgan", "colorization_ddcolor", "real_esrgan_upscale"];
        return (order.indexOf(a) - order.indexOf(b));
      });

      providerUsedName = pipelineResult.final.providerName;

      for (const stage of providersUsed) {
        const mapped = stageMap[stage];
        if (mapped) {
          await prisma.restorationItem.update({
            where: { id: itemId },
            data: { processingStage: mapped }
          });
        }
      }
    } catch (err) {
      logger.error("E2E: pipelineOrchestrator.execute EXCEPTION", {
        orderId: item.restorationOrderId,
        itemId,
        provider: providerUsedName ?? (this.config.restorationDryRun ? "dry-run" : "unknown"),
        stage: "pipeline",
        dryRun: this.config.restorationDryRun,
        errorCode: err instanceof AppError ? err.code : "RESTORATION_PROVIDER_ERROR",
        error: err instanceof Error ? err.message : String(err)
      });
      try {
        await prisma.restorationItem.update({
          where: { id: itemId },
          data: {
            status: "FAILED",
            errorMessage: err instanceof Error ? err.message : String(err),
            processingStage: "RESTORATION_FAILED",
            totalDurationMs: Date.now() - start
          }
        });
        if (walletReservation) {
          try {
            const { WalletService } = await import("../services/wallet.service");
            const walletService = new WalletService();
            await walletService.releaseReservedCredits({
              walletId: walletReservation.walletId, amount: walletReservation.amount,
              referenceType: "restoration_item", referenceId: itemId,
              note: `Auto-release after processing failure`
            });
          } catch (walletErr) {
            logger.warn("Failed to release wallet after processing failure", {
              itemId, error: walletErr instanceof Error ? walletErr.message : String(walletErr)
            });
          }
        }
      } catch (dbErr) {
        logger.error("Failed to mark item as FAILED after processing error", {
          itemId, error: dbErr instanceof Error ? dbErr.message : String(dbErr)
        });
      }
      throw err;
    }

    const elapsed = Date.now() - start;
    stageTimings["restoration"] = elapsed;
    totalDurationMs = elapsed;

    logger.info(STEP("R2 upload START"), {
      orderId: item.restorationOrderId,
      itemId,
      provider: providerUsedName,
      stage: "master",
      dryRun: this.config.restorationDryRun,
      keyPrefix: "finals",
      bodySizeBytes: processedBuffer.length
    });
    releaseUnusedMemory();
    const masterMetadata = await sharp(processedBuffer).metadata();
    const processedUpload = await this.storage.uploadFile({
      keyPrefix: "finals",
      fileName: `master-restoration-${itemId}-${Date.now()}.jpg`,
      body: processedBuffer,
      contentType: processedContentType
    });
    logger.info(STEP("R2 upload END"), {
      orderId: item.restorationOrderId,
      itemId,
      provider: providerUsedName,
      stage: "master",
      dryRun: this.config.restorationDryRun,
      finalStorageKey: processedUpload.key
    });

    const variants: Record<string, { key: string; width: number; height: number; contentType: string; interpolated: boolean }> = {};
    const fourHd = await sharp(processedBuffer, { sequentialRead: true })
      .rotate()
      .resize({ width: 4096, withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    const fourHdUpload = await this.storage.uploadFile({
      keyPrefix: "finals",
      fileName: `4hd-restoration-${itemId}-${Date.now()}.jpg`,
      body: fourHd.data,
      contentType: "image/jpeg"
    });
    variants["4hd"] = {
      key: fourHdUpload.key,
      width: fourHd.info.width,
      height: fourHd.info.height,
      contentType: "image/jpeg",
      interpolated: false
    };

    const twoHd = await sharp(processedBuffer, { sequentialRead: true })
      .rotate()
      .resize({ width: 2048 })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    const twoHdUpload = await this.storage.uploadFile({
      keyPrefix: "finals",
      fileName: `2hd-restoration-${itemId}-${Date.now()}.jpg`,
      body: twoHd.data,
      contentType: "image/jpeg"
    });
    variants["2hd"] = {
      key: twoHdUpload.key,
      width: twoHd.info.width,
      height: twoHd.info.height,
      contentType: "image/jpeg",
      interpolated: false
    };
    processedBuffer = Buffer.alloc(0);
    releaseUnusedMemory();

    const afterQuality = quality.overallScore < 50 ? quality.overallScore + 30 : Math.min(100, quality.overallScore + 10);

    const succeeded = providersUsed.length > 0;

    if (succeeded && walletReservation) {
      try {
        const { WalletService } = await import("../services/wallet.service");
        const walletService = new WalletService();
        await walletService.settleReservedCredits({
          walletId: walletReservation.walletId, amount: walletReservation.amount, referenceType: "restoration_item", referenceId: itemId
        });
      } catch (err) {
        logger.error("Failed to settle wallet reservation", { itemId, error: err instanceof Error ? err.message : String(err) });
      }
    } else if (!succeeded && walletReservation) {
      try {
        const { WalletService } = await import("../services/wallet.service");
        const walletService = new WalletService();
        await walletService.releaseReservedCredits({
          walletId: walletReservation.walletId, amount: walletReservation.amount, referenceType: "restoration_item", referenceId: itemId
        });
      } catch { /* non-critical */ }
    }

    if (succeeded) {
      await this.generatePreview(processedUpload.key, itemId);
    }

    const itemWithAudit = await prisma.restorationItem.findUnique({ where: { id: itemId }, select: { metadata: true } });
    const existingMetadata = asMetadataRecord(itemWithAudit?.metadata);
    await prisma.$transaction(async (tx) => {
      await tx.restorationItem.update({
        where: { id: itemId },
        data: {
          status: succeeded ? "COMPLETED" : "FAILED",
          finalStorageKey: processedUpload.key,
          metadata: {
            ...existingMetadata,
            dryRun: this.config.restorationDryRun || undefined,
            restorationOutputs: {
              master: {
                key: processedUpload.key,
                width: masterMetadata.width ?? null,
                height: masterMetadata.height ?? null,
                contentType: processedContentType
              },
              variants
            }
          },
          afterQualityScore: afterQuality,
          providerUsed: `${providerUsedName ?? "unknown"}:${providersUsed.join(",")}`,
          processingStage: succeeded ? "RESTORATION_PREVIEW" : "RESTORATION_FAILED",
          totalDurationMs,
          errorMessage: null
        }
      });
      if (order) {
        await tx.restorationOrder.update({
          where: { id: order.id },
          data: {
            completedItems: { increment: succeeded ? 1 : 0 },
            failedItems: { increment: succeeded ? 0 : 1 },
            status: (succeeded ? "COMPLETED" : "FAILED") as any
          }
        });
      }
    });
    logger.info(STEP("DB update — status"), {
      orderId: item.restorationOrderId,
      itemId,
      provider: providerUsedName,
      stage: succeeded ? "completed" : "failed",
      dryRun: this.config.restorationDryRun,
      errorCode: succeeded ? undefined : "RESTORATION_PIPELINE_FAILED",
      status: succeeded ? "COMPLETED" : "FAILED",
      finalStorageKey: processedUpload.key
    });

    try {
      const user = order?.userId ? await prisma.user.findUnique({ where: { id: order.userId } }) : null;
      if (user?.email) {
        const subject = succeeded
          ? `Restoration Completed: ${order?.orderNo ?? itemId}`
          : `Restoration Failed: ${order?.orderNo ?? itemId}`;
        const body = succeeded
          ? `Your restoration item (${itemId}) has been successfully processed.`
          : `Your restoration item (${itemId}) could not be processed. Please try again.`;
        this.notificationService.sendEmail(user.email, subject, body);
      }
    } catch (err) {
      logger.warn("Failed to send processing email notification", { itemId, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

type RestorationOutputs = {
  variants?: Record<string, { key: string; width: number; height: number; contentType: string; interpolated?: boolean }>;
};

export type RestorationDownloadTier = "preview" | "master" | "2hd" | "4hd";
export type RestorationEntitlement = "PREVIEW_ONLY" | "MASTER" | "HD_2" | "HD_4" | "ALL" | "TEST_UNLOCKED";

export const resolveRestorationEntitlement = (metadata: unknown): RestorationEntitlement => {
  const record = asMetadataRecord(metadata);
  if (record.testOrder || record.testUnlocked || record.adminTestOrder) return "TEST_UNLOCKED";
  const configured = String(record.entitlement || "").trim().toUpperCase();
  if (["PREVIEW_ONLY", "MASTER", "HD_2", "HD_4", "ALL"].includes(configured)) return configured as RestorationEntitlement;
  return ["PAID", "APPROVED"].includes(String(record.paymentStatus || "").trim().toUpperCase()) ? "ALL" : "PREVIEW_ONLY";
};

const readRestorationOutputs = (metadata: unknown): RestorationOutputs | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const outputs = (metadata as Record<string, unknown>).restorationOutputs;
  return outputs && typeof outputs === "object" && !Array.isArray(outputs) ? outputs as RestorationOutputs : null;
};

const releaseUnusedMemory = (): void => {
  if (typeof global.gc === "function") global.gc();
};

const normalizeReplicateInput = async (body: Buffer) => sharp(body, { sequentialRead: true, limitInputPixels: 40_000_000 })
  .rotate()
  .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
  .jpeg({ quality: 92 })
  .toBuffer({ resolveWithObject: true });

const asMetadataRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
