import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env";
import { ICLightLabService } from "../services/ic-light-lab.service";
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
  providerName: "local-iclight",
  workflowType,
  workflowMode,
  providerRequestId: `local-iclight-${randomUUID()}`
});

export class LocalIclightImageProvider implements ImageProvider {
  readonly name = "local-iclight" as const;
  private readonly icLight: ICLightLabService;

  constructor(config: AppConfig) {
    this.icLight = new ICLightLabService(config);
  }

  async processProductImage(
    input: ProcessImageInput & { workflowMode: ProductWorkflowMode },
    _routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    const result = await this.icLight.relight({
      body: input.buffer,
      contentType: input.contentType,
      fileName: input.fileName
    });
    const outputBuffer = Buffer.from(result.relightedImageBase64, "base64");
    return buildOutput("PRODUCT", input.workflowMode, { body: outputBuffer, contentType: result.contentType, fileName: result.fileName }, input);
  }

  async processVehicleImage(
    input: ProcessImageInput & { workflowMode: VehicleWorkflowMode },
    _routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    const result = await this.icLight.relight({
      body: input.buffer,
      contentType: input.contentType,
      fileName: input.fileName
    });
    const outputBuffer = Buffer.from(result.relightedImageBase64, "base64");
    return buildOutput("VEHICLE", input.workflowMode, { body: outputBuffer, contentType: result.contentType, fileName: result.fileName }, input);
  }
}