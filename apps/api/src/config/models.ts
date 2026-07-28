/**
 * Model path configuration.
 * All production model checkpoints are installed under D:\models.
 * This file defines the expected paths — no checkpoints are downloaded
 * during Sprint 1.
 */

import path from "node:path";
import type { ModelName } from "../providers/model-selection.matrix";

const MODELS_ROOT = "D:/models";

export interface ModelPathConfig {
  modelName: ModelName;
  relativePath: string;
  fullPath: string;
  expectedSha256?: string;
}

const MODEL_PATHS: ModelPathConfig[] = [
  { modelName: "yolov8-seg", relativePath: "yolov8/yolov8n-seg.pt", fullPath: path.join(MODELS_ROOT, "yolov8", "yolov8n-seg.pt") },
  { modelName: "sam2", relativePath: "sam2/sam2-hiera-l.pt", fullPath: path.join(MODELS_ROOT, "sam2", "sam2-hiera-l.pt") },
  { modelName: "retinaface", relativePath: "retinaface/retinaface_resnet50.pth", fullPath: path.join(MODELS_ROOT, "retinaface", "retinaface_resnet50.pth") },
  { modelName: "gfpgan", relativePath: "gfpgan/GFPGANv1.4.pth", fullPath: path.join(MODELS_ROOT, "gfpgan", "GFPGANv1.4.pth") },
  { modelName: "codeformer", relativePath: "codeformer/codeformer.pth", fullPath: path.join(MODELS_ROOT, "codeformer", "codeformer.pth") },
  { modelName: "lama", relativePath: "lama/laMa.pth", fullPath: path.join(MODELS_ROOT, "lama", "laMa.pth") },
  { modelName: "ddcolor", relativePath: "ddcolor/ddcolor.pth", fullPath: path.join(MODELS_ROOT, "ddcolor", "ddcolor.pth") },
  { modelName: "real-esrgan", relativePath: "esrgan/RealESRGAN_x4plus.pth", fullPath: path.join(MODELS_ROOT, "esrgan", "RealESRGAN_x4plus.pth") }
];

export function getModelPath(modelName: ModelName): string {
  const entry = MODEL_PATHS.find((m) => m.modelName === modelName);
  if (!entry) {
    throw new Error(`No path configured for model: ${modelName}`);
  }
  return entry.fullPath;
}

export function getAllModelPaths(): ModelPathConfig[] {
  return [...MODEL_PATHS];
}

export { MODELS_ROOT };
