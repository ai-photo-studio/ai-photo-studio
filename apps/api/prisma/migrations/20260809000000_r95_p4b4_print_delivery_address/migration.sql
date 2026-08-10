CREATE TABLE "PrintDeliveryAddress" (
    "id" TEXT NOT NULL,
    "fixedOrderId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrintDeliveryAddress_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PrintDeliveryAddress_fixedOrderId_key" ON "PrintDeliveryAddress"("fixedOrderId");
ALTER TABLE "PrintDeliveryAddress" ADD CONSTRAINT "PrintDeliveryAddress_fixedOrderId_fkey" FOREIGN KEY ("fixedOrderId") REFERENCES "FixedOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
