import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { QualityLabService } from "../QualityLabService";
import { QualityMetricsCalculator } from "../QualityMetricsCalculator";
import { QualityLabReportGenerator } from "../QualityLabReport";
import { GoldenBenchmarkDatasetManager } from "../../golden/GoldenBenchmarkDataset";
import { MockProvider } from "../../providers/MockProvider";

describe("QualityLabService", () => {
  let qualityLab: QualityLabService;
  let mockProvider: MockProvider;
  let datasetManager: GoldenBenchmarkDatasetManager;

  before(() => {
    datasetManager = new GoldenBenchmarkDatasetManager();
    qualityLab = new QualityLabService(datasetManager, { benchmarkVersion: "1.0.0" });
    mockProvider = new MockProvider();
    qualityLab.registerProvider(mockProvider);
  });

  describe("registerProvider", () => {
    it("should register a provider", () => {
      assert.ok(qualityLab.getProvider("mock"));
    });

    it("should return undefined for unregistered provider", () => {
      assert.strictEqual(qualityLab.getProvider("nonexistent"), undefined);
    });
  });

  describe("runBenchmark", () => {
    it("should benchmark a provider with all images", async () => {
      const results = await qualityLab.runBenchmark("mock");

      const totalImages = datasetManager.getAllImages().length;
      assert.strictEqual(results.length, totalImages);
      assert.ok(results.every((r) => r.success));
      assert.ok(results.every((r) => r.providerName === "mock"));
    });

    it("should benchmark by category", async () => {
      const results = await qualityLab.runBenchmark("mock", ["portrait"]);

      const portraitImages = datasetManager.getImagesByCategory("portrait");
      assert.strictEqual(results.length, portraitImages.length);
      assert.ok(results.every((r) => r.imageCategory === "portrait"));
    });

    it("should handle provider failures", async () => {
      const failingProvider = {
        name: "failing",
        type: "internal" as const,
        status: "active" as const,
        restore: async () => { throw new Error("Test failure"); },
        health: async () => ({ status: "down" as const, latency: 0, errorRate: 1, lastChecked: new Date().toISOString() }),
        estimateCost: () => 0,
      };

      qualityLab.registerProvider(failingProvider);
      const results = await qualityLab.runBenchmark("failing");

      assert.ok(results.every((r) => !r.success));
      assert.ok(results.every((r) => r.error));
    });
  });

  describe("runBenchmarkAll", () => {
    it("should benchmark multiple providers", async () => {
      const summaries = await qualityLab.runBenchmarkAll(["mock"]);

      assert.ok(summaries.has("mock"));
      const summary = summaries.get("mock");
      assert.ok(summary);
      assert.strictEqual(summary.providerName, "mock");
      assert.ok(summary.totalImages > 0);
      assert.ok(summary.overallScore >= 0);
    });
  });

  describe("getSummary", () => {
    it("should return summary after benchmark", async () => {
      await qualityLab.runBenchmark("mock");
      const summary = qualityLab.getSummary("mock");

      assert.ok(summary);
      assert.strictEqual(summary.providerName, "mock");
      assert.ok(summary.categoryScores);
      assert.ok(summary.averageLatencyMs >= 0);
      assert.ok(summary.averageCost >= 0);
    });

    it("should return undefined for unbenchmarked provider", () => {
      assert.strictEqual(qualityLab.getSummary("nonexistent"), undefined);
    });
  });

  describe("getAllSummaries", () => {
    it("should return summaries for all benchmarked providers", async () => {
      await qualityLab.runBenchmark("mock");
      const summaries = qualityLab.getAllSummaries();

      assert.ok(summaries.length >= 1);
      assert.ok(summaries.some((s) => s.providerName === "mock"));
    });
  });

  describe("clearResults", () => {
    it("should clear all results", async () => {
      await qualityLab.runBenchmark("mock");
      assert.ok(qualityLab.getSummary("mock"));

      qualityLab.clearResults();
      assert.strictEqual(qualityLab.getSummary("mock"), undefined);
    });
  });
});

