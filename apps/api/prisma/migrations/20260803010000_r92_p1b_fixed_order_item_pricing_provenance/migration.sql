-- R9.2-P1B: pricing provenance columns on FixedOrderItem (additive).
--
-- PRICING PROVENANCE AUDIT (recorded here, not invented): before this
-- migration, FixedOrder/FixedOrderItem persisted no pricing-source or
-- approved/live flag at all -- `FixedOrder.priceBookVersion` exists in the
-- P0A schema but has zero read/write call sites anywhere in this repository
-- (dead column). Explicit, typed columns are added here instead of reusing
-- generic JSON `metadata`, per this packet's rule against using JSON for
-- pricing authority.
--
-- Every FixedOrderItem ever created (all P1A orders, all PAKISTAN/PKR,
-- priced from FixtureOfferProvider) is local_fixture / not approved. Both new
-- columns get a NOT NULL DEFAULT so this migration is purely additive and
-- backfills existing rows with the truthful, payment-ineligible state --
-- no existing order becomes newly payment-eligible by this migration, and no
-- existing order's readable fields change.

-- AlterTable
ALTER TABLE "FixedOrderItem" ADD COLUMN "pricingSource" TEXT NOT NULL DEFAULT 'local_fixture';
ALTER TABLE "FixedOrderItem" ADD COLUMN "pricingApproved" BOOLEAN NOT NULL DEFAULT false;
