ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "guestOwnershipTokenHash" TEXT;

ALTER TABLE "RestorationOrder" ADD COLUMN IF NOT EXISTS "guestOwnershipTokenHash" TEXT;

CREATE INDEX IF NOT EXISTS "Order_guestOwnershipTokenHash_idx" ON "Order"("guestOwnershipTokenHash");

CREATE INDEX IF NOT EXISTS "RestorationOrder_guestOwnershipTokenHash_idx" ON "RestorationOrder"("guestOwnershipTokenHash");
