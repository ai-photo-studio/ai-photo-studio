CREATE TABLE "PrintOrderLine" (
    "id" TEXT NOT NULL,
    "fixedOrderId" TEXT NOT NULL,
    "fixedOrderItemId" TEXT NOT NULL,
    "printProduct" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "currency" "FixedOrderCurrency" NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "subtotalMinor" BIGINT NOT NULL,
    "requiredTier" TEXT,
    "qualitySurchargeMinor" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrintOrderLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PrintEntitlement" ADD COLUMN "printOrderLineId" TEXT;

CREATE INDEX "PrintOrderLine_fixedOrderId_createdAt_idx" ON "PrintOrderLine"("fixedOrderId", "createdAt");
CREATE INDEX "PrintOrderLine_fixedOrderItemId_createdAt_idx" ON "PrintOrderLine"("fixedOrderItemId", "createdAt");
CREATE UNIQUE INDEX "PrintEntitlement_printOrderLineId_key" ON "PrintEntitlement"("printOrderLineId");

ALTER TABLE "PrintOrderLine" ADD CONSTRAINT "PrintOrderLine_fixedOrderId_fkey" FOREIGN KEY ("fixedOrderId") REFERENCES "FixedOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrintOrderLine" ADD CONSTRAINT "PrintOrderLine_fixedOrderItemId_fkey" FOREIGN KEY ("fixedOrderItemId") REFERENCES "FixedOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrintEntitlement" ADD CONSTRAINT "PrintEntitlement_printOrderLineId_fkey" FOREIGN KEY ("printOrderLineId") REFERENCES "PrintOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
