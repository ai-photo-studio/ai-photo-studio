import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import type { AIProviderName, ImageProvider } from "./provider.interface";
import { MockImageProvider } from "./mock.provider";
import { PhotoroomImageProvider } from "./photoroom.provider";
import { FalImageProvider } from "./fal.provider";

const toProviderName = (value: string): AIProviderName => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "photoroom" || normalized === "fal") return normalized;
  return "mock";
};

export const resolveProviderName = (config: Pick<AppConfig, "aiProvider">): AIProviderName => config.aiProvider;

export const createImageProvider = (config: AppConfig): ImageProvider => {
  const providerName = resolveProviderName(config);

  if (providerName === "photoroom") {
    return new PhotoroomImageProvider(config.PHOTOROOM_API_KEY || config.AI_PROVIDER_API_KEY);
  }

  if (providerName === "fal") {
    return new FalImageProvider(config.FAL_API_KEY || config.AI_PROVIDER_API_KEY);
  }

  if (providerName === "mock") {
    return new MockImageProvider();
  }

  throw new AppError(`Unsupported AI provider: ${toProviderName(providerName)}`, 500, "AI_PROVIDER_UNSUPPORTED");
};
