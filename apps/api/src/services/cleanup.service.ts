import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { StorageService } from "./storage.service";
import { logger } from "../utils/logger";

export interface CleanupConfig {
  tempRetentionHours: number;
  benchmarkRetentionHours: number;
  previewRetentionDays: number;
  finalRetentionDays: number;
  originalRetentionHours: number;
  maxFilesPerRun: number;
}

export interface CleanupResult {
  deletedTempUploads: number;
  deletedBenchmarkFiles: number;
  deletedPreviews: number;
  deletedFinals: number;
  deletedOriginals: number;
  totalDeleted: number;
  errors: string[];
}

export const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
  tempRetentionHours: 1,
  benchmarkRetentionHours: 24,
  previewRetentionDays: 7,
  finalRetentionDays: 30,
  originalRetentionHours: 72,
  maxFilesPerRun: 200,
};

export class CleanupService {
  private readonly config: AppConfig;
  private readonly cleanupConfig: CleanupConfig;

  constructor(config: AppConfig, cleanupConfig?: Partial<CleanupConfig>) {
    this.config = config;
    this.cleanupConfig = { ...DEFAULT_CLEANUP_CONFIG, ...cleanupConfig };
  }

  async runCleanup(): Promise<CleanupResult> {
    const storage = new StorageService(this.config);
    const result: CleanupResult = {
      deletedTempUploads: 0,
      deletedBenchmarkFiles: 0,
      deletedPreviews: 0,
      deletedFinals: 0,
      deletedOriginals: 0,
      totalDeleted: 0,
      errors: [],
    };

    try {
      result.deletedTempUploads = await this.cleanupTempUploads(storage);
      result.deletedBenchmarkFiles = await this.cleanupBenchmarkFiles(storage);
      result.deletedPreviews = await this.cleanupPreviews(storage);
      result.deletedFinals = await this.cleanupExpiredFinals(storage);
      result.deletedOriginals = await this.cleanupExpiredOriginals(storage);

      result.totalDeleted =
        result.deletedTempUploads +
        result.deletedBenchmarkFiles +
        result.deletedPreviews +
        result.deletedFinals +
        result.deletedOriginals;

      logger.info("Cleanup completed", {
        deletedTempUploads: result.deletedTempUploads,
        deletedBenchmarkFiles: result.deletedBenchmarkFiles,
        deletedPreviews: result.deletedPreviews,
        deletedFinals: result.deletedFinals,
        deletedOriginals: result.deletedOriginals,
        totalDeleted: result.totalDeleted,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(msg);
      logger.error("Cleanup failed", { error: msg });
    }

    return result;
  }

  private async cleanupTempUploads(storage: StorageService): Promise<number> {
    const cutoff = new Date(Date.now() - this.cleanupConfig.tempRetentionHours * 3600_000);
    let deleted = 0;

    try {
      const expired = await prisma.restorationItem.findMany({
        where: {
          status: "PENDING",
          createdAt: { lte: cutoff },
        },
        select: { id: true, originalStorageKey: true },
        take: this.cleanupConfig.maxFilesPerRun,
      });

      for (const item of expired) {
        if (item.originalStorageKey?.startsWith("temp/")) {
          await storage.deleteFile(item.originalStorageKey).catch(() => undefined);
          deleted++;
        }
      }
    } catch (err) {
      logger.warn("Temp upload cleanup failed", { error: err instanceof Error ? err.message : String(err) });
    }

    return deleted;
  }

  private async cleanupBenchmarkFiles(storage: StorageService): Promise<number> {
    const cutoff = new Date(Date.now() - this.cleanupConfig.benchmarkRetentionHours * 3600_000);
    let deleted = 0;

    try {
      const expired = await prisma.providerCostLog.findMany({
        where: {
          createdAt: { lte: cutoff },
        },
        select: { id: true, metadata: true },
        take: this.cleanupConfig.maxFilesPerRun,
      });

      for (const log of expired) {
        const metadata = log.metadata as Record<string, unknown> | null;
        if (metadata?.artifactKey) {
          await storage.deleteFile(metadata.artifactKey as string).catch(() => undefined);
          deleted++;
        }
      }
    } catch (err) {
      logger.warn("Benchmark file cleanup failed", { error: err instanceof Error ? err.message : String(err) });
    }

    return deleted;
  }

  private async cleanupPreviews(storage: StorageService): Promise<number> {
    const cutoff = new Date(Date.now() - this.cleanupConfig.previewRetentionDays * 24 * 3600_000);
    let deleted = 0;

    try {
      const expired = await prisma.restorationItem.findMany({
        where: {
          previewStorageKey: { not: null },
          createdAt: { lte: cutoff },
        },
        select: { id: true, previewStorageKey: true },
        take: this.cleanupConfig.maxFilesPerRun,
      });

      for (const item of expired) {
        if (item.previewStorageKey) {
          await storage.deleteFile(item.previewStorageKey).catch(() => undefined);
          deleted++;
        }
      }
    } catch (err) {
      logger.warn("Preview cleanup failed", { error: err instanceof Error ? err.message : String(err) });
    }

    return deleted;
  }

  private async cleanupExpiredFinals(storage: StorageService): Promise<number> {
    const cutoff = new Date(Date.now() - this.cleanupConfig.finalRetentionDays * 24 * 3600_000);
    let deleted = 0;

    try {
      const expired = await prisma.restorationItem.findMany({
        where: {
          finalStorageKey: { not: null },
          status: "COMPLETED",
          createdAt: { lte: cutoff },
        },
        select: { id: true, finalStorageKey: true },
        take: this.cleanupConfig.maxFilesPerRun,
      });

      for (const item of expired) {
        if (item.finalStorageKey) {
          await storage.deleteFile(item.finalStorageKey).catch(() => undefined);
          deleted++;
        }
      }
    } catch (err) {
      logger.warn("Final image cleanup failed", { error: err instanceof Error ? err.message : String(err) });
    }

    return deleted;
  }

  private async cleanupExpiredOriginals(storage: StorageService): Promise<number> {
    const cutoff = new Date(Date.now() - this.cleanupConfig.originalRetentionHours * 3600_000);
    let deleted = 0;

    try {
      const expired = await prisma.restorationItem.findMany({
        where: {
          originalStorageKey: { not: null },
          createdAt: { lte: cutoff },
        },
        select: { id: true, originalStorageKey: true },
        take: this.cleanupConfig.maxFilesPerRun,
      });

      for (const item of expired) {
        if (item.originalStorageKey && !item.originalStorageKey.startsWith("temp/")) {
          await storage.deleteFile(item.originalStorageKey).catch(() => undefined);
          deleted++;
        }
      }
    } catch (err) {
      logger.warn("Original image cleanup failed", { error: err instanceof Error ? err.message : String(err) });
    }

    return deleted;
  }

  getCleanupConfig(): CleanupConfig {
    return { ...this.cleanupConfig };
  }

  updateCleanupConfig(config: Partial<CleanupConfig>): void {
    Object.assign(this.cleanupConfig, config);
  }
}