describe("QualityMetricsCalculator", () => {
  let calculator: QualityMetricsCalculator;

  before(() => {
    calculator = new QualityMetricsCalculator();
  });

  describe("calculateMetrics", () => {
    it("should calculate metrics for image buffers", () => {
      const original = Buffer.from("test-image-data-original");
      const restored = Buffer.from("test-image-data-restored");

      const metrics = calculator.calculateMetrics(original, restored);

      assert.ok(metrics.ssim >= 0);
      assert.ok(metrics.psnr >= 0);
      assert.ok(metrics.sharpness >= 0);
      assert.ok(metrics.noise >= 0);
      assert.ok(metrics.contrast >= 0);
      assert.ok(metrics.brightness >= 0);
      assert.ok(metrics.printQuality >= 0);
    });

    it("should handle empty buffers", () => {
      const empty = Buffer.alloc(0);
      const metrics = calculator.calculateMetrics(empty, empty);

      assert.strictEqual(metrics.ssim, 0);
      assert.strictEqual(metrics.psnr, 0);
    });
  });

  describe("calculateCategoryScore", () => {
    it("should calculate category scores from benchmark results", () => {
      const results = [
        {
          providerName: "mock",
          imageId: "img_001",
          imageCategory: "portrait",
          processingTimeMs: 100,
          estimatedCost: 0.005,
          success: true,
          metrics: { ssim: 80, psnr: 35, sharpness: 70, noise: 20, contrast: 60, brightness: 55, printQuality: 75 },
        },
        {
          providerName: "mock",
          imageId: "img_002",
          imageCategory: "portrait",
          processingTimeMs: 120,
          estimatedCost: 0.006,
          success: true,
          metrics: { ssim: 85, psnr: 38, sharpness: 75, noise: 18, contrast: 65, brightness: 58, printQuality: 80 },
        },
      ];

      const scores = calculator.calculateCategoryScore(results, "portrait");

      assert.ok(scores.restoration >= 0);
      assert.ok(scores.colorization >= 0);
      assert.ok(scores.faceRestoration >= 0);
      assert.ok(scores.printQuality >= 0);
      assert.ok(scores.cost >= 0);
      assert.ok(scores.latency >= 0);
      assert.ok(scores.reliability >= 0);
      assert.ok(scores.overall >= 0);
    });

    it("should handle empty results", () => {
      const scores = calculator.calculateCategoryScore([], "portrait");

      assert.strictEqual(scores.restoration, 0);
      assert.strictEqual(scores.overall, 0);
    });
  });
});

describe("QualityLabReportGenerator", () => {
  let reportGenerator: QualityLabReportGenerator;

  const mockSummaries = [
    {
      providerName: "mock",
      benchmarkVersion: "1.0.0",
      totalImages: 12,
      successful: 12,
      failed: 0,
      averageLatencyMs: 5,
      averageCost: 0,
      categoryScores: {
        portrait: { restoration: 75, colorization: 60, faceRestoration: 70, printQuality: 75, cost: 100, latency: 100, reliability: 100, overall: 78 },
        document: { restoration: 70, colorization: 55, faceRestoration: 65, printQuality: 70, cost: 100, latency: 100, reliability: 100, overall: 72 },
        black_and_white: { restoration: 65, colorization: 50, faceRestoration: 60, printQuality: 65, cost: 100, latency: 100, reliability: 100, overall: 67 },
        heavy_scratch: { restoration: 60, colorization: 45, faceRestoration: 55, printQuality: 60, cost: 100, latency: 100, reliability: 100, overall: 62 },
        faded: { restoration: 62, colorization: 48, faceRestoration: 58, printQuality: 62, cost: 100, latency: 100, reliability: 100, overall: 64 },
        document_2: { restoration: 70, colorization: 55, faceRestoration: 65, printQuality: 70, cost: 100, latency: 100, reliability: 100, overall: 72 },
        landscape: { restoration: 68, colorization: 52, faceRestoration: 62, printQuality: 68, cost: 100, latency: 100, reliability: 100, overall: 66 },
        low_resolution: { restoration: 55, colorization: 40, faceRestoration: 50, printQuality: 55, cost: 100, latency: 100, reliability: 100, overall: 57 },
        artwork: { restoration: 60, colorization: 45, faceRestoration: 55, printQuality: 60, cost: 100, latency: 100, reliability: 100, overall: 62 },
      },
      overallScore: 67,
      lastBenchmarkAt: "2026-07-21T00:00:00.000Z",
    },
  ];

  before(() => {
    reportGenerator = new QualityLabReportGenerator();
  });

  describe("generateReport", () => {
    it("should generate a quality lab report", () => {
      const report = reportGenerator.generateReport(mockSummaries as any, "1.0.0");

      assert.strictEqual(report.benchmarkVersion, "1.0.0");
      assert.ok(report.generatedAt);
      assert.ok(report.bestOverall);
      assert.ok(report.rankings.portrait);
      assert.ok(report.rankings.document);
      assert.ok(report.rankings.blackAndWhite);
      assert.ok(report.rankings.heavyRestoration);
      assert.ok(report.rankings.printQuality);
      assert.ok(report.rankings.overall);
    });

    it("should rank providers within each category", () => {
      const report = reportGenerator.generateReport(mockSummaries as any, "1.0.0");

      assert.strictEqual(report.rankings.overall[0].rank, 1);
      assert.strictEqual(report.rankings.overall[0].providerName, "mock");
    });
  });

  describe("getBestProviderForCategory", () => {
    it("should return best provider for overall", () => {
      const report = reportGenerator.generateReport(mockSummaries as any, "1.0.0");
      const best = reportGenerator.getBestProviderForCategory(report, "overall");

      assert.ok(best);
      assert.strictEqual(best.rank, 1);
    });
  });

  describe("getProviderRanking", () => {
    it("should return rankings for a specific provider", () => {
      const report = reportGenerator.generateReport(mockSummaries as any, "1.0.0");
      const rankings = reportGenerator.getProviderRanking(report, "mock");

      assert.ok(rankings.length >= 6);
    });
  });

  describe("formatReport", () => {
    it("should format report as text", () => {
      const report = reportGenerator.generateReport(mockSummaries as any, "1.0.0");
      const text = reportGenerator.formatReport(report);

      assert.ok(text.includes("Quality Laboratory Report"));
      assert.ok(text.includes("mock"));
    });
  });
});
