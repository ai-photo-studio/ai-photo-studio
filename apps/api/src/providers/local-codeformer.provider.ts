import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env";
import type {
  ImageProvider,
  ProcessImageInput,
  ProcessImageOutput,
  ProductPipelineRoute,
  ProductWorkflowMode,
  VehicleWorkflowMode
} from "./provider.interface";
import { RestorationCodeformerService } from "../services/restoration-provider.service";
import { logger } from "../utils/logger";

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
  providerName: "local-codeformer",
  workflowType,
  workflowMode,
  providerRequestId: `local-codeformer-${randomUUID()}`
});

export class LocalCodeformerImageProvider implements ImageProvider {
  readonly name = "local-codeformer" as const;
  private readonly service: RestorationCodeformerService;

  constructor(config: AppConfig) {
    this.service = new RestorationCodeformerService(config);
  }

  async processProductImage(
    input: ProcessImageInput & { workflowMode: ProductWorkflowMode },
    _routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    logger.info("CodeFormer face restoration provider called", { fileName: input.fileName, orderNo: input.orderNo });

    const output = await this.service.enhance({
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
    const output = await this.service.enhance({
      body: input.buffer,
      contentType: input.contentType,
      fileName: input.fileName
    });
    return buildOutput("VEHICLE", input.workflowMode, output, input);
  }
}
