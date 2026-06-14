import type { AppConfig } from "../config/env";
import type { ProviderHealth, ProviderCostEstimate } from "./provider.interface";
import { logger } from "../utils/logger";

export interface CreativeProviderAdapter {
  readonly name: string;
  readonly isEnabled: boolean;
  checkHealth(): Promise<ProviderHealth>;
  estimateCost(operation: string): Promise<ProviderCostEstimate>;
  generateFlatLay(input: { body: Buffer; background: string }): Promise<{ body: Buffer }>;
  generateLifestyleScene(input: { body: Buffer; sceneType: string }): Promise<{ body: Buffer }>;
  generateVirtualModel(input: { body: Buffer; template: string }): Promise<{ body: Buffer }>;
  generateVideo(input: { body: Buffer; template: string }): Promise<{ body: Buffer }>;
}

export class MockCreativeProvider implements CreativeProviderAdapter {
  readonly name = "mock";
  readonly isEnabled = true;

  async checkHealth(): Promise<ProviderHealth> {
    return { healthy: true, status: "ok", latencyMs: 0 };
  }

  async estimateCost(operation: string): Promise<ProviderCostEstimate> {
    return { estimatedCost: 0, currency: "credits" };
  }

  async generateFlatLay(input: { body: Buffer; background: string }): Promise<{ body: Buffer }> {
    return { body: input.body };
  }

  async generateLifestyleScene(input: { body: Buffer; sceneType: string }): Promise<{ body: Buffer }> {
    return { body: input.body };
  }

  async generateVirtualModel(input: { body: Buffer; template: string }): Promise<{ body: Buffer }> {
    return { body: input.body };
  }

  async generateVideo(input: { body: Buffer; template: string }): Promise<{ body: Buffer }> {
    return { body: input.body };
  }
}