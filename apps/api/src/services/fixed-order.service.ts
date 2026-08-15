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
import { PRINT_CATALOG_VERSION, publicPrintCatalog, publicSinglePrintCatalog, quotePrint, quoteSinglePrint } from "../domain/pricing/printCatalog";
import { findMemoryPackage } from "../domain/pricing/memoryPackages";
import { highestRequiredTier, minimumTierForPrint } from "./print-quality.service";

export interface CreateRestorationDigitalOrderInput {
  draftId: string;
  tier: string;
  product?: "DIGITAL" | "PRINT_DIGITAL";
  printSize?: string;
  quantity?: number;
  printLines?: Array<{ printSize: string; quantity: number }>;
  deliveryAddress?: { recipientName: string; phone: string; addressLine1: string; addressLine2?: string; city: string; region?: string; postalCode?: string; countryCode: string };
}

export interface CartItemInput {
  draftId: string;
  tier: string;
  product: "DIGITAL" | "PRINT_DIGITAL";
  printSize?: string;
  quantity?: number;
  printLines?: Array<{ printSize: string; quantity: number }>;
  // Each draft in a cart may have been created anonymously in its own
  // upload call and therefore carry its own distinct guest ownership
  // token (unlike the single-item flow, where one request always maps to
  // one draft/token). Optional: an authenticated actor never needs this,
  // and a guest submitting only one item can still rely on the shared
  // request-level token for backward compatibility.
  guestOwnershipToken?: string;
}

export interface CreateRestorationCartOrderInput {
  items: CartItemInput[];
  deliveryAddress?: { recipientName: string; phone: string; addressLine1: string; addressLine2?: string; city: string; region?: string; postalCode?: string; countryCode: string };
}

export interface CreateMemoryPackageOrderInput {
  packageCode: string;
  items: Array<{ draftId: string; guestOwnershipToken?: string }>;
}

export interface CartItemSafeView {
  fixedOrderItemId: string;
  draftId: string;
  tier: DigitalTier;
  product: "DIGITAL" | "PRINT_DIGITAL";
  digitalAmountMinor: string;
  print?: { size: string; quantity: number; unitAmountMinor: string; subtotalMinor: string; catalogVersion: string };
  prints?: Array<{ size: string; quantity: number; unitAmountMinor: string; subtotalMinor: string; catalogVersion: string; requiredTier?: string; qualitySurchargeMinor: string }>;
  lineTotalMinor: string;
}

export interface FixedOrderCartSafeView {
  id: string;
  orderNo: string;
  status: string;
  market: Market;
  currency: FixedOrderCurrency;
  items: CartItemSafeView[];
  restorationTotalMinor: string;
  printTotalMinor: string;
  deliveryAmountMinor: string;
  totalAmountMinor: string;
  priceBookVersion: string | null;
  createdAt: string;
  paymentStatus?: string;
  package?: { code: string; name: string; priceMinor: string; imagesIncluded: number };
}

