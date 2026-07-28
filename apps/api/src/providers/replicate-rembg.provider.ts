import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env";
import type {
  ImageProvider,
  ProcessImageInput,
  ProcessImageOutput,
  ProductPipelineRoute,
  ProductWorkflowMode,
  VehicleWorkflowMode
} from "./provider.interface";
import {
  NoopReplicateCostLogger,
  ReplicateServiceWrapper,
  buildReplicatePredictionRequest,
  mapReplicateInternalStatus,
} from "../restoration-providers/replicate-foundation";
import { logger } from "../utils/logger";
import { getReplicateRuntimeConfig } from "../config/replicate";

const clone = (buffer: Buffer) => Buffer.from(buffer);

const buildOutput = (
  providerName: ProcessImageOutput["providerName"],
  workflowType: ProcessImageOutput["workflowType"],
  workflowMode: ProcessImageOutput["workflowMode"],
  output: { body: Buffer; contentType: string; fileName: string }
): ProcessImageOutput => ({
  buffer: clone(output.body),
  contentType: output.contentType,
  fileName: output.fileName,
  providerName,
  workflowType,
  workflowMode,
  providerRequestId: `replicate-rembg-${randomUUID()}`
});

export class ReplicateRembgImageProvider implements ImageProvider {
  readonly name = "local-rembg" as const;
  private readonly service: ReplicateServiceWrapper;
  private readonly enabled: boolean;
  private readonly apiToken: string;

  constructor(config: AppConfig) {
    const runtime = getReplicateRuntimeConfig(config);
    this.enabled = runtime.backgroundRemovalEnabled;
    this.apiToken = runtime.apiToken;
    this.service = new ReplicateServiceWrapper({
      apiToken: runtime.apiToken,
      apiBaseUrl: runtime.apiBaseUrl,
      modelSlug: runtime.backgroundRemovalModelSlug,
      modelVersion: runtime.backgroundRemovalModelVersion || undefined,
      requestWaitSeconds: runtime.requestWaitSeconds,
      cancelAfterSeconds: runtime.cancelAfterSeconds,
      pollIntervalMs: runtime.pollIntervalMs,
      pollTimeoutMs: runtime.pollTimeoutMs,
      maxPollAttempts: runtime.maxPollAttempts,
    }, new NoopReplicateCostLogger());
  }

  async processProductImage(
    input: ProcessImageInput & { workflowMode: ProductWorkflowMode },
    _routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    if (!this.enabled) {
      throw new Error("Replicate background-removal provider is disabled by feature flag");
    }
    if (!this.apiToken) {
      throw new Error("REPLICATE_API_TOKEN is required");
    }
    if (!this.service.modelSlug) {
      throw new Error("REPLICATE_BACKGROUND_REMOVAL_MODEL_SLUG is required");
    }

    const request = buildReplicatePredictionRequest(this.service, {
      contentType: input.contentType,
      fileName: input.fileName,
      imageBuffer: input.buffer,
      request: {
        image: input.buffer,
        contentType: input.contentType,
        fileName: input.fileName,
        options: input.selectedActions?.includes("white-background") ? { outputFormat: "png" } : undefined,
      },
    });

    const prediction = await this.service.createPrediction(request);
    const completed = prediction.status === "succeeded"
      ? prediction
      : await this.service.pollPrediction(prediction.id, {
          intervalMs: 1000,
          timeoutMs: this.service.timeoutMs,
          onStatus: (polled, internalStatus) => {
            logger.info("Replicate background-removal status update", {
              predictionId: polled.id,
              status: polled.status,
              internalStatus,
            });
          },
        });

    const outputUrl = Array.isArray(completed.output)
      ? completed.output[0]
      : typeof completed.output === "string"
        ? completed.output
        : null;

    if (!outputUrl) {
      throw new Error("Replicate background-removal returned no output");
    }

    const response = await fetch(outputUrl, {
      headers: { Authorization: `Bearer ${this.apiToken}` },
    });
    if (!response.ok) {
      throw new Error(`Replicate background-removal download failed (${response.status})`);
    }

    const body = Buffer.from(await response.arrayBuffer());
    logger.info("Replicate background-removal completed", {
      predictionId: completed.id,
      providerStatus: mapReplicateInternalStatus(completed.status),
    });

    return buildOutput(this.name, "PRODUCT", input.workflowMode, {
      body,
      contentType: "image/png",
      fileName: input.fileName,
    });
  }

  async processVehicleImage(
    input: ProcessImageInput & { workflowMode: VehicleWorkflowMode },
    _routing?: ProductPipelineRoute
  ): Promise<ProcessImageOutput> {
    return this.processProductImage(input as unknown as ProcessImageInput & { workflowMode: ProductWorkflowMode }, _routing);
  }
}
