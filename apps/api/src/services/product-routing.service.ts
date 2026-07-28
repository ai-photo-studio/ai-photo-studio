import type { ProductCategory, ProductPipelineRoute, ProductWorkflowMode, VehicleWorkflowMode, WorkflowType } from "../providers/provider.interface";
import type { ProductClassificationResult } from "./product-classifier.service";

type CategoryRouteConfig = {
  processingProfile: ProductPipelineRoute["processingProfile"];
  workflowType: WorkflowType;
  workflowMode: ProductWorkflowMode | VehicleWorkflowMode;
  pipelineUsed: string;
  marginPct: number;
  canvasWidth: number;
  canvasHeight: number;
  enhancementScale: number;
  enhancementSharpen: number;
  enhancementDenoise: number;
  note?: string;
};

const DEFAULT_PROFILE: CategoryRouteConfig = {
  processingProfile: "general-studio",
  workflowType: "PRODUCT",
  workflowMode: "PRODUCT_STUDIO",
  pipelineUsed: "general-product",
  marginPct: 0.14,
  canvasWidth: 1024,
  canvasHeight: 1024,
  enhancementScale: 2,
  enhancementSharpen: 0.55,
  enhancementDenoise: 0.3
};

const ROUTES: Record<ProductCategory, CategoryRouteConfig> = {
  perfume: {
    processingProfile: "luxury-shadow",
    workflowType: "PRODUCT",
    workflowMode: "SHADOW_ENHANCEMENT",
    pipelineUsed: "perfume-luxury-shadow",
    marginPct: 0.12,
    canvasWidth: 1024,
    canvasHeight: 1024,
    enhancementScale: 2,
    enhancementSharpen: 0.62,
    enhancementDenoise: 0.22
  },
  cosmetics: {
    processingProfile: "beauty-finish",
    workflowType: "PRODUCT",
    workflowMode: "WHITE_BACKGROUND",
    pipelineUsed: "cosmetics-beauty-finish",
    marginPct: 0.1,
    canvasWidth: 1024,
    canvasHeight: 1024,
    enhancementScale: 2,
    enhancementSharpen: 0.58,
    enhancementDenoise: 0.2
  },
  shoes: {
    processingProfile: "shoe-catalog",
    workflowType: "PRODUCT",
    workflowMode: "SHADOW_ENHANCEMENT",
    pipelineUsed: "shoes-catalog",
    marginPct: 0.16,
    canvasWidth: 1152,
    canvasHeight: 1024,
    enhancementScale: 2,
    enhancementSharpen: 0.5,
    enhancementDenoise: 0.24
  },
  fashion: {
    processingProfile: "fashion-studio",
    workflowType: "PRODUCT",
    workflowMode: "PRODUCT_STUDIO",
    pipelineUsed: "fashion-studio",
    marginPct: 0.13,
    canvasWidth: 1024,
    canvasHeight: 1280,
    enhancementScale: 2,
    enhancementSharpen: 0.54,
    enhancementDenoise: 0.26
  },
  furniture: {
    processingProfile: "room-frame",
    workflowType: "PRODUCT",
    workflowMode: "PRODUCT_STUDIO",
    pipelineUsed: "furniture-room-frame",
    marginPct: 0.24,
    canvasWidth: 1400,
    canvasHeight: 1100,
    enhancementScale: 1.8,
    enhancementSharpen: 0.42,
    enhancementDenoise: 0.34
  },
  electronics: {
    processingProfile: "tech-catalog",
    workflowType: "PRODUCT",
    workflowMode: "WHITE_BACKGROUND",
    pipelineUsed: "electronics-tech-catalog",
    marginPct: 0.12,
    canvasWidth: 1024,
    canvasHeight: 1024,
    enhancementScale: 2,
    enhancementSharpen: 0.56,
    enhancementDenoise: 0.28
  },
  food: {
    processingProfile: "freshness",
    workflowType: "PRODUCT",
    workflowMode: "SHADOW_ENHANCEMENT",
    pipelineUsed: "food-freshness",
    marginPct: 0.09,
    canvasWidth: 1024,
    canvasHeight: 1024,
    enhancementScale: 2,
    enhancementSharpen: 0.48,
    enhancementDenoise: 0.18
  },
  jewelry: {
    processingProfile: "jewelry-focus",
    workflowType: "PRODUCT",
    workflowMode: "WHITE_BACKGROUND",
    pipelineUsed: "jewelry-focus",
    marginPct: 0.08,
    canvasWidth: 1024,
    canvasHeight: 1024,
    enhancementScale: 2,
    enhancementSharpen: 0.6,
    enhancementDenoise: 0.2
  },
  watch: {
    processingProfile: "watch-focus",
    workflowType: "PRODUCT",
    workflowMode: "WHITE_BACKGROUND",
    pipelineUsed: "watch-focus",
    marginPct: 0.08,
    canvasWidth: 1024,
    canvasHeight: 1024,
    enhancementScale: 2,
    enhancementSharpen: 0.58,
    enhancementDenoise: 0.2
  },
  handbag: {
    processingProfile: "handbag-focus",
    workflowType: "PRODUCT",
    workflowMode: "SHADOW_ENHANCEMENT",
    pipelineUsed: "handbag-focus",
    marginPct: 0.15,
    canvasWidth: 1024,
    canvasHeight: 1024,
    enhancementScale: 2,
    enhancementSharpen: 0.54,
    enhancementDenoise: 0.26
  },
  "human-model": {
    processingProfile: "portrait-separate",
    workflowType: "PRODUCT",
    workflowMode: "PRODUCT_STUDIO",
    pipelineUsed: "human-model-separate",
    marginPct: 0.18,
    canvasWidth: 1024,
    canvasHeight: 1280,
    enhancementScale: 2,
    enhancementSharpen: 0.4,
    enhancementDenoise: 0.22,
    note: "separate handling for future model/portrait-specific flow"
  },
  vehicle: {
    processingProfile: "vehicle-showroom",
    workflowType: "VEHICLE",
    workflowMode: "SHOWROOM",
    pipelineUsed: "vehicle-showroom",
    marginPct: 0.16,
    canvasWidth: 1280,
    canvasHeight: 960,
    enhancementScale: 2,
    enhancementSharpen: 0.5,
    enhancementDenoise: 0.24
  },
  "general-product": DEFAULT_PROFILE
};

export const resolveProductPipelineRoute = (
  classification: ProductClassificationResult
): ProductPipelineRoute => {
  const route = ROUTES[classification.category] || DEFAULT_PROFILE;

  return {
    category: classification.category,
    confidence: classification.confidence,
    processingProfile: route.processingProfile,
    pipelineUsed: route.pipelineUsed,
    marginPct: route.marginPct,
    canvasWidth: route.canvasWidth,
    canvasHeight: route.canvasHeight,
    enhancementScale: route.enhancementScale,
    enhancementSharpen: route.enhancementSharpen,
    enhancementDenoise: route.enhancementDenoise,
    workflowType: route.workflowType,
    workflowMode: route.workflowMode,
    note: route.note
  };
};
