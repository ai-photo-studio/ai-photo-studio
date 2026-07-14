import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import type { AIProviderName, ImageProvider } from "./provider.interface";
import { MockImageProvider } from "./mock.provider";
import { LocalRembgImageProvider } from "./local-rembg.provider";
import { LocalYoloImageProvider } from "./local-yolo.provider";
import { LocalEsrganImageProvider } from "./local-esrgan.provider";
import { LocalIclightImageProvider } from "./local-iclight.provider";
import { GPUSAM2ImageProvider } from "./gpu-sam2.provider";
import { LocalLamaImageProvider } from "./local-lama.provider";
import { LocalGfpganImageProvider } from "./local-gfpgan.provider";
import { LocalCodeformerImageProvider } from "./local-codeformer.provider";
import { LocalDdcolorImageProvider } from "./local-ddcolor.provider";

const LOCAL_PROVIDERS: AIProviderName[] = [
  "mock", "local-rembg", "local-yolo", "local-esrgan", "local-iclight",
  "gpu-sam2", "local-lama", "local-gfpgan", "local-codeformer", "local-ddcolor"
];

const DEPRECATED_PROVIDERS: AIProviderName[] = ["photoroom", "fal", "future-photoroom", "future-falai", "future-replicate"];

export const resolveProviderName = (config: Pick<AppConfig, "aiProvider">): AIProviderName => {
  const selected = (config.aiProvider || "").trim().toLowerCase();
  if (!selected) {
    throw new AppError(
      "AI_PROVIDER environment variable must be set. Valid values: mock, local-rembg, local-yolo, local-esrgan, local-iclight, gpu-sam2, local-lama, local-gfpgan, local-codeformer, local-ddcolor",
      500,
      "AI_PROVIDER_NOT_SET"
    );
  }
  if (LOCAL_PROVIDERS.includes(selected as AIProviderName)) {
    return selected as AIProviderName;
  }
  throw new AppError(
    `Invalid AI_PROVIDER: ${selected}. Valid values: mock, local-rembg, local-yolo, local-esrgan, local-iclight, gpu-sam2, local-lama, local-gfpgan, local-codeformer, local-ddcolor`,
    500,
    "INVALID_AI_PROVIDER"
  );
};

export const isProviderEnabled = (providerName: AIProviderName): boolean => {
  if (LOCAL_PROVIDERS.includes(providerName)) return true;
  return false;
};

export const getFallbackProvider = (primaryProvider: AIProviderName): AIProviderName => {
  if (!isProviderEnabled(primaryProvider)) return "local-yolo";
  return primaryProvider;
};

export const getProviderChain = (config: AppConfig): AIProviderName[] => {
  const primary = resolveProviderName(config);
  const selected = isProviderEnabled(primary) ? primary : "local-yolo";
  const chain: AIProviderName[] = [];

  for (const providerName of [selected, "local-yolo", "local-rembg", "local-esrgan", "local-iclight", "gpu-sam2", "mock"] as AIProviderName[]) {
    if (!chain.includes(providerName) && isProviderEnabled(providerName)) {
      chain.push(providerName);
    }
  }

  return chain;
};

export const getProviderSelection = (config: AppConfig): {
  primaryProvider: AIProviderName;
  activeProvider: AIProviderName;
  fallbackProvider: AIProviderName;
  providerChain: AIProviderName[];
  paidProviderDisabled: boolean;
} => {
  const primaryProvider = resolveProviderName(config);
  const activeProvider = isProviderEnabled(primaryProvider) ? primaryProvider : "local-yolo";
  const fallbackProvider = getFallbackProvider(primaryProvider);
  return {
    primaryProvider,
    activeProvider,
    fallbackProvider,
    providerChain: getProviderChain(config),
    paidProviderDisabled: !isProviderEnabled(primaryProvider)
  };
};

export const createImageProvider = (config: AppConfig): ImageProvider => {
  const providerName = resolveProviderName(config);

  for (const deprecated of DEPRECATED_PROVIDERS) {
    if (providerName === deprecated) {
      throw new AppError(`Provider ${deprecated} is disabled (deprecated for MVP)`, 500, "PROVIDER_DISABLED");
    }
  }

  if (providerName === "local-yolo") {
    return new LocalYoloImageProvider(config);
  }

  if (providerName === "local-rembg") {
    return new LocalRembgImageProvider(config);
  }

  if (providerName === "local-esrgan") {
    return new LocalEsrganImageProvider(config);
  }

  if (providerName === "local-iclight") {
    return new LocalIclightImageProvider(config);
  }

  if (providerName === "gpu-sam2") {
    return new GPUSAM2ImageProvider(config);
  }

  if (providerName === "local-lama") {
    return new LocalLamaImageProvider(config);
  }

  if (providerName === "local-gfpgan") {
    return new LocalGfpganImageProvider(config);
  }

  if (providerName === "local-codeformer") {
    return new LocalCodeformerImageProvider(config);
  }

  if (providerName === "local-ddcolor") {
    return new LocalDdcolorImageProvider(config);
  }

  return new MockImageProvider();
};
