import test from "node:test";
import assert from "node:assert/strict";
import { RestorationExecutionCoordinator, type RunToCompletionParams } from "./RestorationExecutionCoordinator";
import {
  RestorationValidationError,
  type CompletionMutationParams,
  type CompletionRepositoryPort,
  type FinalPersistencePort,
  type FinalUploadParams,
  type FinalVariant,
  type FinalVariantsBuilderPort,
  type OutputValidationPort,
  type ProviderExecutionPort,
  type ValidatedRestorationOutput
} from "./RestorationExecutionPorts";
import type { PipelineResult } from "./PipelineOrchestrator";
import type { RestorationRequest } from "../interfaces/IRestorationProvider";

// ---- Fakes -----------------------------------------------------------------

const buildPipelineResult = (overrides?: Partial<PipelineResult["final"]>): PipelineResult => {
  const final = {
    image: Buffer.from("fake-restored-bytes"),
    contentType: "image/jpeg",
    fileName: "restoration-item-1.jpg",
    providerName: "replicate-pipeline",
    providerVersion: "2.1.0 (flux+gfpgan-face-restoration-scale-1)",
    stages: ["flux_restore", "gfpgan_face_restore"],
    processingTimeMs: 1000,
    creditsUsed: 0,
    estimatedCost: 0.014,
    actualCost: 0.014,
    ...overrides
  };
  return {
    final,
    intermediateResults: [final],
    totalProcessingTimeMs: final.processingTimeMs,
    totalEstimatedCost: final.estimatedCost,
    totalActualCost: final.actualCost ?? final.estimatedCost,
    tier: "replicate"
  };
};

class RecordingProviderExecutor implements ProviderExecutionPort {
  calls: Array<{ request: RestorationRequest; tier: string }> = [];
  constructor(private readonly behavior: () => Promise<PipelineResult>) {}
  async execute(request: RestorationRequest, tier: any): Promise<PipelineResult> {
    this.calls.push({ request, tier });
    return this.behavior();
  }
}

class RecordingValidator implements OutputValidationPort {
  calls = 0;
  constructor(private readonly behavior: (result: PipelineResult) => Promise<ValidatedRestorationOutput>) {}
  async validate(result: PipelineResult): Promise<ValidatedRestorationOutput> {
    this.calls++;
    return this.behavior(result);
  }
}

class RecordingVariantsBuilder implements FinalVariantsBuilderPort {
  calls = 0;
  async buildVariants(validated: ValidatedRestorationOutput): Promise<Record<"master" | "2hd" | "4hd", FinalVariant>> {
    this.calls++;
    return {
      master: { body: validated.image, width: validated.width, height: validated.height, contentType: validated.contentType },
      "4hd": { body: Buffer.from("4hd"), width: 4096, height: 3000, contentType: "image/jpeg" },
      "2hd": { body: Buffer.from("2hd"), width: 2048, height: 1500, contentType: "image/jpeg" }
    };
  }
}

class RecordingFinalPersistence implements FinalPersistencePort {
  calls: FinalUploadParams[] = [];
  constructor(private readonly behavior?: (params: FinalUploadParams) => void) {}
  async uploadFinal(params: FinalUploadParams) {
    this.calls.push(params);
    this.behavior?.(params);
    return { key: `finals/${params.variant}-${params.itemId}.jpg`, url: `https://example.test/${params.variant}`, expiresAt: new Date() };
  }
}

class RecordingCompletionRepository implements CompletionRepositoryPort {
  calls: CompletionMutationParams[] = [];
  async markCompleted(params: CompletionMutationParams): Promise<void> {
    this.calls.push(params);
  }
}

const buildParams = (overrides?: Partial<RunToCompletionParams>): RunToCompletionParams => ({
  request: { image: Buffer.from("original"), contentType: "image/jpeg", fileName: "restoration-item-1.jpg" },
  tier: "replicate" as any,
  itemId: "item-1",
  orderId: "order-1",
  existingMetadata: {},
  qualityOverallScore: 60,
  dryRun: false,
  ...overrides
});

function buildCoordinator<
  V extends OutputValidationPort = RecordingValidator,
  B extends FinalVariantsBuilderPort = RecordingVariantsBuilder,
  P extends FinalPersistencePort = RecordingFinalPersistence,
  C extends CompletionRepositoryPort = RecordingCompletionRepository
>(parts: { providerExecutor: ProviderExecutionPort; outputValidator?: V; variantsBuilder?: B; finalPersistence?: P; completionRepository?: C }) {
  const outputValidator = (parts.outputValidator ??
    new RecordingValidator(async (result) => ({
      image: result.final.image,
      contentType: result.final.contentType,
      width: 1024,
      height: 768
    }))) as V;
  const variantsBuilder = (parts.variantsBuilder ?? new RecordingVariantsBuilder()) as B;
  const finalPersistence = (parts.finalPersistence ?? new RecordingFinalPersistence()) as P;
  const completionRepository = (parts.completionRepository ?? new RecordingCompletionRepository()) as C;
  return {
    coordinator: new RestorationExecutionCoordinator({
      providerExecutor: parts.providerExecutor,
      outputValidator,
      variantsBuilder,
      finalPersistence,
      completionRepository
    }),
    outputValidator,
    variantsBuilder,
    finalPersistence,
    completionRepository
  };
}

// ---- Tests -------------------------------------------------------------------

