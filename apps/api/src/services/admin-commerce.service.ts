// R9.2-P2R-ADMIN: read-only admin visibility for FixedOrder/PaymentAttempt.
//
// This service performs ONLY reads. It never creates, updates, or deletes a
// FixedOrder, FixedOrderItem, PaymentAttempt, PaymentEvent, entitlement,
// master, execution, or variant row, and it never calls a payment provider
// network endpoint (BankAlfalahAdapter.getReadiness is a local config check,
// not a network call -- see domain/payment/bankAlfalahAdapter.ts). It exists
// to close the gap that no admin route could previously read FixedOrder,
// PriceBook, or PaymentAttempt state at all.
import type { FixedOrder, FixedOrderItem, PaymentAttempt } from "@prisma/client";
import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { computeOrderPaymentReasons, type FixedOrderStatus } from "../domain/payment/paymentReadiness";
import { BankAlfalahAdapter } from "../domain/payment/bankAlfalahAdapter";
import type { PaymentProvider } from "../domain/payment/paymentProvider";

export const ADMIN_COMMERCE_MAX_PAGE_SIZE = 100;
export const ADMIN_COMMERCE_DEFAULT_PAGE_SIZE = 20;

export interface AdminCommerceOrderListParams {
  page?: number;
  pageSize?: number;
  orderNo?: string;
  status?: string;
  market?: string;
  currency?: string;
  paymentStatus?: string;
}

export interface AdminCommerceOrderListItem {
  id: string;
  orderNo: string;
  type: string;
  market: string;
  currency: string;
  totalAmountMinor: string;
  status: string;
  paymentStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminCommerceOrderListResult {
  items: AdminCommerceOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminCommerceOrderItemView {
  id: string;
  kind: string;
  tierOrSku: string | null;
  quantity: number;
  unitAmountMinor: string;
  totalAmountMinor: string;
  currency: string;
  pricingSource: string;
  pricingApproved: boolean;
}

export interface AdminCommerceOrderDetail {
  orderNo: string;
  type: string;
  status: string;
  market: string;
  currency: string;
  totalAmountMinor: string;
  priceBookVersion: string | null;
  priceBookApprovalReference: string | null;
  priceBookEffectiveAt: Date | null;
  items: AdminCommerceOrderItemView[];
  paymentReadiness: {
    ready: boolean;
    reasons: string[];
  };
  paymentAttempt: {
    id: string;
    status: string;
    provider: string;
    providerRef: string | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

type OrderWithItems = FixedOrder & { items: FixedOrderItem[] };
type OrderWithItemsAndAttempt = OrderWithItems & { paymentAttempt: PaymentAttempt | null };
type OrderWithAttemptOnly = FixedOrder & { paymentAttempt: PaymentAttempt | null };

function clampPageSize(requested: number | undefined): number {
  if (!requested || !Number.isFinite(requested) || requested < 1) return ADMIN_COMMERCE_DEFAULT_PAGE_SIZE;
  return Math.min(ADMIN_COMMERCE_MAX_PAGE_SIZE, Math.floor(requested));
}

function clampPage(requested: number | undefined): number {
  if (!requested || !Number.isFinite(requested) || requested < 1) return 1;
  return Math.floor(requested);
}

export class AdminCommerceService {
  constructor(private readonly provider: PaymentProvider = new BankAlfalahAdapter()) {}

  async listOrders(params: AdminCommerceOrderListParams): Promise<AdminCommerceOrderListResult> {
    const page = clampPage(params.page);
    const pageSize = clampPageSize(params.pageSize);
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (params.orderNo) where.orderNo = { contains: params.orderNo, mode: "insensitive" };
    if (params.status) where.status = params.status.toUpperCase();
    if (params.market) where.market = params.market.toUpperCase();
    if (params.currency) where.currency = params.currency.toUpperCase();
    if (params.paymentStatus) {
      where.paymentAttempt = { status: params.paymentStatus.toUpperCase() };
    }

    const [rows, total] = await Promise.all([
      prisma.fixedOrder.findMany({
        where,
        include: { paymentAttempt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      }),
      prisma.fixedOrder.count({ where })
    ]);

    return {
      items: rows.map((row) => this.toListItem(row)),
      total,
      page,
      pageSize
    };
  }

  async getOrderDetail(orderNo: string): Promise<AdminCommerceOrderDetail> {
    const order = await prisma.fixedOrder.findUnique({
      where: { orderNo },
      include: { items: true, paymentAttempt: true }
    });
    if (!order) {
      // Safe 404: no stack trace, no existence-leaking detail beyond "not found".
      throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    }
    return this.toDetailView(order);
  }

  private toListItem(order: OrderWithAttemptOnly): AdminCommerceOrderListItem {
    return {
      id: order.id,
      orderNo: order.orderNo,
      type: order.type,
      market: order.market,
      currency: order.currency,
      totalAmountMinor: order.totalAmountMinor.toString(),
      status: order.status,
      paymentStatus: order.paymentAttempt?.status ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    };
  }

  private toDetailView(order: OrderWithItemsAndAttempt): AdminCommerceOrderDetail {
    const reasons = computeOrderPaymentReasons({
      type: order.type,
      market: order.market,
      currency: order.currency,
      status: order.status as FixedOrderStatus,
      totalAmountMinor: order.totalAmountMinor,
      items: order.items.map((item) => ({
        pricingSource: item.pricingSource,
        pricingApproved: item.pricingApproved
      })),
      existingAttemptStatus: order.paymentAttempt?.status ?? null,
      priceBookVersion: order.priceBookVersion,
      priceBookApprovalReference: order.priceBookApprovalReference
    });
    const providerReadiness = this.provider.getReadiness({ market: order.market, currency: order.currency });
    if (!providerReadiness.ready) {
      reasons.push(...providerReadiness.reasons.map((reason) => `provider unavailable: ${reason}`));
    }

    return {
      orderNo: order.orderNo,
      type: order.type,
      status: order.status,
      market: order.market,
      currency: order.currency,
      totalAmountMinor: order.totalAmountMinor.toString(),
      priceBookVersion: order.priceBookVersion,
      priceBookApprovalReference: order.priceBookApprovalReference,
      priceBookEffectiveAt: order.priceBookEffectiveAt,
      items: order.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        tierOrSku: item.tierOrSku,
        quantity: item.quantity,
        unitAmountMinor: item.unitAmountMinor.toString(),
        totalAmountMinor: item.totalAmountMinor.toString(),
        currency: item.currency,
        pricingSource: item.pricingSource,
        pricingApproved: item.pricingApproved
      })),
      paymentReadiness: {
        ready: reasons.length === 0,
        reasons
      },
      paymentAttempt: order.paymentAttempt
        ? {
            id: order.paymentAttempt.id,
            status: order.paymentAttempt.status,
            provider: order.paymentAttempt.provider,
            providerRef: order.paymentAttempt.providerRef
          }
        : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    };
  }
}
