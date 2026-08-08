// R9.2-P6B-APPROVED-OFFER-WIRING
//
// Wires the existing, owner-approved PriceBook (`PB-2026-08-03-v1`, via
// `ApprovedOfferProvider`) into the existing FixedOrder/FixedOrderItem
// domain that R9.2-P0A/P1A/P1B/P1C-B already built and tested, but that no
// route or service had ever actually called. This is the smallest new
// service required to make `POST /api/fixed-orders/restoration-digital`
// (the path already named in `FixedOrder`'s own schema comment) real.
//
// Trust boundary: the client supplies only `draftId` and `tier`. Amount,
// currency, PriceBook version, pricing source, and approval state are never
// read from the request -- they are always resolved server-side from the
// draft's own stored market/currency and the injected `OfferProvider`.
// Production code (`FixedOrderController`) always constructs this service
// with the default provider, `ApprovedOfferProvider` -- `FixtureOfferProvider`
// can only ever be reached by a test explicitly injecting it, and doing so
// proves (rather than risks) that a fixture-priced item is persisted with
// `pricingApproved: false`, never `true`.
//
// Stops before checkout/payment: creates exactly one FixedOrder + one
// FixedOrderItem. Never creates a PaymentAttempt, PaymentEvent,
// RestorationEntitlement, RestorationMaster, or ReplicateExecution -- those
// remain owned exclusively by the existing P4A verified-payment transaction
// boundary (`p4a-payment-verified-execution-queue.service.ts`).
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { assertOwnership, type RequestActor } from "../utils/ownership";
import {
  validateMarketCurrencyPair,
  FixedOrderDomainError,
  type Market,
  type FixedOrderCurrency
} from "../domain/fixedOrder/fixedOrderGuards";
import {
  ALLOWED_DIGITAL_TIERS,
  findOfferByTier,
  FixtureOfferProvider,
  type DigitalTier,
  type OfferProvider
} from "../domain/pricing/offerProvider";
import { ApprovedOfferProvider } from "../domain/pricing/approvedOfferProvider";
import { PRINT_CATALOG_VERSION, publicPrintCatalog, quotePrint } from "../domain/pricing/printCatalog";

export interface CreateRestorationDigitalOrderInput {
  draftId: string;
  tier: string;
  product?: "DIGITAL" | "PRINT_DIGITAL";
  printSize?: string;
  quantity?: number;
  deliveryAddress?: { recipientName: string; phone: string; addressLine1: string; addressLine2?: string; city: string; region?: string; postalCode?: string; countryCode: string };
}

export interface FixedOrderSafeView {
  id: string;
  orderNo: string;
  status: string;
  market: Market;
  currency: FixedOrderCurrency;
  tier: DigitalTier;
  totalAmountMinor: string;
  pricingSource: string;
  pricingApproved: boolean;
  priceBookVersion: string | null;
  priceBookApprovalReference: string | null;
  priceBookEffectiveAt: string | null;
  createdAt: string;
  print?: { size: string; quantity: number; unitAmountMinor: string; subtotalMinor: string; deliveryAmountMinor: string; catalogVersion: string };
  deliveryAddress?: { recipientName: string; phone: string; addressLine1: string; addressLine2?: string; city: string; region?: string; postalCode?: string; countryCode: string };
}

const orderNo = (): string => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomUUID().split("-")[0].toUpperCase();
  return `FO-${ts}-${rand}`;
};

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function toSafeView(order: {
  id: string;
  orderNo: string;
  status: string;
  market: string;
  currency: string;
  totalAmountMinor: bigint;
  priceBookVersion: string | null;
  priceBookApprovalReference: string | null;
  priceBookEffectiveAt: Date | null;
  createdAt: Date;
  items: Array<{ tierOrSku: string | null; pricingSource: string; pricingApproved: boolean; metadata: unknown }>;
}): FixedOrderSafeView {
  const item = order.items[0];
  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    market: order.market as Market,
    currency: order.currency as FixedOrderCurrency,
    tier: (item?.tierOrSku ?? "ORIGINAL") as DigitalTier,
    totalAmountMinor: order.totalAmountMinor.toString(),
    pricingSource: item?.pricingSource ?? "local_fixture",
    pricingApproved: item?.pricingApproved ?? false,
    priceBookVersion: order.priceBookVersion,
    priceBookApprovalReference: order.priceBookApprovalReference,
    priceBookEffectiveAt: order.priceBookEffectiveAt ? order.priceBookEffectiveAt.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
    print: order.items[0]?.metadata && typeof order.items[0].metadata === "object" && "print" in order.items[0].metadata ? (order.items[0].metadata as any).print : undefined
  };
}

