import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { assertOwnership, type RequestActor } from "../utils/ownership";

export const PRINT_PARTNER_ASSIGNMENT_REQUIRED = "PRINT_PARTNER_ASSIGNMENT_REQUIRED" as const;

export class PrintFulfilmentBoundaryService {
  async prepare(orderNo: string, actor: RequestActor) {
    const order = await prisma.fixedOrder.findUnique({ where: { orderNo }, include: { items: { take: 1, include: { printEntitlements: { include: { fulfilmentOrder: true } } } }, paymentAttempt: true, restorationEntitlement: { include: { restorationMaster: true } }, deliveryAddress: true } });
    const owned = assertOwnership(order, actor);
    if (owned.type !== "RESTORATION_WITH_PRINT") throw new AppError("print fulfilment is unavailable for this order", 422, "INVALID_PRINT_ORDER");
    if (owned.paymentAttempt?.status !== "PAID") throw new AppError("verified payment is required", 409, "PAYMENT_REQUIRED");
    if (owned.restorationEntitlement?.restorationMaster?.status !== "VALIDATED") throw new AppError("validated restoration is required", 409, "RESTORATION_NOT_READY");
    if (!owned.deliveryAddress) throw new AppError("delivery address is required", 422, "PRINT_ADDRESS_REQUIRED");
    const item = owned.items[0];
    const snapshot = item?.metadata && typeof item.metadata === "object" && "print" in item.metadata ? item.metadata.print : null;
    if (!snapshot || !item) throw new AppError("valid print snapshot is required", 422, "PRINT_SNAPSHOT_REQUIRED");
    const existing = item.printEntitlements[0];
    if (existing?.fulfilmentOrder) return { printEntitlementId: existing.id, fulfilmentOrderId: existing.fulfilmentOrder.id, status: existing.fulfilmentOrder.status, blocker: PRINT_PARTNER_ASSIGNMENT_REQUIRED };
    const created = await prisma.$transaction(async (tx) => {
      const entitlement = await tx.printEntitlement.create({ data: { fixedOrderItemId: item.id, restorationMasterId: owned.restorationEntitlement.restorationMaster.id, printSku: String((snapshot as { size: string }).size), status: "PREPAID" } });
      const fulfilment = await tx.fulfilmentOrder.create({ data: { printEntitlementId: entitlement.id, status: "PENDING" } });
      return { entitlement, fulfilment };
    });
    return { printEntitlementId: created.entitlement.id, fulfilmentOrderId: created.fulfilment.id, status: created.fulfilment.status, blocker: PRINT_PARTNER_ASSIGNMENT_REQUIRED };
  }
}
