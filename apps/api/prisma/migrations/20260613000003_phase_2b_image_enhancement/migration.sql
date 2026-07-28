-- Phase 2B image enhancement diagnostics
ALTER TABLE "ImageQualityScore"
    ADD COLUMN IF NOT EXISTS "processingStage" TEXT,
    ADD COLUMN IF NOT EXISTS "beforeBlurScore" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "beforeBrightnessScore" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "beforeContrastScore" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "beforeVisibilityScore" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "beforeCropQualityScore" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "beforeOverallScore" INTEGER,
    ADD COLUMN IF NOT EXISTS "enhancementScore" INTEGER,
    ADD COLUMN IF NOT EXISTS "enhancementDelta" INTEGER;

CREATE INDEX IF NOT EXISTS "ImageQualityScore_processingStage_createdAt_idx" ON "ImageQualityScore"("processingStage", "createdAt");
