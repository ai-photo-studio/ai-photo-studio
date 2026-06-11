-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'RETRYING';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "whatsappSenderNumber" TEXT;
ALTER TABLE "Order" ADD COLUMN "whatsappMessageId" TEXT;
ALTER TABLE "Order" ADD COLUMN "whatsappMediaId" TEXT;
ALTER TABLE "Order" ADD COLUMN "originalStorageKey" TEXT;
ALTER TABLE "Order" ADD COLUMN "originalUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN "originalExpiresAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "processedStorageKey" TEXT;
ALTER TABLE "Order" ADD COLUMN "processedUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN "processedExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "metadata" JSONB,
    "sourceMessageId" TEXT,
    "sourceMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "queueName" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "queueJobId" TEXT,
    "errorMessage" TEXT,
    "deadLetterReason" TEXT,
    "payload" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_whatsappMessageId_key" ON "Order"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "Order_whatsappSenderNumber_createdAt_idx" ON "Order"("whatsappSenderNumber", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_createdAt_idx" ON "OrderItem"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_sourceMessageId_idx" ON "OrderItem"("sourceMessageId");

-- CreateIndex
CREATE INDEX "ProcessingJob_orderId_status_idx" ON "ProcessingJob"("orderId", "status");

-- CreateIndex
CREATE INDEX "ProcessingJob_queueName_status_idx" ON "ProcessingJob"("queueName", "status");

-- CreateIndex
CREATE INDEX "ProcessingJob_orderItemId_status_idx" ON "ProcessingJob"("orderItemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingJob_queueJobId_key" ON "ProcessingJob"("queueJobId");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_orderId_createdAt_idx" ON "OrderStatusHistory"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_toStatus_createdAt_idx" ON "OrderStatusHistory"("toStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
