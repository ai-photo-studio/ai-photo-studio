import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { ImageQueueService } from "../queues/image.queue";
import type { AppConfig } from "../config/env";
import { DeliveryService } from "./delivery.service";
import { PaymentService } from "./payment.service";

type ListOrdersParams = {
  status?: string;
  paymentStatus?: string;
  page?: number;
  limit?: number;
  search?: string;
};

type ListJobsParams = {
  status?: string;
  queueName?: string;
  page?: number;
  limit?: number;
};

export class AdminService {
  private readonly queue: ImageQueueService;
  private readonly delivery: DeliveryService;
  private readonly payment: PaymentService;

  constructor(config: AppConfig) {
    this.queue = new ImageQueueService(config);
    this.delivery = new DeliveryService(config);
    this.payment = new PaymentService(config);
  }

  async getDashboard() {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [todayOrders, paidTodayOrders, pendingPayments, processingOrders, completedOrders, failedOrders, failedJobs, imagesProcessedToday] =
      await Promise.all([
        prisma.order.count({ where: { createdAt: { gte: dayStart, lt: dayEnd } } }),
        prisma.order.findMany({
          where: { paymentStatus: "PAID", createdAt: { gte: dayStart, lt: dayEnd } },
          select: { total: true }
        }),
        prisma.order.count({ where: { paymentStatus: "PENDING" } }),
        prisma.order.count({ where: { orderStatus: "PROCESSING" } }),
        prisma.order.count({ where: { orderStatus: "COMPLETED" } }),
        prisma.order.count({ where: { orderStatus: "FAILED" } }),
        prisma.aiJob.count({ where: { status: "FAILED" } }),
        prisma.orderImage.count({
          where: { kind: { in: ["FINAL", "PREVIEW"] }, createdAt: { gte: dayStart, lt: dayEnd } }
        })
      ]);

    const todayRevenue = paidTodayOrders.reduce((sum, row) => sum + Number(row.total), 0);

    return {
      todayOrders,
      todayRevenue,
      pendingPayments,
      processingOrders,
      completedOrders,
      failedOrders,
      failedJobs,
      imagesProcessedToday
    };
  }

  async getStats() {
    const [
      totalJobs,
      queuedJobs,
      runningJobs,
      completedJobs,
      failedJobs,
      retryingJobs,
      deadLetterJobs,
      providerFailures,
      queueFailures,
      providerBreakdown,
      completedDurationJobs
    ] = await Promise.all([
      prisma.processingJob.count(),
      prisma.processingJob.count({ where: { status: "QUEUED" } }),
      prisma.processingJob.count({ where: { status: "RUNNING" } }),
      prisma.processingJob.count({ where: { status: "COMPLETED" } }),
      prisma.processingJob.count({ where: { status: "FAILED" } }),
      prisma.processingJob.count({ where: { status: "RETRYING" } }),
      prisma.processingJob.count({ where: { status: "DEAD_LETTER" } }),
      prisma.processingJob.count({ where: { failureStage: "provider" } }),
      prisma.processingJob.count({ where: { OR: [{ failureStage: "queue" }, { status: "DEAD_LETTER" }] } }),
      prisma.processingJob.groupBy({
        by: ["providerName"],
        _count: { _all: true }
      }),
      prisma.processingJob.findMany({
        where: {
          status: "COMPLETED",
          startedAt: { not: null },
          completedAt: { not: null }
        },
        select: {
          startedAt: true,
          completedAt: true,
          providerName: true,
          workflowType: true,
          workflowMode: true
        },
        orderBy: { createdAt: "desc" },
        take: 500
      })
    ]);

    const completedDurations = completedDurationJobs
      .filter((job) => job.startedAt && job.completedAt)
      .map((job) => (job.completedAt!.getTime() - job.startedAt!.getTime()));

    const averageProcessingDurationMs =
      completedDurations.length > 0
        ? Math.round(completedDurations.reduce((sum, value) => sum + value, 0) / completedDurations.length)
        : 0;

    return {
      totals: {
        totalJobs,
        queuedJobs,
        runningJobs,
        completedJobs,
        failedJobs,
        retryingJobs,
        deadLetterJobs
      },
      failureTracking: {
        providerFailures,
        queueFailures
      },
      performance: {
        averageProcessingDurationMs,
        completedJobsMeasured: completedDurations.length
      },
      providerBreakdown: providerBreakdown.map((row) => ({
        providerName: row.providerName || "unknown",
        count: row._count._all
      }))
    };
  }

