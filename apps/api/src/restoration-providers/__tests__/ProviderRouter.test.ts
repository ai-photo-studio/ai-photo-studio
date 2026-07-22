import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { ProviderRouter } from "../router/ProviderRouter";
import { MockProvider } from "../providers/MockProvider";
import type { IRestorationProvider, ProviderHealth, ProviderStatus, RestorationRequest, RestorationResult, RoutingDecision } from "../interfaces/IRestorationProvider";

const createMockRequest = (): RestorationRequest => ({
  image: Buffer.from("test-image-data"),
  contentType: "image/jpeg",
  fileName: "test.jpg",
});

const createRoutingDecision = (): RoutingDecision => ({
  primaryProvider: "mock",
  fallbackProvider: null,
  shadowProvider: null,
  reason: "test routing",
});

class FailingProvider implements IRestorationProvider {
  readonly name = "failing";
  readonly type = "self-hosted" as const;
  status: ProviderStatus = "active";

  async restore(): Promise<RestorationResult> {
    throw new Error("Primary failed");
  }

  async health(): Promise<ProviderHealth> {
    return { status: "active", latency: 0, errorRate: 0, lastChecked: new Date().toISOString() };
  }

  estimateCost(): number {
    return 0;
  }
}

class FallbackProvider implements IRestorationProvider {
  readonly name = "fallback";
  readonly type = "self-hosted" as const;
  status: ProviderStatus = "active";

  async restore(request: RestorationRequest): Promise<RestorationResult> {
    return {
      image: request.image,
      contentType: "image/jpeg",
      fileName: request.fileName,
      providerName: this.name,
      providerVersion: "1.0.0",
      stages: ["fallback"],
      processingTimeMs: 10,
      creditsUsed: 0,
      estimatedCost: 0,
    };
  }

  async health(): Promise<ProviderHealth> {
    return { status: "active", latency: 0, errorRate: 0, lastChecked: new Date().toISOString() };
  }

  estimateCost(): number {
    return 0;
  }
}

describe("ProviderRouter", () => {
  let router: ProviderRouter;
  let mockProvider: MockProvider;

  before(() => {
    router = new ProviderRouter({
      shadowMode: "disabled",
      abTestMode: "disabled",
      failoverCooldownMs: 1000,
      maxRetries: 2,
    });
    mockProvider = new MockProvider();
    router.registerProvider(mockProvider);
  });

  describe("registerProvider", () => {
    it("should register a provider", () => {
      assert.ok(router.getProvider("mock"));
    });

    it("should return undefined for unregistered provider", () => {
      assert.strictEqual(router.getProvider("nonexistent"), undefined);
    });
  });

  describe("route", () => {
    it("should route to primary provider successfully", async () => {
      const request = createMockRequest();
      const context = { packageTier: "basic" as const };
      const decision = createRoutingDecision();

      const result = await router.route(request, context, decision);

      assert.strictEqual(result.providerName, "mock");
      assert.strictEqual(result.contentType, "image/jpeg");
      assert.ok(result.processingTimeMs >= 0);
    });

    it("should throw if primary provider not found", async () => {
      const request = createMockRequest();
      const context = { packageTier: "basic" as const };
      const decision: RoutingDecision = {
        primaryProvider: "nonexistent",
        fallbackProvider: null,
        shadowProvider: null,
        reason: "test",
      };

      await assert.rejects(
        async () => router.route(request, context, decision),
        /Primary provider not found/
      );
    });

    it("should fall back to fallback provider when primary fails", async () => {
      const testRouter = new ProviderRouter({
        shadowMode: "disabled",
        abTestMode: "disabled",
        failoverCooldownMs: 1000,
        maxRetries: 0,
      });
      testRouter.registerProvider(new FailingProvider());
      testRouter.registerProvider(new FallbackProvider());

      const request = createMockRequest();
      const context = { packageTier: "basic" as const };
      const decision: RoutingDecision = {
        primaryProvider: "failing",
        fallbackProvider: "fallback",
        shadowProvider: null,
        reason: "test fallback",
      };

      const result = await testRouter.route(request, context, decision);
      assert.strictEqual(result.providerName, "fallback");
    });
  });

  describe("isProviderAvailable", () => {
    it("should return true for active provider", () => {
      assert.strictEqual(router.isProviderAvailable("mock"), true);
    });

    it("should return false for unregistered provider", () => {
      assert.strictEqual(router.isProviderAvailable("nonexistent"), false);
    });
  });

  describe("getProviderStatus", () => {
    it("should return status for registered provider", () => {
      assert.strictEqual(router.getProviderStatus("mock"), "active");
    });

    it("should return null for unregistered provider", () => {
      assert.strictEqual(router.getProviderStatus("nonexistent"), null);
    });
  });

  describe("getMetrics", () => {
    it("should return metrics collector", () => {
      const metrics = router.getMetrics();
      assert.ok(metrics);
      assert.strictEqual(typeof metrics.recordSuccess, "function");
      assert.strictEqual(typeof metrics.recordFailure, "function");
    });
  });
});
