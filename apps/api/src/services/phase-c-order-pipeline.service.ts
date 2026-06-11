import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { CustomerService, normalizeWhatsAppNumber } from "./customer.service";
import { PackageService } from "./package.service";
import { PhaseCImageProcessingQueue } from "../queues/phase-c-image-processing.queue";
import type { AppConfig } from "../config/env";

type IncomingImagePayload = {
  senderNumber: string;
  messageId: string;
  mediaId: string;
};

type PhaseCOrderPipelineResult = {
  order: Awaited<ReturnType<typeof prisma.order.findUnique>> extends infer T ? NonNullable<T> : never;
  orderItem?: Awaited<ReturnType<typeof prisma.orderItem.create>>;
  processingJob?: Awaited<ReturnType<typeof prisma.processingJob.create>>;
  queueResult: { dryRun: boolean; queueJobId?: string };
};

const toOrderNo = (): string => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `APS-${ts}-${rand}`;
};

export class PhaseCOrderPipelineService {
  private readonly customerService = new CustomerService();
  private readonly packageService = new PackageService();
  private readonly queue: PhaseCImageProcessingQueue;

  constructor(config: AppConfig) {
    this.queue = new PhaseCImageProcessingQueue(config);
  }

  async createOrderForIncomingImage(payload: IncomingImagePayload): Promise<PhaseCOrderPipelineResult> {
    const normalizedSender = normalizeWhatsAppNumber(payload.senderNumber);
    const existing = await prisma.order.findUnique({
      where: { whatsappMessageId: payload.messageId },
      include: { customer: true, package: true, items: true, processingJobs: true }
    });

    if (existing) {
      return {
        order: existing,
        orderItem: existing.items[0],
        processingJob: existing.processingJobs[0],
        queueResult: { dryRun: true }
      };
    }

    const pkg = await this.packageService.findDefaultActive();
    if (!pkg) {
      throw new AppError("No active package is available for incoming WhatsApp images", 409, "PACKAGE_NOT_AVAILABLE");
    }

    const customer = await this.customerService.findOrCreateByWhatsAppNumber(normalizedSender);

    const order = await prisma.order.create({
      data: {
        orderNo: toOrderNo(),
        customerId: customer.id,
        packageId: pkg.id,
        whatsappSenderNumber: normalizedSender,
        whatsappMessageId: payload.messageId,
        whatsappMediaId: payload.mediaId,
        orderStatus: "QUEUED",
        paymentStatus: "PENDING",
        subtotal: Number(pkg.price).toFixed(2),
        total: Number(pkg.price).toFixed(2),
        currency: pkg.currency,
        notes: "Phase C webhook foundation order created from incoming WhatsApp image"
      },
      include: { customer: true, package: true }
    });

    const orderItem = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        itemType: "WHATSAPP_IMAGE",
        title: "Incoming WhatsApp image",
        quantity: 1,
        currency: order.currency,
        metadata: {
          senderNumber: normalizedSender,
          messageId: payload.messageId,
          mediaId: payload.mediaId
        },
        sourceMessageId: payload.messageId,
        sourceMediaId: payload.mediaId
      }
    });

    const queueResult = await this.queue.enqueueImageProcessing({
      orderId: order.id,
      orderItemId: orderItem.id,
      senderNumber: normalizedSender,
      messageId: payload.messageId,
      mediaId: payload.mediaId
    });

    const processingJob = await prisma.processingJob.create({
      data: {
        orderId: order.id,
        orderItemId: orderItem.id,
        queueName: "image-processing",
        jobName: "process-whatsapp-image",
        status: "QUEUED",
        attempts: 0,
        maxAttempts: 5,
        queueJobId: queueResult.queueJobId,
        payload: {
          senderNumber: normalizedSender,
          messageId: payload.messageId,
          mediaId: payload.mediaId
        }
      }
    });

    return {
      order,
      orderItem,
      processingJob,
      queueResult
    };
  }

  async close() {
    await this.queue.close();
  }
}
