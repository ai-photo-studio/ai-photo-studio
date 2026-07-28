-- Migration: Add comprehensive image quality analysis columns
-- All columns are nullable — no breaking changes.

ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "beforeEntropy" DOUBLE PRECISION;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "afterEntropy" DOUBLE PRECISION;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "beforeEdgeDensity" DOUBLE PRECISION;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "afterEdgeDensity" DOUBLE PRECISION;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "beforeTextureEnergy" DOUBLE PRECISION;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "afterTextureEnergy" DOUBLE PRECISION;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "beforeLaplacianVar" DOUBLE PRECISION;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "afterLaplacianVar" DOUBLE PRECISION;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "beforeHistogramSpread" DOUBLE PRECISION;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "afterHistogramSpread" DOUBLE PRECISION;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "beforeLocalContrast" DOUBLE PRECISION;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "afterLocalContrast" DOUBLE PRECISION;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "qualityRegressionStage" TEXT;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "qualityRegressionDetail" TEXT;
