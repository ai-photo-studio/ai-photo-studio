import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { ProviderBenchmarkService } from "../ProviderBenchmarkService";
import { ProviderScorecardGenerator } from "../ProviderScorecard";
import { MockProvider } from "../../providers/MockProvider";
import type { BenchmarkImage } from "../ProviderBenchmarkService";

const createTestImage = (id: string, category: string): BenchmarkImage => ({
  id,
  fileName: `${id}.jpg`,
  contentType: "image/jpeg",
  imageData: Buffer.from(`test-image-data-${id}`),
  category,
  expectedQuality: 75,
});

describe("ProviderBenchmarkService", () => {
  let benchmarkService: ProviderBenchmarkService;
  let mockProvider: MockProvider;

  const testImages: BenchmarkImage[] = [
    createTestImage("img_001", "PORTRAIT"),
    createTestImage("img_002", "BLACK_WHITE"),
    createTestImage("img_003", "GROUP_PHOTO"),
    createTestImage("img_004", "DOCUMENT"),
    createTestImage("img_005", "LANDSCAPE"),
  ];

  before(() => {
    benchmarkService = new ProviderBenchmarkService();
    mockProvider = new MockProvider();
    benchmarkService.registerProvider(mockProvider);
  });

  describe("registerProvider", () => {
    it("should register a provider", () => {
      assert.ok(benchmarkService.getProvider("mock"));
    });

    it("should return undefined for unregistered provider", () => {
      assert.strictEqual(benchmarkService.getProvider("nonexistent"), undefined);
    });
  });

  describe("benchmarkProvider", () => {
    it("should benchmark a provider with test images", async () => {
      const results = await benchmarkService.benchmarkProvider("mock", testImages);

      assert.strictEqual(results.length, 5);
      assert.ok(results.every((r) => r.success));
      assert.ok(results.every((r) => r.providerName === "mock"));
      assert.ok(results.every((r) => r.processingTimeMs >= 0));
    });

    it("should compute summary with correct metrics", async () => {
      await benchmarkService.benchmarkProvider("mock", testImages);
      const summary = benchmarkService.getSummary("mock");

      assert.ok(summary);
      assert.strictEqual(summary.providerName, "mock");
      assert.strictEqual(summary.totalImages, 5);
      assert.strictEqual(summary.successful, 5);
      assert.strictEqual(summary.failed, 0);
      assert.strictEqual(summary.errorRate, 0);
      assert.ok(summary.averageLatencyMs >= 0);
      assert.ok(summary.score.overallScore >= 0);
    });

    it("should handle provider failures gracefully", async () => {
      const failingProvider = {
        name: "failing",
        type: "internal" as const,
        status: "active" as const,
        restore: async () => { throw new Error("Test failure"); },
        health: async () => ({ status: "down" as const, latency: 0, errorRate: 1, lastChecked: new Date().toISOString() }),
        estimateCost: () => 0,
      };

      benchmarkService.registerProvider(failingProvider);
      const results = await benchmarkService.benchmarkProvider("failing", testImages.slice(0, 2));

      assert.strictEqual(results.length, 2);
      assert.ok(results.every((r) => !r.success));
      assert.ok(results.every((r) => r.error));
    });
  });

  describe("benchmarkAll", () => {
    it("should benchmark multiple providers", async () => {
      const summaries = await benchmarkService.benchmarkAll(testImages, ["mock"]);

      assert.ok(summaries.has("mock"));
      const summary = summaries.get("mock");
      assert.ok(summary);
      assert.strictEqual(summary.totalImages, 5);
    });
  });

  describe("getProviderScore", () => {
    it("should return provider score after benchmark", async () => {
      await benchmarkService.benchmarkProvider("mock", testImages);
      const score = benchmarkService.getProviderScore("mock");

      assert.ok(score);
      assert.strictEqual(score.providerName, "mock");
      assert.ok(score.restorationScore >= 0);
      assert.ok(score.colorizationScore >= 0);
      assert.ok(score.faceRestorationScore >= 0);
      assert.ok(score.printQualityScore >= 0);
      assert.ok(score.costScore >= 0);
      assert.ok(score.latencyScore >= 0);
      assert.ok(score.reliabilityScore >= 0);
      assert.ok(score.overallScore >= 0);
    });
  });

  describe("clearResults", () => {
    it("should clear all results and summaries", async () => {
      await benchmarkService.benchmarkProvider("mock", testImages);
      assert.ok(benchmarkService.getSummary("mock"));

      benchmarkService.clearResults();
      assert.strictEqual(benchmarkService.getSummary("mock"), undefined);
    });
  });
});

