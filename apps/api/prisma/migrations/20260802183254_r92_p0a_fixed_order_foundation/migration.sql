-- R9.2-P0A: Fixed-order data foundation and one-call guards.
--
-- Purely additive: 17 new enums, 15 new tables, their indexes/foreign keys,
-- and 6 hand-authored CHECK constraints (see bottom of file). No existing
-- table, column, enum, index, or constraint is altered or dropped. Legacy
-- `Order`, `Payment`, `Package`, `RestorationOrder`, and `RestorationItem`
-- reads are unaffected; new tables reference them only via plain scalar id
-- columns (`FixedOrder.legacyOrderId`, `FixedOrder.legacyRestorationOrderId`),
-- not Prisma relations, so no legacy model definition changed.
--
-- Forward: `npx prisma migrate deploy` (or `migrate dev` in a dev database).
-- Generated via `prisma migrate diff --from-schema-datamodel <prior
-- schema.prisma> --to-schema-datamodel <this schema.prisma> --script`
-- (datamodel-to-datamodel; no live database connection was available in the
-- authoring environment -- see AI_code_audit_report_RI.md for the validation
-- commands actually run: prisma format/validate/generate only).
--
-- Rollback / feature-disable: no code path in this packet reads or writes
-- these tables yet (payment, provider dispatch, Sharp variants, print
-- fulfilment are explicitly out of scope), so the safe rollback is simply
-- not shipping/enabling any later packet that uses them -- the tables sit
-- inert. If a destructive rollback is ever required, drop in reverse
-- dependency order (Shipment, FulfilmentOrder, AddOnOrderLink,
-- PrintEntitlement, DigitalEntitlement, ImageVariant, ReplicateExecution,
-- RestorationMaster, RestorationEntitlement, PaymentEvent, PaymentAttempt,
-- FixedOrderItem, FixedOrder, RestorationDraft) then the 17 enums; this is
-- intentionally NOT scripted here because destructive migrations must never
-- run against a database that may already hold real rows from a later
-- packet without an explicit, separately authorized decision.

