// R9.2-P1B pure payment-readiness guard.
//
// Mirrors the style of `../fixedOrder/fixedOrderGuards.ts`: no Prisma/DB/
// network imports, plain data in, plain data out, unit-testable without a
// live database. The service layer (`payment-attempt.service.ts`) loads the
// real FixedOrder/items/attempt and provider readiness, then calls this
// function to decide truthfully whether payment may start or continue.
import type { FixedOrderCurrency, Market } from "../fixedOrder/fixedOrderGuards";
import { validateMarketCurrencyPair } from "../fixedOrder/fixedOrderGuards";

export type FixedOrderStatus =
  | "CREATED"
  | "PAYMENT_PENDING"
  | "PAYMENT_VERIFIED"
  | "LOCKED"
  | "CANCELLED"
  | "EXPIRED";

const PAYMENT_ELIGIBLE_ORDER_TYPES: readonly string[] = ["RESTORATION_DIGITAL", "RESTORATION_WITH_PRINT"];

const ORDER_BLOCKED_STATUSES: readonly FixedOrderStatus[] = [
  "PAYMENT_VERIFIED",
  "LOCKED",
  "CANCELLED",
  "EXPIRED"
];

/** Terminal/blocked PaymentAttempt states: an order in one of these must never start a new or repeated payment. */
const ATTEMPT_BLOCKED_STATUSES: readonly string[] = [
  "PAID",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "DISPUTED",
  "CHARGEBACK",
  "CANCELLED",
  "CANCELLED_BY_CUSTOMER",
  "EXPIRED"
];

export interface OrderItemPricingInput {
  pricingSource: string;
  pricingApproved: boolean;
  metadata?: unknown;
}

export interface OrderPaymentReadinessInput {
  type: string;
  market: Market;
  currency: FixedOrderCurrency;
  status: FixedOrderStatus;
  totalAmountMinor: bigint;
  items: OrderItemPricingInput[];
  existingAttemptStatus: string | null;
  /** R9.2-P1C-B immutable PriceBook snapshot -- required to be present whenever any item is pricingApproved. */
  priceBookVersion: string | null;
  priceBookApprovalReference: string | null;
}

/** Returns an empty array when the order itself is payment-ready (provider readiness is checked separately). */
export function computeOrderPaymentReasons(order: OrderPaymentReadinessInput): string[] {
  const reasons: string[] = [];

  if (!PAYMENT_ELIGIBLE_ORDER_TYPES.includes(order.type)) {
    reasons.push(`order type ${order.type} is not eligible for payment`);
  }

  if (ORDER_BLOCKED_STATUSES.includes(order.status)) {
    reasons.push(`order status ${order.status} is not eligible to start or continue payment`);
  }

  if (order.existingAttemptStatus && ATTEMPT_BLOCKED_STATUSES.includes(order.existingAttemptStatus)) {
    reasons.push(`payment attempt is already ${order.existingAttemptStatus}; a new or repeated attempt is not permitted`);
  }

  try {
    validateMarketCurrencyPair(order.market, order.currency);
  } catch {
    reasons.push(`invalid market/currency pairing: market=${order.market} currency=${order.currency}`);
  }

  if (!(order.totalAmountMinor > 0n)) {
    reasons.push("order amount must be a positive integer in minor units");
  }

  if (order.items.length === 0) {
    reasons.push("order has no line items");
  }
  const unapprovedItem = order.items.find((item) => !item.pricingApproved);
  if (unapprovedItem) {
    reasons.push(
      `pricing source "${unapprovedItem.pricingSource}" is not owner-approved/live; payment is not permitted for unapproved pricing`
    );
  }

  // R9.2-P1C-B: an item claiming pricingApproved:true is only trustworthy if
  // the order's immutable PriceBook snapshot (version + approval reference)
  // is actually present. A gap here means a corrupt/incomplete snapshot --
  // fail closed rather than trust a bare boolean.
  const hasApprovedItem = order.items.some((item) => item.pricingApproved);
  const packageCatalogOnly = order.items.length > 0 && order.items.every((item) => item.pricingSource === "package_catalog" && item.pricingApproved && item.metadata && typeof item.metadata === "object" && "package" in item.metadata);
  if (hasApprovedItem && !packageCatalogOnly && (!order.priceBookVersion || !order.priceBookApprovalReference)) {
    reasons.push(
      "approved pricing is missing its PriceBook version or approval reference; payment is not permitted for an incomplete snapshot"
    );
  }

  return reasons;
}
