export type AIProviderName = "mock" | "photoroom" | "fal";

export type WorkflowType = "PRODUCT" | "VEHICLE";

export type ProductWorkflowMode =
  | "WHITE_BACKGROUND"
  | "SOLID_COLOR_BACKGROUND"
  | "SHADOW_ENHANCEMENT"
  | "PRODUCT_STUDIO";

export type VehicleWorkflowMode = "SHOWROOM" | "PREMIUM_ROAD" | "DARK_STUDIO" | "PLATE_BLUR";

export type WorkflowMode = ProductWorkflowMode | VehicleWorkflowMode;

export type ProcessImageInput = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  orderId: string;
  orderNo: string;
  mediaId?: string;
};

export type ProcessImageOutput = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  providerName: AIProviderName;
  workflowType: WorkflowType;
  workflowMode: WorkflowMode;
  providerRequestId: string;
};

export interface ImageProvider {
  readonly name: AIProviderName;
  processProductImage(
    input: ProcessImageInput & { workflowMode: ProductWorkflowMode }
  ): Promise<ProcessImageOutput>;
  processVehicleImage(
    input: ProcessImageInput & { workflowMode: VehicleWorkflowMode }
  ): Promise<ProcessImageOutput>;
}
