-- Migration: Add packageTier column to RestorationItem
-- This column stores the download tier selected by the user (e.g., "ORIGINAL", "2HD", "4HD", etc.)
-- All columns are nullable — no breaking changes.

ALTER TABLE "RestorationItem" ADD COLUMN IF NOT EXISTS "packageTier" TEXT;
CREATE INDEX IF NOT EXISTS "RestorationItem_packageTier_idx" ON "RestorationItem" ("packageTier");
