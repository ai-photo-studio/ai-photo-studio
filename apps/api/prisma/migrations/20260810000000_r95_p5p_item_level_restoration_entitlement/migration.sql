-- R9.5-P5P: item-level multi-image orchestration foundation.
--
-- FixedOrderItem gains its own sourceDraftId (the image that item
-- restores). Backfilled from the parent FixedOrder's sourceDraftId for
-- every pre-existing item, since every order-creation path up to this
-- migration still creates exactly one item per order (so the item's image
-- is, by construction, the same as the order's).
ALTER TABLE "FixedOrderItem" ADD COLUMN "sourceDraftId" TEXT;

UPDATE "FixedOrderItem" AS item
SET "sourceDraftId" = fo."sourceDraftId"
FROM "FixedOrder" AS fo
WHERE fo."id" = item."fixedOrderId"
  AND item."sourceDraftId" IS NULL;

CREATE INDEX "FixedOrderItem_sourceDraftId_idx" ON "FixedOrderItem"("sourceDraftId");
ALTER TABLE "FixedOrderItem" ADD CONSTRAINT "FixedOrderItem_sourceDraftId_fkey" FOREIGN KEY ("sourceDraftId") REFERENCES "RestorationDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RestorationEntitlement moves from order-scoped identity
-- (`fixedOrderId` unique) to item-scoped identity (`fixedOrderItemId`
-- unique), so a single order can own multiple entitlements -- one per
-- item -- once a multi-item order-creation path exists. `fixedOrderId` is
-- retained as a plain, non-unique, denormalized column for existing
-- order-scoped queries; it is never the source of truth for uniqueness.
ALTER TABLE "RestorationEntitlement" ADD COLUMN "fixedOrderItemId" TEXT;

-- Fail-closed backfill: every existing entitlement must map to EXACTLY ONE
-- FixedOrderItem belonging to the same order. Any order with an
-- entitlement but zero or more than one item aborts the whole migration --
-- this repository's own order-creation code has never created more than
-- one item per order, so this is expected to affect zero rows; a failure
-- here is a genuine, previously-unknown data anomaly requiring manual
-- resolution, not something this migration may silently guess at.
DO $$
DECLARE
  ambiguous_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO ambiguous_count
  FROM "RestorationEntitlement" re
  WHERE (SELECT COUNT(*) FROM "FixedOrderItem" fi WHERE fi."fixedOrderId" = re."fixedOrderId") <> 1;

  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION 'R9.5-P5P migration abort: % RestorationEntitlement row(s) do not map to exactly one FixedOrderItem; manual resolution required before this migration can proceed', ambiguous_count;
  END IF;
END $$;

UPDATE "RestorationEntitlement" AS re
SET "fixedOrderItemId" = fi."id"
FROM "FixedOrderItem" AS fi
WHERE fi."fixedOrderId" = re."fixedOrderId";

-- The DO block above already proved every row can be mapped; make it
-- mandatory now that the backfill is complete.
ALTER TABLE "RestorationEntitlement" ALTER COLUMN "fixedOrderItemId" SET NOT NULL;

DROP INDEX "RestorationEntitlement_fixedOrderId_key";
CREATE INDEX "RestorationEntitlement_fixedOrderId_idx" ON "RestorationEntitlement"("fixedOrderId");
CREATE UNIQUE INDEX "RestorationEntitlement_fixedOrderItemId_key" ON "RestorationEntitlement"("fixedOrderItemId");
ALTER TABLE "RestorationEntitlement" ADD CONSTRAINT "RestorationEntitlement_fixedOrderItemId_fkey" FOREIGN KEY ("fixedOrderItemId") REFERENCES "FixedOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