-- CreateEnum
CREATE TYPE "Market" AS ENUM ('PAKISTAN', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "FixedOrderCurrency" AS ENUM ('PKR', 'USD');

-- CreateEnum
CREATE TYPE "FixedOrderType" AS ENUM ('RESTORATION_DIGITAL', 'RESTORATION_WITH_PRINT', 'DIGITAL_UPGRADE', 'PRINT_ADD_ON');

-- CreateEnum
CREATE TYPE "FixedOrderStatus" AS ENUM ('CREATED', 'PAYMENT_PENDING', 'PAYMENT_VERIFIED', 'LOCKED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RestorationDraftStatus" AS ENUM ('UPLOADED', 'PREVIEW_READY', 'ORDER_SELECTION', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'REDIRECT_READY', 'CUSTOMER_RETURNED', 'CANCELLED_BY_CUSTOMER', 'EXPIRED', 'CALLBACK_PENDING', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED', 'CHARGEBACK');

-- CreateEnum
CREATE TYPE "RestorationEntitlementStatus" AS ENUM ('GRANTED', 'CONSUMED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RestorationMasterStatus" AS ENUM ('NOT_STARTED', 'PROCESSING', 'VALIDATED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReplicateExecutionStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "DigitalTier" AS ENUM ('ORIGINAL', 'HD_2X', 'HD_4X');

-- CreateEnum
CREATE TYPE "ImageVariantStatus" AS ENUM ('PENDING', 'AVAILABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "DigitalEntitlementStatus" AS ENUM ('LOCKED', 'GENERATING', 'AVAILABLE', 'DOWNLOADED');

-- CreateEnum
CREATE TYPE "PrintEntitlementStatus" AS ENUM ('PREPAID', 'WAITING_FOR_MASTER', 'PRINT_FILE_READY', 'FULFILMENT_READY', 'IN_PRODUCTION', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED');

-- CreateEnum
CREATE TYPE "FulfilmentOrderStatus" AS ENUM ('PENDING', 'IN_PRODUCTION', 'DISPATCHED', 'DELIVERED', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'EXCEPTION');

-- CreateTable
CREATE TABLE "RestorationDraft" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "ownerCustomerId" TEXT,
    "guestOwnershipTokenHash" TEXT,
    "market" "Market",
    "country" TEXT,
    "currency" "FixedOrderCurrency",
    "originalStorageKey" TEXT NOT NULL,
    "originalMimeType" TEXT,
    "originalWidth" INTEGER,
    "originalHeight" INTEGER,
    "originalFileSizeBytes" INTEGER,
    "originalSha256" TEXT,
    "previewStorageKey" TEXT,
    "status" "RestorationDraftStatus" NOT NULL DEFAULT 'UPLOADED',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestorationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedOrder" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "type" "FixedOrderType" NOT NULL,
    "market" "Market" NOT NULL,
    "currency" "FixedOrderCurrency" NOT NULL,
    "ownerUserId" TEXT,
    "ownerCustomerId" TEXT,
    "guestOwnershipTokenHash" TEXT,
    "sourceDraftId" TEXT,
    "legacyRestorationOrderId" TEXT,
    "legacyOrderId" TEXT,
    "priceBookVersion" TEXT,
    "totalAmountMinor" BIGINT NOT NULL,
    "status" "FixedOrderStatus" NOT NULL DEFAULT 'CREATED',
    "immutableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedOrderItem" (
    "id" TEXT NOT NULL,
    "fixedOrderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tierOrSku" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmountMinor" BIGINT NOT NULL,
    "totalAmountMinor" BIGINT NOT NULL,
    "currency" "FixedOrderCurrency" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "fixedOrderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'bank_alfalah',
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
    "amountMinor" BIGINT NOT NULL,
    "currency" "FixedOrderCurrency" NOT NULL,
    "providerRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "paymentAttemptId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "dedupeHash" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "matchResult" TEXT,
    "rawPayloadRedacted" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestorationEntitlement" (
    "id" TEXT NOT NULL,
    "fixedOrderId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "status" "RestorationEntitlementStatus" NOT NULL DEFAULT 'GRANTED',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestorationEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestorationMaster" (
    "id" TEXT NOT NULL,
    "restorationEntitlementId" TEXT NOT NULL,
    "storageKey" TEXT,
    "sha256" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "contentType" TEXT,
    "status" "RestorationMasterStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestorationMaster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplicateExecution" (
    "id" TEXT NOT NULL,
    "restorationMasterId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "ReplicateExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "providerRequestRef" TEXT,
    "outputSha256" TEXT,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplicateExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageVariant" (
    "id" TEXT NOT NULL,
    "restorationMasterId" TEXT NOT NULL,
    "variantSpecId" TEXT NOT NULL,
    "sourceMasterSha256" TEXT NOT NULL,
    "storageKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "contentType" TEXT,
    "status" "ImageVariantStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalEntitlement" (
    "id" TEXT NOT NULL,
    "fixedOrderItemId" TEXT NOT NULL,
    "restorationMasterId" TEXT NOT NULL,
    "tier" "DigitalTier" NOT NULL,
    "imageVariantId" TEXT,
    "status" "DigitalEntitlementStatus" NOT NULL DEFAULT 'LOCKED',
    "downloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintEntitlement" (
    "id" TEXT NOT NULL,
    "fixedOrderItemId" TEXT NOT NULL,
    "restorationMasterId" TEXT NOT NULL,
    "printSku" TEXT NOT NULL,
    "imageVariantId" TEXT,
    "status" "PrintEntitlementStatus" NOT NULL DEFAULT 'PREPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddOnOrderLink" (
    "id" TEXT NOT NULL,
    "addOnFixedOrderId" TEXT NOT NULL,
    "originalFixedOrderId" TEXT NOT NULL,
    "restorationMasterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddOnOrderLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfilmentOrder" (
    "id" TEXT NOT NULL,
    "printEntitlementId" TEXT NOT NULL,
    "status" "FulfilmentOrderStatus" NOT NULL DEFAULT 'PENDING',
    "partnerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfilmentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "fulfilmentOrderId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "correlationType" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "fixedOrderId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "beforeState" JSONB,
    "afterState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestorationDraft_ownerUserId_createdAt_idx" ON "RestorationDraft"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "RestorationDraft_ownerCustomerId_createdAt_idx" ON "RestorationDraft"("ownerCustomerId", "createdAt");

-- CreateIndex
CREATE INDEX "RestorationDraft_guestOwnershipTokenHash_idx" ON "RestorationDraft"("guestOwnershipTokenHash");

-- CreateIndex
CREATE INDEX "RestorationDraft_status_createdAt_idx" ON "RestorationDraft"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FixedOrder_orderNo_key" ON "FixedOrder"("orderNo");

-- CreateIndex
CREATE INDEX "FixedOrder_ownerUserId_createdAt_idx" ON "FixedOrder"("ownerUserId", "createdAt");

-- CreateIndex
CREATE INDEX "FixedOrder_ownerCustomerId_createdAt_idx" ON "FixedOrder"("ownerCustomerId", "createdAt");

-- CreateIndex
CREATE INDEX "FixedOrder_guestOwnershipTokenHash_idx" ON "FixedOrder"("guestOwnershipTokenHash");

-- CreateIndex
CREATE INDEX "FixedOrder_type_status_idx" ON "FixedOrder"("type", "status");

-- CreateIndex
CREATE INDEX "FixedOrder_sourceDraftId_idx" ON "FixedOrder"("sourceDraftId");

-- CreateIndex
CREATE INDEX "FixedOrderItem_fixedOrderId_createdAt_idx" ON "FixedOrderItem"("fixedOrderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_fixedOrderId_key" ON "PaymentAttempt"("fixedOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_idempotencyKey_key" ON "PaymentAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_createdAt_idx" ON "PaymentAttempt"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentAttempt_provider_providerRef_idx" ON "PaymentAttempt"("provider", "providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_dedupeHash_key" ON "PaymentEvent"("dedupeHash");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentAttemptId_receivedAt_idx" ON "PaymentEvent"("paymentAttemptId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_provider_providerEventId_key" ON "PaymentEvent"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "RestorationEntitlement_fixedOrderId_key" ON "RestorationEntitlement"("fixedOrderId");

-- CreateIndex
CREATE INDEX "RestorationEntitlement_draftId_idx" ON "RestorationEntitlement"("draftId");

-- CreateIndex
CREATE INDEX "RestorationEntitlement_status_createdAt_idx" ON "RestorationEntitlement"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestorationMaster_restorationEntitlementId_key" ON "RestorationMaster"("restorationEntitlementId");

-- CreateIndex
CREATE INDEX "RestorationMaster_status_createdAt_idx" ON "RestorationMaster"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RestorationMaster_sha256_idx" ON "RestorationMaster"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "ReplicateExecution_restorationMasterId_key" ON "ReplicateExecution"("restorationMasterId");

-- CreateIndex
CREATE UNIQUE INDEX "ReplicateExecution_idempotencyKey_key" ON "ReplicateExecution"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ReplicateExecution_status_createdAt_idx" ON "ReplicateExecution"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImageVariant_status_createdAt_idx" ON "ImageVariant"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImageVariant_restorationMasterId_variantSpecId_sourceMaster_key" ON "ImageVariant"("restorationMasterId", "variantSpecId", "sourceMasterSha256");

-- CreateIndex
CREATE INDEX "DigitalEntitlement_restorationMasterId_status_idx" ON "DigitalEntitlement"("restorationMasterId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalEntitlement_fixedOrderItemId_tier_key" ON "DigitalEntitlement"("fixedOrderItemId", "tier");

-- CreateIndex
CREATE INDEX "PrintEntitlement_restorationMasterId_status_idx" ON "PrintEntitlement"("restorationMasterId", "status");

-- CreateIndex
CREATE INDEX "PrintEntitlement_printSku_status_idx" ON "PrintEntitlement"("printSku", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AddOnOrderLink_addOnFixedOrderId_key" ON "AddOnOrderLink"("addOnFixedOrderId");

-- CreateIndex
CREATE INDEX "AddOnOrderLink_originalFixedOrderId_createdAt_idx" ON "AddOnOrderLink"("originalFixedOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "AddOnOrderLink_restorationMasterId_createdAt_idx" ON "AddOnOrderLink"("restorationMasterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FulfilmentOrder_printEntitlementId_key" ON "FulfilmentOrder"("printEntitlementId");

-- CreateIndex
CREATE INDEX "FulfilmentOrder_status_createdAt_idx" ON "FulfilmentOrder"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_fulfilmentOrderId_key" ON "Shipment"("fulfilmentOrderId");

-- CreateIndex
CREATE INDEX "Shipment_status_createdAt_idx" ON "Shipment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

-- CreateIndex
CREATE INDEX "AuditEvent_correlationType_correlationId_createdAt_idx" ON "AuditEvent"("correlationType", "correlationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_fixedOrderId_createdAt_idx" ON "AuditEvent"("fixedOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorType_createdAt_idx" ON "AuditEvent"("actorType", "createdAt");

-- AddForeignKey
ALTER TABLE "FixedOrder" ADD CONSTRAINT "FixedOrder_sourceDraftId_fkey" FOREIGN KEY ("sourceDraftId") REFERENCES "RestorationDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedOrderItem" ADD CONSTRAINT "FixedOrderItem_fixedOrderId_fkey" FOREIGN KEY ("fixedOrderId") REFERENCES "FixedOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_fixedOrderId_fkey" FOREIGN KEY ("fixedOrderId") REFERENCES "FixedOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationEntitlement" ADD CONSTRAINT "RestorationEntitlement_fixedOrderId_fkey" FOREIGN KEY ("fixedOrderId") REFERENCES "FixedOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationEntitlement" ADD CONSTRAINT "RestorationEntitlement_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "RestorationDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestorationMaster" ADD CONSTRAINT "RestorationMaster_restorationEntitlementId_fkey" FOREIGN KEY ("restorationEntitlementId") REFERENCES "RestorationEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplicateExecution" ADD CONSTRAINT "ReplicateExecution_restorationMasterId_fkey" FOREIGN KEY ("restorationMasterId") REFERENCES "RestorationMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageVariant" ADD CONSTRAINT "ImageVariant_restorationMasterId_fkey" FOREIGN KEY ("restorationMasterId") REFERENCES "RestorationMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalEntitlement" ADD CONSTRAINT "DigitalEntitlement_fixedOrderItemId_fkey" FOREIGN KEY ("fixedOrderItemId") REFERENCES "FixedOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalEntitlement" ADD CONSTRAINT "DigitalEntitlement_restorationMasterId_fkey" FOREIGN KEY ("restorationMasterId") REFERENCES "RestorationMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalEntitlement" ADD CONSTRAINT "DigitalEntitlement_imageVariantId_fkey" FOREIGN KEY ("imageVariantId") REFERENCES "ImageVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintEntitlement" ADD CONSTRAINT "PrintEntitlement_fixedOrderItemId_fkey" FOREIGN KEY ("fixedOrderItemId") REFERENCES "FixedOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintEntitlement" ADD CONSTRAINT "PrintEntitlement_restorationMasterId_fkey" FOREIGN KEY ("restorationMasterId") REFERENCES "RestorationMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintEntitlement" ADD CONSTRAINT "PrintEntitlement_imageVariantId_fkey" FOREIGN KEY ("imageVariantId") REFERENCES "ImageVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnOrderLink" ADD CONSTRAINT "AddOnOrderLink_addOnFixedOrderId_fkey" FOREIGN KEY ("addOnFixedOrderId") REFERENCES "FixedOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnOrderLink" ADD CONSTRAINT "AddOnOrderLink_originalFixedOrderId_fkey" FOREIGN KEY ("originalFixedOrderId") REFERENCES "FixedOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddOnOrderLink" ADD CONSTRAINT "AddOnOrderLink_restorationMasterId_fkey" FOREIGN KEY ("restorationMasterId") REFERENCES "RestorationMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfilmentOrder" ADD CONSTRAINT "FulfilmentOrder_printEntitlementId_fkey" FOREIGN KEY ("printEntitlementId") REFERENCES "PrintEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_fulfilmentOrderId_fkey" FOREIGN KEY ("fulfilmentOrderId") REFERENCES "FulfilmentOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_fixedOrderId_fkey" FOREIGN KEY ("fixedOrderId") REFERENCES "FixedOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-authored additions below this line (not emitted by `prisma migrate diff`,
-- because Prisma schema syntax has no native CHECK-constraint representation).
-- R9.2-P0A commercial-rule guards: integer minor-unit money must be
-- non-negative, quantities must be positive, and Pakistan/International
-- market+currency pairing is enforced at the database layer as well as in
-- the pure domain guards in src/domain/fixedOrder. These are pure ADD
-- CONSTRAINT statements against the new tables created above; they touch no
-- existing table.

-- CheckConstraint
ALTER TABLE "FixedOrder" ADD CONSTRAINT "FixedOrder_totalAmountMinor_nonnegative" CHECK ("totalAmountMinor" >= 0);

-- CheckConstraint
ALTER TABLE "FixedOrder" ADD CONSTRAINT "FixedOrder_market_currency_pair" CHECK (
  ("market" = 'PAKISTAN' AND "currency" = 'PKR') OR
  ("market" = 'INTERNATIONAL' AND "currency" = 'USD')
);

-- CheckConstraint
ALTER TABLE "FixedOrderItem" ADD CONSTRAINT "FixedOrderItem_unitAmountMinor_nonnegative" CHECK ("unitAmountMinor" >= 0);

-- CheckConstraint
ALTER TABLE "FixedOrderItem" ADD CONSTRAINT "FixedOrderItem_totalAmountMinor_nonnegative" CHECK ("totalAmountMinor" >= 0);

-- CheckConstraint
ALTER TABLE "FixedOrderItem" ADD CONSTRAINT "FixedOrderItem_quantity_positive" CHECK ("quantity" > 0);

-- CheckConstraint
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_amountMinor_nonnegative" CHECK ("amountMinor" >= 0);

-- CheckConstraint: RestorationDraft, when a market is recorded, must pair it
-- with the matching currency; both remain nullable pre-market-confirmation.
ALTER TABLE "RestorationDraft" ADD CONSTRAINT "RestorationDraft_market_currency_pair" CHECK (
  "market" IS NULL OR "currency" IS NULL OR
  ("market" = 'PAKISTAN' AND "currency" = 'PKR') OR
  ("market" = 'INTERNATIONAL' AND "currency" = 'USD')
);
