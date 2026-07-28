import { getModelForCapability, type ModelName } from "./model-selection.matrix";
import type { AIProviderName } from "./provider.interface";

export interface ProviderSelectionRequest {
  hasFaces: boolean;
  isBlackAndWhite: boolean;
  damageSeverity: "LIGHT" | "MEDIUM" | "HEAVY";
  overallQuality: number;
  artifactScore: number;
}

export interface ProviderSelectionResult {
  backgroundRemoval: AIProviderName | null;
  faceRestoration: AIProviderName | null;
  inpainting: AIProviderName | null;
  colorization: AIProviderName | null;
  upscaling: AIProviderName | null;
  pipeline: AIProviderName[];
}

const MODEL_TO_PROVIDER: Record<ModelName, AIProviderName> = {
  "yolov8-seg": "local-yolo",
  "sam2": "gpu-sam2",
  "retinaface": "local-yolo",
  "gfpgan": "local-gfpgan",
  "codeformer": "local-codeformer",
  "lama": "local-lama",
  "ddcolor": "local-ddcolor",
  "real-esrgan": "local-esrgan"
};

export function selectProviders(request: ProviderSelectionRequest): ProviderSelectionResult {
  const result: ProviderSelectionResult = {
    backgroundRemoval: null,
    faceRestoration: null,
    inpainting: null,
    colorization: null,
    upscaling: null,
    pipeline: []
  };

  if (request.hasFaces) {
    const mapping = getModelForCapability("face-restoration");
    if (mapping?.enabled && mapping.preferredModel) {
      result.faceRestoration = MODEL_TO_PROVIDER[mapping.preferredModel] || null;
      result.pipeline.push(result.faceRestoration);
    }
  }

  if (request.damageSeverity !== "LIGHT" || request.artifactScore > 15) {
    const mapping = getModelForCapability("inpainting");
    if (mapping?.enabled) {
      result.inpainting = MODEL_TO_PROVIDER[mapping.preferredModel] || null;
      result.pipeline.push(result.inpainting);
    }
  }

  if (request.isBlackAndWhite) {
    const mapping = getModelForCapability("colorization");
    if (mapping?.enabled) {
      result.colorization = MODEL_TO_PROVIDER[mapping.preferredModel] || null;
      result.pipeline.push(result.colorization);
    }
  }

  if (request.overallQuality < 70) {
    const mapping = getModelForCapability("upscaling");
    if (mapping?.enabled) {
      result.upscaling = MODEL_TO_PROVIDER[mapping.preferredModel] || null;
      result.pipeline.push(result.upscaling);
    }
  }

  return result;
}
