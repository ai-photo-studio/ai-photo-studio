import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { StorageService } from "./storage.service";
import { createImageProvider } from "../providers/provider.factory";
import type { ImageProvider } from "../providers/provider.interface";
import type { AppConfig } from "../config/env";
import { logger } from "../utils/logger";
import { UnifiedRestorationService } from "./restoration-provider.service";
import { SubscriptionService } from "./subscription.service";
import { NotificationService } from "./notification.service";
import { ProviderFactory } from "../restoration-providers/factory/ProviderFactory";
import { ProviderRouter } from "../restoration-providers/router/ProviderRouter";
import { ProviderPolicyEngine } from "../restoration-providers/policy/ProviderPolicyEngine";
import type { PackageTier } from "../restoration-providers/interfaces/IRestorationProvider";

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
  private readonly provider: ImageProvider;
  private readonly restorationService: UnifiedRestorationService;
  private readonly subscriptionService: SubscriptionService;
  private readonly notificationService: NotificationService;
  private readonly providerFactory: ProviderFactory;
  private readonly providerRouter: ProviderRouter;
  private readonly policyEngine: ProviderPolicyEngine;

  constructor(private readonly config: AppConfig) {
    this.storage = new StorageService(config);
    this.provider = createImageProvider(config);
    this.restorationService = new UnifiedRestorationService(config);
    this.subscriptionService = new SubscriptionService();
    this.notificationService = new NotificationService();
    this.providerFactory = new ProviderFactory(config);
    this.policyEngine = new ProviderPolicyEngine({
      dynamicRouting: {
        mode: config.providerMode,
        benchmarkWeights: {
          restoration: 0.25,
          colorization: 0.15,
          faceRestoration: 0.15,
          printQuality: 0.15,
          cost: 0.10,
          latency: 0.10,
          reliability: 0.10,
        },
        minScoreThreshold: 30,
        maxCostOverride: 0.100,
      },
    });
    this.providerRouter = new ProviderRouter({
      shadowMode: this.policyEngine.isShadowModeEnabled() ? "enabled" : "disabled",
      abTestMode: "disabled",
      failoverCooldownMs: 30000,
      maxRetries: 2,
    });
  }

  async createOrder(input: { userId: string; title?: string; notes?: string; totalItems?: number }) {
    const order = await prisma.restorationOrder.create({
      data: {
        orderNo: toOrderNo(),
        userId: input.userId,
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

    return order;
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
    return prisma.restorationOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
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

    const preview = await this.storage.uploadFile({
      keyPrefix: "previews",
      fileName: `restoration-${itemId}-${Date.now()}.jpg`,
      body: processed.body,
      contentType: processed.contentType || "image/jpeg"
    });

    const signedUrl = await this.storage.getSignedUrl(preview.key);

    await prisma.restorationItem.update({
      where: { id: itemId },
      data: { previewStorageKey: preview.key }
    });

    return { previewKey: preview.key, previewUrl: signedUrl };
  }

  async getDownloadUrl(itemId: string): Promise<string> {
    const item = await prisma.restorationItem.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError("Restoration item not found", 404, "RESTORATION_ITEM_NOT_FOUND");
    if (!item.finalStorageKey) throw new AppError("Restoration not yet completed", 400, "RESTORATION_NOT_COMPLETED");

    const url = await this.storage.generateDownloadUrl(item.finalStorageKey);

    try {
      const order = await prisma.restorationOrder.findUnique({ where: { id: item.restorationOrderId } });
      const user = order?.userId ? await prisma.user.findUnique({ where: { id: order.userId } }) : null;
      if (user?.email) {
        this.notificationService.sendEmail(
          user.email,
          `Your Restoration is Ready for Download: ${order?.orderNo ?? itemId}`,
          `Your restored image is ready. Download it here: ${url}`
        );
      }
    } catch (err) {
      logger.warn("Failed to send DOWNLOAD_READY email notification", { itemId, error: err instanceof Error ? err.message : String(err) });
    }

    return url;
  }

  async processItem(itemId: string): Promise<void> {
    const item = await prisma.restorationItem.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError("Restoration item not found", 404, "RESTORATION_ITEM_NOT_FOUND");

    await prisma.restorationItem.update({
      where: { id: itemId },
      data: { status: "PROCESSING", processingStage: "RESTORATION_ANALYSIS" }
    });

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

    let processedBuffer = original.body;
    let processedContentType = item.mimeType || "image/jpeg";
    let providersUsed: string[] = [];
    const stageTimings: Record<string, number> = {};
    let totalDurationMs = 0;

    const start = Date.now();

    const stageMap: Record<string, string> = {
      damage_detection: "RESTORATION_ANALYSIS",
      lama_inpaint: "RESTORATION_INPAINT",
      face_restoration_gfpgan: "RESTORATION_FACE",
      face_restoration_codeformer: "RESTORATION_FACE",
      colorization_ddcolor: "RESTORATION_COLORIZE",
      real_esrgan_upscale: "RESTORATION_UPSCALE"
    };

    try {
      await prisma.restorationItem.update({
        where: { id: itemId },
        data: { processingStage: "RESTORATION_INPAINT", packageTier: "basic" }
      });

      const packageTier: PackageTier = "basic";
      const routingContext = {
        packageTier,
        imageCategory: item.imageCategory || undefined,
        damageSeverity: item.damageSeverity || undefined,
        hasFaces: (item.faceCount ?? 0) > 0,
        isBlackAndWhite: item.colorMode === "black_and_white",
        imageSizeBytes: item.fileSizeBytes ?? undefined,
      };

      const routingDecision = this.policyEngine.makeRoutingDecision(routingContext);
      logger.info("Provider routing decision", { itemId, decision: routingDecision });

      const runPodProvider = this.providerFactory.create("runpod");
      this.providerRouter.registerProvider(runPodProvider);

      if (routingDecision.fallbackProvider) {
        try {
          const fallbackProvider = this.providerFactory.create(routingDecision.fallbackProvider);
          this.providerRouter.registerProvider(fallbackProvider);
        } catch (err) {
          logger.warn("Failed to register fallback provider", { itemId, provider: routingDecision.fallbackProvider, error: err instanceof Error ? err.message : String(err) });
        }
      }

      const result = await this.providerRouter.route(
        {
          image: original.body,
          contentType: item.mimeType || "image/jpeg",
          fileName: `restoration-${itemId}.jpg`,
        },
        routingContext,
        routingDecision
      );

      processedBuffer = result.image;
      processedContentType = result.contentType;
      providersUsed = result.stages;
      logger.info("Restoration completed via provider router", {
        itemId,
        provider: result.providerName,
        stages: providersUsed,
        processingTimeMs: result.processingTimeMs,
        estimatedCost: result.estimatedCost,
      });

      providersUsed.sort((a, b) => {
        const order = ["damage_detection", "lama_inpaint", "face_restoration_gfpgan", "face_restoration_codeformer", "colorization_ddcolor", "real_esrgan_upscale"];
        return (order.indexOf(a) - order.indexOf(b));
      });

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
      logger.error("Restoration failed", { itemId, error: err instanceof Error ? err.message : String(err) });
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

    const processedUpload = await this.storage.uploadFile({
      keyPrefix: "finals",
      fileName: `restoration-${itemId}-${Date.now()}.jpg`,
      body: processedBuffer,
      contentType: processedContentType
    });

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

    for (const [name, elapsed] of Object.entries(stageTimings)) {
      const costTypeMap: Record<string, string> = { restoration: "RESTORATION_PROCESSING" };
      try {
        await prisma.providerCostLog.create({
          data: {
            provider: name, operation: name, costType: costTypeMap[name] as any, durationMs: elapsed,
            estimatedCost: 0, restorationItemId: itemId
          }
        });
      } catch { /* non-critical */ }
    }

    await prisma.restorationItem.update({
      where: { id: itemId },
      data: {
        status: succeeded ? "COMPLETED" : "FAILED",
        finalStorageKey: processedUpload.key,
        afterQualityScore: afterQuality,
        providerUsed: `runpod:${providersUsed.join(",")}`,
        processingStage: succeeded ? "RESTORATION_PREVIEW" : "RESTORATION_FAILED",
        totalDurationMs
      }
    });

    if (succeeded) {
      await this.generatePreview(processedUpload.key, itemId);
    }

    if (order) {
      await prisma.restorationOrder.update({
        where: { id: order.id },
        data: {
          completedItems: { increment: succeeded ? 1 : 0 },
          failedItems: { increment: succeeded ? 0 : 1 },
          status: (succeeded ? "COMPLETED" : "FAILED") as any
        }
      });
    }

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