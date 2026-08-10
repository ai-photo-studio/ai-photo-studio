#!/usr/bin/env node
/**
 * One-time pre-production trial commerce reset to PB-2026-08-09-TRIAL-V3.
 * Default is dry-run. Apply requires --apply and a loopback disposable DB.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ApprovedOfferProvider } from "../domain/pricing/approvedOfferProvider";
import { CURRENT_PRICE_BOOK_VERSION } from "../domain/pricing/priceBook";
import { findOfferByTier } from "../domain/pricing/offerProvider";

const apply = process.argv.includes("--apply");
const rawUrl = process.env.DATABASE_URL;
const managed = /neon|northflank|railway|supabase|amazonaws|rds|cloudsql|azure|cockroach|planetscale|render\.com/i;

function fail(message: string): never {
  console.error(`TRIAL_RESET_BLOCKED: ${message}`);
  process.exit(2);
}
if (!rawUrl) fail("DATABASE_URL is required");
let parsed: URL;
try { parsed = new URL(rawUrl); } catch { fail("DATABASE_URL is invalid"); }
if (!['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) || managed.test(rawUrl)) fail("only a disposable loopback database is permitted");

const prisma = new PrismaClient();
const provider = new ApprovedOfferProvider({ now: () => new Date("2026-08-09T12:00:00Z") });
async function main() {
  const orders = await prisma.fixedOrder.findMany({
    include: {
      paymentAttempt: { include: { events: true } },
      restorationEntitlements: true,
      items: { include: { printEntitlements: { include: { fulfilmentOrder: { include: { shipment: true } } } } } }
    }
  });
  const unsafe = orders.filter((order) => {
    const attempt = order.paymentAttempt;
    const paid = attempt?.status === "PAID" || attempt?.events.some((event) => event.verified);
    const fulfilled = order.items.some((item) => item.printEntitlements.some((entitlement) => entitlement.fulfilmentOrder?.status === "SHIPPED" || entitlement.fulfilmentOrder?.shipment?.status === "DISPATCHED"));
    // R9.5-P5P: entitlements are item-scoped -- an order is unsafe to reset
    // if ANY of its items has a non-revoked entitlement.
    const granted = order.restorationEntitlements.some((entitlement) => entitlement.status !== "REVOKED");
    return paid || fulfilled || granted;
  });
  if (unsafe.length) fail(`${unsafe.length} order(s) contain paid, verified, granted, or fulfilled evidence; aborting entire reset`);

  const changes = orders.flatMap((order) => {
    const item = order.items[0];
    if (!item || !["CREATED", "PAYMENT_PENDING"].includes(order.status)) return [];
    const offers = provider.getDigitalOffers({ market: order.market as "PAKISTAN" | "INTERNATIONAL" });
    if (!Array.isArray(offers)) return [];
    const offer = findOfferByTier(offers, item.tierOrSku as never);
    if (!offer) return [];
    const next = BigInt(offer.amountMinor);
    return [{ order, item, offer, oldTotal: order.totalAmountMinor, nextTotal: next }];
  });
  const summary = { mode: apply ? "APPLY" : "DRY_RUN", version: CURRENT_PRICE_BOOK_VERSION, scanned: orders.length, eligible: changes.length, changed: changes.filter((c) => c.oldTotal !== c.nextTotal || c.order.priceBookVersion !== CURRENT_PRICE_BOOK_VERSION).length, paymentAttempts: 0, paymentEvents: 0, executions: 0, fulfilment: 0 };
  console.log(JSON.stringify(summary, null, 2));
  if (!apply || changes.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const change of changes) {
      await tx.fixedOrder.update({ where: { id: change.order.id }, data: { totalAmountMinor: change.nextTotal, priceBookVersion: CURRENT_PRICE_BOOK_VERSION, priceBookApprovalReference: change.offer.approvalReference, priceBookEffectiveAt: new Date(change.offer.effectiveAt) } });
      await tx.fixedOrderItem.update({ where: { id: change.item.id }, data: { unitAmountMinor: change.nextTotal, totalAmountMinor: change.nextTotal, pricingSource: "approved_pricebook", pricingApproved: true } });
      if (change.order.paymentAttempt && ["CREATED", "PENDING", "FAILED", "CANCELLED"].includes(change.order.paymentAttempt.status)) await tx.paymentAttempt.update({ where: { id: change.order.paymentAttempt.id }, data: { amountMinor: change.nextTotal } });
    }
  });
  console.log(`TRIAL_RESET_APPLIED: ${changes.length} order(s)`);
}

main().catch((error) => { console.error(`TRIAL_RESET_FAILED: ${error instanceof Error ? error.message : "unknown error"}`); process.exitCode = 1; }).finally(() => prisma.$disconnect());
