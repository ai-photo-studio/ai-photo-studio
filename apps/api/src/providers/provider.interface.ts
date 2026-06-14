export type AIProviderName =
  | "mock"
  | "local-rembg"
  | "local-yolo"
  | "local-esrgan"
  | "local-iclight"
  | "photoroom"
  | "fal"
  | "future-photoroom"
  | "future-falai"
  | "future-replicate";

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
  | "CREATIVE_STUDIO"
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

export type CapabilityName =
  | "background-removal"
  | "classification"
  | "crop-center"
  | "enhancement"
  | "relighting"
  | "shadow-generation"
  | "flat-lay"
  | "lifestyle-scene"
  | "virtual-model"
  | "video-generation";

export type ProviderCapability = {
  capability: CapabilityName;
  enabled: boolean;
  version?: string;
  latencyMs?: number;
};

export type ProviderMetadata = {
  name: AIProviderName;
  displayName: string;
  description: string;
  enabled: boolean;
  isLocal: boolean;
  isPaid: boolean;
  capabilities: ProviderCapability[];
  costPerOperation: {
    operation: string;
    estimatedCost: number;
  };
  supportedWorkflows: WorkflowType[];
  supportedModes: WorkflowMode[];
};

export const PROVIDER_CAPABILITIES: Record<AIProviderName, ProviderMetadata> = {
  mock: {
    name: "mock",
    displayName: "Mock Provider",
    description: "Mock provider for testing",
    enabled: true,
    isLocal: true,
    isPaid: false,
    capabilities: [
      { capability: "background-removal", enabled: false },
      { capability: "classification", enabled: false },
      { capability: "crop-center", enabled: false },
      { capability: "enhancement", enabled: false },
      { capability: "relighting", enabled: false },
      { capability: "shadow-generation", enabled: false },
      { capability: "flat-lay", enabled: true },
      { capability: "lifestyle-scene", enabled: true },
      { capability: "virtual-model", enabled: false },
      { capability: "video-generation", enabled: false }
    ],
    costPerOperation: { operation: "all", estimatedCost: 0 },
    supportedWorkflows: ["PRODUCT", "VEHICLE"],
    supportedModes: ["WHITE_BACKGROUND", "SOLID_COLOR_BACKGROUND", "SHADOW_ENHANCEMENT", "PRODUCT_STUDIO", "SHOWROOM", "PREMIUM_ROAD", "DARK_STUDIO", "PLATE_BLUR"]
  },
  "local-rembg": {
    name: "local-rembg",
    displayName: "Local REMBG",
    description: "Local background removal using REMBG",
    enabled: true,
    isLocal: true,
    isPaid: false,
    capabilities: [
      { capability: "background-removal", enabled: true },
      { capability: "classification", enabled: false },
      { capability: "crop-center", enabled: false },
      { capability: "enhancement", enabled: false },
      { capability: "relighting", enabled: false },
      { capability: "shadow-generation", enabled: false },
      { capability: "flat-lay", enabled: false },
      { capability: "lifestyle-scene", enabled: false },
      { capability: "virtual-model", enabled: false },
      { capability: "video-generation", enabled: false }
    ],
    costPerOperation: { operation: "all", estimatedCost: 0 },
    supportedWorkflows: ["PRODUCT", "VEHICLE"],
    supportedModes: ["WHITE_BACKGROUND", "SOLID_COLOR_BACKGROUND", "SHADOW_ENHANCEMENT", "PRODUCT_STUDIO", "SHOWROOM", "PREMIUM_ROAD", "DARK_STUDIO", "PLATE_BLUR"]
  },
  "local-yolo": {
    name: "local-yolo",
    displayName: "Local YOLO",
    description: "Local object detection and processing pipeline",
    enabled: true,
    isLocal: true,
    isPaid: false,
    capabilities: [
      { capability: "background-removal", enabled: true },
      { capability: "classification", enabled: true },
      { capability: "crop-center", enabled: true },
      { capability: "enhancement", enabled: true },
      { capability: "relighting", enabled: false },
      { capability: "shadow-generation", enabled: false },
      { capability: "flat-lay", enabled: false },
      { capability: "lifestyle-scene", enabled: false },
      { capability: "virtual-model", enabled: false },
      { capability: "video-generation", enabled: false }
    ],
    costPerOperation: { operation: "all", estimatedCost: 0 },
    supportedWorkflows: ["PRODUCT", "VEHICLE"],
    supportedModes: ["WHITE_BACKGROUND", "SOLID_COLOR_BACKGROUND", "SHADOW_ENHANCEMENT", "PRODUCT_STUDIO", "SHOWROOM", "PREMIUM_ROAD", "DARK_STUDIO", "PLATE_BLUR"]
  },
  "local-esrgan": {
    name: "local-esrgan",
    displayName: "Local ESRGAN",
    description: "Local image upscaling using ESRGAN",
    enabled: true,
    isLocal: true,
    isPaid: false,
    capabilities: [
      { capability: "background-removal", enabled: false },
      { capability: "classification", enabled: false },
      { capability: "crop-center", enabled: false },
      { capability: "enhancement", enabled: true },
      { capability: "relighting", enabled: false },
      { capability: "shadow-generation", enabled: false },
      { capability: "flat-lay", enabled: false },
      { capability: "lifestyle-scene", enabled: false },
      { capability: "virtual-model", enabled: false },
      { capability: "video-generation", enabled: false }
    ],
    costPerOperation: { operation: "enhancement", estimatedCost: 0 },
    supportedWorkflows: ["PRODUCT", "VEHICLE"],
    supportedModes: ["WHITE_BACKGROUND", "SOLID_COLOR_BACKGROUND", "SHADOW_ENHANCEMENT", "PRODUCT_STUDIO", "SHOWROOM", "PREMIUM_ROAD", "DARK_STUDIO", "PLATE_BLUR"]
  },
  "local-iclight": {
    name: "local-iclight",
    displayName: "Local IC-Light",
    description: "Local image relighting using IC-Light",
    enabled: true,
    isLocal: true,
    isPaid: false,
    capabilities: [
      { capability: "background-removal", enabled: false },
      { capability: "classification", enabled: false },
      { capability: "crop-center", enabled: false },
      { capability: "enhancement", enabled: false },
      { capability: "relighting", enabled: true },
      { capability: "shadow-generation", enabled: true },
      { capability: "flat-lay", enabled: false },
      { capability: "lifestyle-scene", enabled: false },
      { capability: "virtual-model", enabled: false },
      { capability: "video-generation", enabled: false }
    ],
    costPerOperation: { operation: "relighting", estimatedCost: 0 },
    supportedWorkflows: ["PRODUCT", "VEHICLE"],
    supportedModes: ["WHITE_BACKGROUND", "SOLID_COLOR_BACKGROUND", "SHADOW_ENHANCEMENT", "PRODUCT_STUDIO", "SHOWROOM", "PREMIUM_ROAD", "DARK_STUDIO", "PLATE_BLUR"]
  },
  "future-photoroom": {
    name: "future-photoroom",
    displayName: "Photoroom (Future)",
    description: "Photoroom API integration - disabled",
    enabled: false,
    isLocal: false,
    isPaid: true,
    capabilities: [
      { capability: "background-removal", enabled: false },
      { capability: "classification", enabled: false },
      { capability: "crop-center", enabled: false },
      { capability: "enhancement", enabled: false },
      { capability: "relighting", enabled: false },
      { capability: "shadow-generation", enabled: false },
      { capability: "flat-lay", enabled: false },
      { capability: "lifestyle-scene", enabled: false },
      { capability: "virtual-model", enabled: false },
      { capability: "video-generation", enabled: false }
    ],
    costPerOperation: { operation: "all", estimatedCost: 0.05 },
    supportedWorkflows: ["PRODUCT", "VEHICLE"],
    supportedModes: ["WHITE_BACKGROUND", "SOLID_COLOR_BACKGROUND", "SHADOW_ENHANCEMENT", "PRODUCT_STUDIO", "SHOWROOM", "PREMIUM_ROAD", "DARK_STUDIO", "PLATE_BLUR"]
  },
  "future-falai": {
    name: "future-falai",
    displayName: "FAL.ai (Future)",
    description: "FAL.ai integration - disabled",
    enabled: false,
    isLocal: false,
    isPaid: true,
    capabilities: [
      { capability: "background-removal", enabled: false },
      { capability: "classification", enabled: false },
      { capability: "crop-center", enabled: false },
      { capability: "enhancement", enabled: false },
      { capability: "relighting", enabled: false },
      { capability: "shadow-generation", enabled: false },
      { capability: "flat-lay", enabled: false },
      { capability: "lifestyle-scene", enabled: false },
      { capability: "virtual-model", enabled: false },
      { capability: "video-generation", enabled: false }
    ],
    costPerOperation: { operation: "all", estimatedCost: 0.08 },
    supportedWorkflows: ["PRODUCT", "VEHICLE"],
    supportedModes: ["WHITE_BACKGROUND", "SOLID_COLOR_BACKGROUND", "SHADOW_ENHANCEMENT", "PRODUCT_STUDIO", "SHOWROOM", "PREMIUM_ROAD", "DARK_STUDIO", "PLATE_BLUR"]
  },
  "future-replicate": {
    name: "future-replicate",
    displayName: "Replicate (Future)",
    description: "Replicate integration - disabled",
    enabled: false,
    isLocal: false,
    isPaid: true,
    capabilities: [
      { capability: "background-removal", enabled: false },
      { capability: "classification", enabled: false },
      { capability: "crop-center", enabled: false },
      { capability: "enhancement", enabled: false },
      { capability: "relighting", enabled: false },
      { capability: "shadow-generation", enabled: false },
      { capability: "flat-lay", enabled: false },
      { capability: "lifestyle-scene", enabled: false },
      { capability: "virtual-model", enabled: false },
      { capability: "video-generation", enabled: false }
    ],
    costPerOperation: { operation: "all", estimatedCost: 0.03 },
    supportedWorkflows: ["PRODUCT", "VEHICLE"],
    supportedModes: ["WHITE_BACKGROUND", "SOLID_COLOR_BACKGROUND", "SHADOW_ENHANCEMENT", "PRODUCT_STUDIO", "SHOWROOM", "PREMIUM_ROAD", "DARK_STUDIO", "PLATE_BLUR"]
  },
  photoroom: {
    name: "photoroom",
    displayName: "Photoroom",
    description: "Photoroom API integration - disabled",
    enabled: false,
    isLocal: false,
    isPaid: true,
    capabilities: [
      { capability: "background-removal", enabled: false },
      { capability: "classification", enabled: false },
      { capability: "crop-center", enabled: false },
      { capability: "enhancement", enabled: false },
      { capability: "relighting", enabled: false },
      { capability: "shadow-generation", enabled: false },
      { capability: "flat-lay", enabled: false },
      { capability: "lifestyle-scene", enabled: false },
      { capability: "virtual-model", enabled: false },
      { capability: "video-generation", enabled: false }
    ],
    costPerOperation: { operation: "all", estimatedCost: 0.05 },
    supportedWorkflows: ["PRODUCT", "VEHICLE"],
    supportedModes: ["WHITE_BACKGROUND", "SOLID_COLOR_BACKGROUND", "SHADOW_ENHANCEMENT", "PRODUCT_STUDIO", "SHOWROOM", "PREMIUM_ROAD", "DARK_STUDIO", "PLATE_BLUR"]
  },
  fal: {
    name: "fal",
    displayName: "FAL.ai",
    description: "FAL.ai integration - disabled",
    enabled: false,
    isLocal: false,
    isPaid: true,
    capabilities: [
      { capability: "background-removal", enabled: false },
      { capability: "classification", enabled: false },
      { capability: "crop-center", enabled: false },
      { capability: "enhancement", enabled: false },
      { capability: "relighting", enabled: false },
      { capability: "shadow-generation", enabled: false },
      { capability: "flat-lay", enabled: false },
      { capability: "lifestyle-scene", enabled: false },
      { capability: "virtual-model", enabled: false },
      { capability: "video-generation", enabled: false }
    ],
    costPerOperation: { operation: "all", estimatedCost: 0.08 },
    supportedWorkflows: ["PRODUCT", "VEHICLE"],
    supportedModes: ["WHITE_BACKGROUND", "SOLID_COLOR_BACKGROUND", "SHADOW_ENHANCEMENT", "PRODUCT_STUDIO", "SHOWROOM", "PREMIUM_ROAD", "DARK_STUDIO", "PLATE_BLUR"]
  }
};