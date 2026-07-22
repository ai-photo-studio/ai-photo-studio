import type { AppConfig } from "../config/env";
import { PrintPreparationService } from "./print-preparation.service";
import type { PrintSize, PrintPreparationRequest, PrintPreparationResult, PrintReadinessCheck } from "./print-preparation.service";

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
  private readonly printPrep: PrintPreparationService;

  constructor(private readonly config: AppConfig) {
    this.printPrep = new PrintPreparationService(config);
  }

  getPrintSizes() {
    return this.printPrep.getPrintSizes();
  }

  getPrintSize(size: PrintSize) {
    return this.printPrep.getPrintSize(size);
  }

  async assessPrintReadiness(request: PrintReadinessRequest): Promise<PrintReadinessResponse> {
    const targetSize = this.determinePrintSize(request.targetSize);
    const dpi = request.dpi || 300;

    const dummyImage = Buffer.alloc(100 * 1024);
    const check = this.printPrep.assessPrintReadiness(dummyImage, targetSize, request.targetSize?.width, request.targetSize?.height);

    return {
      isPrintReady: check.isPrintReady,
      dpi: dpi,
      resolutionScore: check.resolutionScore,
      qualityScore: check.qualityScore,
      recommendedSize: check.recommendedSize,
      warnings: check.warnings,
      issues: check.issues,
    };
  }

  async prepareForPrint(request: PrintPreparationRequest): Promise<PrintPreparationResult> {
    return this.printPrep.prepareForPrint(request);
  }

  validatePrintQuality(imageBuffer: Buffer, targetSize: PrintSize) {
    return this.printPrep.validatePrintQuality(imageBuffer, targetSize);
  }

  private determinePrintSize(targetSize?: { width: number; height: number }): PrintSize {
    if (!targetSize) return "4x6";

    const { width, height } = targetSize;
    const ratio = width / height;

    if (Math.abs(ratio - 4 / 6) < 0.1) return "4x6";
    if (Math.abs(ratio - 5 / 7) < 0.1) return "5x7";
    if (Math.abs(ratio - 8 / 10) < 0.1) return "8x10";
    if (Math.abs(ratio - 210 / 297) < 0.1) return "A4";
    if (Math.abs(ratio - 297 / 420) < 0.1) return "A3";

    return "4x6";
  }
}
