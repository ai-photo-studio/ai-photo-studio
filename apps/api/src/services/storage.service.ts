import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
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

export type DownloadFileResult = {
  body: Buffer;
  contentType?: string;
};

export interface StorageProvider {
  uploadFile(params: UploadFileInput): Promise<UploadFileResult>;
  getSignedUrl(key: string): Promise<string>;
  deleteFile(key: string): Promise<void>;
  deleteExpiredFiles(): Promise<{ deleted: number }>;
  getPublicUrl(key: string): string;
  downloadFile(key: string): Promise<DownloadFileResult>;
  uploadOriginal(params: { fileName: string; body: Buffer | string; contentType?: string }): Promise<UploadFileResult>;
  uploadProcessed(params: { fileName: string; body: Buffer | string; contentType?: string }): Promise<UploadFileResult>;
  generateDownloadUrl(key: string): Promise<string>;
}

const retentionByPrefix: Record<UploadFileInput["keyPrefix"], number> = {
  originals: 72,
  finals: 24 * 30,
  previews: 24 * 7
};

const buildStorageKey = (params: UploadFileInput) => {
  const safeFileName = basename(params.fileName).replace(/[^a-zA-Z0-9._-]+/g, "_") || "file";
  return `${params.keyPrefix}/${Date.now()}-${randomUUID()}-${safeFileName}`;
};

const buildRetentionDate = (keyPrefix: UploadFileInput["keyPrefix"]) =>
  new Date(Date.now() + retentionByPrefix[keyPrefix] * 3600_000);

const buildPublicUrl = (baseUrl: string, key: string) => `${baseUrl.replace(/\/$/, "")}/${key}`;

const buildR2Client = (config: AppConfig) =>
  new S3Client({
    region: "auto",
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY
    },
    forcePathStyle: true
  });

const toStorageError = (action: string, error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`R2 storage ${action} failed`, { action, errorMessage: message });
  return new AppError(`R2 storage ${action} failed`, 502, "STORAGE_R2_ERROR");
};

const bodyToBuffer = async (body: unknown): Promise<Buffer> => {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof (body as any).arrayBuffer === "function") {
    const arrayBuffer = await (body as any).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
  if (typeof (body as any)[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<unknown>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
    }
    return Buffer.concat(chunks);
  }
  return Buffer.from(String(body));
};

class MockStorageProvider implements StorageProvider {
  constructor(private readonly config: AppConfig) {}

  async uploadFile(params: UploadFileInput): Promise<UploadFileResult> {
    const key = buildStorageKey(params);
    const url = this.getPublicUrl(key);
    const expiresAt = buildRetentionDate(params.keyPrefix);
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

  async downloadFile(_key: string): Promise<DownloadFileResult> {
    throw new AppError("Mock storage download is not supported", 501, "STORAGE_DOWNLOAD_UNSUPPORTED");
  }

  uploadOriginal(params: { fileName: string; body: Buffer | string; contentType?: string }): Promise<UploadFileResult> {
    return this.uploadFile({
      keyPrefix: "originals",
      fileName: params.fileName,
      body: params.body,
      contentType: params.contentType
    });
  }

  uploadProcessed(params: { fileName: string; body: Buffer | string; contentType?: string }): Promise<UploadFileResult> {
    return this.uploadFile({
      keyPrefix: "finals",
      fileName: params.fileName,
      body: params.body,
      contentType: params.contentType
    });
  }

  generateDownloadUrl(key: string): Promise<string> {
    return this.getSignedUrl(key);
  }

  getPublicUrl(key: string): string {
    const baseUrl = this.config.R2_PUBLIC_BASE_URL || `http://localhost:${this.config.PORT}`;
    return `${baseUrl.replace(/\/$/, "")}/${key}`;
  }
}

class R2StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(private readonly config: AppConfig) {
    this.client = buildR2Client(config);
  }

  async uploadFile(params: UploadFileInput): Promise<UploadFileResult> {
    const key = buildStorageKey(params);

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.R2_BUCKET_NAME,
          Key: key,
          Body: params.body,
          ContentType: params.contentType
        })
      );
      const url = this.getPublicUrl(key);
      const expiresAt = buildRetentionDate(params.keyPrefix);
      logger.info("R2 storage upload", { keyPrefix: params.keyPrefix, key });
      return { key, url, expiresAt };
    } catch (error) {
      throw toStorageError("upload", error);
    }
  }

  async getSignedUrl(key: string): Promise<string> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.config.R2_BUCKET_NAME,
          Key: key
        }),
        { expiresIn: 15 * 60 }
      );
    } catch (error) {
      throw toStorageError("signed-url", error);
    }
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.R2_BUCKET_NAME,
          Key: key
        })
      );
      logger.info("R2 storage delete", { key });
    } catch (error) {
      throw toStorageError("delete", error);
    }
  }

  async deleteExpiredFiles(): Promise<{ deleted: number }> {
    logger.info("R2 storage cleanup noop", { bucket: this.config.R2_BUCKET_NAME });
    return { deleted: 0 };
  }

  async downloadFile(key: string): Promise<DownloadFileResult> {
    try {
      const output = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.R2_BUCKET_NAME,
          Key: key
        })
      );
      return {
        body: await bodyToBuffer(output.Body),
        contentType: output.ContentType ?? undefined
      };
    } catch (error) {
      throw toStorageError("download", error);
    }
  }

  uploadOriginal(params: { fileName: string; body: Buffer | string; contentType?: string }): Promise<UploadFileResult> {
    return this.uploadFile({
      keyPrefix: "originals",
      fileName: params.fileName,
      body: params.body,
      contentType: params.contentType
    });
  }

  uploadProcessed(params: { fileName: string; body: Buffer | string; contentType?: string }): Promise<UploadFileResult> {
    return this.uploadFile({
      keyPrefix: "finals",
      fileName: params.fileName,
      body: params.body,
      contentType: params.contentType
    });
  }

  generateDownloadUrl(key: string): Promise<string> {
    return this.getSignedUrl(key);
  }

  getPublicUrl(key: string): string {
    return buildPublicUrl(this.config.R2_PUBLIC_BASE_URL, key);
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

  downloadFile(key: string): Promise<DownloadFileResult> {
    return this.provider.downloadFile(key);
  }

  uploadOriginal(params: { fileName: string; body: Buffer | string; contentType?: string }): Promise<UploadFileResult> {
    return this.provider.uploadOriginal(params);
  }

  uploadProcessed(params: { fileName: string; body: Buffer | string; contentType?: string }): Promise<UploadFileResult> {
    return this.provider.uploadProcessed(params);
  }

  generateDownloadUrl(key: string): Promise<string> {
    return this.provider.generateDownloadUrl(key);
  }
}
