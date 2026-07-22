import type { AppConfig } from "../../config/env";
import type { IRestorationProvider, PackageTier } from "../interfaces/IRestorationProvider";
import { RunPodProvider } from "../providers/RunPodProvider";
import { MockProvider } from "../providers/MockProvider";
import { OpenAIProvider } from "../providers/OpenAIProvider";
import { FalAiProvider } from "../providers/FalAiProvider";
import { ReplicateProvider } from "../providers/ReplicateProvider";

export class ProviderFactory {
  private readonly config: AppConfig;
  private readonly providers: Map<string, IRestorationProvider> = new Map();

  constructor(config: AppConfig) {
    this.config = config;
  }

  create(name: string): IRestorationProvider {
    if (this.providers.has(name)) {
      return this.providers.get(name)!;
    }

    let provider: IRestorationProvider;

    switch (name) {
      case "runpod":
        provider = new RunPodProvider(this.config);
        break;
      case "mock":
        provider = new MockProvider();
        break;
      case "openai":
        provider = new OpenAIProvider(this.config);
        break;
      case "fal-ai":
        provider = new FalAiProvider(this.config.FAL_AI_API_KEY);
        break;
      case "replicate":
        provider = new ReplicateProvider(this.config.REPLICATE_API_TOKEN);
        break;
      default:
        throw new Error(`Unknown provider: ${name}`);
    }

    this.providers.set(name, provider);
    return provider;
  }

  createForPackage(tier: PackageTier): { primary: IRestorationProvider; fallback: IRestorationProvider | null } {
    const mapping: Record<PackageTier, { primary: string; fallback: string | null }> = {
      preview: { primary: "runpod", fallback: null },
      basic: { primary: "runpod", fallback: null },
      premium: { primary: "openai", fallback: "fal-ai" },
      print: { primary: "openai", fallback: "fal-ai" },
      archive: { primary: "runpod", fallback: null },
    };

    const config = mapping[tier];
    const primary = this.create(config.primary);
    const fallback = config.fallback ? this.create(config.fallback) : null;

    return { primary, fallback };
  }

  getAvailableProviders(): string[] {
    return ["runpod", "mock", "openai", "fal-ai", "replicate"];
  }
}
