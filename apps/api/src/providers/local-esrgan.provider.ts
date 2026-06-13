import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env";
import { RealEsrganService } from "../services/real-esrgan.service";
import type {
  ImageProvider,
  ProcessImageInput,
  ProcessImageOutput,
  ProductPipelineRoute,
  ProductWorkflowMode,
  VehicleWorkflowMode
} from "./provider.interface";

const clone = (buffer: Buffer) => Buffer.from(buffer);

const buildOutput = (
  workflowType: ProcessImageOutput["workflowType"],
  workflowMode: ProcessImageOutput["workflowMode"],
  output: { body: Buffer; contentType: string; fileName: string },
  input: ProcessImageInput
): ProcessImageOutput => ({
  buffer: clone(output.body),
  contentType: output.contentType,
  fileName: output.fileName,
  providerName: "local-esrgan",
  workflowType,
  workflowMode,
  providerRequestId: `local-esrgan-${randomUUID()}`,
  enhancement: {
    before: {
      blurScore: 0,
      brightnessScore: 0,
      contrastScore: 0,
      visibilityScore: 0,
      cropQualityScore: 0,
      overallScore: 0
    },
    after: {
      blurScore: 0,
      brightnessScore: 0,
      contrastScore: 0,
      visibilityScore: 0,
      cropQualityScore: 0,
      overallScore: 0
    },
    delta: {
      blurScore: 0,
      brightnessScore: 0,
      contrastScore: 0,
      visibilityScore: 0,
      cropQualityScore: 0,
      overallScore: 0
    },
    enhancementScore: 50,
    processingStage: "EXPORT"
  }
});

export class LocalEsrganImageProvider implements ImageProvider {
  readonly name = "local-esrgan" as const;
  private readonly enhancement: RealEsrganService;

  constructor(config: AppConfig) {
    this.enhancement = new RealEsrganService(config);
  }

  async processProductImage(
    input: ProcessImageInput & { workflowMode: ProductWorkflowMode },
    _routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    const output = await this.enhancement.enhance({
      body: input.buffer,
      contentType: input.contentType,
      fileName: input.fileName
    });
    return buildOutput("PRODUCT", input.workflowMode, output, input);
  }

  async processVehicleImage(
    input: ProcessImageInput & { workflowMode: VehicleWorkflowMode },
    _routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    const output = await this.enhancement.enhance({
      body: input.buffer,
      contentType: input.contentType,
      fileName: input.fileName
    });
    return buildOutput("VEHICLE", input.workflowMode, output, input);
  }
}