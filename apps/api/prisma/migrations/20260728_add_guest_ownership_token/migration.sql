-- Add guest ownership hashes for guest-access restoration and order records
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "guestOwnershipTokenHash" TEXT;
ALTER TABLE "RestorationOrder" ADD COLUMN IF NOT EXISTS "guestOwnershipTokenHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_guestOwnershipTokenHash_key"
  ON "Order"("guestOwnershipTokenHash");

CREATE UNIQUE INDEX IF NOT EXISTS "RestorationOrder_guestOwnershipTokenHash_key"
  ON "RestorationOrder"("guestOwnershipTokenHash");
