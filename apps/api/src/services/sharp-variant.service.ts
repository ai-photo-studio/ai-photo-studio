import { createHash } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";

export type SharpVariantSpec = "original" | "2hd" | "4hd" | `print:${string}`;

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

const SERVER_VARIANTS: Record<"2hd" | "4hd", { width: number }> = {
  "2hd": { width: 2048 },
  "4hd": { width: 4096 }
};

const PRINT_VARIANTS: Record<string, { width: number; height: number }> = {
  "4x6": { width: 1200, height: 1800 }, "5x7": { width: 1500, height: 2100 }, "6x8": { width: 1800, height: 2400 },
  "8x10": { width: 2400, height: 3000 }, "8x12": { width: 2400, height: 3600 }, "10x12": { width: 3000, height: 3600 },
  "12x18": { width: 3600, height: 5400 }, "16x24": { width: 4800, height: 7200 }, "20x30": { width: 6000, height: 9000 },
  "24x36": { width: 7200, height: 10800 }, "30x40": { width: 9000, height: 12000 }, "40x60": { width: 12000, height: 18000 }
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

    const printSize = variantSpecId.startsWith("print:") ? variantSpecId.slice("print:".length) : null;
    const printTarget = printSize ? PRINT_VARIANTS[printSize] : null;
    const target = printTarget || SERVER_VARIANTS[variantSpecId as "2hd" | "4hd"];
    let rendered;
    try {
      rendered = printTarget
        ? await sharp(sourceBytes, { sequentialRead: true }).rotate().resize({ width: printTarget.width, height: printTarget.height, fit: "cover", position: "centre" }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true })
        : await sharp(sourceBytes, { sequentialRead: true }).rotate().resize({ width: target.width, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
    } catch {
      throw new Error("variant output could not be decoded");
    }
    return this.persistValidatedVariant(master, variantSpecId, master.sha256, rendered.data, "image/jpeg", rendered.info.width ?? null, rendered.info.height ?? null);
  }

  async getOrCreatePrintVariant(restorationMasterId: string, printSize: string): Promise<SharpVariantResult> {
    if (!PRINT_VARIANTS[printSize]) throw new Error("print dimensions are not documented for this product");
    return this.getOrCreateVariant(restorationMasterId, `print:${printSize}`);
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
  return value === "original" || value === "2hd" || value === "4hd" || value.startsWith("print:");
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
