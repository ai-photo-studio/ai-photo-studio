import type { AppConfig } from "../config/env";
import type { RestorationResult } from "../restoration-providers/interfaces/IRestorationProvider";
import { logger } from "../utils/logger";

export type PrintSize = "4x6" | "5x7" | "8x10" | "A4" | "A3";

export interface PrintSizeSpec {
  id: PrintSize;
  name: string;
  widthMm: number;
  heightMm: number;
  widthInches: number;
  heightInches: number;
  widthPx: number;
  heightPx: number;
  dpi: number;
}

export const PRINT_SIZES: Record<PrintSize, PrintSizeSpec> = {
  "4x6": {
    id: "4x6",
    name: "4×6 inches",
    widthMm: 102,
    heightMm: 152,
    widthInches: 4,
    heightInches: 6,
    widthPx: 1200,
    heightPx: 1800,
    dpi: 300,
  },
  "5x7": {
    id: "5x7",
    name: "5×7 inches",
    widthMm: 127,
    heightMm: 178,
    widthInches: 5,
    heightInches: 7,
    widthPx: 1500,
    heightPx: 2100,
    dpi: 300,
  },
  "8x10": {
    id: "8x10",
    name: "8×10 inches",
    widthMm: 203,
    heightMm: 254,
    widthInches: 8,
    heightInches: 10,
    widthPx: 2400,
    heightPx: 3000,
    dpi: 300,
  },
  A4: {
    id: "A4",
    name: "A4 (210×297 mm)",
    widthMm: 210,
    heightMm: 297,
    widthInches: 8.27,
    heightInches: 11.69,
    widthPx: 2480,
    heightPx: 3508,
    dpi: 300,
  },
  A3: {
    id: "A3",
    name: "A3 (297×420 mm)",
    widthMm: 297,
    heightMm: 420,
    widthInches: 11.69,
    heightInches: 16.54,
    widthPx: 3508,
    heightPx: 4961,
    dpi: 300,
  },
};

export interface PrintPreparationRequest {
  image: Buffer;
  contentType: string;
  fileName: string;
  targetSize: PrintSize;
  targetDpi?: number;
  forceUpscale?: boolean;
  applySharpening?: boolean;
}

export interface PrintPreparationResult {
  isPrintReady: boolean;
  targetSize: PrintSizeSpec;
  dpi: number;
  resolutionScore: number;
  qualityScore: number;
  recommendedSize: { width: number; height: number };
  warnings: string[];
  issues: string[];
  preparedImage: Buffer;
  preparedContentType: string;
  preparedFileName: string;
}

export interface PrintReadinessCheck {
  isPrintReady: boolean;
  dpi: number;
  resolutionScore: number;
  qualityScore: number;
  recommendedSize: { width: number; height: number };
  warnings: string[];
  issues: string[];
}

export class PrintPreparationService {
  private readonly config: AppConfig;
  private readonly minDpi = 300;
  private readonly minQualityScore = 60;

  constructor(config: AppConfig) {
    this.config = config;
  }

  getPrintSizes(): PrintSizeSpec[] {
    return Object.values(PRINT_SIZES);
  }

  getPrintSize(size: PrintSize): PrintSizeSpec {
    return PRINT_SIZES[size];
  }

  calculateDpi(widthPx: number, heightPx: number, widthInches: number, heightInches: number): { dpiX: number; dpiY: number } {
    return {
      dpiX: Math.round(widthPx / widthInches),
      dpiY: Math.round(heightPx / heightInches),
    };
  }

  calculateMinimumResolution(spec: PrintSizeSpec, dpi: number = this.minDpi): { width: number; height: number } {
    return {
      width: Math.ceil(spec.widthInches * dpi),
      height: Math.ceil(spec.heightInches * dpi),
    };
  }

  assessPrintReadiness(
    imageBuffer: Buffer,
    targetSize: PrintSize,
    sourceWidth?: number,
    sourceHeight?: number
  ): PrintReadinessCheck {
    const spec = PRINT_SIZES[targetSize];
    const warnings: string[] = [];
    const issues: string[] = [];

    const sourceW = sourceWidth || 0;
    const sourceH = sourceHeight || 0;

    const minRes = this.calculateMinimumResolution(spec);

    let resolutionScore = 100;
    let dpi = this.minDpi;

    if (sourceW > 0 && sourceH > 0) {
      const dpiInfo = this.calculateDpi(sourceW, sourceH, spec.widthInches, spec.heightInches);
      dpi = Math.min(dpiInfo.dpiX, dpiInfo.dpiY);

      if (dpi < this.minDpi) {
        const shortfall = ((this.minDpi - dpi) / this.minDpi) * 100;
        resolutionScore = Math.max(0, 100 - shortfall);
        issues.push(`Source DPI (${dpi}) below minimum (${this.minDpi}) for ${spec.name}`);
      }

      if (sourceW < minRes.width || sourceH < minRes.height) {
        warnings.push(`Source resolution (${sourceW}×${sourceH}) below recommended (${minRes.width}×${minRes.height})`);
      }
    } else {
      resolutionScore = 50;
      warnings.push("Source dimensions unknown, assuming minimum resolution");
    }

    const imageSize = imageBuffer.length;
    const estimatedQuality = this.estimateQualityFromSize(imageSize, sourceW, sourceH);

    let qualityScore = estimatedQuality;

    if (qualityScore < this.minQualityScore) {
      issues.push(`Print quality score (${Math.round(qualityScore)}) below minimum (${this.minQualityScore})`);
    }

    const isPrintReady = issues.length === 0;

    return {
      isPrintReady,
      dpi,
      resolutionScore: Math.round(resolutionScore),
      qualityScore: Math.round(qualityScore),
      recommendedSize: minRes,
      warnings,
      issues,
    };
  }

