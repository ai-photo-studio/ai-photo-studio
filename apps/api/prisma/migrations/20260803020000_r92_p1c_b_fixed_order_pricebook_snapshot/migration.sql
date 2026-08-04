-- R9.2-P1C-B: additive immutable PriceBook snapshot fields on FixedOrder.
--
-- FixedOrder already had `priceBookVersion` (P0A). This adds the two
-- remaining fields required to make the order-time pricing snapshot
-- complete: the owner approval reference and the PriceBook's effective
-- timestamp at the moment the order was created. Both are NULL for existing
-- (and any future) local_fixture orders, which genuinely have no owner
-- approval reference or PriceBook effective date -- NULL is the truthful
-- value, not a placeholder to be backfilled later. No existing row is
-- altered by this migration beyond the new columns defaulting to NULL.

-- AlterTable
ALTER TABLE "FixedOrder" ADD COLUMN "priceBookApprovalReference" TEXT;
ALTER TABLE "FixedOrder" ADD COLUMN "priceBookEffectiveAt" TIMESTAMP(3);
