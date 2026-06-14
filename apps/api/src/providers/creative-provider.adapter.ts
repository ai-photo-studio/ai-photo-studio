import type { ProviderHealth, ProviderCostEstimate } from "./provider.interface";

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