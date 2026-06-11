import type { AppConfig } from "../config/env";
import { logger } from "../utils/logger";

export interface AiProvider {
  removeBackground(input: string): Promise<string>;
  applyWhiteBackground(input: string): Promise<string>;
  resizeImage(input: string): Promise<string>;
  applyStaticTemplate(input: string): Promise<string>;
  createWatermarkedPreview(input: string): Promise<string>;
}

class MockAiProvider implements AiProvider {
  async removeBackground(input: string): Promise<string> {
    return `${input}-bg-removed`;
  }
  async applyWhiteBackground(input: string): Promise<string> {
    return `${input}-white-bg`;
  }
  async resizeImage(input: string): Promise<string> {
    return `${input}-resized`;
  }
  async applyStaticTemplate(input: string): Promise<string> {
    return `${input}-template`;
  }
  async createWatermarkedPreview(input: string): Promise<string> {
    return `${input}-preview`;
  }
}

export class AiProviderService {
  private readonly provider: AiProvider;
  private readonly dryRun: boolean;

  constructor(private readonly config: AppConfig) {
    this.dryRun = !config.AI_PROVIDER_API_KEY || config.AI_PROVIDER_API_KEY === "replace_me";
    this.provider = new MockAiProvider();
    if (this.dryRun) logger.info("AI provider running in dry-run mode");
  }

  async processForPackage(packageCode: string, inputKey: string): Promise<{ outputKey: string; previewKey?: string }> {
    const code = packageCode.toUpperCase();
    let output = await this.provider.removeBackground(inputKey);

    if (code === "BASIC_PACK" || code === "STARTER") {
      output = await this.provider.applyWhiteBackground(output);
      return { outputKey: output };
    }
    if (code === "SELLER_READY" || code === "PRO") {
      output = await this.provider.applyWhiteBackground(output);
      output = await this.provider.resizeImage(output);
      return { outputKey: `${output}-bright` };
    }
    if (code === "PREMIUM_LAUNCH" || code === "BUSINESS" || code === "DEALER") {
      output = await this.provider.applyStaticTemplate(output);
      output = await this.provider.resizeImage(output);
      return { outputKey: `${output}-bright` };
    }

    const preview = await this.provider.createWatermarkedPreview(output);
    return { outputKey: output, previewKey: preview };
  }
}
