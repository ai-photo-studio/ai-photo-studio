import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import type { AIProviderName, ImageProvider } from "./provider.interface";
import { MockImageProvider } from "./mock.provider";
import { LocalRembgImageProvider } from "./local-rembg.provider";
import { LocalYoloImageProvider } from "./local-yolo.provider";
import { LocalEsrganImageProvider } from "./local-esrgan.provider";
import { LocalIclightImageProvider } from "./local-iclight.provider";

const LOCAL_PROVIDERS: AIProviderName[] = ["mock", "local-rembg", "local-yolo", "local-esrgan", "local-iclight"];

const FUTURE_PROVIDERS: AIProviderName[] = ["future-photoroom", "future-falai", "future-replicate"];

const VALID_PROVIDERS: AIProviderName[] = [...LOCAL_PROVIDERS, ...FUTURE_PROVIDERS, "photoroom", "fal"];

export const resolveProviderName = (config: Pick<AppConfig, "aiProvider">): AIProviderName => {
  const selected = (config.aiProvider || "mock").trim().toLowerCase();
  if (VALID_PROVIDERS.includes(selected as AIProviderName)) {
    return selected as AIProviderName;
  }
  return "mock";
};

export const isProviderEnabled = (providerName: AIProviderName): boolean => {
  if (LOCAL_PROVIDERS.includes(providerName)) return true;
  return false;
};

export const createImageProvider = (config: AppConfig): ImageProvider => {
  const providerName = resolveProviderName(config);

  if (providerName === "photoroom") {
    throw new AppError("Provider photoroom is disabled", 500, "PROVIDER_DISABLED");
  }

  if (providerName === "fal") {
    throw new AppError("Provider fal is disabled", 500, "PROVIDER_DISABLED");
  }

  if (providerName === "future-photoroom") {
    throw new AppError("Provider future-photoroom is disabled", 500, "PROVIDER_DISABLED");
  }

  if (providerName === "future-falai") {
    throw new AppError("Provider future-falai is disabled", 500, "PROVIDER_DISABLED");
  }

  if (providerName === "future-replicate") {
    throw new AppError("Provider future-replicate is disabled", 500, "PROVIDER_DISABLED");
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

  return new MockImageProvider();
};