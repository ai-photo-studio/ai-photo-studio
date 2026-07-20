import type { AppConfig } from "../config/env";

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

export class DamageDetectionService {
  constructor(private readonly config: AppConfig) {}

  async detectDamage(request: DamageDetectionRequest): Promise<DamageDetectionResponse> {
    // Placeholder — implementation in Sprint 2
    void request;
    throw new Error("DamageDetectionService.detectDamage not yet implemented");
  }
}
