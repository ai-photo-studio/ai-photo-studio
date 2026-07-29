import sharp from "sharp";
import type { IRestorationProvider, ProviderHealth, ProviderStatus, RestorationRequest, RestorationResult } from "../interfaces/IRestorationProvider";
import { logger } from "../../utils/logger";

const DRY_RUN_MARKER = "DRY RUN";

const fallbackFixtureImage = async (): Promise<Buffer> => {
  const image = sharp({
    create: {
      width: 1024,
      height: 768,
      channels: 3,
      background: { r: 235, g: 235, b: 235 }
    }
  });

  return image
    .composite([
      {
        input: Buffer.from(
          `<svg width="1024" height="768" xmlns="http://www.w3.org/2000/svg">
            <rect width="1024" height="768" fill="#ebebeb"/>
            <text x="50%" y="48%" dominant-baseline="middle" text-anchor="middle" font-size="64" font-family="Arial" fill="#111">${DRY_RUN_MARKER}</text>
            <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" font-size="24" font-family="Arial" fill="#666">Mock Flux + GFPGAN fixtures</text>
          </svg>`
        )
      }
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
};

export class DryRunRestorationProvider implements IRestorationProvider {
  readonly name = "dry-run";
  readonly type = "internal" as const;
  status: ProviderStatus = "active";

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    const start = Date.now();
    logger.info("RESTORATION DRY RUN start", {
      orderId: request.options?.orderId,
      itemId: request.options?.itemId,
      marker: DRY_RUN_MARKER
    });

    let output: Buffer;
    try {
      // The E2E fixture is the uploaded image; keep the mock lane deterministic
      // without inventing a different image or making a provider request.
      output = await sharp(request.image, { sequentialRead: true })
        .rotate()
        .jpeg({ quality: 90 })
        .toBuffer();
    } catch {
      output = await fallbackFixtureImage();
    }
    const metadata = await sharp(output).metadata();

    return {
      image: output,
      contentType: "image/jpeg",
      fileName: request.fileName,
      providerName: this.name,
      providerVersion: "mock-fixture/1.0.0",
      stages: ["flux_restore", "face_restoration_gfpgan"],
      processingTimeMs: Date.now() - start,
      creditsUsed: 0,
      estimatedCost: 0,
      actualCost: 0,
      actualGPUSeconds: 0,
      actualProviderCharge: 0,
      requestId: `dry-run-${request.options?.itemId || "unknown"}`,
      costSource: "estimated",
      model: "mock/fixture",
      modelVersion: "fixture",
      inputWidth: metadata.width,
      inputHeight: metadata.height,
      inputSizeBytes: request.image.length,
      outputWidth: metadata.width,
      outputHeight: metadata.height,
      outputSizeBytes: output.length,
      queueTimeMs: 0,
      runningTimeMs: 0,
      retryCount: 0
    };
  }

  async health(): Promise<ProviderHealth> {
    return {
      status: "active",
      latency: 0,
      errorRate: 0,
      lastChecked: new Date().toISOString()
    };
  }

  estimateCost(): number {
    return 0;
  }
}