export interface FixedOrderSafeView {
  id: string;
  orderNo: string;
  sourceDraftId: string | null;
  status: string;
  market: Market;
  currency: FixedOrderCurrency;
  tier: DigitalTier;
  product: "DIGITAL" | "PRINT_DIGITAL";
  totalAmountMinor: string;
  pricingSource: string;
  pricingApproved: boolean;
  priceBookVersion: string | null;
  priceBookApprovalReference: string | null;
  priceBookEffectiveAt: string | null;
  createdAt: string;
  paymentStatus?: string;
  print?: { size: string; quantity: number; unitAmountMinor: string; subtotalMinor: string; deliveryAmountMinor: string; catalogVersion: string; requiredTier?: string; qualitySurchargeMinor?: number };
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
  sourceDraftId: string | null;
  status: string;
  market: string;
  currency: string;
  totalAmountMinor: bigint;
  priceBookVersion: string | null;
  priceBookApprovalReference: string | null;
  priceBookEffectiveAt: Date | null;
  createdAt: Date;
  items: Array<{ tierOrSku: string | null; pricingSource: string; pricingApproved: boolean; metadata: unknown }>;
  deliveryAddress?: { recipientName: string; phone: string; addressLine1: string; addressLine2: string | null; city: string; region: string | null; postalCode: string | null; countryCode: string } | null;
  paymentAttempt?: { status: string } | null;
}): FixedOrderSafeView {
  const item = order.items[0];
  const isPrint = Boolean(item?.metadata && typeof item.metadata === "object" && "print" in item.metadata);
  return {
    id: order.id,
    orderNo: order.orderNo,
    sourceDraftId: order.sourceDraftId,
    status: order.status,
    market: order.market as Market,
    currency: order.currency as FixedOrderCurrency,
    tier: (item?.tierOrSku ?? "ORIGINAL") as DigitalTier,
    product: isPrint ? "PRINT_DIGITAL" : "DIGITAL",
    totalAmountMinor: order.totalAmountMinor.toString(),
    pricingSource: item?.pricingSource ?? "local_fixture",
    pricingApproved: item?.pricingApproved ?? false,
    priceBookVersion: order.priceBookVersion,
    priceBookApprovalReference: order.priceBookApprovalReference,
    priceBookEffectiveAt: order.priceBookEffectiveAt ? order.priceBookEffectiveAt.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
    paymentStatus: order.paymentAttempt?.status,
    print: order.items[0]?.metadata && typeof order.items[0].metadata === "object" && "print" in order.items[0].metadata ? (order.items[0].metadata as any).print : undefined,
    deliveryAddress: order.deliveryAddress ? {
      recipientName: order.deliveryAddress.recipientName,
      phone: order.deliveryAddress.phone,
      addressLine1: order.deliveryAddress.addressLine1,
      ...(order.deliveryAddress.addressLine2 ? { addressLine2: order.deliveryAddress.addressLine2 } : {}),
      city: order.deliveryAddress.city,
      ...(order.deliveryAddress.region ? { region: order.deliveryAddress.region } : {}),
      ...(order.deliveryAddress.postalCode ? { postalCode: order.deliveryAddress.postalCode } : {}),
      countryCode: order.deliveryAddress.countryCode
    } : undefined
  };
}

const ORDER_INCLUDE = { items: { take: 1, orderBy: { createdAt: "asc" as const }, select: { id: true, tierOrSku: true, pricingSource: true, pricingApproved: true, metadata: true } }, deliveryAddress: true, paymentAttempt: { select: { status: true } } };

const CART_ORDER_INCLUDE = {
  items: { orderBy: { createdAt: "asc" as const }, select: { id: true, tierOrSku: true, unitAmountMinor: true, totalAmountMinor: true, pricingSource: true, pricingApproved: true, metadata: true, sourceDraftId: true, printOrderLines: { orderBy: { createdAt: "asc" as const } } } },
  deliveryAddress: true,
  paymentAttempt: { select: { status: true } }
};

