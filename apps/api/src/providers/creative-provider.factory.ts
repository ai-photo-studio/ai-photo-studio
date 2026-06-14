import type { AppConfig } from "../config/env";
import type { CreativeProviderAdapter } from "./creative-provider.adapter";
import { MockCreativeProvider } from "./mock-creative-provider.adapter";

export class CreativeProviderFactory {
  constructor(private readonly config: AppConfig) {}

  create(providerName: string): CreativeProviderAdapter {
    const providers: Record<string, CreativeProviderAdapter> = {
      mock: new MockCreativeProvider(),
      photoroom: new MockCreativeProvider(),
      fal: new MockCreativeProvider(),
      replicate: new MockCreativeProvider()
    };
    return providers[providerName.toLowerCase()] || new MockCreativeProvider();
  }

  getEnabledProviders(): string[] {
    return ["mock"];
  }
}