-- Migration: Add queue reliability and GPU guardrails columns to ProcessingJob
-- All columns are nullable — no breaking changes.

ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "lastHeartbeat" TIMESTAMP(3);
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "processingStartedAt" TIMESTAMP(3);
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "processingWorkerId" TEXT;
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "gpuSecondsSpent" INTEGER DEFAULT 0;
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "estimatedGpuCost" DECIMAL(10,4);
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "cloudRunCost" DECIMAL(10,4);
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "runpodCost" DECIMAL(10,4);
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "refundProcessed" BOOLEAN DEFAULT false;
ALTER TABLE "ProcessingJob" ADD COLUMN IF NOT EXISTS "refundNote" TEXT;

CREATE INDEX IF NOT EXISTS "ProcessingJob_status_lastHeartbeat_idx" ON "ProcessingJob"("status", "lastHeartbeat");
CREATE INDEX IF NOT EXISTS "ProcessingJob_status_processingStartedAt_idx" ON "ProcessingJob"("status", "processingStartedAt");