test("existing Replicate processing still works: provider -> validate -> persist -> complete", async () => {
  const providerExecutor = new RecordingProviderExecutor(async () => buildPipelineResult());
  const { coordinator, finalPersistence, completionRepository } = buildCoordinator({ providerExecutor });

  const result = await coordinator.runToCompletion(buildParams());

  assert.equal(providerExecutor.calls.length, 1);
  assert.equal(result.providerUsedName, "replicate-pipeline");
  assert.deepEqual(result.providersUsed, ["flux_restore", "gfpgan_face_restore"]);
  assert.equal(finalPersistence.calls.length, 3, "master + 4hd + 2hd uploaded");
  assert.equal(completionRepository.calls.length, 1);
  assert.equal(completionRepository.calls[0].finalStorageKey, result.masterUpload.key);
  assert.equal(completionRepository.calls[0].providerUsed, "replicate-pipeline:flux_restore,gfpgan_face_restore");
});

test("provider failure prevents R2 upload and DB completion", async () => {
  const providerExecutor = new RecordingProviderExecutor(async () => {
    throw new Error("Replicate prediction failed");
  });
  const { coordinator, finalPersistence, completionRepository, outputValidator, variantsBuilder } = buildCoordinator({ providerExecutor });

  await assert.rejects(() => coordinator.runToCompletion(buildParams()), /Replicate prediction failed/);

  assert.equal(providerExecutor.calls.length, 1, "no retry/fallback attempted");
  assert.equal(outputValidator.calls, 0);
  assert.equal(variantsBuilder.calls, 0);
  assert.equal(finalPersistence.calls.length, 0);
  assert.equal(completionRepository.calls.length, 0);
});

test("validation failure prevents R2 upload and DB completion", async () => {
  const providerExecutor = new RecordingProviderExecutor(async () => buildPipelineResult({ image: Buffer.alloc(0) }));
  const outputValidator = new RecordingValidator(async () => {
    throw new RestorationValidationError("Restoration output image is empty");
  });
  const { coordinator, finalPersistence, completionRepository, variantsBuilder } = buildCoordinator({ providerExecutor, outputValidator });

  await assert.rejects(() => coordinator.runToCompletion(buildParams()), RestorationValidationError);

  assert.equal(providerExecutor.calls.length, 1);
  assert.equal(variantsBuilder.calls, 0);
  assert.equal(finalPersistence.calls.length, 0);
  assert.equal(completionRepository.calls.length, 0);
});

test("R2 failure prevents DB completion", async () => {
  const providerExecutor = new RecordingProviderExecutor(async () => buildPipelineResult());
  const finalPersistence = new RecordingFinalPersistence((params) => {
    if (params.variant === "master") throw new Error("R2 upload failed: network error");
  });
  const { coordinator, completionRepository } = buildCoordinator({ providerExecutor, finalPersistence });

  await assert.rejects(() => coordinator.runToCompletion(buildParams()), /R2 upload failed/);

  assert.equal(finalPersistence.calls.length, 1, "stopped after the failing upload, no later variants attempted");
  assert.equal(completionRepository.calls.length, 0);
});

test("database completion happens only after validated R2 persistence (strict ordering)", async () => {
  const events: string[] = [];
  const providerExecutor = new RecordingProviderExecutor(async () => {
    events.push("provider");
    return buildPipelineResult();
  });
  const outputValidator = new RecordingValidator(async (result) => {
    events.push("validate");
    return { image: result.final.image, contentType: result.final.contentType, width: 1024, height: 768 };
  });
  const variantsBuilder: FinalVariantsBuilderPort = {
    async buildVariants(validated) {
      events.push("build-variants");
      return {
        master: { body: validated.image, width: validated.width, height: validated.height, contentType: validated.contentType },
        "4hd": { body: Buffer.from("4hd"), width: 4096, height: 3000, contentType: "image/jpeg" },
        "2hd": { body: Buffer.from("2hd"), width: 2048, height: 1500, contentType: "image/jpeg" }
      };
    }
  };
  const finalPersistence = new RecordingFinalPersistence((params) => {
    events.push(`persist:${params.variant}`);
  });
  const completionRepository: CompletionRepositoryPort = {
    async markCompleted() {
      events.push("complete");
    }
  };

  await buildCoordinator({ providerExecutor, outputValidator, variantsBuilder, finalPersistence, completionRepository }).coordinator.runToCompletion(
    buildParams()
  );

  assert.deepEqual(events, ["provider", "validate", "build-variants", "persist:master", "persist:4hd", "persist:2hd", "complete"]);
});

test("no implicit provider fallback occurs on failure", async () => {
  let calls = 0;
  const providerExecutor: ProviderExecutionPort = {
    async execute() {
      calls++;
      throw new Error("primary provider unavailable");
    }
  };
  const { coordinator, completionRepository, finalPersistence } = buildCoordinator({ providerExecutor });

  await assert.rejects(() => coordinator.runToCompletion(buildParams()));

  assert.equal(calls, 1, "coordinator must not retry or substitute another provider");
  assert.equal(finalPersistence.calls.length, 0);
  assert.equal(completionRepository.calls.length, 0);
});

test("existing replay behavior is unaffected: coordinator treats a replay-shaped result like any other validated output", async () => {
  const providerExecutor = new RecordingProviderExecutor(async () =>
    buildPipelineResult({
      providerName: "replay",
      providerVersion: "archived-fixture/1.0.0",
      stages: ["replay"],
      estimatedCost: 0,
      actualCost: 0
    })
  );
  const { coordinator, completionRepository } = buildCoordinator({ providerExecutor });

  const result = await coordinator.runToCompletion(buildParams());

  assert.equal(result.providerUsedName, "replay");
  assert.deepEqual(result.providersUsed, ["replay"]);
  assert.equal(completionRepository.calls[0].providerUsed, "replay:replay");
});
