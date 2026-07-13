-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'OPERATIONS', 'FINANCE', 'SUPPORT', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "RestorationStatus" AS ENUM ('PENDING', 'QUEUED', 'ANALYZING', 'PROCESSING', 'REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DamageSeverity" AS ENUM ('LIGHT', 'MEDIUM', 'HEAVY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ImageCategory" AS ENUM ('FACE', 'DOCUMENT', 'LANDSCAPE', 'PORTRAIT', 'BLACK_WHITE', 'COLOR', 'WEDDING', 'GROUP_PHOTO', 'GENERAL');

-- CreateEnum
CREATE TYPE "ProviderCostType" AS ENUM ('BACKGROUND_REMOVAL', 'CLASSIFICATION', 'CROP_CENTER', 'ENHANCEMENT', 'RELIGHTING', 'SHADOW_GENERATION', 'FLAT_LAY', 'LIFESTYLE_SCENE', 'VIRTUAL_MODEL', 'VIDEO_GENERATION', 'RESTORATION_INPAINT', 'RESTORATION_FACE', 'RESTORATION_COLORIZE', 'RESTORATION_UPSCALE', 'RESTORATION_ANALYSIS');

-- CreateEnum
CREATE TYPE "CreativeType" AS ENUM ('FLAT_LAY', 'LIFESTYLE_SCENE', 'VIRTUAL_MODEL', 'PRODUCT_VIDEO');

-- CreateEnum
CREATE TYPE "CreativeSceneType" AS ENUM ('STUDIO', 'TABLETOP', 'LIFESTYLE', 'MODEL', 'VIDEO_LOOP');

-- CreateEnum
CREATE TYPE "CreativeGenerationStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- DropIndex
DROP INDEX "ImageQualityScore_category_createdAt_idx";

-- DropIndex
DROP INDEX "ImageQualityScore_processingStage_createdAt_idx";

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "AdminRole" NOT NULL DEFAULT 'READ_ONLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestorationOrder" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "userId" TEXT,
    "customerId" TEXT,
    "packageId" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "status" "RestorationStatus" NOT NULL DEFAULT 'PENDING',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "completedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestorationOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestorationItem" (
    "id" TEXT NOT NULL,
    "restorationOrderId" TEXT NOT NULL,
    "originalStorageKey" TEXT NOT NULL,
    "previewStorageKey" TEXT,
    "finalStorageKey" TEXT,
    "maskStorageKey" TEXT,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "fileSizeBytes" INTEGER,
    "status" "RestorationStatus" NOT NULL DEFAULT 'PENDING',
    "damageSeverity" "DamageSeverity" NOT NULL DEFAULT 'UNKNOWN',
    "imageCategory" "ImageCategory" NOT NULL DEFAULT 'GENERAL',
    "damageScore" DOUBLE PRECISION,
    "qualityScore" INTEGER,
    "beforeQualityScore" INTEGER,
    "afterQualityScore" INTEGER,
    "processingStage" TEXT,
    "providerUsed" TEXT,
    "totalDurationMs" INTEGER,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestorationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCostLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "costType" "ProviderCostType",
    "durationMs" INTEGER NOT NULL,
    "inputSizeBytes" INTEGER,
    "outputSizeBytes" INTEGER,
    "estimatedCost" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(10,4),
    "orderId" TEXT,
    "processingJobId" TEXT,
    "aiJobId" TEXT,
    "creativeStudioJobId" TEXT,
    "restorationItemId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCostLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeStudioJob" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "orderImageId" TEXT,
    "creativeType" "CreativeType" NOT NULL,
    "sceneType" "CreativeSceneType" NOT NULL,
    "generationStatus" "CreativeGenerationStatus" NOT NULL DEFAULT 'PENDING',
    "providerUsed" TEXT NOT NULL,
    "inputStorageKey" TEXT,
    "outputStorageKey" TEXT,
    "promptSummary" TEXT,
    "durationMs" INTEGER,
    "estimatedCost" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(10,4),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeStudioJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminUser_role_isActive_idx" ON "AdminUser"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_refreshTokenHash_key" ON "AdminSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_adminUserId_expiresAt_idx" ON "AdminSession"("adminUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "AdminSession_revokedAt_expiresAt_idx" ON "AdminSession"("revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminUserId_createdAt_idx" ON "AdminAuditLog"("adminUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestorationOrder_orderNo_key" ON "RestorationOrder"("orderNo");

-- CreateIndex
CREATE INDEX "RestorationOrder_userId_createdAt_idx" ON "RestorationOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RestorationOrder_status_createdAt_idx" ON "RestorationOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RestorationOrder_orderNo_idx" ON "RestorationOrder"("orderNo");

-- CreateIndex
CREATE INDEX "RestorationItem_restorationOrderId_status_idx" ON "RestorationItem"("restorationOrderId", "status");

-- CreateIndex
CREATE INDEX "RestorationItem_status_createdAt_idx" ON "RestorationItem"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderCostLog_provider_createdAt_idx" ON "ProviderCostLog"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderCostLog_orderId_createdAt_idx" ON "ProviderCostLog"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderCostLog_processingJobId_createdAt_idx" ON "ProviderCostLog"("processingJobId", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderCostLog_aiJobId_createdAt_idx" ON "ProviderCostLog"("aiJobId", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderCostLog_creativeStudioJobId_createdAt_idx" ON "ProviderCostLog"("creativeStudioJobId", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderCostLog_restorationItemId_createdAt_idx" ON "ProviderCostLog"("restorationItemId", "createdAt");

-- CreateIndex
CREATE INDEX "CreativeStudioJob_orderId_createdAt_idx" ON "CreativeStudioJob"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "CreativeStudioJob_orderImageId_createdAt_idx" ON "CreativeStudioJob"("orderImageId", "createdAt");

-- CreateIndex
CREATE INDEX "CreativeStudioJob_creativeType_generationStatus_idx" ON "CreativeStudioJob"("creativeType", "generationStatus");

-- CreateIndex
CREATE INDEX "CreativeStudioJob_providerUsed_createdAt_idx" ON "CreativeStudioJob"("providerUsed", "createdAt");

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationItem" ADD CONSTRAINT "RestorationItem_restorationOrderId_fkey" FOREIGN KEY ("restorationOrderId") REFERENCES "RestorationOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCostLog" ADD CONSTRAINT "ProviderCostLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCostLog" ADD CONSTRAINT "ProviderCostLog_processingJobId_fkey" FOREIGN KEY ("processingJobId") REFERENCES "ProcessingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCostLog" ADD CONSTRAINT "ProviderCostLog_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "AiJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCostLog" ADD CONSTRAINT "ProviderCostLog_creativeStudioJobId_fkey" FOREIGN KEY ("creativeStudioJobId") REFERENCES "CreativeStudioJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCostLog" ADD CONSTRAINT "ProviderCostLog_restorationItemId_fkey" FOREIGN KEY ("restorationItemId") REFERENCES "RestorationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeStudioJob" ADD CONSTRAINT "CreativeStudioJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeStudioJob" ADD CONSTRAINT "CreativeStudioJob_orderImageId_fkey" FOREIGN KEY ("orderImageId") REFERENCES "OrderImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
