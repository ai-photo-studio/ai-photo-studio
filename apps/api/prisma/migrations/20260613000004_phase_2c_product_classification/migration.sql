-- Phase 2C product classification layer
ALTER TABLE "ImageQualityScore"
    ADD COLUMN IF NOT EXISTS "category" TEXT,
    ADD COLUMN IF NOT EXISTS "classificationConfidence" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "pipelineUsed" TEXT,
    ADD COLUMN IF NOT EXISTS "processingProfile" TEXT;

CREATE INDEX IF NOT EXISTS "ImageQualityScore_category_createdAt_idx" ON "ImageQualityScore"("category", "createdAt");
