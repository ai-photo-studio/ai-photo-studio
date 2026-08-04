import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  PipelineOrchestratorProviderExecutor,
  SharpFinalVariantsBuilder,
  SharpOutputValidator
} from "./DefaultRestorationExecutionPorts";
import { RestorationValidationError } from "./RestorationExecutionPorts";
import type { PipelineOrchestrator, PipelineResult } from "./PipelineOrchestrator";

const buildPipelineResult = (image: Buffer, stages: string[] = ["flux_restore", "gfpgan_face_restore"]): PipelineResult => {
  const final = {
    image,
    contentType: "image/jpeg",
    fileName: "restoration-item-1.jpg",
    providerName: "replicate-pipeline",
    providerVersion: "2.1.0",
    stages,
    processingTimeMs: 10,
    creditsUsed: 0,
    estimatedCost: 0.014,
    actualCost: 0.014
  };
  return { final, intermediateResults: [final], totalProcessingTimeMs: 10, totalEstimatedCost: 0.014, totalActualCost: 0.014, tier: "replicate" };
};

const buildImageBuffer = (width = 32, height = 24) =>
  sharp({ create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } } }).jpeg().toBuffer();

test("PipelineOrchestratorProviderExecutor is a pure pass-through to PipelineOrchestrator.execute (no fallback logic added)", async () => {
  let receivedRequest: unknown;
  let receivedTier: unknown;
  const fakeResult = buildPipelineResult(Buffer.from("x"));
  const fakeOrchestrator = {
    execute: async (request: unknown, tier: unknown) => {
      receivedRequest = request;
      receivedTier = tier;
      return fakeResult;
    }
  } as unknown as PipelineOrchestrator;

  const executor = new PipelineOrchestratorProviderExecutor(fakeOrchestrator);
  const request = { image: Buffer.from("in"), contentType: "image/jpeg", fileName: "f.jpg" };
  const result = await executor.execute(request, "replicate" as any);

  assert.equal(receivedRequest, request, "request must be forwarded unmodified");
  assert.equal(receivedTier, "replicate");
  assert.equal(result, fakeResult, "result must be forwarded unmodified, no wrapping/fallback");
});

test("SharpOutputValidator fails closed on an empty image buffer", async () => {
  const validator = new SharpOutputValidator();
  await assert.rejects(() => validator.validate(buildPipelineResult(Buffer.alloc(0))), RestorationValidationError);
});

test("SharpOutputValidator fails closed on non-decodable bytes", async () => {
  const validator = new SharpOutputValidator();
  await assert.rejects(() => validator.validate(buildPipelineResult(Buffer.from("not-an-image"))), RestorationValidationError);
});

test("SharpOutputValidator fails closed when the pipeline reports no completed stages", async () => {
  const validator = new SharpOutputValidator();
  const image = await buildImageBuffer();
  await assert.rejects(() => validator.validate(buildPipelineResult(image, [])), RestorationValidationError);
});

test("SharpOutputValidator accepts a decodable image and returns its dimensions", async () => {
  const validator = new SharpOutputValidator();
  const image = await buildImageBuffer(64, 48);
  const validated = await validator.validate(buildPipelineResult(image));
  assert.equal(validated.width, 64);
  assert.equal(validated.height, 48);
  assert.equal(validated.image, image);
});

test("SharpFinalVariantsBuilder produces master/2hd/4hd variants from validated output", async () => {
  const builder = new SharpFinalVariantsBuilder();
  const image = await buildImageBuffer(5000, 4000);
  const variants = await builder.buildVariants({ image, contentType: "image/jpeg", width: 5000, height: 4000 });

  assert.equal(variants.master.body, image);
  assert.ok(variants["4hd"].width! <= 4096);
  assert.ok(variants["2hd"].width! <= 2048);
  assert.equal(variants["4hd"].contentType, "image/jpeg");
  assert.equal(variants["2hd"].contentType, "image/jpeg");
});
