import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";

type SubscriptionPeriod = {
  periodStart: Date;
  periodEnd: Date;
  nextResetAt: Date;
};

type SubscriptionBootstrapInput = {
  userId: string;
  walletId: string;
  packageId: string;
  planCode: string;
  monthlyCreditLimit: number;
  referenceType?: string;
  referenceId?: string;
};

type UsageReserveInput = {
  subscriptionId: string;
  amount: number;
  referenceType?: string;
  referenceId?: string;
  note?: string;
};

const monthWindow = (date: Date): SubscriptionPeriod => {
  const periodStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return {
    periodStart,
    periodEnd,
    nextResetAt: periodEnd
  };
};

const ensurePositiveAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("Amount must be greater than zero", 400, "INVALID_AMOUNT");
  }
};

export class SubscriptionService {
  async createOrRefreshSubscription(input: SubscriptionBootstrapInput) {
    const now = new Date();
    const period = monthWindow(now);
    const existing = await prisma.subscription.findFirst({
      where: {
        userId: input.userId,
        planCode: input.planCode,
        status: "ACTIVE"
      },
      orderBy: { createdAt: "desc" }
    });

    if (existing) {
      return prisma.subscription.update({
        where: { id: existing.id },
        data: {
          walletId: input.walletId,
          packageId: input.packageId,
          monthlyCreditLimit: input.monthlyCreditLimit,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          nextResetAt: period.nextResetAt,
          lastResetAt: now
        }
      });
    }

    return prisma.subscription.create({
      data: {
        userId: input.userId,
        walletId: input.walletId,
        packageId: input.packageId,
        planCode: input.planCode,
        monthlyCreditLimit: input.monthlyCreditLimit,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        nextResetAt: period.nextResetAt,
        lastResetAt: now
      }
    });
  }

  async ensureUsageWindow(subscriptionId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId }
    });

    if (!subscription) {
      throw new AppError("Subscription not found", 404, "SUBSCRIPTION_NOT_FOUND");
    }

    const now = new Date();
    if (subscription.nextResetAt <= now) {
      const period = monthWindow(now);
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          nextResetAt: period.nextResetAt,
          lastResetAt: now,
          monthlyCreditsUsed: 0,
          monthlyCreditsReserved: 0
        }
      });
    }

    const current = await prisma.subscription.findUnique({
      where: { id: subscriptionId }
    });

    if (!current) {
      throw new AppError("Subscription not found", 404, "SUBSCRIPTION_NOT_FOUND");
    }

    const usage = await prisma.subscriptionUsage.findUnique({
      where: {
        subscriptionId_periodStart: {
          subscriptionId: current.id,
          periodStart: current.periodStart
        }
      }
    });

    if (usage) return { subscription: current, usage };

    const createdUsage = await prisma.subscriptionUsage.create({
      data: {
        subscriptionId: current.id,
        periodStart: current.periodStart,
        periodEnd: current.periodEnd
      }
    });

    return { subscription: current, usage: createdUsage };
  }

  async reserveUsage(input: UsageReserveInput) {
    ensurePositiveAmount(input.amount);
    const { subscription, usage } = await this.ensureUsageWindow(input.subscriptionId);

    if (subscription.monthlyCreditLimit > 0 && usage.creditsReserved + usage.creditsSpent + input.amount > subscription.monthlyCreditLimit) {
      throw new AppError("Subscription credit limit exceeded", 409, "SUBSCRIPTION_LIMIT_EXCEEDED");
    }

    return prisma.$transaction(async (tx) => {
      const updatedSubscription = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          monthlyCreditsReserved: { increment: input.amount }
        }
      });

      const updatedUsage = await tx.subscriptionUsage.update({
        where: {
          subscriptionId_periodStart: {
            subscriptionId: subscription.id,
            periodStart: subscription.periodStart
          }
        },
        data: {
          creditsReserved: { increment: input.amount },
          jobsReserved: { increment: 1 }
        }
      });

      return {
        subscription: updatedSubscription,
        usage: updatedUsage
      };
    });
  }

  async settleUsage(input: UsageReserveInput) {
    ensurePositiveAmount(input.amount);
    const { subscription } = await this.ensureUsageWindow(input.subscriptionId);

    return prisma.$transaction(async (tx) => {
      const updatedSubscription = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          monthlyCreditsReserved: { decrement: input.amount },
          monthlyCreditsUsed: { increment: input.amount }
        }
      });

      const updatedUsage = await tx.subscriptionUsage.update({
        where: {
          subscriptionId_periodStart: {
            subscriptionId: subscription.id,
            periodStart: subscription.periodStart
          }
        },
        data: {
          creditsReserved: { decrement: input.amount },
          creditsSpent: { increment: input.amount },
          jobsCompleted: { increment: 1 }
        }
      });

      return {
        subscription: updatedSubscription,
        usage: updatedUsage
      };
    });
  }

  async releaseUsage(input: UsageReserveInput) {
    ensurePositiveAmount(input.amount);
    const { subscription } = await this.ensureUsageWindow(input.subscriptionId);

    return prisma.$transaction(async (tx) => {
      const updatedSubscription = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          monthlyCreditsReserved: { decrement: input.amount }
        }
      });

      const updatedUsage = await tx.subscriptionUsage.update({
        where: {
          subscriptionId_periodStart: {
            subscriptionId: subscription.id,
            periodStart: subscription.periodStart
          }
        },
        data: {
          creditsReserved: { decrement: input.amount },
          creditsReleased: { increment: input.amount },
          jobsFailed: { increment: 1 }
        }
      });

      return {
        subscription: updatedSubscription,
        usage: updatedUsage
      };
    });
  }

  async listSubscriptions(page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await Promise.all([
      prisma.subscription.findMany({
        include: {
          user: true,
          wallet: true,
          package: true,
          usage: { orderBy: { periodStart: "desc" }, take: 12 }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: safeLimit
      }),
      prisma.subscription.count()
    ]);

    return { items, total, page: safePage, limit: safeLimit };
  }

  async getUsageSummary(subscriptionId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        user: true,
        wallet: true,
        package: true,
        usage: { orderBy: { periodStart: "desc" }, take: 24 }
      }
    });

    if (!subscription) {
      throw new AppError("Subscription not found", 404, "SUBSCRIPTION_NOT_FOUND");
    }

    return subscription;
  }
}
