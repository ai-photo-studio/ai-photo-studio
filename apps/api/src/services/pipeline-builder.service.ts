import type { AppConfig } from "../config/env";
import type { DamageDetectionResponse } from "./damage-detection.service";
import type { ImageAnalysisResponse } from "./image-analysis.service";
import { getModelForCapability } from "../providers/model-selection.matrix";
import { getModelSpec } from "../providers/model-selection.matrix";
import type { ModelName } from "../providers/model-selection.matrix";

export interface PipelineBuildRequest {
  imageAnalysis: ImageAnalysisResponse;
  damageAnalysis: DamageDetectionResponse;
  qualityBefore: ImageAnalysisResponse["qualityMetrics"];
  packageTier: "basic" | "premium" | "enterprise";
  hasFaces: boolean;
}

export interface PipelineStep {
  model: string;
  priority: number;
  scale?: number;
  maskKey?: string;
  confidenceThreshold?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface PipelineBuildResponse {
  steps: PipelineStep[];
  skipReason?: string;
  estimatedDurationMs: number;
  estimatedCost: number;
}

const STAGE_TIMEOUTS: Record<string, number> = {
  "retinaface": 30_000,
  "lama": 120_000,
  "gfpgan": 60_000,
  "codeformer": 90_000,
  "ddcolor": 60_000,
  "real-esrgan": 120_000,
  "quality-verification": 30_000
};

const TIER_COST: Record<string, number> = {
  basic: 1,
  premium: 2,
  enterprise: 3
};

const TIER_FACE_MODEL: Record<string, ModelName> = {
  basic: "gfpgan",
  premium: "gfpgan",
  enterprise: "gfpgan"
};

const TIER_MAX_RESOLUTION_MP: Record<string, number> = {
  basic: 2,
  premium: 4,
  enterprise: 8
};

export class PipelineBuilderService {
  constructor(private readonly config: AppConfig) {}

  async buildPipeline(request: PipelineBuildRequest): Promise<PipelineBuildResponse> {
    const steps: PipelineStep[] = [];
    const skipReasons: string[] = [];
    let estimatedDurationMs = 0;
    const tier = request.packageTier;
    const analysis = request.imageAnalysis;
    const damage = request.damageAnalysis;
    const quality = request.qualityBefore;
    const hasFaces = request.hasFaces;
    const isBw = analysis.colorMode === "black_and_white";
    const isDamageLight = damage.damageSeverity === "LIGHT" && damage.coverage < 5;
    const isHighQuality = quality.overallScore > 80;
    const resolutionMp = (analysis.resolution.width * analysis.resolution.height) / 1_000_000;
    const maxMp = TIER_MAX_RESOLUTION_MP[tier];

    const exceedsMaxRes = resolutionMp > maxMp;

    if (isHighQuality && isDamageLight) {
      skipReasons.push("R1: Image quality > 80 AND damage < 5% — skip analysis stages");
    }

    if (!hasFaces) {
      skipReasons.push("R2: No faces detected — skip face restoration");
    }

    if (!isBw) {
      skipReasons.push("R3: Color image — skip colorization");
    }

    if (isDamageLight) {
      skipReasons.push("R4: Damage severity = LIGHT — skip LaMa inpainting");
    }

    const inpaintMapping = getModelForCapability("inpainting");
    if (inpaintMapping?.enabled && !isDamageLight) {
      const inpaintSpec = getModelSpec(inpaintMapping.preferredModel);
      steps.push({
        model: inpaintMapping.preferredModel,
        priority: 1,
        maskKey: damage.maskStorageKey || undefined,
        maxRetries: 3,
        timeoutMs: STAGE_TIMEOUTS.lama
      });
      estimatedDurationMs += STAGE_TIMEOUTS.lama;
    }

    if (hasFaces && !exceedsMaxRes) {
      const faceModel = TIER_FACE_MODEL[tier];
      const faceMapping = getModelForCapability("face-restoration");

      if (faceMapping?.enabled && faceModel) {
        steps.push({
          model: faceModel,
          priority: 2,
          confidenceThreshold: 0.5,
          maxRetries: tier === "enterprise" ? 2 : 0,
          timeoutMs: STAGE_TIMEOUTS[faceModel] || 60_000
        });
        estimatedDurationMs += STAGE_TIMEOUTS[faceModel] || 60_000;

        if (tier === "basic" && faceMapping.fallbackModel) {
          skipReasons.push("R5: Package tier = basic — skip face restoration fallback");
        }
      }
    } else if (hasFaces && exceedsMaxRes) {
      skipReasons.push(`Resolution ${resolutionMp.toFixed(1)}MP exceeds ${maxMp}MP limit for ${tier} tier`);
    }

    if (isBw) {
      const colorMapping = getModelForCapability("colorization");
      if (colorMapping?.enabled) {
        steps.push({
          model: colorMapping.preferredModel,
          priority: 3,
          timeoutMs: STAGE_TIMEOUTS.ddcolor
        });
        estimatedDurationMs += STAGE_TIMEOUTS.ddcolor;
      }
    }

    if (quality.overallScore < 70) {
      const upscaleMapping = getModelForCapability("upscaling");
      if (upscaleMapping?.enabled) {
        steps.push({
          model: upscaleMapping.preferredModel,
          priority: 4,
          scale: 4,
          timeoutMs: STAGE_TIMEOUTS["real-esrgan"]
        });
        estimatedDurationMs += STAGE_TIMEOUTS["real-esrgan"];
      }
    }

    // Quality verification
    estimatedDurationMs += STAGE_TIMEOUTS["quality-verification"];

    if (steps.length === 0) {
      skipReasons.push("All stages skipped based on analysis — image may already be high quality");
    }

    steps.sort((a, b) => a.priority - b.priority);

    const estimatedCost = TIER_COST[tier];

    return {
      steps,
      skipReason: skipReasons.length > 0 ? skipReasons.join("; ") : undefined,
      estimatedDurationMs,
      estimatedCost
    };
  }
}