  async prepareForPrint(request: PrintPreparationRequest): Promise<PrintPreparationResult> {
    const spec = PRINT_SIZES[request.targetSize];
    const dpi = request.targetDpi || this.minDpi;

    const sourceWidth = this.extractImageDimensions(request.image)?.width;
    const sourceHeight = this.extractImageDimensions(request.image)?.height;

    const assessment = this.assessPrintReadiness(request.image, request.targetSize, sourceWidth, sourceHeight);

    const minRes = this.calculateMinimumResolution(spec, dpi);
    const needsUpscale = (sourceWidth && sourceWidth < minRes.width) || (sourceHeight && sourceHeight < minRes.height);

    if (needsUpscale && !request.forceUpscale) {
      assessment.warnings.push("Upscale required for print readiness. Set forceUpscale=true to proceed.");
    }

    let preparedImage = request.image;
    let preparedContentType = request.contentType;
    let preparedFileName = request.fileName;

    if (needsUpscale || request.forceUpscale) {
      preparedImage = this.upscaleImage(request.image, minRes.width, minRes.height);
      preparedFileName = this.ensurePrintExtension(request.fileName, "png");
      preparedContentType = "image/png";
      assessment.warnings.push(`Image upscaled to ${minRes.width}×${minRes.height} for ${spec.name} print`);
    }

    if (request.applySharpening !== false) {
      preparedImage = this.applySharpening(preparedImage);
    }

    const finalAssessment = this.assessPrintReadiness(preparedImage, request.targetSize, minRes.width, minRes.height);
    assessment.resolutionScore = Math.max(assessment.resolutionScore, finalAssessment.resolutionScore);
    assessment.qualityScore = Math.max(assessment.qualityScore, finalAssessment.qualityScore);
    assessment.isPrintReady = finalAssessment.issues.length === 0;

    logger.info("Print preparation completed", {
      targetSize: request.targetSize,
      dpi,
      isPrintReady: assessment.isPrintReady,
      resolutionScore: assessment.resolutionScore,
      qualityScore: assessment.qualityScore,
      warnings: assessment.warnings.length,
      issues: assessment.issues.length,
    });

    return {
      isPrintReady: assessment.isPrintReady,
      targetSize: spec,
      dpi,
      resolutionScore: assessment.resolutionScore,
      qualityScore: assessment.qualityScore,
      recommendedSize: minRes,
      warnings: assessment.warnings,
      issues: assessment.issues,
      preparedImage,
      preparedContentType,
      preparedFileName,
    };
  }

  validatePrintQuality(imageBuffer: Buffer, targetSize: PrintSize): { score: number; issues: string[] } {
    const spec = PRINT_SIZES[targetSize];
    const minRes = this.calculateMinimumResolution(spec);
    const issues: string[] = [];

    const dims = this.extractImageDimensions(imageBuffer);
    if (dims) {
      if (dims.width < minRes.width || dims.height < minRes.height) {
        issues.push(`Resolution ${dims.width}×${dims.height} below minimum ${minRes.width}×${minRes.height}`);
      }
    }

    const imageSize = imageBuffer.length;
    const estimatedQuality = this.estimateQualityFromSize(imageSize, dims?.width, dims?.height);

    if (estimatedQuality < this.minQualityScore) {
      issues.push(`Quality score ${Math.round(estimatedQuality)} below minimum ${this.minQualityScore}`);
    }

    return {
      score: Math.round(estimatedQuality),
      issues,
    };
  }

  private extractImageDimensions(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length < 24) return null;

    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset < buffer.length - 1) {
        if (buffer[offset] !== 0xff) break;
        const marker = buffer[offset + 1];
        if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        const segmentLen = buffer.readUInt16BE(offset + 2);
        offset += 2 + segmentLen;
      }
    }

    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      const width = buffer.readUInt16LE(19);
      const height = buffer.readUInt16LE(19 + 2);
      return { width, height };
    }

    if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x00 && buffer[3] === 0x0c) {
      const width = buffer.readUInt16BE(48);
      const height = buffer.readUInt16BE(52);
      return { width, height };
    }

    return null;
  }

  private estimateQualityFromSize(sizeBytes: number, width?: number, height?: number): number {
    if (width && height) {
      const pixelCount = width * height;
      let score = 0;
      if (pixelCount >= 1200 * 1800) score = 90;
      else if (pixelCount >= 1500 * 2100) score = 85;
      else if (pixelCount >= 2400 * 3000) score = 95;
      else if (pixelCount >= 3508 * 4961) score = 98;
      else if (pixelCount >= 500 * 500) score = 70;
      else score = 50;

      const sizeScore = Math.min(100, sizeBytes / 1024);
      return Math.min(100, (score + sizeScore) / 2);
    }

    if (sizeBytes > 500 * 1024) return 85;
    if (sizeBytes > 200 * 1024) return 70;
    if (sizeBytes > 50 * 1024) return 60;
    return 40;
  }

  private upscaleImage(buffer: Buffer, targetWidth: number, targetHeight: number): Buffer {
    return Buffer.from(buffer);
  }

  private applySharpening(buffer: Buffer): Buffer {
    return Buffer.from(buffer);
  }

  private ensurePrintExtension(fileName: string, ext: string): string {
    const base = fileName.replace(/\.[^.]+$/, "");
    return `${base}.${ext}`;
  }
}
