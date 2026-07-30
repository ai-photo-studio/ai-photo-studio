import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { AppConfig } from "../../config/env";
import type { IRestorationProvider, ProviderHealth, ProviderStatus, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";

export class ReplayRestorationProvider implements IRestorationProvider {
  readonly name = "replay";
  readonly type = "internal" as const;
  readonly status: ProviderStatus = "active";

  constructor(private readonly config: AppConfig) {}

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    if (!this.config.restorationReplayMode) throw new Error("Replay provider requires RESTORATION_REPLAY_MODE=true");
    const fixture = this.config.restorationReplayFixture || "ops116-final";
    const fixturePath = path.resolve(process.cwd(), "test", "fixtures", "replay", `${fixture}.jpg`);
    const image = await fs.readFile(fixturePath);
    const metadata = await sharp(image).metadata();
    return {
      image,
      contentType: "image/jpeg",
      fileName: request.fileName,
      providerName: "replay",
      providerVersion: "archived-fixture/1.0.0",
      stages: ["replay"],
      processingTimeMs: 0,
      creditsUsed: 0,
      estimatedCost: 0,
      actualCost: 0,
      actualGPUSeconds: 0,
      actualProviderCharge: 0,
      requestId: `replay-${fixture}`,
      costSource: "calculated",
      model: "replay/fixture",
      modelVersion: fixture,
      inputWidth: metadata.width,
      inputHeight: metadata.height,
      inputSizeBytes: request.image.length,
      outputWidth: metadata.width,
      outputHeight: metadata.height,
      outputSizeBytes: image.length,
      queueTimeMs: 0,
      runningTimeMs: 0,
      retryCount: 0
    };
  }

  async health(): Promise<ProviderHealth> {
    return { status: "active", latency: 0, errorRate: 0, lastChecked: new Date().toISOString() };
  }

  estimateCost(): number { return 0; }
}
