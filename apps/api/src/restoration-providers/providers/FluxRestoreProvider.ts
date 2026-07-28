import { BaseReplicateProvider, type ModelConfig } from "./BaseReplicateProvider";
import type { RestorationRequest } from "../interfaces/IRestorationProvider";

/**
 * FLUX Restore by flux-kontext-apps
 * Uses FLUX Kontext [pro] to restore old photos, fix scratches and damage, and colorize.
 * https://replicate.com/flux-kontext-apps/restore-image
 */
export class FluxRestoreProvider extends BaseReplicateProvider {
  readonly name = "flux-restore";
  readonly description = "flux-restore";

  protected readonly modelConfig: ModelConfig = {
    owner: "flux-kontext-apps",
    name: "restore-image",
    version: "85ae46551612b8f778348846b6ce1ce1b340e384fe2062399c0c412be29e107d",
    inputFields: {
      input_image: "Image to restore. Must be jpeg, png, gif, or webp.",
    },
  };

  // Cost per GPU second for FLUX Kontext models (L40S GPU)
  protected readonly costPerGpuSecond = 0.0023;
  // Estimated cost per run based on model page (~3-5 seconds on L40S)
  protected readonly estimatedCostPerRun = 0.009;

  buildInput(request: RestorationRequest): Record<string, unknown> {
    const base64Image = request.image.toString("base64");
    return {
      input_image: `data:${request.contentType || "image/png"};base64,${base64Image}`,
      output_format: "png",
      safety_tolerance: 2,
    };
  }
}
