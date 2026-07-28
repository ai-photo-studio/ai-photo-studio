import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";

export class AdminRestorationService {
  async listRestorations(params: {
    status?: string;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.status) where.status = params.status.toUpperCase();
    if (params.search) {
      where.OR = [
        { orderNo: { contains: params.search, mode: "insensitive" } }
      ];
    }

    const [items, total] = await Promise.all([
      prisma.restorationOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit
      }),
      prisma.restorationOrder.count({ where })
    ]);

    return { items, total, page, limit };
  }

  async getRestorationDetail(id: string) {
    const order = await prisma.restorationOrder.findUnique({
      where: { id },
      include: { items: true }
    });
    if (!order) throw new AppError("Restoration order not found", 404, "RESTORATION_ORDER_NOT_FOUND");
    return order;
  }

  async retryItem(itemId: string) {
    const item = await prisma.restorationItem.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError("Restoration item not found", 404, "RESTORATION_ITEM_NOT_FOUND");

    return prisma.restorationItem.update({
      where: { id: itemId },
      data: {
        status: "QUEUED",
        retryCount: { increment: 1 },
        errorMessage: null,
        processingStage: null
      }
    });
  }

  async getStats() {
    const [total, pending, processing, completed, failed] = await Promise.all([
      prisma.restorationOrder.count(),
      prisma.restorationOrder.count({ where: { status: "PENDING" } }),
      prisma.restorationOrder.count({ where: { status: { in: ["ANALYZING", "PROCESSING"] } } }),
      prisma.restorationOrder.count({ where: { status: "COMPLETED" } }),
      prisma.restorationOrder.count({ where: { status: "FAILED" } })
    ]);

    const [itemsProcessed, itemsFailed] = await Promise.all([
      prisma.restorationItem.count({ where: { status: "COMPLETED" } }),
      prisma.restorationItem.count({ where: { status: "FAILED" } })
    ]);

    return {
      orders: { total, pending, processing, completed, failed },
      items: { processed: itemsProcessed, failed: itemsFailed }
    };
  }

  async retryOrder(orderId: string) {
    const items = await prisma.restorationItem.findMany({
      where: { restorationOrderId: orderId, status: { in: ["FAILED", "REJECTED"] } }
    });

    await prisma.restorationItem.updateMany({
      where: { restorationOrderId: orderId, status: { in: ["FAILED", "REJECTED"] } },
      data: { status: "QUEUED", errorMessage: null }
    });

    await prisma.restorationOrder.update({
      where: { id: orderId },
      data: { status: "QUEUED" }
    });

    return { orderId, retriedItems: items.length };
  }
}
