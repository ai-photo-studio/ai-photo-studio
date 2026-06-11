import type { AppConfig } from "../config/env";
import { createImageProvider } from "../providers/provider.factory";
import type {
  ImageProvider,
  ProcessImageOutput,
  ProductWorkflowMode,
  VehicleWorkflowMode
} from "../providers/provider.interface";

export type ProcessImageInput = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  orderId: string;
  orderNo: string;
  mediaId?: string;
};

export type ProcessedImageResult = ProcessImageOutput;

export class ImageProcessingService {
  private readonly provider: ImageProvider;

  constructor(private readonly config: AppConfig) {
    this.provider = createImageProvider(this.config);
  }

  async processProductImage(
    input: ProcessImageInput,
    workflowMode: ProductWorkflowMode
  ): Promise<ProcessedImageResult> {
    return this.provider.processProductImage({
      ...input,
      workflowMode
    });
  }

  async processVehicleImage(
    input: ProcessImageInput,
    workflowMode: VehicleWorkflowMode
  ): Promise<ProcessedImageResult> {
    return this.provider.processVehicleImage({
      ...input,
      workflowMode
    });
  }
}
