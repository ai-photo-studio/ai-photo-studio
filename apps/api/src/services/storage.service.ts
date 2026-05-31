import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env";
import { logger } from "../utils/logger";

export type UploadFileInput = {
  keyPrefix: "originals" | "previews" | "finals";
  fileName: string;
  contentType?: string;
  body: Buffer | string;
};

export type UploadFileResult = {
  key: string;
  url: string;
  expiresAt: Date;
};

export interface StorageProvider {
  uploadFile(params: UploadFileInput): Promise<UploadFileResult>;
  getSignedUrl(key: string): Promise<string>;
  deleteFile(key: string): Promise<void>;
  deleteExpiredFiles(): Promise<{ deleted: number }>;
  getPublicUrl(key: string): string;
}

const retentionByPrefix: Record<UploadFileInput["keyPrefix"], number> = {
  originals: 24,
  finals: 72,
  previews: 24 * 7
};

class MockStorageProvider implements StorageProvider {
  constructor(private readonly config: AppConfig) {}

  async uploadFile(params: UploadFileInput): Promise<UploadFileResult> {
    const key = `${params.keyPrefix}/${Date.now()}-${randomUUID()}-${params.fileName}`;
    const url = this.getPublicUrl(key);
    const expiresAt = new Date(Date.now() + retentionByPrefix[params.keyPrefix] * 3600_000);
    logger.info("Mock storage upload", { keyPrefix: params.keyPrefix, key });
    return { key, url, expiresAt };
  }

  async getSignedUrl(key: string): Promise<string> {
    return `${this.getPublicUrl(key)}?signed=mock`;
  }

  async deleteFile(key: string): Promise<void> {
    logger.info("Mock storage delete", { key });
  }

  async deleteExpiredFiles(): Promise<{ deleted: number }> {
    logger.info("Mock storage cleanup executed");
    return { deleted: 0 };
  }

  getPublicUrl(key: string): string {
    return `${this.config.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
}

class R2StorageProvider extends MockStorageProvider {
  async uploadFile(params: UploadFileInput): Promise<UploadFileResult> {
    // Placeholder: real S3-compatible R2 SDK integration will be added in next iteration.
    logger.info("R2 storage skeleton upload", { keyPrefix: params.keyPrefix });
    return super.uploadFile(params);
  }
}

export class StorageService implements StorageProvider {
  private readonly provider: StorageProvider;

  constructor(config: AppConfig) {
    this.provider = config.storageDryRun ? new MockStorageProvider(config) : new R2StorageProvider(config);
  }

  uploadFile(params: UploadFileInput): Promise<UploadFileResult> {
    return this.provider.uploadFile(params);
  }

  getSignedUrl(key: string): Promise<string> {
    return this.provider.getSignedUrl(key);
  }

  deleteFile(key: string): Promise<void> {
    return this.provider.deleteFile(key);
  }

  deleteExpiredFiles(): Promise<{ deleted: number }> {
    return this.provider.deleteExpiredFiles();
  }

  getPublicUrl(key: string): string {
    return this.provider.getPublicUrl(key);
  }
}
