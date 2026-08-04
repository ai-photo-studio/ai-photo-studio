import { createHash } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";

export type SharpVariantSpec = "original" | "2hd" | "4hd";

export type SharpVariantValidation = {
  body: Buffer;
  contentType: string;
  width: number;
  height: number;
  sha256: string;
  byteLength: number;
};

export type SharpVariantResult = {
  id: string;
  restorationMasterId: string;
  variantSpecId: SharpVariantSpec;
  sourceMasterSha256: string;
  storageKey: string;
  width: number;
  height: number;
  contentType: string;
  status?: string;
};

export type SharpVariantStore = {
  findValidatedMaster(restorationMasterId: string): Promise<{
    id: string;
    storageKey: string | null;
    sha256: string | null;
    width: number | null;
    height: number | null;
    contentType: string | null;
    status: string;
  } | null>;
  findVariant(restorationMasterId: string, variantSpecId: SharpVariantSpec, sourceMasterSha256: string): Promise<SharpVariantResult | null>;
  createVariant(input: {
    restorationMasterId: string;
    variantSpecId: SharpVariantSpec;
    sourceMasterSha256: string;
    storageKey: string;
    width: number;
    height: number;
    contentType: string;
    byteLength: number;
  }): Promise<SharpVariantResult>;
};

export type SharpVariantStorage = {
  download(storageKey: string): Promise<Buffer>;
  upload(storageKey: string, body: Buffer, contentType: string): Promise<void>;
  delete(storageKey: string): Promise<void>;
};

const SERVER_VARIANTS: Record<Exclude<SharpVariantSpec, "original">, { width: number }> = {
  "2hd": { width: 2048 },
  "4hd": { width: 4096 }
};

export class SharpVariantService {
  constructor(private readonly store: SharpVariantStore, private readonly storage: SharpVariantStorage) {}

  async getOrCreateVariant(restorationMasterId: string, variantSpecId: SharpVariantSpec): Promise<SharpVariantResult> {
    const master = await this.store.findValidatedMaster(restorationMasterId);
    if (!master || master.status !== "VALIDATED" || !master.storageKey || !master.sha256 || !master.width || !master.height || !master.contentType) {
      throw new Error("validated restoration master is required");
    }

    const existing = await this.store.findVariant(restorationMasterId, variantSpecId, master.sha256);
    if (existing && existing.storageKey) return existing;

    const sourceBytes = await this.storage.download(master.storageKey);
    if (variantSpecId === "original") {
      return this.persistValidatedVariant(master, variantSpecId, master.sha256, sourceBytes, master.contentType, master.width, master.height);
    }

    const target = SERVER_VARIANTS[variantSpecId];
    let rendered;
    try {
      rendered = await sharp(sourceBytes, { sequentialRead: true }).rotate().resize({ width: target.width, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
    } catch {
      throw new Error("variant output could not be decoded");
    }
    return this.persistValidatedVariant(master, variantSpecId, master.sha256, rendered.data, "image/jpeg", rendered.info.width ?? null, rendered.info.height ?? null);
  }

  private async persistValidatedVariant(
    master: NonNullable<Awaited<ReturnType<SharpVariantStore["findValidatedMaster"]>>>,
    variantSpecId: SharpVariantSpec,
    sourceMasterSha256: string,
    body: Buffer,
    contentType: string,
    width: number | null,
    height: number | null
  ): Promise<SharpVariantResult> {
    if (!body || body.length === 0) throw new Error("variant output is empty");
    let metadata;
    try {
      metadata = await sharp(body).metadata();
    } catch {
      throw new Error("variant output could not be decoded");
    }
    const validatedWidth = metadata.width ?? width;
    const validatedHeight = metadata.height ?? height;
    if (!validatedWidth || !validatedHeight) throw new Error("variant output has no usable dimensions");
    const sha256 = createHash("sha256").update(body).digest("hex");
    const storageKey = `finals/restoration-master-${master.id}-${variantSpecId}-${sourceMasterSha256}-${sha256}.jpg`;
    await this.storage.upload(storageKey, body, contentType);
    return this.store.createVariant({
      restorationMasterId: master.id,
      variantSpecId,
      sourceMasterSha256,
      storageKey,
      width: validatedWidth,
      height: validatedHeight,
      contentType,
      byteLength: body.length,
    });
  }
}

export function isSharpVariantSpec(value: string): value is SharpVariantSpec {
  return value === "original" || value === "2hd" || value === "4hd";
}

export const sharpVariantSpecIds = ["original", "2hd", "4hd"] as const;

export class PrismaSharpVariantStore implements SharpVariantStore {
  constructor(private readonly prisma: PrismaClient) {}

  findValidatedMaster(restorationMasterId: string) {
    return this.prisma.restorationMaster.findUnique({ where: { id: restorationMasterId } });
  }

  findVariant(restorationMasterId: string, variantSpecId: SharpVariantSpec, sourceMasterSha256: string) {
    return this.prisma.imageVariant.findUnique({
      where: {
        restorationMasterId_variantSpecId_sourceMasterSha256: {
          restorationMasterId,
          variantSpecId,
          sourceMasterSha256
        }
      }
    }).then((row) => row ? {
      id: row.id,
      restorationMasterId: row.restorationMasterId,
      variantSpecId: row.variantSpecId as SharpVariantSpec,
      sourceMasterSha256: row.sourceMasterSha256,
      storageKey: row.storageKey,
      width: row.width ?? 0,
      height: row.height ?? 0,
      contentType: row.contentType ?? "application/octet-stream",
      status: row.status
    } : null);
  }

  createVariant(input: {
    restorationMasterId: string;
    variantSpecId: SharpVariantSpec;
    sourceMasterSha256: string;
    storageKey: string;
    width: number;
    height: number;
    contentType: string;
    byteLength: number;
  }) {
    const { byteLength: _byteLength, ...persisted } = input;
    void _byteLength;
    return this.prisma.imageVariant.create({ data: { ...persisted, status: "AVAILABLE" } }).then((row) => ({
      id: row.id,
      restorationMasterId: row.restorationMasterId,
      variantSpecId: row.variantSpecId as SharpVariantSpec,
      sourceMasterSha256: row.sourceMasterSha256,
      storageKey: row.storageKey ?? "",
      width: row.width ?? 0,
      height: row.height ?? 0,
      contentType: row.contentType ?? "application/octet-stream",
      status: row.status
    }));
  }
}
