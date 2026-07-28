import type { ReplicatePredictionRequest, ReplicateProviderContract } from "./types";

export interface ReplicateRequestBuilderOptions {
  readonly contentType: string;
  readonly fileName: string;
  readonly imageBuffer: Buffer;
  readonly request: import("../interfaces/IRestorationProvider").RestorationRequest;
}

export const buildReplicateImageDataUri = (contentType: string, imageBuffer: Buffer): string =>
  `data:${contentType || "image/png"};base64,${imageBuffer.toString("base64")}`;

export const buildReplicatePredictionRequest = (
  provider: Pick<ReplicateProviderContract, "modelSlug" | "modelVersion">,
  options: ReplicateRequestBuilderOptions,
): ReplicatePredictionRequest => {
  const imageDataUri = buildReplicateImageDataUri(options.contentType, options.imageBuffer);

  return {
    request: options.request,
    imageDataUri,
    modelInput: {
      image: imageDataUri,
      upscale: options.request.options?.upscaleScale || 1,
    },
    cancelAfter: "120s",
    waitSeconds: 60,
    metadata: {
      modelSlug: provider.modelSlug,
      modelVersion: provider.modelVersion || "Verification Required",
      fileName: options.fileName,
    },
  };
};

