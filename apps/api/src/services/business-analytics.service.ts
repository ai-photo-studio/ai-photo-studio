import { prisma } from "../db/prisma";
import { CostMetricsService } from "./cost-metrics.service";

export type BusinessMetrics = {
  daily: {
    uploads: number;
    paidOrders: number;
    revenuePKR: number;
    revenueUSD: number;
    replicateCost: number;
    grossMargin: number;
    avgProcessingTimeMs: number;
    printOrders: number;
    repeatCustomers: number;
  };
  totals: {
    totalOrders: number;
    totalPaidOrders: number;
    totalRevenuePKR: number;
    totalRevenueUSD: number;
    totalReplicateCost: number;
    totalCustomers: number;
  };
  conversion: {
    uploadToPaid: number;
  };
  storage: {
    totalOriginals: number;
    totalFinals: number;
    totalPreviews: number;
    storageBytes: number;
  };
  queue: {
    queued: number;
    running: number;
    failed: number;
    deadLetter: number;
    completed: number;
  };
  restoreFailures: {
    replicateFailures: number;
    totalRestoreItems: number;
    failedItems: number;
  };
};

export class BusinessAnalyticsService {
  private readonly costMetrics = new CostMetricsService();

  async getBusinessMetrics(hoursBack = 24): Promise<BusinessMetrics> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);

    const [
      dailyUploads,
      dailyPayments,
      allPaidOrders,
      dailyReplicateCostLogs,
      allFinals,
      allOriginals,
      allPreviews,
      queueTotals,
      restoreFailures,
      totalOrders,
      totalPaid,
      totalCustomers,
      restoreItemStats,
      repeatCustomerOrders,
      printOrders,
      dailyPrintOrders,
      dailyRestoreItems,
      replicateCostTypeLogs
    ] = await Promise.all([
      prisma.orderImage.count({ where: { createdAt: { gte: dayStart, lte: dayEnd }, kind: "ORIGINAL" } }),
      prisma.payment.findMany({
        where: { status: "PAID", paidAt: { gte: dayStart, lte: dayEnd } },
        include: { order: { select: { total: true, currency: true } } }
      }),
      prisma.order.findMany({
        where: { paymentStatus: "PAID" },
        select: { total: true, currency: true }
      }),
      prisma.providerCostLog.findMany({
        where: { createdAt: { gte: dayStart, lte: dayEnd } }
      }),
      prisma.orderImage.count({ where: { kind: "FINAL" } }),
      prisma.orderImage.count({ where: { kind: "ORIGINAL" } }),
      prisma.orderImage.count({ where: { kind: "PREVIEW" } }),
      prisma.processingJob.groupBy({
        by: ["status"],
        _count: { _all: true }
      }),
      prisma.restorationItem.findMany({
        where: { status: "FAILED" },
        select: { errorMessage: true, id: true }
      }),
      prisma.order.count(),
      prisma.order.count({ where: { paymentStatus: "PAID" } }),
      prisma.user.count(),
      prisma.restorationItem.groupBy({
        by: ["status"],
        _count: { _all: true }
      }),
      prisma.order.groupBy({
        by: ["customerId"],
        _count: { _all: true },
        where: { paymentStatus: "PAID" }
      }),
      prisma.orderItem.count({ where: { itemType: "print" } }),
      prisma.orderItem.count({
        where: { itemType: "print", createdAt: { gte: dayStart, lte: dayEnd } }
      }),
      prisma.restorationItem.count({ where: { createdAt: { gte: dayStart, lte: dayEnd } } }),
      prisma.providerCostLog.findMany({
        where: {
          createdAt: { gte: since },
          provider: "flux-restore"
        }
      })
    ]);

    const dailyRevenuePKR = dailyPayments
      .filter(p => p.order?.currency === "PKR")
      .reduce((s, p) => s + Number(p.amount), 0);
    const dailyRevenueUSD = dailyPayments
      .filter(p => p.order?.currency !== "PKR")
      .reduce((s, p) => s + Number(p.amount), 0);

    const totalRevenuePKR = allPaidOrders
      .filter(o => o.currency === "PKR")
      .reduce((s, o) => s + Number(o.total), 0);
    const totalRevenueUSD = allPaidOrders
      .filter(o => o.currency !== "PKR")
      .reduce((s, o) => s + Number(o.total), 0);

    const dailyReplicateCost = dailyReplicateCostLogs
      .filter(l => l.provider === "flux-restore" || l.provider === "replicate")
      .reduce((s, l) => s + Number(l.actualCost || l.estimatedCost), 0);

    const totalReplicateCost = replicateCostTypeLogs
      .reduce((s, l) => s + Number(l.actualCost || l.estimatedCost), 0);

    const dailyPaidCount = dailyPayments.length;
    const grossMargin = dailyRevenuePKR > 0
      ? Math.round(((dailyRevenuePKR - dailyReplicateCost) / dailyRevenuePKR) * 10000) / 100
      : 0;

    const failedReplicate = restoreFailures.filter(f =>
      f.errorMessage?.toLowerCase().includes("replicate") ||
      f.errorMessage?.includes("429")
    ).length;

    const queued = queueTotals.find(r => r.status === "QUEUED")?._count._all || 0;
    const running = queueTotals.find(r => r.status === "RUNNING")?._count._all || 0;
    const failed = queueTotals.find(r => r.status === "FAILED")?._count._all || 0;
    const deadLetter = queueTotals.find(r => r.status === "DEAD_LETTER")?._count._all || 0;
    const completed = queueTotals.find(r => r.status === "COMPLETED")?._count._all || 0;

    const repeatCustomers = repeatCustomerOrders.filter(c => c._count._all > 1).length;

    const failedItems = restoreItemStats.find(r => r.status === "FAILED")?._count._all || 0;
    const totalRestoreItems = restoreItemStats.reduce((s, r) => s + r._count._all, 0);

    return {
      daily: {
        uploads: dailyUploads,
        paidOrders: dailyPaidCount,
        revenuePKR: dailyRevenuePKR,
        revenueUSD: dailyRevenueUSD,
        replicateCost: Math.round(dailyReplicateCost * 100000) / 100000,
        grossMargin,
        avgProcessingTimeMs: 0,
        printOrders: dailyPrintOrders,
        repeatCustomers
      },
      totals: {
        totalOrders,
        totalPaidOrders: totalPaid,
        totalRevenuePKR,
        totalRevenueUSD,
        totalReplicateCost: Math.round(totalReplicateCost * 100000) / 100000,
        totalCustomers
      },
      conversion: {
        uploadToPaid: dailyUploads > 0
          ? Math.round((dailyPaidCount / dailyRestoreItems) * 10000) / 100
          : 0
      },
      storage: {
        totalOriginals: allOriginals,
        totalFinals: allFinals,
        totalPreviews: allPreviews,
        storageBytes: 0
      },
      queue: {
        queued, running, failed, deadLetter, completed
      },
      restoreFailures: {
        replicateFailures: failedReplicate,
        totalRestoreItems,
        failedItems
      }
    };
  }
}
