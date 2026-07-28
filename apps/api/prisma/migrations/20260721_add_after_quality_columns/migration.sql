-- Migration: Add after-quality analysis columns to RestorationItem
-- All columns are nullable — no breaking changes.

ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "afterBlurScore" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "afterNoiseScore" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "afterSharpnessScore" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "afterBrightnessScore" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "afterContrastScore" INTEGER;
ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "afterColorCastScore" INTEGER;
