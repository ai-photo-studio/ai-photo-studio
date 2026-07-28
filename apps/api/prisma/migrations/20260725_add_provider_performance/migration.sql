-- Migration: Add ProviderPerformance table
-- This table stores benchmark results for AI provider performance comparison.
-- Safe to run — creates a new table, no existing data impact.

CREATE TABLE IF NOT EXISTS "ProviderPerformance" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "imageCategory" TEXT NOT NULL,
    "benchmarkVersion" TEXT NOT NULL,
    "avgScore" DOUBLE PRECISION NOT NULL,
    "avgLatencyMs" INTEGER NOT NULL,
    "avgCost" DECIMAL(10,4) NOT NULL,
    "successRate" DOUBLE PRECISION NOT NULL,
    "lastBenchmarkAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderPerformance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderPerformance_provider_imageCategory_benchmarkVersion_key"
    ON "ProviderPerformance" ("provider", "imageCategory", "benchmarkVersion");

CREATE INDEX IF NOT EXISTS "ProviderPerformance_provider_benchmarkVersion_idx"
    ON "ProviderPerformance" ("provider", "benchmarkVersion");

CREATE INDEX IF NOT EXISTS "ProviderPerformance_imageCategory_benchmarkVersion_idx"
    ON "ProviderPerformance" ("imageCategory", "benchmarkVersion");

CREATE INDEX IF NOT EXISTS "ProviderPerformance_avgScore_idx"
    ON "ProviderPerformance" ("avgScore");
