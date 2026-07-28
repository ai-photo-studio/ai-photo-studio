import { StorageService } from "./storage.service";
import type { AppConfig } from "../config/env";
import { logger } from "../utils/logger";

export interface DamageMaskRequest {
  storageKey: string;
  mimeType: string;
}

export interface DamageMaskResult {
  maskStorageKey: string;
  scratchMaskKey: string;
  dustMaskKey: string;
  tearMaskKey: string;
  regions: Array<{ x: number; y: number; width: number; height: number; type: string }>;
  processingTimeMs: number;
}

export class DamageMaskService {
  private readonly storage: StorageService;

  constructor(private readonly config: AppConfig) {
    this.storage = new StorageService(config);
  }

  private pixelCount = 0;

  async generateMasks(request: DamageMaskRequest): Promise<DamageMaskResult> {
    const startTime = Date.now();
    const { body } = await this.storage.downloadFile(request.storageKey);

    const width = 256;
    const height = Math.round(body.length / 3 / width) || 256;
    const pixelCount = Math.min(width * height, body.length / 3);
    this.pixelCount = pixelCount;

    const maskData = Buffer.alloc(pixelCount);
    const scratchMask = Buffer.alloc(pixelCount);
    const dustMask = Buffer.alloc(pixelCount);
    const tearMask = Buffer.alloc(pixelCount);

    const regions: Array<{ x: number; y: number; width: number; height: number; type: string }> = [];

    const rows = Math.min(height, pixelCount / width);

    let scratchPixels = 0;
    let dustPixels = 0;
    let tearPixels = 0;

    const pixelStep = Math.max(1, Math.floor(body.length / 3 / pixelCount));

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < width; x++) {
        const bufIdx = 54 + ((y * width + x) * pixelStep * 3);
        const maskIdx = y * width + x;

        if (bufIdx + 2 >= body.length) continue;

        const r = body[bufIdx], g = body[bufIdx + 1], b = body[bufIdx + 2];
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

        const laplacian = this.laplacian3x3(body, bufIdx, width, pixelStep);
        const isEdge = laplacian > 80;
        const isDark = gray < 40;
        const isBright = gray > 220;

        const isScratch = isEdge && isBright;
        const isDust = isDark && !isEdge;
        const isTear = isEdge && isDark && laplacian > 150;

        if (isScratch) {
          scratchMask[maskIdx] = 255;
          scratchPixels++;
        }
        if (isDust) {
          dustMask[maskIdx] = 255;
          dustPixels++;
        }
        if (isTear) {
          tearMask[maskIdx] = 255;
          tearPixels++;
        }

        maskData[maskIdx] = isScratch ? 255 : isDust ? 180 : isTear ? 100 : 0;
      }
    }

    const minRegionPixels = Math.round(pixelCount * 0.001);
    let regionId = 0;
    const visited = new Uint8Array(pixelCount);
    for (let i = 0; i < pixelCount; i++) {
      if (maskData[i] > 0 && !visited[i]) {
        const region = this.floodFill(maskData, visited, i, width, rows);
        if (region.size >= minRegionPixels) {
          const type = scratchMask[i] > 0 ? "scratch" : dustMask[i] > 0 ? "dust" : "tear";
          regions.push({
            x: region.minX, y: region.minY,
            width: region.maxX - region.minX + 1,
            height: region.maxY - region.minY + 1,
            type
          });
          regionId++;
        }
      }
    }

    const combinedMask = this.combineMasks(scratchMask, dustMask, tearMask);
    const maskUpload = await this.storage.uploadFile({
      keyPrefix: "artifacts",
      fileName: `damage-mask-${Date.now()}.png`,
      body: this.encodeMaskAsPng(combinedMask, width, rows),
      contentType: "image/png"
    });
    const scratchUpload = await this.storage.uploadFile({
      keyPrefix: "artifacts",
      fileName: `scratch-mask-${Date.now()}.png`,
      body: this.encodeMaskAsPng(scratchMask, width, rows),
      contentType: "image/png"
    });
    const dustUpload = await this.storage.uploadFile({
      keyPrefix: "artifacts",
      fileName: `dust-mask-${Date.now()}.png`,
      body: this.encodeMaskAsPng(dustMask, width, rows),
      contentType: "image/png"
    });
    const tearUpload = await this.storage.uploadFile({
      keyPrefix: "artifacts",
      fileName: `tear-mask-${Date.now()}.png`,
      body: this.encodeMaskAsPng(tearMask, width, rows),
      contentType: "image/png"
    });

    return {
      maskStorageKey: maskUpload.key,
      scratchMaskKey: scratchUpload.key,
      dustMaskKey: dustUpload.key,
      tearMaskKey: tearUpload.key,
      regions,
      processingTimeMs: Date.now() - startTime
    };
  }

  private lapWidth = 0;

  private laplacian3x3(buf: Buffer, idx: number, w: number, step: number): number {
    if (idx - step * 3 - 3 < 54 || idx + step * 3 + 3 >= buf.length) return 0;
    const center = gray(buf[idx], buf[idx + 1], buf[idx + 2]);
    const top = gray(buf[idx - step * w], buf[idx - step * w + 1], buf[idx - step * w + 2]);
    const bottom = gray(buf[idx + step * w], buf[idx + step * w + 1], buf[idx + step * w + 2]);
    const left = gray(buf[idx - 3], buf[idx - 2], buf[idx - 1]);
    const right = gray(buf[idx + 3], buf[idx + 4], buf[idx + 5]);
    return Math.abs(-top - bottom - left - right + 4 * center);
  }

  private floodFill(
    mask: Buffer, visited: Uint8Array,
    startIdx: number, width: number, height: number
  ): { size: number; minX: number; minY: number; maxX: number; maxY: number } {
    const stack = [startIdx];
    let size = 0;
    let minX = startIdx % width, maxX = minX;
    let minY = Math.floor(startIdx / width), maxY = minY;

    while (stack.length > 0) {
      const idx = stack.pop()!;
      if (visited[idx] || mask[idx] === 0) continue;
      visited[idx] = 1;
      size++;
      const x = idx % width, y = Math.floor(idx / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (const n of neighbors) {
        if (n >= 0 && n < mask.length && !visited[n] && mask[n] > 0) {
          stack.push(n);
        }
      }
    }

    return { size, minX, minY, maxX, maxY };
  }

  private combineMasks(...masks: Buffer[]): Buffer {
    const combined = Buffer.alloc(masks[0].length);
    for (let i = 0; i < combined.length; i++) {
      let val = 0;
      for (const m of masks) {
        if (m[i] > val) val = m[i];
      }
      combined[i] = val;
    }
    return combined;
  }

  private encodeMaskAsPng(mask: Buffer, width: number, height: number): Buffer {
    const rowSize = Math.ceil(width * 3 / 4) * 4;
    const dataSize = rowSize * height;
    const fileSize = 54 + dataSize;

    const bmp = Buffer.alloc(fileSize);
    bmp.write("BM", 0);
    bmp.writeUInt32LE(fileSize, 2);
    bmp.writeUInt32LE(54, 10);
    bmp.writeUInt32LE(40, 14);
    bmp.writeInt32LE(width, 18);
    bmp.writeInt32LE(Math.abs(height), 22);
    bmp.writeUInt16LE(1, 26);
    bmp.writeUInt16LE(24, 28);
    bmp.writeUInt32LE(0, 34);
    bmp.writeUInt32LE(dataSize, 38);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const maskIdx = y * width + x;
        const v = maskIdx < mask.length ? mask[maskIdx] : 0;
        const bmpIdx = 54 + y * rowSize + x * 3;
        bmp[bmpIdx] = v;
        bmp[bmpIdx + 1] = v === 255 ? 0 : v;
        bmp[bmpIdx + 2] = v === 255 ? 0 : v === 180 ? 255 : v === 100 ? 0 : v;
      }
    }

    return bmp;
  }
}

function gray(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}
