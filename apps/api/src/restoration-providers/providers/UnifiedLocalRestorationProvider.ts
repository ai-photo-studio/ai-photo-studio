import type { AppConfig } from "../../config/env";
import type { IRestorationProvider, ProviderHealth, ProviderStatus, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";
import { logger } from "../../utils/logger";
import { RestorationGfpganService, RestorationInpaintService } from "../../services/restoration-provider.service";
import { RealEsrganService } from "../../services/real-esrgan.service";
import { RestorationDdcolorService } from "../../services/restoration-provider.service";

interface DamageAnalysis {
  coverage: number;
  damageSeverity: "LIGHT" | "MEDIUM" | "HEAVY";
  overallScore: number;
  isGrayscale: boolean;
  resolution: { width: number; height: number };
}

const SCRATCH_THRESHOLD = 15;

export class UnifiedLocalRestorationProvider implements IRestorationProvider {
  readonly name = "unified-local";
  readonly type = "self-hosted" as const;
  status: ProviderStatus = "active";

  private readonly inpaintService: RestorationInpaintService;
  private readonly gfpganService: RestorationGfpganService;
  private readonly esrganService: RealEsrganService;
  private readonly ddcolorService: RestorationDdcolorService;

  constructor(private readonly config: AppConfig) {
    this.inpaintService = new RestorationInpaintService(config);
    this.gfpganService = new RestorationGfpganService(config);
    this.esrganService = new RealEsrganService(config);
    this.ddcolorService = new RestorationDdcolorService(config);
  }

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    const startTime = Date.now();
    let currentImage = request.image;
    let currentContentType = request.contentType;
    const stages: string[] = [];

    const damage = await this.analyzeDamage(currentImage, currentContentType);

    if (damage.coverage > SCRATCH_THRESHOLD) {
      try {
        const inpainted = await this.inpaintService.inpaint({
          body: currentImage,
          contentType: currentContentType,
          fileName: request.fileName,
        });
        currentImage = inpainted.body;
        currentContentType = inpainted.contentType;
        stages.push("lama_inpaint");
      } catch (err) {
        logger.warn("LaMa inpainting failed, continuing without it", { error: err instanceof Error ? err.message : String(err) });
      }
    }

    try {
      const enhanced = await this.gfpganService.enhance({
        body: currentImage,
        contentType: currentContentType,
        fileName: request.fileName,
      });
      currentImage = enhanced.body;
      currentContentType = enhanced.contentType;
      stages.push("face_restoration_gfpgan");
    } catch (err) {
      logger.warn("GFPGAN face restoration failed, continuing without it", { error: err instanceof Error ? err.message : String(err) });
    }

    if (damage.isGrayscale) {
      try {
        const colorized = await this.ddcolorService.colorize({
          body: currentImage,
          contentType: currentContentType,
          fileName: request.fileName,
        });
        currentImage = colorized.body;
        currentContentType = colorized.contentType;
        stages.push("colorization_ddcolor");
      } catch (err) {
        logger.warn("DDColor colorization failed, continuing without it", { error: err instanceof Error ? err.message : String(err) });
      }
    }

    try {
      const upscaled = await this.esrganService.enhance({
        body: currentImage,
        contentType: currentContentType,
        fileName: request.fileName,
      });
      currentImage = upscaled.body;
      currentContentType = upscaled.contentType;
      stages.push("real_esrgan_upscale");
    } catch (err) {
      logger.warn("Real-ESRGAN upscaling failed, continuing without it", { error: err instanceof Error ? err.message : String(err) });
    }

    const processingTimeMs = Date.now() - startTime;

    return {
      image: currentImage,
      contentType: currentContentType,
      fileName: request.fileName,
      providerName: this.name,
      providerVersion: "1.0.0",
      stages,
      processingTimeMs,
      creditsUsed: 0,
      estimatedCost: 0,
    };
  }

  private async analyzeDamage(image: Buffer, contentType: string): Promise<DamageAnalysis> {
    try {
      const img = image.toString("base64");
      const pixelCount = img.length;
      const coverage = pixelCount > 0 ? ((pixelCount % 100) / 100) * 100 : 0;
      const hasGrayscaleMarkers = this.detectGrayscale(image);

      return {
        coverage,
        damageSeverity: coverage > 50 ? "HEAVY" : coverage > 20 ? "MEDIUM" : "LIGHT",
        overallScore: Math.max(0, 100 - coverage),
        isGrayscale: hasGrayscaleMarkers,
        resolution: { width: 1024, height: 768 },
      };
    } catch {
      return {
        coverage: 0,
        damageSeverity: "LIGHT",
        overallScore: 80,
        isGrayscale: false,
        resolution: { width: 1024, height: 768 },
      };
    }
  }

  private detectGrayscale(image: Buffer): boolean {
    const header = image.subarray(0, Math.min(image.length, 64)).toString("ascii").toLowerCase();
    const modeMatch = header.match(/color\s*type["\s:=]+(\d)/i);
    if (modeMatch) {
      return modeMatch[1] === "0" || modeMatch[1] === "2";
    }
    return false;
  }

  estimateCost(_request: RestorationRequest): number {
    return 0;
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: "active",
      latency: 0,
      errorRate: 0,
      lastChecked: new Date().toISOString(),
    };
  }
}