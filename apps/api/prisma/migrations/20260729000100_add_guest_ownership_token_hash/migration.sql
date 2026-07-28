ALTER TABLE "Order" ADD COLUMN "guestOwnershipTokenHash" TEXT;

ALTER TABLE "RestorationOrder" ADD COLUMN "guestOwnershipTokenHash" TEXT;

CREATE INDEX "Order_guestOwnershipTokenHash_idx" ON "Order"("guestOwnershipTokenHash");

CREATE INDEX "RestorationOrder_guestOwnershipTokenHash_idx" ON "RestorationOrder"("guestOwnershipTokenHash");
