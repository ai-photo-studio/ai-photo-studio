import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { WalletService } from "./wallet.service";

export const normalizeWhatsAppNumber = (value: string): string => value.replace(/[^\d+]/g, "").trim();

export class CustomerService {
  private readonly walletService = new WalletService();

  async findOrCreateByWhatsAppNumber(whatsappNumber: string) {
    const normalized = normalizeWhatsAppNumber(whatsappNumber);
    return prisma.customer.upsert({
      where: { whatsappNumber: normalized },
      update: {},
      create: { whatsappNumber: normalized }
    });
  }

  async getWalletOverview(userId: string) {
    const walletRecord = await this.walletService.getOrCreateWallet(userId);
    const [wallet, pendingPayments, transactionCount, activeSubscriptionCount] = await Promise.all([
      prisma.wallet.findUnique({
        where: { id: walletRecord.id },
        include: {
          user: true,
          transactions: {
            orderBy: { createdAt: "desc" },
            take: 20,
            include: {
              payment: true,
              order: true,
              subscription: {
                include: { package: true }
              }
            }
          },
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 10,
            include: {
              package: true,
              usage: { orderBy: { periodStart: "desc" }, take: 6 }
            }
          }
        }
      }),
      prisma.payment.count({
        where: {
          order: { userId },
          status: "PENDING"
        }
      }),
      prisma.walletTransaction.count({
        where: { walletId: walletRecord.id }
      }),
      prisma.subscription.count({
        where: { userId, status: "ACTIVE" }
      })
    ]);

    if (!wallet) {
      throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");
    }

    const activeSubscription = wallet.subscriptions.find((item) => item.status === "ACTIVE") || wallet.subscriptions[0] || null;

    return {
      wallet,
      summary: {
        availableBalance: wallet.balance - wallet.reservedBalance,
        totalTransactions: transactionCount,
        activeSubscriptions: activeSubscriptionCount,
        lifetimeSpent: wallet.lifetimeSpent,
        lifetimeCredited: wallet.lifetimeCredited,
        pendingPayments
      },
      activeSubscription
    };
  }

  async getPaymentOverview(userId: string, page = 1, limit = 10) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const where = { userId };
    const [items, total, pendingPayments] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          package: true,
          customer: true,
          payments: { orderBy: { createdAt: "desc" }, take: 3 }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: safeLimit
      }),
      prisma.order.count({ where }),
      prisma.payment.count({
        where: {
          order: { userId },
          status: "PENDING"
        }
      })
    ]);

    return {
      items: items.map((order) => {
        const latestPayment = order.payments[0] || null;
        return {
          id: order.id,
          orderNo: order.orderNo,
          package: order.package,
          customer: order.customer,
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
          total: Number(order.total),
          currency: order.currency,
          createdAt: order.createdAt,
          latestPayment,
          pendingProof: latestPayment?.status === "PENDING" ? latestPayment : null,
          paymentHistory: order.payments
        };
      }),
      total,
      page: safePage,
      limit: safeLimit,
      pendingPayments
    };
  }

  async getSubscriptionOverview(userId: string, page = 1, limit = 10) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const where = { userId };
    const [items, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          package: true,
          wallet: true,
          usage: { orderBy: { periodStart: "desc" }, take: 6 }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: safeLimit
      }),
      prisma.subscription.count({ where })
    ]);

    const activeSubscription = items.find((subscription) => subscription.status === "ACTIVE") || items[0] || null;
    const currentUsage = activeSubscription?.usage[0] || null;

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      activeSubscription,
      currentUsage,
      summary: activeSubscription
        ? {
            planCode: activeSubscription.planCode,
            planName: activeSubscription.package.name,
            monthlyCreditLimit: activeSubscription.monthlyCreditLimit,
            monthlyCreditsUsed: activeSubscription.monthlyCreditsUsed,
            monthlyCreditsReserved: activeSubscription.monthlyCreditsReserved,
            remainingCredits: Math.max(0, activeSubscription.monthlyCreditLimit - activeSubscription.monthlyCreditsUsed - activeSubscription.monthlyCreditsReserved),
            nextResetAt: activeSubscription.nextResetAt,
            periodStart: activeSubscription.periodStart,
            periodEnd: activeSubscription.periodEnd
          }
        : null
    };
  }
}
