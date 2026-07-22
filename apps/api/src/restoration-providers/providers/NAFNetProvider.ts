import { BaseReplicateProvider, type ModelConfig } from "./BaseReplicateProvider";
import type { RestorationRequest } from "../interfaces/IRestorationProvider";

/**
 * NAFNet by megvii-research
 * Nonlinear Activation Free Network for Image Restoration (denoising, deblurring, inpainting).
 * https://replicate.com/megvii-research/nafnet
 */
export class NAFNetProvider extends BaseReplicateProvider {
  readonly name = "nafnet";
  readonly description = "denoising-deblurring";

  protected readonly modelConfig: ModelConfig = {
    owner: "megvii-research",
    name: "nafnet",
    version: "018241a6c880319404eaa2714b764313e27e11f950a7ff0a7b5b37b27b74dcf7",
    inputFields: {
      task_type: "Choose task type: Image Denoising (REDS), Image Debluring (REDS), etc.",
      image: "Input image.",
    },
  };

  // Cost per GPU second (L40S GPU)
  protected readonly costPerGpuSecond = 0.0023;
  // Estimated cost per run (~1-2 seconds on L40S)
  protected readonly estimatedCostPerRun = 0.003;

  buildInput(request: RestorationRequest): Record<string, unknown> {
    const base64Image = request.image.toString("base64");
    return {
      image: `data:${request.contentType || "image/png"};base64,${base64Image}`,
      task_type: "Image Denoising (REDS)",
    };
  }
}
