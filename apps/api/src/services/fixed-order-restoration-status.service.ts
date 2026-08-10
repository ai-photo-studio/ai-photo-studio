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
}
