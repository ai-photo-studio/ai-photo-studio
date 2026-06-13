import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { PhaseCImageProcessingQueue } from "../queues/phase-c-image-processing.queue";
import { CustomerService } from "../services/customer.service";
import { NotificationService } from "../services/notification.service";
import { AppError, toErrorMessage } from "../utils/errors";
import { OrderService } from "../services/order.service";
import { PaymentService } from "../services/payment.service";
import { StorageService } from "../services/storage.service";
import { SubscriptionService } from "../services/subscription.service";
import { WalletService } from "../services/wallet.service";
import { resolveProductWorkflowMode } from "../services/product-workflow.service";
import { resolveVehicleWorkflowMode } from "../services/vehicle-workflow.service";
import { verifyToken } from "../middleware/auth.middleware";
import { logger } from "../utils/logger";
import type { WorkflowMode } from "../providers/provider.interface";

type OrderImagePayload = {
  storageKey: string;
  mimeType?: string;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
};

type WebUploadPayload = {
  fileName?: string;
  contentType?: string;
  bodyBase64?: string;
  workflowType?: string;
  workflowMode?: string;
};

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_WEB_IMAGE_BYTES = 10 * 1024 * 1024;

const normalizeWorkflowType = (value?: string | null): "PRODUCT" | "VEHICLE" => {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized === "VEHICLE" ? "VEHICLE" : "PRODUCT";
};

const resolveWorkflowMode = (
  workflowType: "PRODUCT" | "VEHICLE",
  workflowMode: string | undefined,
  packageCode: string
): WorkflowMode => {
  const normalized = String(workflowMode || "").trim().toUpperCase();

  if (workflowType === "VEHICLE") {
    if (["SHOWROOM", "PREMIUM_ROAD", "DARK_STUDIO", "PLATE_BLUR"].includes(normalized)) {
      return normalized as WorkflowMode;
    }
    return resolveVehicleWorkflowMode(packageCode);
  }

  if (["WHITE_BACKGROUND", "SOLID_COLOR_BACKGROUND", "SHADOW_ENHANCEMENT", "PRODUCT_STUDIO"].includes(normalized)) {
    return normalized as WorkflowMode;
  }

  return resolveProductWorkflowMode(packageCode);
};

const decodeBase64Input = (input: string) => {
  const cleaned = input.trim();
  const base64 = cleaned.includes(",") ? cleaned.slice(cleaned.indexOf(",") + 1) : cleaned;
  return Buffer.from(base64, "base64");
};

export class OrderController {
  private readonly config: AppConfig;
  private readonly orderService = new OrderService();
  private readonly customerService = new CustomerService();
  private readonly walletService = new WalletService();
  private readonly subscriptionService = new SubscriptionService();
  private readonly paymentService: PaymentService;
  private readonly storage: StorageService;
  private readonly queue: PhaseCImageProcessingQueue;
  private readonly notifications = new NotificationService();

  constructor(config: AppConfig) {
    this.config = config;
    this.paymentService = new PaymentService(config);
    this.storage = new StorageService(config);
    this.queue = new PhaseCImageProcessingQueue(config);
  }

  createOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const { whatsappNumber, packageSlug, serviceType } = req.body ?? {};
      if (!whatsappNumber || !packageSlug || !serviceType) {
        throw new AppError("whatsappNumber, packageSlug and serviceType are required", 400, "INVALID_REQUEST");
      }
      const result = await this.orderService.createOrder({
        whatsappNumber,
        packageSlug,
        serviceType,
        userId: req.user?.sub
      });
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.orderService.getOrderByOrderNo(req.params.orderNo);
      const user = this.resolveOptionalUser(req);
      const downloadAllowed = Boolean(result.processedUrl && user && result.userId && user.sub === result.userId);

