import crypto from "node:crypto";
import sharp from "sharp";
import { StorageService } from "./storage.service";
import type { AppConfig } from "../config/env";

const MASK_VERSION = "damage-mask/2";
const MAX_PIXELS = 40_000_000;

export interface DamageMaskRequest { storageKey: string; mimeType: string; }
export interface DamageMaskResult {
  maskStorageKey: string; scratchMaskKey: string; dustMaskKey: string; tearMaskKey: string;
  regions: Array<{ x: number; y: number; width: number; height: number; type: string }>;
  processingTimeMs: number; mimeType: "image/png"; width: number; height: number; checksum: string; generationVersion: string; damagedAreaPercent: number;
}

export class DamageMaskService {
  private readonly storage: StorageService;
  constructor(private readonly config: AppConfig) { this.storage = new StorageService(config); }

  async generateMasks(request: DamageMaskRequest): Promise<DamageMaskResult> {
    if (!this.config.restorationDamageMaskEnabled) throw new Error("Damage mask generation is disabled");
    const started = Date.now();
    const { body } = await this.storage.downloadFile(request.storageKey);
    if (!body.length) throw new Error("Damage mask input is empty");
    const decoded = sharp(body, { limitInputPixels: MAX_PIXELS }).rotate();
    const meta = await decoded.metadata();
    if (!meta.width || !meta.height || !["jpeg", "png", "webp"].includes(meta.format || "")) throw new Error("Damage mask input is unsupported or undecodable");
    const { data, info } = await decoded.removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
    const mask = Buffer.alloc(info.width * info.height);
    for (let y = 1; y < info.height - 1; y++) for (let x = 1; x < info.width - 1; x++) {
      const i = y * info.width + x;
      const edge = Math.abs(data[i - 1] - data[i + 1]) + Math.abs(data[i - info.width] - data[i + info.width]);
      if (edge > 130 || data[i] < 20) mask[i] = 255;
    }
    const damaged = mask.reduce((sum, value) => sum + (value ? 1 : 0), 0);
    const damagedAreaPercent = damaged / mask.length * 100;
    if (!damaged) throw new Error("Damage mask is empty; structural repair is a no-op");
    if (damagedAreaPercent >= 100) throw new Error("Damage mask cannot cover the entire image");
    if (damagedAreaPercent > this.config.restorationDamageMaskMaxPercent) throw new Error("Damage mask exceeds configured maximum area");
    const png = await sharp(mask, { raw: { width: info.width, height: info.height, channels: 1 } }).png({ palette: true, colours: 2 }).toBuffer();
    const upload = await this.storage.uploadFile({ keyPrefix: "artifacts", fileName: `damage-mask-${Date.now()}.png`, body: png, contentType: "image/png" });
    return { maskStorageKey: upload.key, scratchMaskKey: upload.key, dustMaskKey: upload.key, tearMaskKey: upload.key, regions: [], processingTimeMs: Date.now() - started, mimeType: "image/png", width: info.width, height: info.height, checksum: crypto.createHash("sha256").update(png).digest("hex"), generationVersion: MASK_VERSION, damagedAreaPercent };
  }
}
