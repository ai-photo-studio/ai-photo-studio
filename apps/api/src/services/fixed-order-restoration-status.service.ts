// R9.5-P4B7-FIXED-ORDER-RESTORATION-STATUS
//
// The FixedOrder/RestorationEntitlement/RestorationMaster/ReplicateExecution
// chain (R9.2-P0A onward) had no read-only HTTP surface at all: nothing let
// a customer (or this repo's own E2E harness) observe processing progress or
// obtain a download for a FixedOrder-sourced restoration. This is the
// smallest such surface -- read-only, ownership-gated exactly like every
// other FixedOrder route (`assertOwnership`), and it never mutates any row.
//
// A signed download URL is only ever returned once `RestorationMaster.status
// === "VALIDATED"` AND a `storageKey` is actually present -- i.e. only after
// the real P3A worker (mock or Replicate, whichever `RESTORATION_PROVIDER`
// selected) has validated output. This service never fabricates a
// "COMPLETED"/available state from a `ReplicateExecution.status` alone.
import { prisma } from "../db/prisma";
import type { AppConfig } from "../config/env";
import { StorageService } from "./storage.service";
import { AppError } from "../utils/errors";
import { assertOwnership, type RequestActor } from "../utils/ownership";

export interface FixedOrderRestorationStatusView {
  orderNo: string;
  entitlementStatus: string | null;
  masterStatus: string | null;
  executionStatus: string | null;
  failureReason: string | null;
  downloadAvailable: boolean;
  downloadUrl: string | null;
}

/** R9.5-P5Q: one entry per FixedOrderItem, for the multi-image cart flow. */
export interface FixedOrderItemRestorationStatusView {
  fixedOrderItemId: string;
  tier: string | null;
  isPrint: boolean;
  entitlementStatus: string | null;
  masterStatus: string | null;
  executionStatus: string | null;
  failureReason: string | null;
  downloadAvailable: boolean;
  downloadUrl: string | null;
  printStatus: "IN_HOUSE_PRINT_PENDING" | null;
}

export class FixedOrderRestorationStatusService {
  private readonly storage: StorageService;

  constructor(config: AppConfig) {
    this.storage = new StorageService(config);
  }

  async getRestorationStatus(orderNo: string, actor: RequestActor): Promise<FixedOrderRestorationStatusView> {
    const order = await prisma.fixedOrder.findUnique({
      where: { orderNo },
      include: {
        restorationEntitlements: {
          orderBy: { createdAt: "asc" },
          include: { restorationMaster: { include: { replicateExecution: true } } }
        }
      }
    });
    const owned = assertOwnership(order, actor);

    // R9.5-P5P: entitlement identity moved from order-scoped to item-scoped.
    // This view is still single-item shaped (unchanged HTTP contract; no
    // multi-image UI ships in this packet) -- it reports the order's first
    // (today, only) item's entitlement. A future multi-item status surface
    // will report one entry per item instead of collapsing to the first.
    const entitlement = owned.restorationEntitlements[0] ?? null;
    const master = entitlement?.restorationMaster ?? null;
    const execution = master?.replicateExecution ?? null;

    const downloadAvailable = master?.status === "VALIDATED" && !!master.storageKey;
    let downloadUrl: string | null = null;
    if (downloadAvailable && master?.storageKey) {
      downloadUrl = await this.storage.getSignedUrl(master.storageKey);
    }

    if (!entitlement) {
      throw new AppError("Restoration has not started for this order", 404, "RESTORATION_NOT_STARTED");
    }

    return {
      orderNo: owned.orderNo,
      entitlementStatus: entitlement.status,
      masterStatus: master?.status ?? null,
      executionStatus: execution?.status ?? null,
      failureReason: execution?.failureReason ?? null,
      downloadAvailable,
      downloadUrl
    };
  }

  /**
   * R9.5-P5Q: GET-only, one entry per FixedOrderItem. Read-only exactly like
   * `getRestorationStatus` -- never claims, never mutates, never starts
   * work; polling this endpoint any number of times has zero side effects.
   */
  async getMultiItemRestorationStatus(orderNo: string, actor: RequestActor): Promise<FixedOrderItemRestorationStatusView[]> {
    const order = await prisma.fixedOrder.findUnique({
      where: { orderNo },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            restorationEntitlement: { include: { restorationMaster: { include: { replicateExecution: true } } } },
            printEntitlements: { include: { fulfilmentOrder: true } }
          }
        }
      }
    });
    const owned = assertOwnership(order, actor);

    const views: FixedOrderItemRestorationStatusView[] = [];
    for (const item of owned.items) {
      const entitlement = item.restorationEntitlement;
      const master = entitlement?.restorationMaster ?? null;
      const execution = master?.replicateExecution ?? null;
      const downloadAvailable = master?.status === "VALIDATED" && !!master.storageKey;
      let downloadUrl: string | null = null;
      if (downloadAvailable && master?.storageKey) {
        downloadUrl = await this.storage.getSignedUrl(master.storageKey);
      }
      const isPrint = item.printEntitlements.length > 0 || (item.metadata && typeof item.metadata === "object" && "print" in item.metadata);
      views.push({
        fixedOrderItemId: item.id,
        tier: item.tierOrSku,
        isPrint: Boolean(isPrint),
        entitlementStatus: entitlement?.status ?? null,
        masterStatus: master?.status ?? null,
        executionStatus: execution?.status ?? null,
        failureReason: execution?.failureReason ?? null,
        downloadAvailable,
        downloadUrl,
        // Pakistan never reports PRINT_PARTNER_ASSIGNMENT_REQUIRED; this
        // view only ever emits the truthful in-house pending marker (or
        // null for a digital-only item / before the print entitlement
        // exists). It never fabricates printed/dispatched/delivered.
        printStatus: item.printEntitlements.length > 0 ? "IN_HOUSE_PRINT_PENDING" : null
      });
    }
    return views;
  }
}
