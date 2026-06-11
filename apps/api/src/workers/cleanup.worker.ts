import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { StorageService } from "../services/storage.service";
import { logger } from "../utils/logger";

const ORIGINAL_RETENTION_HOURS = 72;
const PROCESSED_RETENTION_DAYS = 30;

const deleteIfPresent = async (storage: StorageService, key?: string | null) => {
  if (!key) return false;
  await storage.deleteFile(key);
  return true;
};

export const runCleanupOnce = async (config: AppConfig) => {
  const storage = new StorageService(config);
  const now = new Date();

  const expiredOriginalImages = await prisma.orderImage.findMany({
    where: {
      kind: "ORIGINAL",
      expiresAt: { lte: now }
    },
    include: { order: true },
    take: 200
  });

  const expiredProcessedImages = await prisma.orderImage.findMany({
    where: {
      kind: "FINAL",
      expiresAt: { lte: now }
    },
    include: { order: true },
    take: 200
  });

  const expiredOrders = await prisma.order.findMany({
    where: {
      OR: [
        { originalExpiresAt: { lte: now } },
        { processedExpiresAt: { lte: now } }
      ]
    },
    take: 200
  });

  const uniqueKeys = new Set<string>();
  let deleted = 0;

  for (const image of [...expiredOriginalImages, ...expiredProcessedImages]) {
    if (uniqueKeys.has(image.storageKey)) continue;
    uniqueKeys.add(image.storageKey);
    await deleteIfPresent(storage, image.storageKey);
    deleted += 1;
  }

  for (const order of expiredOrders) {
    const keysToDelete = [order.originalStorageKey, order.processedStorageKey].filter(Boolean) as string[];
    for (const key of keysToDelete) {
      if (uniqueKeys.has(key)) continue;
      uniqueKeys.add(key);
      await deleteIfPresent(storage, key);
      deleted += 1;
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        originalStorageKey: order.originalExpiresAt && order.originalExpiresAt <= now ? null : order.originalStorageKey,
        originalUrl: order.originalExpiresAt && order.originalExpiresAt <= now ? null : order.originalUrl,
        originalExpiresAt: order.originalExpiresAt && order.originalExpiresAt <= now ? null : order.originalExpiresAt,
        processedStorageKey: order.processedExpiresAt && order.processedExpiresAt <= now ? null : order.processedStorageKey,
        processedUrl: order.processedExpiresAt && order.processedExpiresAt <= now ? null : order.processedUrl,
        processedExpiresAt: order.processedExpiresAt && order.processedExpiresAt <= now ? null : order.processedExpiresAt
      }
    });
  }

  logger.info("Phase D retention cleanup completed", {
    dbExpiredOriginals: expiredOriginalImages.length,
    dbExpiredProcessed: expiredProcessedImages.length,
    orderRowsExpired: expiredOrders.length,
    deleted,
    originalRetentionHours: ORIGINAL_RETENTION_HOURS,
    processedRetentionDays: PROCESSED_RETENTION_DAYS
  });
};
