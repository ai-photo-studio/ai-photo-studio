import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { assertOwnership, type RequestActor } from "../utils/ownership";

export const PRINT_PARTNER_ASSIGNMENT_REQUIRED = "PRINT_PARTNER_ASSIGNMENT_REQUIRED" as const;
// R9.5-P5O: Pakistan Print+Digital orders are fulfilled by ThanNow's own
// in-house printing facility -- they were never blocked on a real external
// partner and must never report PRINT_PARTNER_ASSIGNMENT_REQUIRED, which
// is untrue for this market. No schema change: `FulfilmentOrder.status`
// already defaults to the existing `PENDING` enum value, which is exactly
// "created, not yet printed" -- true regardless of fulfilment model. Only
// the customer-facing blocker/label differs by market. The partner-blocker
// path is retained unchanged for any future non-Pakistan print market.
export const IN_HOUSE_PRINT_PENDING = "IN_HOUSE_PRINT_PENDING" as const;

function blockerForMarket(market: string): typeof PRINT_PARTNER_ASSIGNMENT_REQUIRED | typeof IN_HOUSE_PRINT_PENDING {
  return market === "PAKISTAN" ? IN_HOUSE_PRINT_PENDING : PRINT_PARTNER_ASSIGNMENT_REQUIRED;
}

const ORDER_INCLUDE_FOR_PRINT = {
  paymentAttempt: true,
  deliveryAddress: true,
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      restorationEntitlement: { include: { restorationMaster: true } },
      printEntitlements: { include: { fulfilmentOrder: true } },
      printOrderLines: { orderBy: { createdAt: "asc" as const } }
    }
  }
};

type OrderWithItems = NonNullable<Awaited<ReturnType<typeof loadOrderForPrint>>>;
type ItemWithEntitlement = OrderWithItems["items"][number];

function loadOrderForPrint(orderNo: string) {
  return prisma.fixedOrder.findUnique({ where: { orderNo }, include: ORDER_INCLUDE_FOR_PRINT });
}

function printSnapshotFor(item: ItemWithEntitlement): { size: string } | null {
  const snapshot = item.metadata && typeof item.metadata === "object" && "print" in item.metadata ? item.metadata.print : null;
  return snapshot as { size: string } | null;
}

async function prepareOneItem(order: OrderWithItems, item: ItemWithEntitlement, blocker: ReturnType<typeof blockerForMarket>) {
  const lineInputs = item.printOrderLines.length > 0 ? item.printOrderLines.map((line) => ({ id: line.id, size: line.printProduct })) : (() => { const snapshot = printSnapshotFor(item); return snapshot ? [{ id: null, size: snapshot.size }] : []; })();
  if (lineInputs.length === 0) throw new AppError("valid print snapshot is required", 422, "PRINT_SNAPSHOT_REQUIRED");
  // R9.5-P5P: reuses THIS item's own restoration master, never the order's
  // -- each item is restored independently, so print must never borrow
  // another item's master.
  if (item.restorationEntitlement?.restorationMaster?.status !== "VALIDATED") {
    throw new AppError("validated restoration is required", 409, "RESTORATION_NOT_READY");
  }
  const existing = lineInputs.map((line) => item.printEntitlements.find((candidate) => candidate.printOrderLineId === line.id || (!line.id && candidate.printSku === line.size))).filter((candidate) => candidate?.fulfilmentOrder);
  if (existing.length === lineInputs.length) {
    return { printEntitlementId: existing[0]!.id, fulfilmentOrderId: existing[0]!.fulfilmentOrder!.id, status: existing[0]!.fulfilmentOrder!.status, blocker, fixedOrderItemId: item.id, printEntitlementIds: existing.map((candidate) => candidate!.id) };
  }
  const masterId = item.restorationEntitlement.restorationMaster.id;
  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${item.id}))`;
    const current = await tx.fixedOrderItem.findUnique({ where: { id: item.id }, include: { printEntitlements: { include: { fulfilmentOrder: true } } } });
    const createdLines = [];
    for (const line of lineInputs) {
      const winner = current?.printEntitlements.find((candidate) => candidate.printOrderLineId === line.id && candidate.fulfilmentOrder);
      if (winner?.fulfilmentOrder) { createdLines.push({ entitlement: winner, fulfilment: winner.fulfilmentOrder }); continue; }
      const entitlement = await tx.printEntitlement.create({ data: { fixedOrderItemId: item.id, restorationMasterId: masterId, printSku: String(line.size), printOrderLineId: line.id, status: "PREPAID" } });
      const fulfilment = await tx.fulfilmentOrder.create({ data: { printEntitlementId: entitlement.id, status: "PENDING" } });
      createdLines.push({ entitlement, fulfilment });
    }
    return createdLines;
  });
  const first = created[0];
  return { printEntitlementId: first.entitlement.id, fulfilmentOrderId: first.fulfilment.id, status: first.fulfilment.status, blocker, fixedOrderItemId: item.id, printEntitlementIds: created.map((line) => line.entitlement.id) };
}

export class PrintFulfilmentBoundaryService {
  /**
   * Existing single-item HTTP contract (`POST /fixed-orders/:orderNo/print-
   * fulfilment`), preserved exactly: prepares the order's one print item and
   * returns a single object, not an array. R9.5-P5P only changed what this
   * reads internally (the item's OWN entitlement/master, not the order's
   * singular one) -- the response shape a frontend already depends on is
   * unchanged, since no multi-image UI ships in this packet.
   */
  async prepare(orderNo: string, actor: RequestActor) {
    const order = await loadOrderForPrint(orderNo);
    const owned = assertOwnership(order, actor);
    if (owned.paymentAttempt?.status !== "PAID") throw new AppError("verified payment is required", 409, "PAYMENT_REQUIRED");
    if (!owned.deliveryAddress) throw new AppError("delivery address is required", 422, "PRINT_ADDRESS_REQUIRED");
    const printItem = owned.items.find((candidate) => printSnapshotFor(candidate) !== null);
    if (owned.type !== "RESTORATION_WITH_PRINT" || !printItem) {
      throw new AppError("print fulfilment is unavailable for this order", 422, "INVALID_PRINT_ORDER");
    }
    const blocker = blockerForMarket(owned.market);
    const { fixedOrderItemId: _fixedOrderItemId, ...rest } = await prepareOneItem(owned, printItem, blocker);
    return rest;
  }

  /**
   * R9.5-P5P orchestration surface for a future multi-item order: prepares
   * every print-eligible item on the order (each reusing that item's own
   * validated master) and returns one result per item. Digital-only items
   * are skipped entirely -- no print entitlement is ever created for them.
   * Not yet wired to any route; exercised directly by pg-race tests to
   * prove the mixed-order invariant ahead of the next packet's UI.
   */
  async prepareAllPrintItems(orderNo: string, actor: RequestActor) {
    const order = await loadOrderForPrint(orderNo);
    const owned = assertOwnership(order, actor);
    if (owned.paymentAttempt?.status !== "PAID") throw new AppError("verified payment is required", 409, "PAYMENT_REQUIRED");
    if (!owned.deliveryAddress) throw new AppError("delivery address is required", 422, "PRINT_ADDRESS_REQUIRED");
    const printItems = owned.items.filter((candidate) => printSnapshotFor(candidate) !== null);
    if (printItems.length === 0) throw new AppError("print fulfilment is unavailable for this order", 422, "INVALID_PRINT_ORDER");
    const blocker = blockerForMarket(owned.market);
    const results = [];
    for (const item of printItems) {
      results.push(await prepareOneItem(owned, item, blocker));
    }
    return results;
  }
}
