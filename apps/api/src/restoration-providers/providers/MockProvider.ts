import { randomUUID } from "node:crypto";
import type { IRestorationProvider, ProviderHealth, ProviderStatus, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";

export class MockProvider implements IRestorationProvider {
  readonly name = "mock";
  readonly type = "internal" as const;
  status: ProviderStatus = "active";

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    const startTime = Date.now();

    return {
      image: Buffer.from(request.image),
      contentType: request.contentType,
      fileName: request.fileName,
      providerName: this.name,
      providerVersion: "1.0.0-mock",
      stages: ["mock-restoration"],
      processingTimeMs: Date.now() - startTime,
      creditsUsed: 0,
      estimatedCost: 0,
    };
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: "active",
      latency: 0,
      errorRate: 0,
      lastChecked: new Date().toISOString(),
    };
  }

  estimateCost(_request: RestorationRequest): number {
    return 0;
  }
}
