import { randomUUID } from "node:crypto";
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
  input: ProcessImageInput
): ProcessImageOutput => ({
  buffer: clone(input.buffer),
  contentType: input.contentType,
  fileName: input.fileName,
  providerName,
  workflowType,
  workflowMode,
  providerRequestId: `photoroom-${randomUUID()}`
});

export class PhotoroomImageProvider implements ImageProvider {
  readonly name = "photoroom" as const;

  constructor(private readonly apiKey: string) {
    void this.apiKey;
  }

  async processProductImage(
    input: ProcessImageInput & { workflowMode: ProductWorkflowMode },
    _routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    return buildOutput(this.name, "PRODUCT", input.workflowMode, input);
  }

  async processVehicleImage(
    input: ProcessImageInput & { workflowMode: VehicleWorkflowMode },
    _routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    return buildOutput(this.name, "VEHICLE", input.workflowMode, input);
  }
}
