export type AIProviderName = "mock" | "local-yolo" | "local-rembg" | "photoroom" | "fal";

export type WorkflowType = "PRODUCT" | "VEHICLE";

export type ProductCategory =
  | "perfume"
  | "cosmetics"
  | "shoes"
  | "fashion"
  | "furniture"
  | "electronics"
  | "food"
  | "jewelry"
  | "watch"
  | "handbag"
  | "human-model"
  | "vehicle"
  | "general-product";

export type ProcessingProfileName =
  | "luxury-shadow"
  | "beauty-finish"
  | "shoe-catalog"
  | "fashion-studio"
  | "room-frame"
  | "tech-catalog"
  | "freshness"
  | "jewelry-focus"
  | "watch-focus"
  | "handbag-focus"
  | "portrait-separate"
  | "vehicle-showroom"
  | "general-studio";

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
  analysis?: ImageAnalysis;
  enhancement?: EnhancementComparison;
};

export type BoundingBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type CropCoordinates = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type QualityScores = {
  blurScore: number;
  brightnessScore: number;
  contrastScore: number;
  visibilityScore: number;
  cropQualityScore: number;
  overallScore: number;
};

export type ProcessingStage =
  | "UPLOAD"
  | "YOLO"
  | "AUTO_CROP"
  | "AUTO_CENTER"
  | "REMBG"
  | "REAL_ESRGAN"
  | "EXPORT"
  | "IC_LIGHT_LAB";

export type EnhancementComparison = {
  before: QualityScores;
  after: QualityScores;
  delta: QualityScores;
  enhancementScore: number;
  processingStage: ProcessingStage;
};

export type ProductPipelineRoute = {
  category: ProductCategory;
  confidence: number;
  processingProfile: ProcessingProfileName;
  pipelineUsed: string;
  marginPct: number;
  canvasWidth: number;
  canvasHeight: number;
  enhancementScale: number;
  enhancementSharpen: number;
  enhancementDenoise: number;
  workflowType: WorkflowType;
  workflowMode: WorkflowMode;
  note?: string;
};

export type ImageAnalysis = {
  requestId: string;
  label: string;
  productDetected: boolean;
  confidence: number;
  boundingBox: BoundingBox;
  cropCoordinates: CropCoordinates;
  sourceDimensions: {
    width: number;
    height: number;
  };
  canvasDimensions: {
    width: number;
    height: number;
  };
  quality: QualityScores;
};

export interface ImageProvider {
  readonly name: AIProviderName;
  processProductImage(
    input: ProcessImageInput & { workflowMode: ProductWorkflowMode },
    routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput>;
  processVehicleImage(
    input: ProcessImageInput & { workflowMode: VehicleWorkflowMode },
    routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput>;
}
