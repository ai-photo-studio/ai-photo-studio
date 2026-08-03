// R9.2-P1A: immutable RESTORATION_DIGITAL FixedOrder creation.
//
// Stops at order creation. This file never creates a PaymentAttempt,
// RestorationEntitlement, RestorationMaster, ReplicateExecution, or
// ImageVariant, and never calls Replicate/RunPod/Bank Alfalah -- those are
// explicitly out of scope for this packet.
import { randomBytes } from "node:crypto";
import type { FixedOrder, FixedOrderItem } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { assertOwnership, type RequestActor } from "../utils/ownership";
import {
  assertAllowedOrderType,
  assertFixedOrderMutationAllowed,
  validateIntegerMinorAmount,
  validateMarketCurrencyPair
} from "../domain/fixedOrder/fixedOrderGuards";
import {
  ALLOWED_DIGITAL_TIERS,
  findOfferByTier,
  type DigitalTier,
  type OfferProvider
} from "../domain/pricing/offerProvider";
import { ApprovedOfferProvider } from "../domain/pricing/approvedOfferProvider";
import { createGuestOwnershipToken, hashGuestOwnershipToken } from "../utils/guest-ownership";

export interface CreateRestorationDigitalOrderInput {
  draftId: string;
  tier: string;
  actor: RequestActor;
}

export interface FixedOrderSafeView {
  id: string;
  orderNo: string;
  type: string;
  market: string;
  currency: string;
  totalAmountMinor: string;
  status: string;
  immutableAt: Date;
  createdAt: Date;
  /** Immutable PriceBook snapshot captured at order creation -- never recomputed later. */
  priceBookVersion: string | null;
  priceBookApprovalReference: string | null;
  priceBookEffectiveAt: Date | null;
  items: Array<{
    id: string;
    kind: string;
    tierOrSku: string | null;
    quantity: number;
    unitAmountMinor: string;
    totalAmountMinor: string;
    currency: string;
    pricingSource: string;
    pricingApproved: boolean;
  }>;
}

type FixedOrderWithItems = FixedOrder & { items: FixedOrderItem[] };

