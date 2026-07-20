import type { AppConfig } from "../config/env";

export interface PrintReadinessRequest {
  storageKey: string;
  mimeType: string;
  targetSize?: { width: number; height: number };
  dpi?: number;
}

export interface PrintReadinessResponse {
  isPrintReady: boolean;
  dpi: number;
  resolutionScore: number;
  qualityScore: number;
  recommendedSize: { width: number; height: number };
  warnings: string[];
  issues: string[];
}

export class PrintReadinessService {
  constructor(private readonly config: AppConfig) {}

  async assessPrintReadiness(request: PrintReadinessRequest): Promise<PrintReadinessResponse> {
    // Placeholder — implementation in Sprint 3
    void request;
    throw new Error("PrintReadinessService.assessPrintReadiness not yet implemented");
  }
}
