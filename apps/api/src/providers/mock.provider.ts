import { randomUUID } from "node:crypto";
import type {
  ImageProvider,
  ProcessImageInput,
  ProcessImageOutput,
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
  providerRequestId: randomUUID()
});

export class MockImageProvider implements ImageProvider {
  readonly name = "mock" as const;

  async processProductImage(
    input: ProcessImageInput & { workflowMode: ProductWorkflowMode }
  ): Promise<ProcessImageOutput> {
    return buildOutput(this.name, "PRODUCT", input.workflowMode, input);
  }

  async processVehicleImage(
    input: ProcessImageInput & { workflowMode: VehicleWorkflowMode }
  ): Promise<ProcessImageOutput> {
    return buildOutput(this.name, "VEHICLE", input.workflowMode, input);
  }
}
