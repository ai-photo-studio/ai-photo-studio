import { BaseReplicateProvider, type ModelConfig } from "./BaseReplicateProvider";
import type { RestorationRequest } from "../interfaces/IRestorationProvider";

/**
 * GFPGAN by TencentARC
 * Practical face restoration algorithm for old photos or AI-generated faces.
 * https://replicate.com/tencentarc/gfpgan
 */
export class GFPGANProvider extends BaseReplicateProvider {
  readonly name = "gfpgan";
  readonly description = "face-restoration";

  protected readonly modelConfig: ModelConfig = {
    owner: "tencentarc",
    name: "gfpgan",
    version: "0fbacf7afc6c144e5be9767cff80f25aff23e52b0708f17e20f9879b2f21516c",
    inputFields: {
      img: "Input image",
      version: "GFPGAN version. v1.3: better quality. v1.4: more details and better identity.",
      scale: "Rescaling factor",
    },
  };

  // Cost per GPU second (L40S GPU)
  protected readonly costPerGpuSecond = 0.0023;
  // Estimated cost per run (~2-3 seconds on L40S)
  protected readonly estimatedCostPerRun = 0.005;

  buildInput(request: RestorationRequest): Record<string, unknown> {
    const base64Image = request.image.toString("base64");
    return {
      img: `data:${request.contentType || "image/png"};base64,${base64Image}`,
      version: "v1.4",
      scale: request.options?.upscaleScale || 2,
    };
  }
}
