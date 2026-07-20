-- Migration: Add quality metrics, damage detection, and print readiness columns
-- Sprint 1: All new columns are nullable — no breaking changes.

-- RestorationOrder table
ALTER TABLE "RestorationOrder" ADD COLUMN IF NOT EXISTS "totalDurationMs" INTEGER;
ALTER TABLE "RestorationOrder" ADD COLUMN IF NOT EXISTS "qualityImprovement" INTEGER;
ALTER TABLE "RestorationOrder" ADD COLUMN IF NOT EXISTS "estimatedCost" DECIMAL(10,4);

-- RestorationItem table — quality metrics
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "damageMaskStorageKey" TEXT;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "beforeBlurScore" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "beforeNoiseScore" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "beforeSharpnessScore" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "beforeBrightnessScore" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "beforeContrastScore" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "beforeColorCastScore" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "faceCount" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "faceConfidence" REAL;

-- RestorationItem table — resolution / color
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "imageResolutionWidth" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "imageResolutionHeight" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "colorMode" TEXT;

-- RestorationItem table — verification metrics
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "artifactScore" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "printQuality" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "ssimScore" REAL;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "psnrScore" REAL;

-- RestorationItem table — revision tracking
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "revisionCount" INTEGER DEFAULT 0;
