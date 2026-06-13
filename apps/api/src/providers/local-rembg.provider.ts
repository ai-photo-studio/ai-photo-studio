import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env";
import { BackgroundRemoverService } from "../services/background-remover.service";
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
  providerName: ProcessImageOutput["providerName"],
  workflowType: ProcessImageOutput["workflowType"],
  workflowMode: ProcessImageOutput["workflowMode"],
  input: ProcessImageInput,
  output: { body: Buffer; contentType: string; fileName: string }
): ProcessImageOutput => ({
  buffer: clone(output.body),
  contentType: output.contentType,
  fileName: output.fileName,
  providerName,
  workflowType,
  workflowMode,
  providerRequestId: `local-rembg-${randomUUID()}`
});

export class LocalRembgImageProvider implements ImageProvider {
  readonly name = "local-rembg" as const;
  private readonly backgroundRemover: BackgroundRemoverService;

  constructor(config: AppConfig) {
    this.backgroundRemover = new BackgroundRemoverService(config);
  }

  async processProductImage(
    input: ProcessImageInput & { workflowMode: ProductWorkflowMode },
    _routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    const output = await this.backgroundRemover.productWhite({
      body: input.buffer,
      contentType: input.contentType,
      fileName: input.fileName
    });
    return buildOutput(this.name, "PRODUCT", input.workflowMode, input, output);
  }

  async processVehicleImage(
    input: ProcessImageInput & { workflowMode: VehicleWorkflowMode },
    _routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    const output = await this.backgroundRemover.productWhite({
      body: input.buffer,
      contentType: input.contentType,
      fileName: input.fileName
    });
    return buildOutput(this.name, "VEHICLE", input.workflowMode, input, output);
  }
}
