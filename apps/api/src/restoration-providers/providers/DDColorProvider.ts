import { BaseReplicateProvider, type ModelConfig } from "./BaseReplicateProvider";
import type { RestorationRequest } from "../interfaces/IRestorationProvider";

/**
 * DDColor by piddnad
 * Towards Photo-Realistic Image Colorization via Dual Decoders.
 * https://replicate.com/piddnad/ddcolor
 */
export class DDColorProvider extends BaseReplicateProvider {
  readonly name = "ddcolor";
  readonly description = "colorization";

  protected readonly modelConfig: ModelConfig = {
    owner: "piddnad",
    name: "ddcolor",
    version: "ca494ba129e44e45f661d6ece83c4c98a9a7c774309beca01429b58fce8aa695",
    inputFields: {
      image: "Grayscale input image.",
      model_size: "Choose the model size (large or small).",
    },
  };

  // Cost per GPU second (L40S GPU)  
  protected readonly costPerGpuSecond = 0.0023;
  // Official model page: ~$0.00098 per run, ~1 second runtime  
  protected readonly estimatedCostPerRun = 0.001;

  buildInput(request: RestorationRequest): Record<string, unknown> {
    const base64Image = request.image.toString("base64");
    return {
      image: `data:${request.contentType || "image/png"};base64,${base64Image}`,
      model_size: "large",
    };
  }
}
