import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { MockProvider } from "../providers/MockProvider";
import { RunPodProvider } from "../providers/RunPodProvider";
import type { IRestorationProvider, ProviderStatus, ProviderType, RestorationRequest, ProviderHealth } from "../interfaces/IRestorationProvider";

describe("IRestorationProvider", () => {
  describe("MockProvider", () => {
    let provider: MockProvider;

    before(() => {
      provider = new MockProvider();
    });

    it("should implement IRestorationProvider interface", () => {
      assert.strictEqual(provider.name, "mock");
      assert.strictEqual(provider.type, "internal");
      assert.strictEqual(provider.status, "active");
    });

    it("should have restore method", async () => {
      const request: RestorationRequest = {
        image: Buffer.from("test"),
        contentType: "image/jpeg",
        fileName: "test.jpg",
      };
      const result = await provider.restore(request);
      assert.strictEqual(result.providerName, "mock");
      assert.strictEqual(result.contentType, "image/jpeg");
      assert.ok(result.image instanceof Buffer);
      assert.ok(result.processingTimeMs >= 0);
      assert.strictEqual(result.estimatedCost, 0);
    });

    it("should have health method", async () => {
      const health: ProviderHealth = await provider.health();
      assert.strictEqual(health.status, "active");
      assert.ok(health.lastChecked);
    });

    it("should have estimateCost method", () => {
      const request: RestorationRequest = {
        image: Buffer.from("test"),
        contentType: "image/jpeg",
        fileName: "test.jpg",
      };
      const cost = provider.estimateCost(request);
      assert.strictEqual(cost, 0);
    });

    it("should allow status changes", () => {
      provider.status = "degraded";
      assert.strictEqual(provider.status, "degraded");
      provider.status = "active";
    });
  });

  describe("RunPodProvider", () => {
    it("should have correct static properties", () => {
      const mockConfig = {
        RESTORATION_ENDPOINT_URL: "test-endpoint",
      } as any;

      const provider = new RunPodProvider(mockConfig);
      assert.strictEqual(provider.name, "runpod");
      assert.strictEqual(provider.type, "self-hosted");
      assert.strictEqual(provider.status, "active");
    });

    it("should have restore, health, and estimateCost methods", () => {
      const mockConfig = {
        RESTORATION_ENDPOINT_URL: "test-endpoint",
      } as any;

      const provider = new RunPodProvider(mockConfig);
      assert.strictEqual(typeof provider.restore, "function");
      assert.strictEqual(typeof provider.health, "function");
      assert.strictEqual(typeof provider.estimateCost, "function");
    });

    it("should estimate cost based on image size", () => {
      const mockConfig = {
        RESTORATION_ENDPOINT_URL: "test-endpoint",
      } as any;

      const provider = new RunPodProvider(mockConfig);

      const smallRequest: RestorationRequest = {
        image: Buffer.alloc(500 * 1024),
        contentType: "image/jpeg",
        fileName: "small.jpg",
      };
      assert.strictEqual(provider.estimateCost(smallRequest), 0.003);

      const mediumRequest: RestorationRequest = {
        image: Buffer.alloc(2 * 1024 * 1024),
        contentType: "image/jpeg",
        fileName: "medium.jpg",
      };
      assert.strictEqual(provider.estimateCost(mediumRequest), 0.008);

      const largeRequest: RestorationRequest = {
        image: Buffer.alloc(5 * 1024 * 1024),
        contentType: "image/jpeg",
        fileName: "large.jpg",
      };
      assert.strictEqual(provider.estimateCost(largeRequest), 0.015);
    });
  });

  describe("ProviderType", () => {
    it("should accept all valid types", () => {
      const types: ProviderType[] = ["commercial", "self-hosted", "internal"];
      assert.ok(types.includes("commercial"));
      assert.ok(types.includes("self-hosted"));
      assert.ok(types.includes("internal"));
    });
  });

  describe("ProviderStatus", () => {
    it("should accept all valid statuses", () => {
      const statuses: ProviderStatus[] = ["active", "degraded", "down"];
      assert.ok(statuses.includes("active"));
      assert.ok(statuses.includes("degraded"));
      assert.ok(statuses.includes("down"));
    });
  });
});
