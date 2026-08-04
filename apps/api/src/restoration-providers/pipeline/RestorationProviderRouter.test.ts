import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RestorationProviderRouter,
  InvalidProviderSelectionError,
  type RestorationProviderRouterDeps
} from "./RestorationProviderRouter";
import { RestorationExecutionCoordinator } from "./RestorationExecutionCoordinator";
import type {
  CompletionMutationParams,
  CompletionRepositoryPort,
  FinalPersistencePort,
  FinalUploadParams,
  FinalVariant,
  FinalVariantsBuilderPort,
  OutputValidationPort,
  ProviderExecutionPort,
  ValidatedRestorationOutput
} from "./RestorationExecutionPorts";
import type { PipelineResult } from "./PipelineOrchestrator";
import type { RestorationRequest } from "../interfaces/IRestorationProvider";

const buildPipelineResult = (providerName: string): PipelineResult => {
  const final = {
    image: Buffer.from("bytes"),
    contentType: "image/jpeg",
    fileName: "f.jpg",
    providerName,
    providerVersion: "v1",
    stages: [providerName],
    processingTimeMs: 10,
    creditsUsed: 0,
    estimatedCost: 0.01,
    actualCost: 0.01
  };
  return { final, intermediateResults: [final], totalProcessingTimeMs: 10, totalEstimatedCost: 0.01, totalActualCost: 0.01, tier: "replicate" };
};

class RecordingExecutor implements ProviderExecutionPort {
  calls = 0;
  constructor(private readonly behavior: () => Promise<PipelineResult>) {}
  async execute(): Promise<PipelineResult> {
    this.calls++;
    return this.behavior();
  }
}

const buildRouter = (overrides: Partial<RestorationProviderRouterDeps>) => {
  const replicateExecutor = overrides.replicateExecutor ?? new RecordingExecutor(async () => buildPipelineResult("replicate-pipeline"));
  const deps: RestorationProviderRouterDeps = {
    selection: "replicate",
    replicateExecutor,
    ...overrides
  };
  return { router: new RestorationProviderRouter(deps), replicateExecutor: deps.replicateExecutor as RecordingExecutor };
};

const request: RestorationRequest = { image: Buffer.from("x"), contentType: "image/jpeg", fileName: "f.jpg" };

test("default Replicate selection: selection='replicate' always calls the Replicate executor", async () => {
  const { router, replicateExecutor } = buildRouter({ selection: "replicate" });
  const result = await router.execute(request, "replicate" as any);
  assert.equal(replicateExecutor.calls, 1);
  assert.equal(result.final.providerName, "replicate-pipeline");
});

test("mock selection preserves current mock behavior: routes to the same Replicate/PipelineOrchestrator seam", async () => {
  const { router, replicateExecutor } = buildRouter({ selection: "mock" });
  const result = await router.execute(request, "replicate" as any);
  assert.equal(replicateExecutor.calls, 1);
  assert.equal(result.final.providerName, "replicate-pipeline");
});

test("exhaustive routing switch: an unexpected runtime provider value is rejected before either executor runs", async () => {
  const { router, replicateExecutor } = buildRouter({ selection: "not-a-real-provider" as any });
  await assert.rejects(() => router.execute(request, "replicate" as any), InvalidProviderSelectionError);
  assert.equal(replicateExecutor.calls, 0, "an invalid selection must never be treated as Replicate");
});

test("a bypassed 'runpod' selection is rejected as an unsupported provider and dispatches nothing", async () => {
  const { router, replicateExecutor } = buildRouter({ selection: "runpod" as any });
  await assert.rejects(() => router.execute(request, "replicate" as any), InvalidProviderSelectionError);
  assert.equal(replicateExecutor.calls, 0, "an unsupported selection must never fall through to Replicate");
});

test("no implicit fallback: a Replicate dispatch failure is not retried on any other provider", async () => {
  const replicateExecutor = new RecordingExecutor(async () => {
    throw new Error("Replicate dispatch failed");
  });
  const { router } = buildRouter({ selection: "replicate", replicateExecutor });

  await assert.rejects(() => router.execute(request, "replicate" as any), /Replicate dispatch failed/);
  assert.equal(replicateExecutor.calls, 1, "exactly one dispatch, no retry and no second provider");
});

test("the router source declares no second provider, no RunPod coupling, and no fallback seam", () => {
  const source = readFileSync(join(__dirname, "RestorationProviderRouter.ts"), "utf8");
  for (const token of [
    "runpod",
    "RunPod",
    "RUNPOD_",
    "restoration-providers/runpod",
    "runpodExecutorFactory",
    "fallback",
    "api.runpod.ai"
  ]) {
    assert.ok(!source.includes(token), `router source must not reference "${token}"`);
  }
});

// ---- Integration with the execution coordinator --------------------------

class StubValidator implements OutputValidationPort {
  async validate(result: PipelineResult): Promise<ValidatedRestorationOutput> {
    return { image: result.final.image, contentType: result.final.contentType, width: 1, height: 1 };
  }
}
class StubVariantsBuilder implements FinalVariantsBuilderPort {
  async buildVariants(validated: ValidatedRestorationOutput): Promise<Record<"master" | "2hd" | "4hd", FinalVariant>> {
    return {
      master: { body: validated.image, width: 1, height: 1, contentType: validated.contentType },
      "4hd": { body: Buffer.from("4"), width: 1, height: 1, contentType: "image/jpeg" },
      "2hd": { body: Buffer.from("2"), width: 1, height: 1, contentType: "image/jpeg" }
    };
  }
}
class RecordingPersistence implements FinalPersistencePort {
  calls: FinalUploadParams[] = [];
  async uploadFinal(params: FinalUploadParams) {
    this.calls.push(params);
    return { key: `finals/${params.variant}.jpg`, url: "https://example.test", expiresAt: new Date() };
  }
}
class RecordingCompletion implements CompletionRepositoryPort {
  calls: CompletionMutationParams[] = [];
  async markCompleted(params: CompletionMutationParams) {
    this.calls.push(params);
  }
}

test("provider failure through the router prevents R2 upload and DB completion (coordinator integration)", async () => {
  const replicateExecutor = new RecordingExecutor(async () => {
    throw new Error("selected provider failed");
  });
  const { router } = buildRouter({ selection: "replicate", replicateExecutor });

  const finalPersistence = new RecordingPersistence();
  const completionRepository = new RecordingCompletion();
  const coordinator = new RestorationExecutionCoordinator({
    providerExecutor: router,
    outputValidator: new StubValidator(),
    variantsBuilder: new StubVariantsBuilder(),
    finalPersistence,
    completionRepository
  });

  await assert.rejects(
    () =>
      coordinator.runToCompletion({
        request,
        tier: "replicate" as any,
        itemId: "item-1",
        orderId: "order-1",
        existingMetadata: {},
        qualityOverallScore: 50,
        dryRun: false
      }),
    /selected provider failed/
  );

  assert.equal(finalPersistence.calls.length, 0);
  assert.equal(completionRepository.calls.length, 0);
});
