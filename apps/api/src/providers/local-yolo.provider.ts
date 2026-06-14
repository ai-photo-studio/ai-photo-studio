import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env";
import { BackgroundRemoverService } from "../services/background-remover.service";
import { RealEsrganService } from "../services/real-esrgan.service";
import { YoloDetectorService, toImageAnalysis } from "../services/yolo-detector.service";
import type {
  EnhancementComparison,
  ImageProvider,
  ProcessImageInput,
  ProcessImageOutput,
  ProductPipelineRoute,
  ProductWorkflowMode,
  QualityScores,
  VehicleWorkflowMode
} from "./provider.interface";

const clone = (buffer: Buffer) => Buffer.from(buffer);

const toDelta = (before: QualityScores, after: QualityScores): QualityScores => ({
  blurScore: Number((after.blurScore - before.blurScore).toFixed(2)),
  brightnessScore: Number((after.brightnessScore - before.brightnessScore).toFixed(2)),
  contrastScore: Number((after.contrastScore - before.contrastScore).toFixed(2)),
  visibilityScore: Number((after.visibilityScore - before.visibilityScore).toFixed(2)),
  cropQualityScore: Number((after.cropQualityScore - before.cropQualityScore).toFixed(2)),
  overallScore: Number((after.overallScore - before.overallScore).toFixed(2))
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const buildEnhancementComparison = (
  before: QualityScores,
  after: QualityScores
): EnhancementComparison => {
  const delta = toDelta(before, after);
  const enhancementScore = Math.round(clamp(50 + delta.overallScore * 2, 0, 100));
  return {
    before,
    after,
    delta,
    enhancementScore,
    processingStage: "EXPORT"
  };
};

const buildOutput = (
  workflowType: ProcessImageOutput["workflowType"],
  workflowMode: ProcessImageOutput["workflowMode"],
  output: { body: Buffer; contentType: string; fileName: string },
  analysis: ProcessImageOutput["analysis"],
  enhancement?: EnhancementComparison
): ProcessImageOutput => ({
  buffer: clone(output.body),
  contentType: output.contentType,
  fileName: output.fileName,
  providerName: "local-yolo",
  workflowType,
  workflowMode,
  providerRequestId: enhancement ? `local-yolo-${analysis?.requestId || randomUUID()}` : analysis?.requestId || `local-yolo-${randomUUID()}`,
  analysis,
  enhancement
});

export class LocalYoloImageProvider implements ImageProvider {
  readonly name = "local-yolo" as const;
  private readonly yolo: YoloDetectorService;
  private readonly backgroundRemover: BackgroundRemoverService;
  private readonly enhancement: RealEsrganService;

  constructor(config: AppConfig) {
    this.yolo = new YoloDetectorService(config);
    this.backgroundRemover = new BackgroundRemoverService(config);
    this.enhancement = new RealEsrganService(config);
  }

  async processProductImage(
    input: ProcessImageInput & { workflowMode: ProductWorkflowMode },
    routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    return this.process(input, "PRODUCT", input.workflowMode, routing);
  }

  async processVehicleImage(
    input: ProcessImageInput & { workflowMode: VehicleWorkflowMode },
    routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    return this.process(input, "VEHICLE", input.workflowMode, routing);
  }

  private async process(
    input: ProcessImageInput,
    workflowType: ProcessImageOutput["workflowType"],
    workflowMode: ProcessImageOutput["workflowMode"],
    routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    const selectedActions = new Set(input.selectedActions || []);
    const hasExplicitActions = selectedActions.size > 0;
    const wantsCropCenter =
      !hasExplicitActions ||
      selectedActions.has("auto-crop") ||
      selectedActions.has("auto-center") ||
      selectedActions.has("daraz-ready") ||
      selectedActions.has("shopify-ready");
    const wantsBackground =
      !hasExplicitActions ||
      selectedActions.has("remove-background") ||
      selectedActions.has("white-background") ||
      selectedActions.has("daraz-ready") ||
      selectedActions.has("shopify-ready");
    const wantsEnhancement = !hasExplicitActions || selectedActions.has("enhancement") || selectedActions.has("meta-ads-ready");

    if (!wantsCropCenter && !wantsBackground && !wantsEnhancement) {
      return buildOutput(
        workflowType,
        workflowMode,
        {
          body: input.buffer,
          contentType: input.contentType,
          fileName: input.fileName
        },
        undefined,
        undefined
      );
    }

    const before = await this.yolo.detect({
      body: input.buffer,
      contentType: input.contentType,
      fileName: input.fileName,
      marginPct: routing?.marginPct,
      canvasWidth: routing?.canvasWidth,
      canvasHeight: routing?.canvasHeight
    });

    const centeredOutput = wantsCropCenter
      ? {
          body: Buffer.from(before.images.centeredImageBase64, "base64"),
          contentType: before.images.contentType,
          fileName: before.images.fileName
        }
      : {
          body: input.buffer,
          contentType: input.contentType,
          fileName: input.fileName
        };

    const rembgOutput = wantsBackground
      ? await this.backgroundRemover.productWhite({
          body: centeredOutput.body,
          contentType: centeredOutput.contentType,
          fileName: centeredOutput.fileName
        })
      : centeredOutput;

    const enhancedOutput = wantsEnhancement
      ? await this.enhancement.enhance({
          body: rembgOutput.body,
          contentType: rembgOutput.contentType,
          fileName: rembgOutput.fileName,
          scale: routing?.enhancementScale || 2,
          sharpen: routing?.enhancementSharpen || 0.55,
          denoise: routing?.enhancementDenoise || 0.3
        })
      : rembgOutput;

    const after = await this.yolo.detect({
      body: enhancedOutput.body,
      contentType: enhancedOutput.contentType,
      fileName: enhancedOutput.fileName
    });

    return buildOutput(
      workflowType,
      workflowMode,
      enhancedOutput,
      toImageAnalysis(after),
      wantsEnhancement ? buildEnhancementComparison(before.quality, after.quality) : undefined
    );
  }
}