const generateOrderNo = () =>
  `FXD-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

// R9.2-P2R-CUSTOMER-ORDERS: authenticated, read-only customer order history.
export const CUSTOMER_ORDERS_DEFAULT_PAGE_SIZE = 20;
export const CUSTOMER_ORDERS_MAX_PAGE_SIZE = 100;
const CUSTOMER_ORDER_STATUSES = new Set(["CREATED", "PAYMENT_PENDING", "PAYMENT_VERIFIED", "LOCKED", "CANCELLED", "EXPIRED"]);
const CUSTOMER_ORDER_MARKETS = new Set(["PAKISTAN", "INTERNATIONAL"]);
const CUSTOMER_ORDER_CURRENCIES = new Set(["PKR", "USD"]);

export interface CustomerOrderListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  market?: string;
  currency?: string;
}

export interface CustomerOrderListItem {
  orderNo: string;
  type: string;
  status: string;
  market: string;
  currency: string;
  totalAmountMinor: string;
  priceBookVersion: string | null;
  items: Array<{
    tierOrSku: string | null;
    pricingSource: string;
    pricingApproved: boolean;
  }>;
  paymentAttempt: { id: string; status: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerOrderListResult {
  items: CustomerOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

function clampCustomerPageSize(requested: number | undefined): number {
  if (!requested || !Number.isFinite(requested) || requested < 1) return CUSTOMER_ORDERS_DEFAULT_PAGE_SIZE;
  return Math.min(CUSTOMER_ORDERS_MAX_PAGE_SIZE, Math.floor(requested));
}

function clampCustomerPage(requested: number | undefined): number {
  if (!requested || !Number.isFinite(requested) || requested < 1) return 1;
  return Math.floor(requested);
}

function normalizeCustomerOrderFilter(value: string | undefined, allowed: Set<string>, name: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toUpperCase();
  if (!normalized || !allowed.has(normalized)) {
    throw new AppError(`Invalid ${name} filter`, 400, "INVALID_FILTER");
  }
  return normalized;
}

export class FixedOrderService {
  // R9.2-P1C-B: the default provider is now the real, owner-approved
  // PriceBook -- FixtureOfferProvider remains available (unchanged) for
  // tests that must prove local_fixture pricing stays permanently
  // unapproved and payment-ineligible.
  constructor(private readonly offers: OfferProvider = new ApprovedOfferProvider()) {}

  async createRestorationDigitalOrder(
    input: CreateRestorationDigitalOrderInput
  ): Promise<FixedOrderSafeView & { guestOwnershipToken?: string }> {
    if (!ALLOWED_DIGITAL_TIERS.includes(input.tier as DigitalTier)) {
      throw new AppError(`Invalid digital tier: ${input.tier}`, 400, "INVALID_TIER");
    }
    // Order type is a fixed literal for this endpoint, not client-supplied --
    // this assertion is defense-in-depth documentation, not input validation.
    assertAllowedOrderType("RESTORATION_DIGITAL");

    const draft = await prisma.restorationDraft.findUnique({ where: { id: input.draftId } });
    const ownedDraft = assertOwnership(draft, input.actor);

    if (!ownedDraft.market || !ownedDraft.currency) {
      throw new AppError("Market has not been confirmed for this draft", 409, "MARKET_NOT_CONFIRMED");
    }
    const market = ownedDraft.market;
    const currency = ownedDraft.currency;
    validateMarketCurrencyPair(market, currency);

    if (ownedDraft.status === "CANCELLED" || ownedDraft.status === "EXPIRED") {
      throw new AppError("This draft is no longer available", 410, "DRAFT_UNAVAILABLE");
    }

    // Idempotency: the draft id IS the idempotency key. A RestorationDraft
    // may source at most one FixedOrder, ever -- enforced at the database
    // level by the unique index on FixedOrder.sourceDraftId (R9.2-P1A
    // migration). A repeated request for the same draft returns the same
    // order rather than erroring or creating a second one.
    const existing = await prisma.fixedOrder.findFirst({
      where: { sourceDraftId: input.draftId },
      include: { items: true }
    });
    if (existing) {
      return this.toSafeView(existing);
    }

    // Client sends only a tier identifier -- amount/currency are always
    // resolved server-side from the offer provider, never accepted from the
    // request body.
    const offers = this.offers.getDigitalOffers({ market });
    if (!Array.isArray(offers)) {
      throw new AppError(offers.reason, 409, "PRICING_UNAVAILABLE");
    }
    const offer = findOfferByTier(offers, input.tier);
    if (!offer) {
      throw new AppError(`No offer available for tier ${input.tier}`, 400, "INVALID_TIER");
    }
    validateIntegerMinorAmount(offer.amountMinor);

    let guestOwnershipTokenHash: string | null = ownedDraft.guestOwnershipTokenHash;
    let issuedGuestToken: string | undefined;
    if (!input.actor.userId && !guestOwnershipTokenHash) {
      issuedGuestToken = createGuestOwnershipToken();
      guestOwnershipTokenHash = hashGuestOwnershipToken(issuedGuestToken);
    }

    // R9.2-P1C-B: the immutable order-time PriceBook snapshot. Only a real
    // "approved_pricebook" offer (ApprovedOfferProvider) ever carries a
    // priceBookVersion/approvalReference/effectiveAt and only that source
    // may ever mark the item's pricing as approved -- a local_fixture offer
    // (FixtureOfferProvider, used only in tests) always yields false/null,
    // exactly as before. Neither value is ever recomputed after this write.
    const isApproved = offer.source === "approved_pricebook";
    const priceBookVersion = offer.priceBookVersion ?? `${offer.source}-v1`;
    const priceBookApprovalReference = offer.approvalReference ?? null;
    const priceBookEffectiveAt = offer.effectiveAt ? new Date(offer.effectiveAt) : null;

    try {
      const created = await prisma.$transaction(async (tx) => {
        const order = await tx.fixedOrder.create({
          data: {
            orderNo: generateOrderNo(),
            type: "RESTORATION_DIGITAL",
            market,
            currency,
            ownerUserId: input.actor.userId ?? null,
            guestOwnershipTokenHash: guestOwnershipTokenHash ?? null,
            sourceDraftId: ownedDraft.id,
            totalAmountMinor: BigInt(offer.amountMinor),
            priceBookVersion,
            priceBookApprovalReference,
            priceBookEffectiveAt
          }
        });
        const item = await tx.fixedOrderItem.create({
          data: {
            fixedOrderId: order.id,
            kind: "DIGITAL_TIER",
            tierOrSku: offer.tier,
            quantity: 1,
            unitAmountMinor: BigInt(offer.amountMinor),
            totalAmountMinor: BigInt(offer.amountMinor),
            currency,
            pricingSource: offer.source,
            pricingApproved: isApproved
          }
        });
        await tx.restorationDraft.update({ where: { id: ownedDraft.id }, data: { status: "ORDER_SELECTION" } });
        return { ...order, items: [item] };
      });
      return { ...this.toSafeView(created), guestOwnershipToken: issuedGuestToken };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Lost a race to a concurrent request for the same draft -- return
        // the winner's order instead of failing. Still idempotent overall.
        const winner = await prisma.fixedOrder.findFirst({
          where: { sourceDraftId: input.draftId },
          include: { items: true }
        });
        if (winner) return this.toSafeView(winner);
      }
      throw error;
    }
  }

  async getOrderByOrderNo(orderNo: string, actor: RequestActor): Promise<FixedOrderSafeView> {
    const order = await prisma.fixedOrder.findUnique({ where: { orderNo }, include: { items: true } });
    const owned = assertOwnership(order, actor);
    return this.toSafeView(owned);
  }

  /**
   * R9.2-P2R-CUSTOMER-ORDERS: authenticated, read-only list of the calling
   * customer's own FixedOrders. `ownerUserId` MUST always be the id derived
   * from a verified auth token (see `requireAuth` in auth.middleware.ts /
   * `actorFromRequest` in utils/ownership.ts) -- this method never accepts or
   * trusts any client-supplied owner/user id. Performs reads only: no
   * create/update/delete/upsert Prisma call is reachable from this method.
   */
  async listMyOrders(ownerUserId: string, params: CustomerOrderListParams): Promise<CustomerOrderListResult> {
    const page = clampCustomerPage(params.page);
    const pageSize = clampCustomerPageSize(params.pageSize);
    const skip = (page - 1) * pageSize;
    const status = normalizeCustomerOrderFilter(params.status, CUSTOMER_ORDER_STATUSES, "status");
    const market = normalizeCustomerOrderFilter(params.market, CUSTOMER_ORDER_MARKETS, "market");
    const currency = normalizeCustomerOrderFilter(params.currency, CUSTOMER_ORDER_CURRENCIES, "currency");

    const where: Record<string, unknown> = { ownerUserId };
    if (status) where.status = status;
    if (market) where.market = market;
    if (currency) where.currency = currency;

    const [rows, total] = await Promise.all([
      prisma.fixedOrder.findMany({
        where,
        include: { items: true, paymentAttempt: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      }),
      prisma.fixedOrder.count({ where })
    ]);

    return {
      items: rows.map((row) => this.toCustomerListItem(row)),
      total,
      page,
      pageSize
    };
  }

  private toCustomerListItem(
    order: FixedOrderWithItems & { paymentAttempt: { id: string; status: string } | null }
  ): CustomerOrderListItem {
    return {
      orderNo: order.orderNo,
      type: order.type,
      status: order.status,
      market: order.market,
      currency: order.currency,
      totalAmountMinor: order.totalAmountMinor.toString(),
      priceBookVersion: order.priceBookVersion,
      items: order.items.map((item) => ({
        tierOrSku: item.tierOrSku,
        pricingSource: item.pricingSource,
        pricingApproved: item.pricingApproved
      })),
      paymentAttempt: order.paymentAttempt
        ? { id: order.paymentAttempt.id, status: order.paymentAttempt.status }
        : null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt
    };
  }

  /**
   * Not called from any route in this packet (no edit/reprice endpoint
   * exists yet) -- exposed so tests can prove a real, persisted FixedOrder
   * genuinely rejects mutation via the shared P0A guard, not just synthetic
   * data.
   */
  assertMutable(order: { immutableAt: Date | string | null; status: string }): void {
    assertFixedOrderMutationAllowed(order);
  }

  private toSafeView(order: FixedOrderWithItems): FixedOrderSafeView {
    return {
      id: order.id,
      orderNo: order.orderNo,
      type: order.type,
      market: order.market,
      currency: order.currency,
      totalAmountMinor: order.totalAmountMinor.toString(),
      status: order.status,
      immutableAt: order.immutableAt,
      createdAt: order.createdAt,
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
      }))
    };
  }
}
