import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { StorageService } from "../services/storage.service";
import { logger } from "../utils/logger";

export const runCleanupOnce = async (config: AppConfig) => {
  const storage = new StorageService(config);
  const now = new Date();

  const expired = await prisma.orderImage.findMany({
    where: {
      expiresAt: { lte: now }
    },
    take: 200
  });

  let deleted = 0;
  for (const file of expired) {
    if (!file.storageKey) continue;
    await storage.deleteFile(file.storageKey);
    deleted += 1;
  }

  const providerCleanup = await storage.deleteExpiredFiles();
  logger.info("Cleanup worker completed", { dbDeleted: deleted, providerDeleted: providerCleanup.deleted });
};
