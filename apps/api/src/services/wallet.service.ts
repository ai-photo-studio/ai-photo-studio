import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import type { CreditSourceType } from "@prisma/client";

type BaseWalletActionInput = {
  walletId: string;
  amount: number;
  referenceType?: string;
  referenceId?: string;
  paymentId?: string;
  orderId?: string;
  subscriptionId?: string;
  note?: string;
  metadata?: Record<string, unknown>;
};

type CreditWalletInput = BaseWalletActionInput & {
  creditSource: CreditSourceType;
};

type ReservationResult = {
  walletId: string;
  transactionId: string;
  amount: number;
};

const ensurePositiveAmount = (amount: number) => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("Amount must be greater than zero", 400, "INVALID_AMOUNT");
  }
};

const findReferenceReservation = async (walletId: string, referenceType?: string, referenceId?: string) => {
  if (!referenceType || !referenceId) return null;
  return prisma.walletTransaction.findFirst({
    where: {
      walletId,
      referenceType,
      referenceId,
      type: "DEBIT",
      state: "RESERVED"
    },
    orderBy: { createdAt: "desc" }
  });
};

export class WalletService {
  async getOrCreateWallet(userId: string) {
    const existing = await prisma.wallet.findUnique({ where: { userId } });
    if (existing) return existing;

    return prisma.wallet.create({
      data: {
        userId,
        currency: "PKR"
      }
    });
  }

  async creditWallet(input: CreditWalletInput) {
    ensurePositiveAmount(input.amount);

    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { id: input.walletId }
      });

      if (!wallet) {
        throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: input.amount },
          lifetimeCredited: { increment: input.amount }
        }
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          paymentId: input.paymentId,
          orderId: input.orderId,
          subscriptionId: input.subscriptionId,
          type: "CREDIT",
          state: "SETTLED",
          creditSource: input.creditSource,
          amount: input.amount,
          balanceBefore: wallet.balance,
          balanceAfter: updatedWallet.balance,
          reservedBefore: wallet.reservedBalance,
          reservedAfter: wallet.reservedBalance,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          note: input.note,
          metadata: input.metadata as any
        }
      });

      return { wallet: updatedWallet, transaction };
    });
  }

  async refundWallet(input: BaseWalletActionInput) {
    ensurePositiveAmount(input.amount);

    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { id: input.walletId } });
      if (!wallet) throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: input.amount },
          lifetimeCredited: { increment: input.amount }
        }
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          paymentId: input.paymentId,
          orderId: input.orderId,
          subscriptionId: input.subscriptionId,
          type: "REFUND",
          state: "SETTLED",
          amount: input.amount,
          balanceBefore: wallet.balance,
          balanceAfter: updatedWallet.balance,
          reservedBefore: wallet.reservedBalance,
          reservedAfter: wallet.reservedBalance,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          note: input.note,
          metadata: input.metadata as any
        }
      });

      return { wallet: updatedWallet, transaction };
    });
  }

  async reserveCredits(input: BaseWalletActionInput): Promise<ReservationResult> {
    ensurePositiveAmount(input.amount);

    return prisma.$transaction(async (tx) => {
      const existingReservation = await findReferenceReservation(input.walletId, input.referenceType, input.referenceId);
      if (existingReservation) {
        return {
          walletId: input.walletId,
          transactionId: existingReservation.id,
          amount: existingReservation.amount
        };
      }

      const wallet = await tx.wallet.findUnique({ where: { id: input.walletId } });
      if (!wallet) throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");
      if (wallet.balance < input.amount) {
        throw new AppError("Insufficient wallet balance", 409, "WALLET_INSUFFICIENT_BALANCE");
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { decrement: input.amount },
          reservedBalance: { increment: input.amount }
        }
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          paymentId: input.paymentId,
          orderId: input.orderId,
          subscriptionId: input.subscriptionId,
          type: "DEBIT",
          state: "RESERVED",
          amount: input.amount,
          balanceBefore: wallet.balance,
          balanceAfter: updatedWallet.balance,
          reservedBefore: wallet.reservedBalance,
          reservedAfter: updatedWallet.reservedBalance,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          note: input.note,
          metadata: input.metadata as any
        }
      });

      return {
        walletId: wallet.id,
        transactionId: transaction.id,
        amount: input.amount
      };
    });
  }

  async settleReservedCredits(input: BaseWalletActionInput) {
    ensurePositiveAmount(input.amount);

    return prisma.$transaction(async (tx) => {
      const reservation = await tx.walletTransaction.findFirst({
        where: {
          walletId: input.walletId,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          type: "DEBIT",
          state: "RESERVED"
        },
        orderBy: { createdAt: "desc" }
      });

      if (!reservation) {
        const settled = await tx.walletTransaction.findFirst({
          where: {
            walletId: input.walletId,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            type: "DEBIT",
            state: "SETTLED"
          },
          orderBy: { createdAt: "desc" }
        });
        if (settled) {
          return settled;
        }
        throw new AppError("Reserved wallet transaction not found", 404, "WALLET_RESERVATION_NOT_FOUND");
      }

      const wallet = await tx.wallet.findUnique({ where: { id: input.walletId } });
      if (!wallet) throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          reservedBalance: { decrement: input.amount },
          lifetimeSpent: { increment: input.amount }
        }
      });

      return tx.walletTransaction.update({
        where: { id: reservation.id },
        data: {
          state: "SETTLED",
          balanceAfter: updatedWallet.balance,
          reservedAfter: updatedWallet.reservedBalance,
          note: input.note ?? reservation.note,
          metadata: input.metadata as any
        }
      });
    });
  }

  async releaseReservedCredits(input: BaseWalletActionInput) {
    ensurePositiveAmount(input.amount);

    return prisma.$transaction(async (tx) => {
      const reservation = await tx.walletTransaction.findFirst({
        where: {
          walletId: input.walletId,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          type: "DEBIT",
          state: "RESERVED"
        },
        orderBy: { createdAt: "desc" }
      });

      if (!reservation) {
        const released = await tx.walletTransaction.findFirst({
          where: {
            walletId: input.walletId,
            referenceType: input.referenceType,
            referenceId: input.referenceId,
            type: "DEBIT",
            state: "RELEASED"
          },
          orderBy: { createdAt: "desc" }
        });
        if (released) {
          return released;
        }
        throw new AppError("Reserved wallet transaction not found", 404, "WALLET_RESERVATION_NOT_FOUND");
      }

      const wallet = await tx.wallet.findUnique({ where: { id: input.walletId } });
      if (!wallet) throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: { increment: input.amount },
          reservedBalance: { decrement: input.amount }
        }
      });

      return tx.walletTransaction.update({
        where: { id: reservation.id },
        data: {
          state: "RELEASED",
          balanceAfter: updatedWallet.balance,
          reservedAfter: updatedWallet.reservedBalance,
          note: input.note ?? reservation.note,
          metadata: input.metadata as any
        }
      });
    });
  }

  async getWalletByUserId(userId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: { orderBy: { createdAt: "desc" }, take: 20 },
        subscriptions: { orderBy: { createdAt: "desc" }, take: 10 }
      }
    });

    if (!wallet) throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");
    return wallet;
  }
}