      res.json({
        success: true,
        data: {
          ...result,
          processedUrl: downloadAllowed ? result.processedUrl : null,
          downloadAllowed
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  addOrderImages = async (req: Request, res: Response): Promise<void> => {
    try {
      const images = Array.isArray(req.body?.images) ? (req.body.images as OrderImagePayload[]) : [];
      const mapped = images.map((img: OrderImagePayload) => ({
        storageKey: String(img.storageKey || ""),
        mimeType: img.mimeType ? String(img.mimeType) : undefined,
        width: typeof img.width === "number" ? img.width : undefined,
        height: typeof img.height === "number" ? img.height : undefined,
        fileSizeBytes: typeof img.fileSizeBytes === "number" ? img.fileSizeBytes : undefined
      }));
      if (mapped.some((img) => !img.storageKey)) {
        throw new AppError("Each image requires storageKey", 400, "INVALID_IMAGE_INPUT");
      }
      const result = await this.orderService.addImages(req.params.orderNo, mapped);
      res.status(201).json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  uploadWebImage = async (req: Request, res: Response): Promise<void> => {
    let billingReservation:
      | {
          type: "WALLET";
          walletId: string;
          transactionId: string;
          amount: number;
          referenceId: string;
        }
      | {
          type: "SUBSCRIPTION";
          subscriptionId: string;
          amount: number;
          referenceId: string;
        }
      | null = null;

    try {
      const user = await this.requireUser(req);
      const orderNo = String(req.params.orderNo || "").trim();
      const order = await this.orderService.getOrderByOrderNo(orderNo);
      if (order.userId && order.userId !== user.sub) {
        throw new AppError("Order does not belong to the current customer", 403, "FORBIDDEN");
      }
      if (!order.userId) {
        await this.orderService.linkOrderToUser(order.id, user.sub);
      }

      const payload = (req.body || {}) as WebUploadPayload;
      const fileName = String(payload.fileName || "customer-upload.jpg").trim();
      const contentType = String(payload.contentType || "").trim().toLowerCase();
      const bodyBase64 = String(payload.bodyBase64 || "").trim();

      if (!fileName || !bodyBase64) {
        throw new AppError("fileName and bodyBase64 are required", 400, "INVALID_REQUEST");
      }

      if (!SUPPORTED_IMAGE_MIME_TYPES.has(contentType)) {
        throw new AppError("Unsupported image type", 415, "UNSUPPORTED_IMAGE_TYPE");
      }

      const body = decodeBase64Input(bodyBase64);
      if (body.length === 0) {
        throw new AppError("Uploaded file is empty", 400, "EMPTY_FILE");
      }
      if (body.length > MAX_WEB_IMAGE_BYTES) {
        throw new AppError("Image exceeds size limit of 10 MB", 413, "IMAGE_TOO_LARGE");
      }

      const walletOverview = await this.customerService.getWalletOverview(user.sub);
      const activeSubscription = walletOverview.activeSubscription;
      const remainingSubscriptionCredits = activeSubscription
        ? Math.max(
            0,
            activeSubscription.monthlyCreditLimit -
              activeSubscription.monthlyCreditsUsed -
              activeSubscription.monthlyCreditsReserved
          )
        : 0;
      const hasWalletCredits = walletOverview.summary.availableBalance > 0;
      const hasSubscriptionCredits = Boolean(activeSubscription && remainingSubscriptionCredits > 0);

      const queueJobId = `web-${randomUUID()}`;

      if (hasSubscriptionCredits && activeSubscription) {
        await this.subscriptionService.reserveUsage({
          subscriptionId: activeSubscription.id,
          amount: 1,
          referenceType: "processing_job",
          referenceId: queueJobId,
          note: `Reserved before upload for order ${order.orderNo}`
        });
        billingReservation = {
          type: "SUBSCRIPTION",
          subscriptionId: activeSubscription.id,
          amount: 1,
          referenceId: queueJobId
        };
      } else if (hasWalletCredits) {
        const wallet = await this.walletService.getOrCreateWallet(user.sub);
        const walletReservation = await this.walletService.reserveCredits({
          walletId: wallet.id,
          amount: 1,
          orderId: order.id,
          referenceType: "processing_job",
          referenceId: queueJobId,
          note: `Reserved before upload for order ${order.orderNo}`,
          metadata: {
            queueJobId,
            packageCode: order.package.code
          }
        });
        billingReservation = {
          type: "WALLET",
          walletId: walletReservation.walletId,
          transactionId: walletReservation.transactionId,
          amount: walletReservation.amount,
          referenceId: queueJobId
        };
      } else {
        throw new AppError("Credits are required before upload", 409, "CREDITS_REQUIRED");
      }

      const originalUpload = await this.storage.uploadOriginal({
        fileName,
        body,
        contentType
      });

      await this.orderService.attachOriginalMedia(order.id, {
        storageKey: originalUpload.key,
        url: originalUpload.url,
        expiresAt: originalUpload.expiresAt,
        mimeType: contentType,
        fileSizeBytes: body.length
      });

      const originalImage = await prisma.orderImage.create({
        data: {
          orderId: order.id,
          kind: "ORIGINAL",
          storageKey: originalUpload.key,
          mimeType: contentType,
          fileSizeBytes: body.length,
          expiresAt: originalUpload.expiresAt
        }
      });

      const workflowType = normalizeWorkflowType(payload.workflowType);
      const workflowMode = resolveWorkflowMode(workflowType, payload.workflowMode, order.package.code);
      const senderNumber = order.customer.whatsappNumber;
      const messageId = `web-${order.orderNo}`;
      const mediaId = `web-${order.orderNo}-${Date.now()}`;

      const orderItem = await prisma.orderItem.create({
        data: {
          orderId: order.id,
          itemType: "WEB_UPLOAD",
          title: "Customer web upload",
          quantity: 1,
          unitPrice: order.total,
          currency: order.currency,
          metadata: {
            source: "web",
            workflowType,
            workflowMode,
            originalStorageKey: originalUpload.key,
            originalUrl: originalUpload.url,
            originalExpiresAt: originalUpload.expiresAt.toISOString(),
            fileSizeBytes: body.length,
            mimeType: contentType,
            billingReservation
          }
        }
      });

      const processingJob = await prisma.processingJob.create({
        data: {
          orderId: order.id,
          orderItemId: orderItem.id,
          queueName: "image-processing",
          jobName: "process-web-upload",
          workflowType,
          workflowMode,
          status: "QUEUED",
          attempts: 0,
          maxAttempts: 5,
          queueJobId,
          payload: {
            senderNumber,
            messageId,
            mediaId,
            originalStorageKey: originalUpload.key,
            workflowType,
            workflowMode,
            billingReservation
          }
        }
      });

      const queueResult = await this.queue.enqueueImageProcessing(
        {
          orderId: order.id,
          orderItemId: orderItem.id,
          senderNumber,
          messageId,
          mediaId,
          originalStorageKey: originalUpload.key,
          workflowType,
          workflowMode,
          billingReservation
        },
        { jobId: queueJobId }
      );

      await this.orderService.updateOrderStatus(order.id, {
        toStatus: "QUEUED",
        source: "web.upload",
        meta: {
          queueJobId,
          originalImageId: originalImage.id,
          workflowType,
          workflowMode,
          storageKey: originalUpload.key
        }
      });

      this.notifications.log("WHATSAPP_ORDER_RECEIVED", {
        orderId: order.id,
        orderNo: order.orderNo,
        senderNumber,
        messageId,
        mediaId
      });

      res.status(201).json({
        success: true,
        data: {
          orderNo: order.orderNo,
          orderStatus: "QUEUED",
          paymentStatus: order.paymentStatus,
          originalImageId: originalImage.id,
          orderItemId: orderItem.id,
          processingJobId: processingJob.id,
          queueResult,
          image: {
            storageKey: originalUpload.key,
            url: originalUpload.url,
            expiresAt: originalUpload.expiresAt
          }
        }
      });
    } catch (error) {
      if (billingReservation) {
        const reservation = billingReservation;
        await this.releaseBillingReservation(reservation).catch((releaseError) => {
          logger.warn("Failed to release upload billing reservation", {
            error: releaseError instanceof Error ? releaseError.message : String(releaseError),
            reservationType: reservation.type,
            referenceId: reservation.referenceId
          });
        });
      }
      this.handleError(res, error);
    }
  };

  createOrderCheckout = async (req: Request, res: Response): Promise<void> => {
    try {
      const order = await this.orderService.getOrderByOrderNo(req.params.orderNo);
      const amount = Number(order.total);
      if (amount <= 0) throw new AppError("Order amount must be greater than zero", 400, "INVALID_AMOUNT");

      const checkout = await this.paymentService.createCheckout({
        orderId: order.id,
        orderNo: order.orderNo,
        amount,
        currency: order.currency
      });

      await this.paymentService.createPaymentRecord({
        orderId: order.id,
        amount,
        currency: order.currency,
        providerName: checkout.providerName,
        gatewayRef: checkout.providerRef,
        checkoutUrl: checkout.checkoutUrl
      });

      res.json({
        success: true,
        data: {
          orderNo: order.orderNo,
          checkoutUrl: checkout.checkoutUrl,
          paymentReference: checkout.providerRef
        }
      });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  listAdminOrders = async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.orderService.listOrders();
      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getAdminOrderById = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.orderService.getOrderById(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      this.handleError(res, error);
    }
  };

  private async requireUser(req: Request) {
    if (!req.user) {
      throw new AppError("Not authenticated", 401, "UNAUTHORIZED");
    }
    return req.user;
  }

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

  private async releaseBillingReservation(
    billingReservation:
      | {
          type: "WALLET";
          walletId: string;
          transactionId: string;
          amount: number;
          referenceId: string;
        }
      | {
          type: "SUBSCRIPTION";
          subscriptionId: string;
          amount: number;
          referenceId: string;
        },
  ): Promise<void> {
    if (billingReservation.type === "SUBSCRIPTION") {
      await this.subscriptionService.releaseUsage({
        subscriptionId: billingReservation.subscriptionId,
        amount: billingReservation.amount,
        referenceType: "processing_job",
        referenceId: billingReservation.referenceId,
        note: `Released after upload failure for job ${billingReservation.referenceId}`
      });
      return;
    }

    await this.walletService.releaseReservedCredits({
      walletId: billingReservation.walletId,
      amount: billingReservation.amount,
      referenceType: "processing_job",
      referenceId: billingReservation.referenceId,
      note: `Released after upload failure for job ${billingReservation.referenceId}`
    });
  }

  private handleError(res: Response, error: unknown) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
      return;
    }
    res.status(500).json({ success: false, code: "INTERNAL_ERROR", message: toErrorMessage(error) });
  }
}
