-- R9.2-P1A: FixedOrder.sourceDraftId becomes a unique index (it was a plain,
-- non-unique index in the finalized P0A migration). This is the
-- idempotency/duplicate-order enforcement mechanism for
-- POST /api/fixed-orders/restoration-digital: a RestorationDraft may source
-- at most one FixedOrder, ever. NULL values (non-draft-sourced FixedOrders,
-- e.g. future add-on order types) are unaffected -- Postgres treats multiple
-- NULLs in a unique index as distinct from one another, so this is purely
-- additive and does not restrict any existing or future non-draft order.
--
-- Safe to apply to any environment: no real database has ever held
-- FixedOrder rows (P0A was verified only against disposable test
-- databases), so there is no possibility of a pre-existing duplicate
-- sourceDraftId value that this constraint would reject.

-- DropIndex
DROP INDEX "FixedOrder_sourceDraftId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "FixedOrder_sourceDraftId_key" ON "FixedOrder"("sourceDraftId");