function toCartSafeView(order: {
  id: string;
  orderNo: string;
  status: string;
  market: string;
  currency: string;
  totalAmountMinor: bigint;
  priceBookVersion: string | null;
  createdAt: Date;
  items: Array<{ id: string; tierOrSku: string | null; unitAmountMinor: bigint; totalAmountMinor: bigint; metadata: unknown; sourceDraftId: string | null; printOrderLines: Array<{ printProduct: string; quantity: number; unitPriceMinor: bigint; subtotalMinor: bigint; requiredTier: string | null; qualitySurchargeMinor: bigint }> }>;
  paymentAttempt?: { status: string } | null;
}): FixedOrderCartSafeView {
  const items: CartItemSafeView[] = order.items.map((item) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const printMeta = item.metadata && typeof item.metadata === "object" && "print" in item.metadata ? (item.metadata as any).print : null;
    const linePrints = item.printOrderLines.map((line) => ({ size: line.printProduct, quantity: line.quantity, unitAmountMinor: line.unitPriceMinor.toString(), subtotalMinor: line.subtotalMinor.toString(), catalogVersion: PRINT_CATALOG_VERSION, ...(line.requiredTier ? { requiredTier: line.requiredTier } : {}), qualitySurchargeMinor: line.qualitySurchargeMinor.toString() }));
    const legacyPrint = printMeta ? { size: String(printMeta.size), quantity: Number(printMeta.quantity), unitAmountMinor: String(printMeta.unitAmountMinor), subtotalMinor: String(printMeta.subtotalMinor), catalogVersion: String(printMeta.catalogVersion) } : undefined;
    return {
      fixedOrderItemId: item.id,
      draftId: item.sourceDraftId ?? "",
      tier: (item.tierOrSku ?? "ORIGINAL") as DigitalTier,
      product: printMeta ? "PRINT_DIGITAL" : "DIGITAL",
      digitalAmountMinor: item.unitAmountMinor.toString(),
      print: linePrints[0] ? { size: linePrints[0].size, quantity: linePrints[0].quantity, unitAmountMinor: linePrints[0].unitAmountMinor, subtotalMinor: linePrints[0].subtotalMinor, catalogVersion: linePrints[0].catalogVersion } : legacyPrint,
      prints: linePrints.length > 0 ? linePrints : (legacyPrint ? [{ ...legacyPrint, qualitySurchargeMinor: "0" }] : []),
      lineTotalMinor: item.totalAmountMinor.toString()
    };
  });
  const restorationTotalMinor = order.items.reduce((sum, item) => sum + item.unitAmountMinor, 0n);
  const printTotalMinor = order.items.reduce((sum, item) => sum + (item.totalAmountMinor - item.unitAmountMinor), 0n);
  const deliveryAmountMinor = order.totalAmountMinor - restorationTotalMinor - printTotalMinor;
  const packageMeta = order.items.find((item) => item.metadata && typeof item.metadata === "object" && "package" in item.metadata)?.metadata as { package?: { code?: string; name?: string; priceMinor?: number; imagesIncluded?: number } } | undefined;
  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    market: order.market as Market,
    currency: order.currency as FixedOrderCurrency,
    items,
    restorationTotalMinor: restorationTotalMinor.toString(),
    printTotalMinor: printTotalMinor.toString(),
    deliveryAmountMinor: deliveryAmountMinor.toString(),
    totalAmountMinor: order.totalAmountMinor.toString(),
    priceBookVersion: order.priceBookVersion,
    createdAt: order.createdAt.toISOString(),
    paymentStatus: order.paymentAttempt?.status,
    ...(packageMeta?.package ? { package: { code: String(packageMeta.package.code), name: String(packageMeta.package.name), priceMinor: String(packageMeta.package.priceMinor), imagesIncluded: Number(packageMeta.package.imagesIncluded) } } : {})
  };
}

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
    const isPrint = input.product === "PRINT_DIGITAL";
    if (!isPrint && !ALLOWED_DIGITAL_TIERS.includes(input.tier as DigitalTier)) {
      throw new AppError(`invalid tier: ${input.tier}`, 422, "INVALID_TIER");
    }

    const draft = await prisma.restorationDraft.findUnique({ where: { id: input.draftId } });
    const owned = assertOwnership(draft, actor);

    if (owned.status === "EXPIRED" || owned.status === "CANCELLED") {
      throw new AppError(`draft is ${owned.status.toLowerCase()} and cannot be ordered`, 409, "DRAFT_NOT_ORDERABLE");
    }

    const requestedLinesForTier = input.printLines?.length
      ? input.printLines
      : input.printSize
        ? [{ printSize: input.printSize, quantity: input.quantity ?? 1 }]
        : [];
    const requiredTier = isPrint
      ? highestRequiredTier(requestedLinesForTier.map((line) => minimumTierForPrint(owned.originalWidth, owned.originalHeight, line.printSize)))
      : null;
    const tier = (isPrint ? requiredTier ?? "ORIGINAL" : input.tier) as DigitalTier;

    // A customer can return from Review and change Product before payment.
    // The draft uniqueness constraint still protects duplicate submissions, but
    // an unpaid stale order must not win over the new product selection.
    const existing = await prisma.fixedOrder.findFirst({ where: { sourceDraftId: owned.id }, include: ORDER_INCLUDE });
    if (existing) {
      assertOwnership({ ownerUserId: existing.ownerUserId, guestOwnershipTokenHash: existing.guestOwnershipTokenHash }, actor);
      const existingMeta = existing.items[0]?.metadata;
      const existingPrint = existingMeta && typeof existingMeta === "object" && "print" in existingMeta;
      const existingTier = existing.items[0]?.tierOrSku;
      const requestedLines = input.printLines?.length ? input.printLines : (input.printSize ? [{ printSize: input.printSize, quantity: input.quantity ?? 1 }] : []);
      const existingPrintLines = existingMeta && typeof existingMeta === "object" && "printLines" in existingMeta ? (existingMeta as { printLines?: Array<{ size?: string; quantity?: number }> }).printLines ?? [] : [];
      const samePrint = isPrint && existingPrint && JSON.stringify(existingPrintLines.map((line) => [line.size, line.quantity])) === JSON.stringify(requestedLines.map((line) => [line.printSize, line.quantity]));
      const sameSelection = isPrint ? samePrint : !existingPrint && existingTier === tier;
      if (sameSelection) return toSafeView(existing);
      if (existing.paymentAttempt) throw new AppError("paid order selections cannot be changed", 409, "ORDER_ALREADY_PAID");
      await prisma.fixedOrder.delete({ where: { id: existing.id } });
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
    let printQuote: ReturnType<typeof quotePrint> | undefined;
    let printLines: Array<{ printSize: string; quantity: number; quote: ReturnType<typeof quotePrint> }> = [];
    const enhancementAmountMinor = isPrint && requiredTier === "ORIGINAL" ? 0 : offer.amountMinor;
    if (isPrint) {
      if (owned.currency === "USD") throw new AppError("international print shipping is not configured", 422, "INTERNATIONAL_PRINT_SHIPPING_REQUIRED");
      if (owned.currency !== "PKR" || !input.printSize || !Number.isSafeInteger(input.quantity)) throw new AppError("valid PKR print size and quantity are required", 422, "INVALID_PRINT_SELECTION");
      const address = input.deliveryAddress;
      if (!address || !address.recipientName.trim() || !/^(?:\+92|0)3\d{9}$/.test(address.phone.replace(/[\s-]/g, "")) || !address.addressLine1.trim() || !address.city.trim() || !address.region?.trim() || !address.countryCode.trim()) throw new AppError("delivery address is required for print orders", 422, "PRINT_ADDRESS_REQUIRED");
      const requestedLines = input.printLines?.length ? input.printLines : [{ printSize: input.printSize, quantity: input.quantity }];
      if (requestedLines.length > 10) throw new AppError("too many print lines", 422, "INVALID_PRINT_LINES");
      try { printLines = requestedLines.map((line) => ({ printSize: line.printSize, quantity: line.quantity, quote: quoteSinglePrint(enhancementAmountMinor, line.printSize, line.quantity) })); printQuote = printLines[0]?.quote; } catch (error) { throw new AppError(error instanceof Error ? error.message : "invalid print selection", 422, "INVALID_PRINT_SELECTION"); }
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
            totalAmountMinor: BigInt(enhancementAmountMinor) + printLines.reduce((sum, line) => sum + BigInt(line.quote.printSubtotalMinor), 0n) + printLines.reduce((max, line) => { const fee = BigInt(line.quote.deliveryFeeMinor); return fee > max ? fee : max; }, 0n),
            priceBookVersion: isApproved ? offer.priceBookVersion ?? null : null,
            priceBookApprovalReference: isApproved ? offer.approvalReference ?? null : null,
            priceBookEffectiveAt: isApproved && offer.effectiveAt ? new Date(offer.effectiveAt) : null,
            items: {
              create: {
                kind: "RESTORATION_DIGITAL_TIER",
                tierOrSku: tier,
                unitAmountMinor: BigInt(enhancementAmountMinor),
                totalAmountMinor: BigInt(enhancementAmountMinor) + printLines.reduce((sum, line) => sum + BigInt(line.quote.printSubtotalMinor), 0n),
                currency: owned.currency as FixedOrderCurrency,
                pricingSource: offer.source,
                pricingApproved: isApproved,
                metadata: printQuote && input.printSize ? { print: { size: input.printSize, quantity: input.quantity, unitAmountMinor: printQuote.printSubtotalMinor / (input.quantity ?? 1), subtotalMinor: printQuote.printSubtotalMinor, deliveryAmountMinor: printQuote.deliveryFeeMinor, catalogVersion: PRINT_CATALOG_VERSION, requiredTier: tier, qualitySurchargeMinor: enhancementAmountMinor }, printLines: printLines.map((line) => ({ size: line.printSize, quantity: line.quantity, unitAmountMinor: line.quote.printSubtotalMinor / line.quantity, subtotalMinor: line.quote.printSubtotalMinor, deliveryAmountMinor: line.quote.deliveryFeeMinor, catalogVersion: PRINT_CATALOG_VERSION, requiredTier: tier, qualitySurchargeMinor: enhancementAmountMinor })) } : undefined
              }
            }
          },
          include: ORDER_INCLUDE
        });

        const createdItem = order.items[0];
        if (createdItem && printLines.length > 0) await tx.printOrderLine.createMany({ data: printLines.map((line, index) => ({ fixedOrderId: order.id, fixedOrderItemId: createdItem.id, printProduct: line.printSize, quantity: line.quantity, currency: owned.currency as FixedOrderCurrency, unitPriceMinor: BigInt(line.quote.printSubtotalMinor / line.quantity), subtotalMinor: BigInt(line.quote.printSubtotalMinor), requiredTier: tier, qualitySurchargeMinor: index === 0 ? BigInt(enhancementAmountMinor) : 0n })) });
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
  getSinglePrintCatalog() { return publicSinglePrintCatalog(); }

  /** Server-owned fixed-price package order. Package policy supplies one tier
   * for every image; customers never choose per-image product or quality. */
  async createMemoryPackageOrder(input: CreateMemoryPackageOrderInput, actor: RequestActor): Promise<FixedOrderCartSafeView> {
    const pkg = findMemoryPackage(input.packageCode);
    if (!pkg || !pkg.checkoutReady) throw new AppError("memory package is not currently available", 422, "PACKAGE_UNAVAILABLE");
    if (!Array.isArray(input.items) || input.items.length < pkg.minImages || input.items.length > pkg.maxImages) {
      throw new AppError(`package requires ${pkg.minImages} to ${pkg.maxImages} photos`, 422, "INVALID_PACKAGE_IMAGE_COUNT");
    }
    const draftIds = input.items.map((item) => item.draftId);
    if (new Set(draftIds).size !== draftIds.length) throw new AppError("each package photo must be unique", 422, "DUPLICATE_DRAFT_IN_PACKAGE");
    const drafts = await prisma.restorationDraft.findMany({ where: { id: { in: draftIds } } });
    if (drafts.length !== draftIds.length) throw new AppError("one or more package photos were not found", 404, "NOT_FOUND");
    for (const draft of drafts) {
      const item = input.items.find((candidate) => candidate.draftId === draft.id);
      assertOwnership(draft, actor.userId ? actor : { guestToken: item?.guestOwnershipToken ?? actor.guestToken ?? null });
      if (draft.status === "EXPIRED" || draft.status === "CANCELLED") throw new AppError("package photo is not orderable", 409, "DRAFT_NOT_ORDERABLE");
    }
    if (drafts.some((draft) => draft.market !== "PAKISTAN" || draft.currency !== "PKR")) throw new AppError("this package is currently available in PKR only", 422, "PACKAGE_MARKET_UNAVAILABLE");
    const existing = await prisma.fixedOrderItem.findMany({ where: { sourceDraftId: { in: draftIds } }, select: { fixedOrderId: true } });
    if (existing.length) throw new AppError("one or more package photos are already ordered", 409, "DRAFT_ALREADY_ORDERED");
    const created = await prisma.$transaction(async (tx) => {
      const order = await tx.fixedOrder.create({
        data: {
          orderNo: orderNo(), type: "RESTORATION_DIGITAL", market: "PAKISTAN", currency: "PKR",
          ownerUserId: actor.userId ?? drafts[0].ownerUserId ?? null, ownerCustomerId: null,
          guestOwnershipTokenHash: drafts[0].guestOwnershipTokenHash ?? null,
          sourceDraftId: drafts[0].id, totalAmountMinor: BigInt(pkg.priceMinor),
          items: { create: drafts.map((draft, index) => ({
            kind: "MEMORY_PACKAGE_IMAGE", tierOrSku: "HD_2X", unitAmountMinor: index === 0 ? BigInt(pkg.priceMinor) : 0n,
            totalAmountMinor: index === 0 ? BigInt(pkg.priceMinor) : 0n, currency: "PKR",
            pricingSource: "package_catalog", pricingApproved: true, sourceDraftId: draft.id,
            metadata: { package: { code: pkg.code, name: pkg.name, priceMinor: pkg.priceMinor, imagesIncluded: drafts.length, policyTier: "HD_2X" } }
          }))
          }
        }, include: CART_ORDER_INCLUDE
      });
      await tx.restorationDraft.updateMany({ where: { id: { in: draftIds } }, data: { status: "ORDER_SELECTION" } });
      return order;
    });
    return toCartSafeView(created);
  }

  /** R9.5-P5Q: GET /api/fixed-orders/:orderNo/cart -- read-only, multi-item view. */
  async getCartByOrderNo(orderNo: string, actor: RequestActor): Promise<FixedOrderCartSafeView> {
    const order = await prisma.fixedOrder.findUnique({ where: { orderNo }, include: CART_ORDER_INCLUDE });
    const owned = assertOwnership(order, actor);
    return toCartSafeView(owned);
  }

  /**
   * R9.5-P5Q: creates ONE FixedOrder with 1-10 independently configured
   * FixedOrderItems -- one cart, one order, one payment lifecycle (P4A,
   * unchanged, activates every item of whichever order it verifies).
   * Reuses the exact same trust boundary as the single-item path: the
   * client supplies only draftId/tier/product/printSize/quantity per item;
   * every amount, PriceBook field, and the one order-level delivery charge
   * are always resolved server-side.
   */
  async createRestorationCartOrder(input: CreateRestorationCartOrderInput, actor: RequestActor): Promise<FixedOrderCartSafeView> {
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 10) {
      throw new AppError("an order must contain between 1 and 10 items", 422, "INVALID_ITEM_COUNT");
    }
    const draftIds = input.items.map((item) => item.draftId);
    if (new Set(draftIds).size !== draftIds.length) {
      throw new AppError("each photo may appear only once per order", 422, "DUPLICATE_DRAFT_IN_CART");
    }

    // Every draft in a cart may carry its own distinct guest ownership
    // token (each was created by its own anonymous upload call). An
    // authenticated actor is authoritative for every item regardless; a
    // guest actor is resolved per-item, falling back to the shared
    // request-level token so a single-item cart stays backward compatible.
    const actorForItem = (draftId: string): RequestActor => {
      if (actor.userId) return actor;
      const raw = input.items.find((item) => item.draftId === draftId);
      return { guestToken: raw?.guestOwnershipToken ?? actor.guestToken ?? null };
    };
    const primaryActor = actorForItem(draftIds[0]);

    // Idempotency: if every one of these exact drafts already belongs to
    // one single existing order, converge on it rather than creating a
    // duplicate (safe retry/double-submit). A partial overlap (some drafts
    // already ordered elsewhere, some not) is rejected, not guessed.
    const existingItems = await prisma.fixedOrderItem.findMany({ where: { sourceDraftId: { in: draftIds } }, select: { fixedOrderId: true, sourceDraftId: true } });
    if (existingItems.length > 0) {
      const existingOrderIds = new Set(existingItems.map((item) => item.fixedOrderId));
      const existingDraftIds = new Set(existingItems.map((item) => item.sourceDraftId));
      if (existingOrderIds.size === 1 && existingDraftIds.size === draftIds.length && draftIds.every((id) => existingDraftIds.has(id))) {
        const existing = await prisma.fixedOrder.findUniqueOrThrow({ where: { id: [...existingOrderIds][0] }, include: CART_ORDER_INCLUDE });
        assertOwnership({ ownerUserId: existing.ownerUserId, guestOwnershipTokenHash: existing.guestOwnershipTokenHash }, primaryActor);
        return toCartSafeView(existing);
      }
      throw new AppError("one or more of these photos already belong to a different order", 409, "DRAFT_ALREADY_ORDERED");
    }

    // Every draft must be owned by this actor, orderable, and share one
    // market/currency (one order has exactly one currency).
    const drafts = await prisma.restorationDraft.findMany({ where: { id: { in: draftIds } } });
    if (drafts.length !== draftIds.length) throw new AppError("one or more photos were not found", 404, "NOT_FOUND");
    for (const draft of drafts) {
      assertOwnership(draft, actorForItem(draft.id));
      if (draft.status === "EXPIRED" || draft.status === "CANCELLED") {
        throw new AppError(`photo ${draft.id} is ${draft.status.toLowerCase()} and cannot be ordered`, 409, "DRAFT_NOT_ORDERABLE");
      }
    }
    const market = drafts[0].market;
    const currency = drafts[0].currency;
    if (!market || !currency) throw new AppError("photo has no resolved market/currency", 422, "INVALID_MARKET");
    if (drafts.some((d) => d.market !== market || d.currency !== currency)) {
      throw new AppError("every photo in one order must share the same market and currency", 422, "INVALID_MARKET");
    }
    try {
      validateMarketCurrencyPair(market as Market, currency as FixedOrderCurrency);
    } catch (err) {
      if (err instanceof FixedOrderDomainError) throw new AppError(err.message, 422, "INVALID_MARKET");
      throw err;
    }

    const offers = this.offerProvider.getDigitalOffers({ market: market as Market });
    if (!Array.isArray(offers)) throw new AppError(offers.reason, 422, "PRICING_UNAVAILABLE");

    const anyPrint = input.items.some((item) => item.product === "PRINT_DIGITAL");
    if (anyPrint) {
      if (currency === "USD") throw new AppError("international print shipping is not configured", 422, "INTERNATIONAL_PRINT_SHIPPING_REQUIRED");
      const address = input.deliveryAddress;
      if (!address || !address.recipientName.trim() || !/^(?:\+92|0)3\d{9}$/.test(address.phone.replace(/[\s-]/g, "")) || !address.addressLine1.trim() || !address.city.trim() || !address.countryCode.trim()) {
        throw new AppError("delivery address is required when any item is Print + Digital", 422, "PRINT_ADDRESS_REQUIRED");
      }
    }

    type ResolvedItem = {
      draftId: string;
      tier: DigitalTier;
      offer: ReturnType<typeof findOfferByTier>;
      isPrint: boolean;
      printLines: Array<{ printSize: string; quantity: number; printQuote: ReturnType<typeof quotePrint> }>;
    };
    const resolved: ResolvedItem[] = [];
    for (const raw of input.items) {
      if (!ALLOWED_DIGITAL_TIERS.includes(raw.tier as DigitalTier)) {
        throw new AppError(`invalid tier: ${raw.tier}`, 422, "INVALID_TIER");
      }
      const tier = raw.tier as DigitalTier;
      const offer = findOfferByTier(offers, tier);
      if (!offer) throw new AppError(`no approved offer for tier ${tier} in market ${market}`, 422, "INVALID_TIER");
      const isPrint = raw.product === "PRINT_DIGITAL";
      const requestedLines = isPrint ? (raw.printLines?.length ? raw.printLines : (raw.printSize ? [{ printSize: raw.printSize, quantity: raw.quantity ?? 0 }] : [])) : [];
      if (isPrint && (requestedLines.length < 1 || requestedLines.length > 10)) throw new AppError("one to ten print lines are required", 422, "INVALID_PRINT_LINES");
      const printLines: Array<{ printSize: string; quantity: number; printQuote: ReturnType<typeof quotePrint> }> = [];
      if (isPrint) {
        for (const line of requestedLines) {
          if (!line.printSize || !Number.isSafeInteger(line.quantity)) throw new AppError("valid print size and quantity are required for a Print + Digital item", 422, "INVALID_PRINT_SELECTION");
          try { printLines.push({ printSize: line.printSize, quantity: line.quantity, printQuote: quotePrint(offer.amountMinor, line.printSize, line.quantity) }); }
          catch (error) { throw new AppError(error instanceof Error ? error.message : "invalid print selection", 422, "INVALID_PRINT_SELECTION"); }
        }
      }
      resolved.push({ draftId: raw.draftId, tier, offer, isPrint, printLines });
    }

    // ---- Server-authoritative totals: restoration + print subtotals summed
    // across every item, delivery charged ONCE at the highest applicable
    // band among the print items selected -- never per item, never client-
    // supplied. ----
    const restorationTotalMinor = resolved.reduce((sum, item) => sum + BigInt(item.offer!.amountMinor), 0n);
    const printTotalMinor = resolved.reduce((sum, item) => sum + item.printLines.reduce((lineSum, line) => lineSum + BigInt(line.printQuote.printSubtotalMinor), 0n), 0n);
    const deliveryAmountMinor = resolved.reduce((max, item) => {
      const band = item.printLines.reduce((lineMax, line) => { const fee = BigInt(line.printQuote.deliveryFeeMinor ?? 0); return fee > lineMax ? fee : lineMax; }, 0n);
      return band > max ? band : max;
    }, 0n);
    const grandTotalMinor = restorationTotalMinor + printTotalMinor + deliveryAmountMinor;

    const isApproved = resolved.every((item) => item.offer!.source === "approved_pricebook");
    const firstApproved = resolved.find((item) => item.offer!.source === "approved_pricebook")?.offer;

    try {
      const created = await prisma.$transaction(async (tx) => {
        const order = await tx.fixedOrder.create({
          data: {
            orderNo: orderNo(),
            type: anyPrint ? "RESTORATION_WITH_PRINT" : "RESTORATION_DIGITAL",
            market: market as Market,
            currency: currency as FixedOrderCurrency,
            ownerUserId: drafts[0].ownerUserId ?? null,
            ownerCustomerId: null,
            guestOwnershipTokenHash: drafts[0].guestOwnershipTokenHash ?? null,
            // Order-level sourceDraftId retains the existing single-draft
            // idempotency unique-index behavior for the FIRST item; every
            // item (including this one) additionally carries its own
            // sourceDraftId, which is what this packet's multi-item flows
            // actually key off.
            sourceDraftId: resolved[0].draftId,
            totalAmountMinor: grandTotalMinor,
            priceBookVersion: isApproved ? firstApproved?.priceBookVersion ?? null : null,
            priceBookApprovalReference: isApproved ? firstApproved?.approvalReference ?? null : null,
            priceBookEffectiveAt: isApproved && firstApproved?.effectiveAt ? new Date(firstApproved.effectiveAt) : null,
            items: {
              create: resolved.map((item) => ({
                kind: "RESTORATION_DIGITAL_TIER",
                tierOrSku: item.tier,
                unitAmountMinor: BigInt(item.offer!.amountMinor),
                totalAmountMinor: BigInt(item.offer!.amountMinor) + item.printLines.reduce((sum, line) => sum + BigInt(line.printQuote.printSubtotalMinor), 0n),
                currency: currency as FixedOrderCurrency,
                pricingSource: item.offer!.source,
                pricingApproved: item.offer!.source === "approved_pricebook",
                sourceDraftId: item.draftId,
                metadata: item.printLines.length > 0
                  ? { print: { size: item.printLines[0].printSize, quantity: item.printLines[0].quantity, unitAmountMinor: item.printLines[0].printQuote.printSubtotalMinor / item.printLines[0].quantity, subtotalMinor: item.printLines[0].printQuote.printSubtotalMinor, deliveryAmountMinor: item.printLines[0].printQuote.deliveryFeeMinor, catalogVersion: PRINT_CATALOG_VERSION }, printLines: item.printLines.map((line) => ({ size: line.printSize, quantity: line.quantity, unitAmountMinor: line.printQuote.printSubtotalMinor / line.quantity, subtotalMinor: line.printQuote.printSubtotalMinor, deliveryAmountMinor: line.printQuote.deliveryFeeMinor, catalogVersion: PRINT_CATALOG_VERSION })) }
                  : undefined
              }))
            }
          },
          include: CART_ORDER_INCLUDE
        });

        for (const item of resolved) {
          const createdItem = order.items.find((candidate) => candidate.sourceDraftId === item.draftId);
          if (!createdItem) throw new Error("created print item could not be resolved");
          if (item.printLines.length > 0) await tx.printOrderLine.createMany({ data: item.printLines.map((line) => ({ fixedOrderId: order.id, fixedOrderItemId: createdItem.id, printProduct: line.printSize, quantity: line.quantity, currency: currency as FixedOrderCurrency, unitPriceMinor: BigInt(line.printQuote.printSubtotalMinor / line.quantity), subtotalMinor: BigInt(line.printQuote.printSubtotalMinor), requiredTier: item.tier, qualitySurchargeMinor: 0n })) });
        }
        await tx.restorationDraft.updateMany({ where: { id: { in: draftIds } }, data: { status: "ORDER_SELECTION" } });
        if (anyPrint && input.deliveryAddress) {
          await tx.printDeliveryAddress.create({ data: { fixedOrderId: order.id, ...input.deliveryAddress } });
        }
        return order;
      });
      return this.getCartByOrderNo(created.orderNo, primaryActor);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        const winner = await prisma.fixedOrder.findFirst({ where: { sourceDraftId: resolved[0].draftId }, include: CART_ORDER_INCLUDE });
        if (!winner) throw err;
        assertOwnership({ ownerUserId: winner.ownerUserId, guestOwnershipTokenHash: winner.guestOwnershipTokenHash }, primaryActor);
        return toCartSafeView(winner);
      }
      throw err;
    }
  }
}

// Exported only so a test can prove the fixture path is rejected without
// depending on a real, network-shaped FixtureOfferProvider import elsewhere.
export { FixtureOfferProvider };