const ORDER_INCLUDE = { items: { take: 1, orderBy: { createdAt: "asc" as const }, select: { tierOrSku: true, pricingSource: true, pricingApproved: true, metadata: true } } };

export class FixedOrderService {
  private readonly offerProvider: OfferProvider;

  /**
   * `offerProvider` defaults to the real, owner-approved `ApprovedOfferProvider`.
   * Only a test may override it (e.g. with `FixtureOfferProvider`) to prove
   * the fixture path is correctly rejected/never-approved -- no production
   * code path in this repository constructs this service with an override.
   */
  constructor(offerProvider: OfferProvider = new ApprovedOfferProvider()) {
    this.offerProvider = offerProvider;
  }

  /** GET /api/fixed-orders/:orderNo -- read-only. Uniform 404 for wrong-owner/nonexistent (enumeration-safe). */
  async getByOrderNo(orderNo: string, actor: RequestActor): Promise<FixedOrderSafeView> {
    const order = await prisma.fixedOrder.findUnique({ where: { orderNo }, include: ORDER_INCLUDE });
    const owned = assertOwnership(order, actor);
    return toSafeView(owned);
  }

  async createRestorationDigitalOrder(
    input: CreateRestorationDigitalOrderInput,
    actor: RequestActor
  ): Promise<FixedOrderSafeView> {
    if (!ALLOWED_DIGITAL_TIERS.includes(input.tier as DigitalTier)) {
      throw new AppError(`invalid tier: ${input.tier}`, 422, "INVALID_TIER");
    }
    const tier = input.tier as DigitalTier;

    const draft = await prisma.restorationDraft.findUnique({ where: { id: input.draftId } });
    const owned = assertOwnership(draft, actor);

    if (owned.status === "EXPIRED" || owned.status === "CANCELLED") {
      throw new AppError(`draft is ${owned.status.toLowerCase()} and cannot be ordered`, 409, "DRAFT_NOT_ORDERABLE");
    }

    // Idempotency: a draft may source at most one FixedOrder, ever (DB-level
    // unique index on FixedOrder.sourceDraftId). A repeat call -- including a
    // page refresh re-submitting the same draft -- returns the existing,
    // immutable order rather than creating (or erroring on) a duplicate.
    const existing = await prisma.fixedOrder.findFirst({
      where: { sourceDraftId: owned.id },
      include: ORDER_INCLUDE
    });
    if (existing) {
      assertOwnership(
        { ownerUserId: existing.ownerUserId, guestOwnershipTokenHash: existing.guestOwnershipTokenHash },
        actor
      );
      return toSafeView(existing);
    }

    if (!owned.market || !owned.currency) {
      throw new AppError("draft has no resolved market/currency", 422, "INVALID_MARKET");
    }
    try {
      validateMarketCurrencyPair(owned.market as Market, owned.currency as FixedOrderCurrency);
    } catch (err) {
      if (err instanceof FixedOrderDomainError) {
        throw new AppError(err.message, 422, "INVALID_MARKET");
      }
      throw err;
    }

    const offers = this.offerProvider.getDigitalOffers({ market: owned.market as Market });
    if (!Array.isArray(offers)) {
      throw new AppError(offers.reason, 422, "PRICING_UNAVAILABLE");
    }
    const offer = findOfferByTier(offers, tier);
    if (!offer) {
      throw new AppError(`no approved offer for tier ${tier} in market ${owned.market}`, 422, "INVALID_TIER");
    }

    const isApproved = offer.source === "approved_pricebook";
    const isPrint = input.product === "PRINT_DIGITAL";
    let printQuote: ReturnType<typeof quotePrint> | undefined;
    if (isPrint) {
      if (owned.currency !== "PKR" || !input.printSize || !Number.isSafeInteger(input.quantity)) throw new AppError("valid PKR print size and quantity are required", 422, "INVALID_PRINT_SELECTION");
      const address = input.deliveryAddress;
      if (!address || !address.recipientName.trim() || !address.phone.trim() || !address.addressLine1.trim() || !address.city.trim() || !address.countryCode.trim()) throw new AppError("delivery address is required for print orders", 422, "PRINT_ADDRESS_REQUIRED");
      try { printQuote = quotePrint(offer.amountMinor, input.printSize, input.quantity); } catch (error) { throw new AppError(error instanceof Error ? error.message : "invalid print selection", 422, "INVALID_PRINT_SELECTION"); }
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const order = await tx.fixedOrder.create({
          data: {
            orderNo: orderNo(),
            type: isPrint ? "RESTORATION_WITH_PRINT" : "RESTORATION_DIGITAL",
            market: owned.market as Market,
            currency: owned.currency as FixedOrderCurrency,
            ownerUserId: owned.ownerUserId ?? null,
            ownerCustomerId: null,
            guestOwnershipTokenHash: owned.guestOwnershipTokenHash ?? null,
            sourceDraftId: owned.id,
            totalAmountMinor: BigInt(printQuote?.totalAmountMinor ?? offer.amountMinor),
            priceBookVersion: isApproved ? offer.priceBookVersion ?? null : null,
            priceBookApprovalReference: isApproved ? offer.approvalReference ?? null : null,
            priceBookEffectiveAt: isApproved && offer.effectiveAt ? new Date(offer.effectiveAt) : null,
            items: {
              create: {
                kind: "RESTORATION_DIGITAL_TIER",
                tierOrSku: tier,
                unitAmountMinor: BigInt(offer.amountMinor),
                totalAmountMinor: BigInt(printQuote?.totalAmountMinor ?? offer.amountMinor),
                currency: owned.currency as FixedOrderCurrency,
                pricingSource: offer.source,
                pricingApproved: isApproved,
                metadata: printQuote && input.printSize ? { print: { size: input.printSize, quantity: input.quantity, unitAmountMinor: printQuote.printSubtotalMinor / (input.quantity ?? 1), subtotalMinor: printQuote.printSubtotalMinor, deliveryAmountMinor: printQuote.deliveryFeeMinor, catalogVersion: PRINT_CATALOG_VERSION } } : undefined
              }
            }
          },
          include: ORDER_INCLUDE
        });

        await tx.restorationDraft.update({
          where: { id: owned.id },
          data: { status: "ORDER_SELECTION" }
        });
        if (isPrint && input.deliveryAddress) {
          await tx.printDeliveryAddress.create({ data: { fixedOrderId: order.id, ...input.deliveryAddress } });
        }

        return order;
      });

      return toSafeView(created);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        // A concurrent request for the same draft won the race. Re-read and
        // return the winner's order rather than erroring -- this is what
        // makes a duplicate page-refresh submission converge safely.
        const winner = await prisma.fixedOrder.findFirst({
          where: { sourceDraftId: owned.id },
          include: ORDER_INCLUDE
        });
        if (!winner) throw err;
        assertOwnership(
          { ownerUserId: winner.ownerUserId, guestOwnershipTokenHash: winner.guestOwnershipTokenHash },
          actor
        );
        return toSafeView(winner);
      }
      throw err;
    }
  }

  getPrintCatalog() { return publicPrintCatalog(); }
}

// Exported only so a test can prove the fixture path is rejected without
// depending on a real, network-shaped FixtureOfferProvider import elsewhere.
export { FixtureOfferProvider };
