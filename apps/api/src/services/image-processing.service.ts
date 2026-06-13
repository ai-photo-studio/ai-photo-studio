import type { AppConfig } from "../config/env";
import { createImageProvider } from "../providers/provider.factory";
import type {
  ImageProvider,
  ProcessImageInput,
  ProcessImageOutput,
  ProductPipelineRoute,
  ProductWorkflowMode,
  VehicleWorkflowMode
} from "../providers/provider.interface";

export type ProcessedImageResult = ProcessImageOutput;

export class ImageProcessingService {
  private readonly provider: ImageProvider;

  constructor(private readonly config: AppConfig) {
    this.provider = createImageProvider(this.config);
  }

  async processProductImage(
    input: ProcessImageInput,
    workflowMode: ProductWorkflowMode,
    routing?: ProductPipelineRoute
  ): Promise<ProcessedImageResult> {
    return this.provider.processProductImage({
      ...input,
      workflowMode
    }, routing);
  }

  async processVehicleImage(
    input: ProcessImageInput,
    workflowMode: VehicleWorkflowMode,
    routing?: ProductPipelineRoute
  ): Promise<ProcessedImageResult> {
    return this.provider.processVehicleImage({
      ...input,
      workflowMode
    }, routing);
  }
}