describe("ProviderScorecardGenerator", () => {
  let benchmarkService: ProviderBenchmarkService;
  let mockProvider: MockProvider;
  let scorecardGenerator: ProviderScorecardGenerator;

  const testImages: BenchmarkImage[] = [
    createTestImage("img_001", "PORTRAIT"),
    createTestImage("img_002", "BLACK_WHITE"),
    createTestImage("img_003", "GROUP_PHOTO"),
  ];

  before(async () => {
    benchmarkService = new ProviderBenchmarkService();
    mockProvider = new MockProvider();
    benchmarkService.registerProvider(mockProvider);
    scorecardGenerator = new ProviderScorecardGenerator();
    await benchmarkService.benchmarkProvider("mock", testImages);
  });

  describe("generateScorecard", () => {
    it("should generate scorecard from benchmark summaries", () => {
      const summaries = benchmarkService.getAllSummaries();
      const scorecard = scorecardGenerator.generateScorecard(summaries);

      assert.ok(scorecard.categories.length >= 8);
      assert.ok(scorecard.lastUpdated);
      assert.ok(scorecard.bestOverall);
    });

    it("should include all expected categories", () => {
      const summaries = benchmarkService.getAllSummaries();
      const scorecard = scorecardGenerator.generateScorecard(summaries);

      const categoryNames = scorecard.categories.map((c) => c.name);
      assert.ok(categoryNames.includes("Restoration"));
      assert.ok(categoryNames.includes("Colorization"));
      assert.ok(categoryNames.includes("Face Restoration"));
      assert.ok(categoryNames.includes("Print Quality"));
      assert.ok(categoryNames.includes("Cost Efficiency"));
      assert.ok(categoryNames.includes("Latency"));
      assert.ok(categoryNames.includes("Reliability"));
      assert.ok(categoryNames.includes("Overall"));
    });

    it("should rank providers within each category", () => {
      const summaries = benchmarkService.getAllSummaries();
      const scorecard = scorecardGenerator.generateScorecard(summaries);

      const overall = scorecard.categories.find((c) => c.name === "Overall");
      assert.ok(overall);
      assert.strictEqual(overall.entries[0].rank, 1);
    });
  });

  describe("getBestProviderForCategory", () => {
    it("should return best provider for Overall category", () => {
      const summaries = benchmarkService.getAllSummaries();
      const scorecard = scorecardGenerator.generateScorecard(summaries);

      const best = scorecardGenerator.getBestProviderForCategory(scorecard, "Overall");
      assert.ok(best);
      assert.strictEqual(best.rank, 1);
    });
  });

  describe("getProviderRanking", () => {
    it("should return ranking for a specific provider", () => {
      const summaries = benchmarkService.getAllSummaries();
      const scorecard = scorecardGenerator.generateScorecard(summaries);

      const rankings = scorecardGenerator.getProviderRanking(scorecard, "mock");
      assert.ok(rankings.length >= 8);
      assert.ok(rankings.every((r) => r.category));
      assert.ok(rankings.every((r) => r.rank >= 1));
    });
  });

  describe("getOverallRanking", () => {
    it("should return overall ranking", () => {
      const summaries = benchmarkService.getAllSummaries();
      const scorecard = scorecardGenerator.generateScorecard(summaries);

      const ranking = scorecardGenerator.getOverallRanking(scorecard);
      assert.ok(ranking.length >= 1);
      assert.strictEqual(ranking[0].rank, 1);
    });
  });
});
