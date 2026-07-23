import { BaseReplicateProvider, type ModelConfig } from "./BaseReplicateProvider";
import type { RestorationRequest } from "../interfaces/IRestorationProvider";

/**
 * Microsoft Bringing Old Photos Back to Life
 * https://replicate.com/microsoft/bringing-old-photos-back-to-life
 */
export class MicrosoftBringOldPhotosProvider extends BaseReplicateProvider {
  readonly name = "microsoft-bring-old-photos";
  readonly description = "restoration";

  protected readonly modelConfig: ModelConfig = {
    owner: "microsoft",
    name: "bringing-old-photos-back-to-life",
    version: "c75db81db6cbd809d93cc3b7e7a088a351a3349c9fa02b6d393e35e0d51ba799",
    inputFields: {
      image: "Input image to restore.",
    },
  };

  // Cost per GPU second (L40S GPU)
  protected readonly costPerGpuSecond = 0.0023;
  // Estimated cost per run (~5-10 seconds on L40S)
  protected readonly estimatedCostPerRun = 0.015;

  buildInput(request: RestorationRequest): Record<string, unknown> {
    const base64Image = request.image.toString("base64");
    return {
      image: `data:${request.contentType || "image/png"};base64,${base64Image}`,
    };
  }
}