  async listOrders(params: ListOrdersParams) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status) where.orderStatus = params.status.toUpperCase();
    if (params.paymentStatus) where.paymentStatus = params.paymentStatus.toUpperCase();
    if (params.search) {
      where.OR = [{ orderNo: { contains: params.search, mode: "insensitive" } }, { customer: { whatsappNumber: { contains: params.search } } }];
    }

    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          customer: true,
          package: true,
          images: true
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prisma.order.count({ where })
    ]);

    return { items, total, page, limit };
  }

  async getOrderDetail(id: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        package: true,
        payments: { orderBy: { createdAt: "desc" } },
        images: true,
        aiJobs: { orderBy: { createdAt: "desc" } },
        processingJobs: {
          orderBy: { createdAt: "desc" },
          include: {
            orderItem: true
          }
        },
        statusHistory: { orderBy: { createdAt: "desc" } }
      }
    });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

    const deliveryStatus = order.orderStatus === "COMPLETED" ? "sent_or_ready" : order.orderStatus === "FAILED" ? "failed" : "pending";

    return {
      order,
      customer: order.customer,
      package: order.package,
      payment: order.payments[0] || null,
      files: order.images,
      images: order.images,
      jobs: order.processingJobs,
      aiJobs: order.aiJobs,
      statusHistory: order.statusHistory,
      deliveryStatus
    };
  }

  async listFailedJobs() {
    return prisma.aiJob.findMany({
      where: { status: "FAILED" },
      include: {
        order: { include: { customer: true, package: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
  }

  async listJobs(params: ListJobsParams) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status) where.status = params.status.toUpperCase();
    if (params.queueName) where.queueName = params.queueName;

    const [items, total] = await Promise.all([
      prisma.processingJob.findMany({
        where,
        include: {
          order: {
            include: {
              customer: true,
              package: true
            }
          },
          orderItem: true
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prisma.processingJob.count({ where })
    ]);

    return { items, total, page, limit };
  }

  async retryOrder(id: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { images: true }
    });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    if (order.paymentStatus !== "PAID") throw new AppError("Only paid orders can be retried", 400, "ORDER_NOT_PAID");

    const originalImages = order.images.filter((img) => img.kind === "ORIGINAL");
    let enqueued = 0;
    for (const image of originalImages) {
      await this.queue.enqueueImageProcessing(image.id);
      enqueued += 1;
    }

    await prisma.auditLog.create({
      data: {
        actorType: "admin",
        action: "retry_order",
        entityType: "order",
        entityId: order.id,
        meta: { enqueued }
      }
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { orderStatus: "PROCESSING" }
    });

    return { orderId: id, enqueued };
  }

  async approveManualPayment(id: string) {
    const result = await this.payment.approveManualPayment(id);

    await prisma.auditLog.create({
      data: {
        actorType: "admin",
        action: "approve_manual_payment",
        entityType: "order",
        entityId: id,
        meta: {
          orderNo: result.orderNo,
          paymentId: result.paymentId,
          enqueued: result.enqueued
        }
      }
    });

    return result;
  }

  async sendAgain(id: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { customer: true }
    });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

    const message = await this.delivery.sendOrderCompleted(order.customer.whatsappNumber, order.orderNo, `Order ${order.orderNo} is ready.`);

    await prisma.auditLog.create({
      data: {
        actorType: "admin",
        action: "send_again",
        entityType: "order",
        entityId: order.id,
        meta: message
      }
    });

    return { orderId: id, sent: true };
  }

  async retryJob(jobId: string) {
    const job = await prisma.aiJob.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError("Job not found", 404, "JOB_NOT_FOUND");
    if (!job.orderImageId) throw new AppError("Job has no image reference", 400, "JOB_IMAGE_MISSING");

    await this.queue.enqueueImageProcessing(job.orderImageId);

    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: "QUEUED",
        attempts: job.attempts + 1,
        errorMessage: null
      }
    });

    await prisma.auditLog.create({
      data: {
        actorType: "admin",
        action: "retry_job",
        entityType: "ai_job",
        entityId: job.id
      }
    });

    return { jobId, retried: true };
  }
}
