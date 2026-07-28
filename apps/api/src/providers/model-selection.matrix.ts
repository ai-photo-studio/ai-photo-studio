/**
 * Model selection configuration — Sprint 1 skeleton.
 * Maps AI capabilities to specific models for pipeline selection.
 * No existing providers are modified; this is an extension of the
 * provider abstraction layer.
 */

export type ModelName =
  | "yolov8-seg"
  | "sam2"
  | "retinaface"
  | "gfpgan"
  | "codeformer"
  | "lama"
  | "ddcolor"
  | "real-esrgan";

export interface ModelSpec {
  name: ModelName;
  displayName: string;
  repository: string;
  checkpoint: string;
  version: string;
  vramGb: number;
  supportsCpu: boolean;
  supportsGpu: boolean;
  license: string;
}

export interface ModelCapabilityMapping {
  capability: string;
  preferredModel: ModelName;
  fallbackModel?: ModelName;
  enabled: boolean;
}

const MODEL_SPECS: Record<ModelName, ModelSpec> = {
  "yolov8-seg": {
    name: "yolov8-seg",
    displayName: "YOLOv8-seg",
    repository: "Ultralytics",
    checkpoint: "yolov8n-seg.pt",
    version: "8.0.0",
    vramGb: 2,
    supportsCpu: true,
    supportsGpu: true,
    license: "GPL-3.0"
  },
  sam2: {
    name: "sam2",
    displayName: "SAM2",
    repository: "Meta",
    checkpoint: "sam2-hiera-l.pt",
    version: "1.0",
    vramGb: 4,
    supportsCpu: true,
    supportsGpu: true,
    license: "Apache-2.0"
  },
  retinaface: {
    name: "retinaface",
    displayName: "RetinaFace",
    repository: "deepinsight",
    checkpoint: "retinaface_resnet50.pth",
    version: "0.0.1",
    vramGb: 2,
    supportsCpu: true,
    supportsGpu: true,
    license: "MIT"
  },
  gfpgan: {
    name: "gfpgan",
    displayName: "GFPGAN",
    repository: "TencentARC",
    checkpoint: "GFPGANv1.4.pth",
    version: "1.3.8",
    vramGb: 2,
    supportsCpu: true,
    supportsGpu: true,
    license: "Apache-2.0"
  },
  codeformer: {
    name: "codeformer",
    displayName: "CodeFormer",
    repository: "WuSonJie",
    checkpoint: "codeformer.pth",
    version: "1.0",
    vramGb: 2,
    supportsCpu: true,
    supportsGpu: true,
    license: "NTU S-Lab"
  },
  lama: {
    name: "lama",
    displayName: "LaMa",
    repository: "saic-mdal",
    checkpoint: "laMa.pth",
    version: "1.0",
    vramGb: 2,
    supportsCpu: true,
    supportsGpu: true,
    license: "MIT"
  },
  ddcolor: {
    name: "ddcolor",
    displayName: "DDColor",
    repository: "Alibaba",
    checkpoint: "ddcolor.pth",
    version: "1.0",
    vramGb: 2,
    supportsCpu: true,
    supportsGpu: true,
    license: "Apache-2.0"
  },
  "real-esrgan": {
    name: "real-esrgan",
    displayName: "Real-ESRGAN",
    repository: "xinntao",
    checkpoint: "RealESRGAN_x4plus.pth",
    version: "1.0",
    vramGb: 2,
    supportsCpu: true,
    supportsGpu: true,
    license: "BSD-3-Clause"
  }
};

const CAPABILITY_MAPPING: ModelCapabilityMapping[] = [
  { capability: "background-removal", preferredModel: "yolov8-seg", fallbackModel: "sam2", enabled: true },
  { capability: "face-detection", preferredModel: "retinaface", enabled: true },
  { capability: "face-restoration", preferredModel: "gfpgan", enabled: true },
  { capability: "inpainting", preferredModel: "lama", enabled: true },
  { capability: "colorization", preferredModel: "ddcolor", enabled: true },
  { capability: "upscaling", preferredModel: "real-esrgan", enabled: true }
];

export function getModelSpec(modelName: ModelName): ModelSpec {
  const spec = MODEL_SPECS[modelName];
  if (!spec) {
    throw new Error(`Unknown model: ${modelName}`);
  }
  return spec;
}

export function getModelForCapability(capability: string): ModelCapabilityMapping | undefined {
  return CAPABILITY_MAPPING.find((m) => m.capability === capability);
}

export function getAllModelSpecs(): ModelSpec[] {
  return Object.values(MODEL_SPECS);
}
