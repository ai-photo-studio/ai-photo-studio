import { basename } from "node:path";
import { prisma } from "../db/prisma";
import type { AppConfig } from "../config/env";
import { ImageQueueService } from "../queues/image.queue";
import { BackgroundRemoverService } from "./background-remover.service";
import { DeliveryService } from "./delivery.service";
import { OrderService } from "./order.service";
import { StorageService } from "./storage.service";
import { WhatsAppService } from "./whatsapp.service";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";

export class WhatsAppImageFlowService {
  private readonly whatsapp: WhatsAppService;
  private readonly orders: OrderService;
  private readonly storage: StorageService;
  private readonly queue: ImageQueueService;
  private readonly backgroundRemover: BackgroundRemoverService;
  private readonly delivery: DeliveryService;

  constructor(private readonly config: AppConfig) {
    this.whatsapp = new WhatsAppService(config);
    this.orders = new OrderService();
    this.storage = new StorageService(config);
    this.queue = new ImageQueueService(config);
    this.backgroundRemover = new BackgroundRemoverService(config);
    this.delivery = new DeliveryService(config);
  }

  async handleIncomingImage(from: string, mediaId: string) {
    const order = await this.orders.findLatestPaidOrderByWhatsAppNumber(from);
    if (!order) {
      await this.whatsapp.sendTextMessage(from, "Please complete payment first before sending images.");
      return { accepted: false, reason: "NO_PAID_ORDER" as const };
    }

    await this.whatsapp.sendTextMessage(from, "Image received. Preparing your product photo.");

    try {
      const media = await this.whatsapp.downloadMedia(mediaId);
      const original = await this.storage.uploadFile({
        keyPrefix: "originals",
        fileName: media.fileName,
        contentType: media.mimeType,
        body: media.buffer
      });

      const image = await this.orders.addImage(order.id, {
        storageKey: original.key,
        mimeType: media.mimeType,
        fileSizeBytes: media.buffer.length,
        kind: "ORIGINAL"
      });

      await this.queue.enqueueWhatsAppImageProcessing(image.id);

      logger.info("WhatsApp image accepted for processing", { orderNo: order.orderNo, imageId: image.id });
      return { accepted: true as const, orderNo: order.orderNo, imageId: image.id };
    } catch (error) {
      logger.warn("WhatsApp image intake failed", {
        orderNo: order.orderNo,
        error: error instanceof Error ? error.message : String(error)
      });
      await this.whatsapp.sendTextMessage(
        from,
        "Sorry, we could not process your image right now. Please try again later."
      );
      throw error;
    }
  }

  async processQueuedImage(imageId: string) {
    const image = await prisma.orderImage.findUnique({
      where: { id: imageId },
      include: { order: { include: { customer: true, images: true, aiJobs: true } } }
    });

    if (!image) {
      logger.warn("Queued WhatsApp image not found", { imageId });
      return;
    }

    if (image.order.paymentStatus !== "PAID") {
      logger.warn("Skipping WhatsApp image processing for unpaid order", {
        orderId: image.orderId,
        imageId
      });
      return;
    }

    const aiJob = await prisma.aiJob.create({
      data: {
        orderId: image.orderId,
        orderImageId: image.id,
        provider: "rembg",
        operation: "product-white",
        status: "RUNNING",
        attempts: 1,
        inputKey: image.storageKey
      }
    });

    try {
      const source = await this.storage.downloadFile(image.storageKey);
      const processed = await this.backgroundRemover.productWhite({
        body: source.body,
        contentType: source.contentType || image.mimeType || "image/png",
        fileName: `${basename(image.storageKey)}-white.jpg`
      });

      const uploaded = await this.storage.uploadFile({
        keyPrefix: "finals",
        fileName: `${basename(image.storageKey)}-white.jpg`,
        contentType: processed.contentType,
        body: processed.body
      });

      await prisma.$transaction([
        prisma.orderImage.create({
          data: {
            orderId: image.orderId,
            kind: "FINAL",
            storageKey: uploaded.key,
            mimeType: processed.contentType,
            fileSizeBytes: processed.body.length,
            expiresAt: new Date(Date.now() + 72 * 3600_000)
          }
        }),
        prisma.aiJob.update({
          where: { id: aiJob.id },
          data: { status: "COMPLETED", outputKey: uploaded.key, completedAt: new Date() }
        })
      ]);

      const order = await prisma.order.findUnique({
        where: { id: image.orderId },
        include: { customer: true, images: true, aiJobs: true }
      });

      if (order) {
        await this.whatsapp.sendImageMessage(
          order.customer.whatsappNumber,
          uploaded.url,
          "Your product photo is ready."
        );

        const originals = order.images.filter((img) => img.kind === "ORIGINAL");
        const outputs = order.images.filter((img) => img.kind === "FINAL" || img.kind === "PREVIEW");

        if (originals.length > 0 && outputs.length >= originals.length) {
          await prisma.order.update({
            where: { id: order.id },
            data: { orderStatus: "COMPLETED" }
          });
          await this.delivery.sendOrderCompleted(order.customer.whatsappNumber, order.orderNo, uploaded.url);
        }
      }
    } catch (error) {
      await prisma.aiJob.update({
        where: { id: aiJob.id },
        data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "unknown error" }
      });
      await prisma.order.update({
        where: { id: image.orderId },
        data: { orderStatus: "FAILED", notes: "WhatsApp image processing failed" }
      });
      await this.whatsapp.sendTextMessage(
        image.order.customer.whatsappNumber,
        "Sorry, we could not finish your product photo. Please try again later."
      );
      throw new AppError("WhatsApp image processing failed", 502, "WHATSAPP_IMAGE_PROCESSING_FAILED");
    }
  }
}
