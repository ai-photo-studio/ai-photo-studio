import { StorageService } from "./storage.service";
import type { AppConfig } from "../config/env";
import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger";

export interface DamageDetectionRequest {
  storageKey: string;
  mimeType: string;
}

export interface DamageDetectionResponse {
  damageSeverity: "LIGHT" | "MEDIUM" | "HEAVY";
  damageTypes: Array<"scratch" | "dust" | "tear" | "fold" | "crack" | "water_mark" | "fading">;
  coverage: number;
  maskStorageKey: string;
  scratchCoverage: number;
  dustLevel: number;
  tearDepth: number;
  crackCount: number;
  artifactScore: number;
  processingTimeMs: number;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function toGray(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

function isSkinTone(r: number, g: number, b: number): boolean {
  return r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15;
}

export class DamageDetectionService {
  private readonly storage: StorageService;

  constructor(private readonly config: AppConfig) {
    this.storage = new StorageService(config);
  }

  async detectDamage(request: DamageDetectionRequest): Promise<DamageDetectionResponse> {
    const startTime = Date.now();
    const { body } = await this.storage.downloadFile(request.storageKey);

    const pixelCount = Math.min(body.length / 3, 50000);
    const step = Math.max(1, Math.floor((body.length / 3) / pixelCount));

    const pixels: Array<{ r: number; g: number; b: number; gray: number }> = [];

    const width = 0;
    const height = 0;

    for (let i = 54; i + 2 < body.length && pixels.length < pixelCount; i += step * 3) {
      const r = body[i], g = body[i + 1], b = body[i + 2];
      pixels.push({ r, g, b, gray: toGray(r, g, b) });
    }

    if (pixels.length < 10) {
      const duration = Date.now() - startTime;
      return {
        damageSeverity: "UNKNOWN" as any,
        damageTypes: [],
        coverage: 0,
        maskStorageKey: "",
        scratchCoverage: 0,
        dustLevel: 0,
        tearDepth: 0,
        crackCount: 0,
        artifactScore: 0,
        processingTimeMs: duration
      };
    }

    const grays = pixels.map(p => p.gray);
    const avgGray = grays.reduce((a, b) => a + b, 0) / grays.length;
    const variance = grays.reduce((a, g) => a + (g - avgGray) ** 2, 0) / grays.length;
    const stdDev = Math.sqrt(variance);

    let scanLineEdges = 0;
    for (let i = 1; i < grays.length; i++) {
      const d = Math.abs(grays[i] - grays[i - 1]);
      if (d > 40) scanLineEdges++;
    }
    const edgeDensity = scanLineEdges / grays.length;

    const darkPixels = pixels.filter(p => p.gray < 30).length / pixels.length;
    const brightPixels = pixels.filter(p => p.gray > 220).length / pixels.length;

    let colorDeviation = 0;
    let skinPixelCount = 0;
    for (const p of pixels) {
      colorDeviation += Math.abs(p.r - p.g) + Math.abs(p.g - p.b) + Math.abs(p.b - p.r);
      if (isSkinTone(p.r, p.g, p.b)) skinPixelCount++;
    }
    const avgColorDev = colorDeviation / pixels.length;
    const skinRatio = skinPixelCount / pixels.length;

    const scratchCoverage = clamp(Math.round(edgeDensity * 100));
    const dustLevel = clamp(Math.round(darkPixels * 100));
    const tearDepth = clamp(Math.round((edgeDensity + darkPixels) * 50));
    const crackCount = Math.max(0, Math.round(scanLineEdges * 0.1));
    const fadingLevel = clamp(Math.round((1 - stdDev / 127) * 100));
    const yellowing = Math.max(0, (avgColorDev > 50 ? (avgColorDev - 50) / 50 * 100 : 0));
    const artifactScore = clamp(Math.round((dustLevel * 0.5 + (100 - fadingLevel) * 0.3 + crackCount * 0.2)));

    let severity: "LIGHT" | "MEDIUM" | "HEAVY";
    const severityScore = scratchCoverage * 0.3 + dustLevel * 0.2 + tearDepth * 0.2 + (100 - fadingLevel) * 0.15 + crackCount * 5;
    if (severityScore < 25) severity = "LIGHT";
    else if (severityScore < 55) severity = "MEDIUM";
    else severity = "HEAVY";

    const damageTypes: Array<"scratch" | "dust" | "tear" | "fold" | "crack" | "water_mark" | "fading"> = [];
    if (scratchCoverage > 15) damageTypes.push("scratch");
    if (dustLevel > 10) damageTypes.push("dust");
    if (tearDepth > 30) damageTypes.push("tear");
    if (crackCount > 3) damageTypes.push("crack");
    if (fadingLevel > 40) damageTypes.push("fading");

    const coverage = clamp(Math.round(
      scratchCoverage * 0.25 + dustLevel * 0.2 + tearDepth * 0.15 +
      (fadingLevel > 30 ? fadingLevel * 0.2 : 0) + crackCount * 2
    ));

    const maskKey = "";
    const durationMs = Date.now() - startTime;

    return {
      damageSeverity: severity,
      damageTypes,
      coverage,
      maskStorageKey: maskKey,
      scratchCoverage,
      dustLevel,
      tearDepth,
      crackCount,
      artifactScore,
      processingTimeMs: durationMs
    };
  }
}
