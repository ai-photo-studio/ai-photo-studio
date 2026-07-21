import type { IRestorationProvider, RestorationRequest } from "../interfaces/IRestorationProvider";
import { GoldenBenchmarkDatasetManager, type BenchmarkCategory } from "../golden/GoldenBenchmarkDataset";
import { QualityMetricsCalculator, type BenchmarkResult } from "./QualityMetricsCalculator";
import { logger } from "../../utils/logger";

export interface QualityLabConfig {
  benchmarkVersion: string;
  maxConcurrency: number;
  timeoutMs: number;
  skipExisting: boolean;
}

export interface QualityLabSummary {
  providerName: string;
  benchmarkVersion: string;
  totalImages: number;
  successful: number;
  failed: number;
  averageLatencyMs: number;
  averageCost: number;
  categoryScores: Record<string, {
    restoration: number;
    colorization: number;
    faceRestoration: number;
    printQuality: number;
    cost: number;
    latency: number;
    reliability: number;
    overall: number;
  }>;
  overallScore: number;
  lastBenchmarkAt: string;
}

export class QualityLabService {
  private readonly providers: Map<string, IRestorationProvider> = new Map();
  private readonly datasetManager: GoldenBenchmarkDatasetManager;
  private readonly metricsCalculator: QualityMetricsCalculator;
  private readonly config: QualityLabConfig;
  private readonly results: Map<string, BenchmarkResult[]> = new Map();

  constructor(
    datasetManager?: GoldenBenchmarkDatasetManager,
    config?: Partial<QualityLabConfig>
  ) {
    this.datasetManager = datasetManager ?? new GoldenBenchmarkDatasetManager();
    this.metricsCalculator = new QualityMetricsCalculator();
    this.config = {
      benchmarkVersion: "1.0.0",
      maxConcurrency: 3,
      timeoutMs: 120000,
      skipExisting: false,
      ...config,
    };
  }

  registerProvider(provider: IRestorationProvider): void {
    this.providers.set(provider.name, provider);
  }

  getProvider(name: string): IRestorationProvider | undefined {
    return this.providers.get(name);
  }

  async runBenchmark(
    providerName: string,
    categories?: BenchmarkCategory[]
  ): Promise<BenchmarkResult[]> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider not registered: ${providerName}`);
    }

    const images = this.datasetManager.getAllImages();
    const filteredImages = categories
      ? images.filter((img) => categories.includes(img.category))
      : images;

    const results: BenchmarkResult[] = [];

    for (let i = 0; i < filteredImages.length; i += this.config.maxConcurrency) {
      const chunk = filteredImages.slice(i, i + this.config.maxConcurrency);
      const chunkResults = await Promise.all(
        chunk.map((image) => this.runSingleBenchmark(provider, image))
      );
      results.push(...chunkResults);
    }

    this.results.set(providerName, results);

    logger.info("Quality Lab benchmark completed", {
      providerName,
      totalImages: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    });

    return results;
  }

  async runBenchmarkAll(
    providerNames: string[],
    categories?: BenchmarkCategory[]
  ): Promise<Map<string, QualityLabSummary>> {
    const summaries = new Map<string, QualityLabSummary>();

    for (const providerName of providerNames) {
      try {
        await this.runBenchmark(providerName, categories);
        const summary = this.computeSummary(providerName);
        summaries.set(providerName, summary);
      } catch (err) {
        logger.error("Quality Lab benchmark failed", {
          providerName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return summaries;
  }

  private async runSingleBenchmark(
    provider: IRestorationProvider,
    image: { id: string; fileName: string; contentType: string; category: string; expectedQuality: number }
  ): Promise<BenchmarkResult> {
    const startTime = Date.now();

    const request: RestorationRequest = {
      image: Buffer.from(`benchmark-image-${image.id}`),
      contentType: image.contentType,
      fileName: image.fileName,
      options: {
        restoreFaces: true,
        colorize: image.category === "black_and_white",
        upscale: image.category === "low_resolution",
        upscaleScale: 2,
      },
    };

    try {
      const result = await provider.restore(request);
      const processingTimeMs = Date.now() - startTime;

      const metrics = this.metricsCalculator.calculateMetrics(request.image, result.image);

      return {
        providerName: provider.name,
        imageId: image.id,
        imageCategory: image.category,
        processingTimeMs,
        estimatedCost: result.estimatedCost,
        success: true,
        outputImage: result.image,
        outputContentType: result.contentType,
        metrics,
      };
    } catch (err) {
      const processingTimeMs = Date.now() - startTime;
      return {
        providerName: provider.name,
        imageId: image.id,
        imageCategory: image.category,
        processingTimeMs,
        estimatedCost: 0,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        metrics: {
          ssim: 0,
          psnr: 0,
          sharpness: 0,
          noise: 0,
          contrast: 0,
          brightness: 0,
          printQuality: 0,
        },
      };
    }
  }

  private computeSummary(providerName: string): QualityLabSummary {
    const results = this.results.get(providerName) ?? [];
    const successful = results.filter((r) => r.success);

    const categoryScores: Record<string, any> = {};

    for (const category of this.datasetManager.getCategories()) {
      categoryScores[category] = this.metricsCalculator.calculateCategoryScore(results, category);
    }

    const avgLatency = successful.length > 0
      ? successful.reduce((sum, r) => sum + r.processingTimeMs, 0) / successful.length
      : 0;

    const avgCost = successful.length > 0
      ? successful.reduce((sum, r) => sum + r.estimatedCost, 0) / successful.length
      : 0;

    const overallScore = Math.round(
      Object.values(categoryScores).reduce((sum: number, scores: any) => sum + scores.overall, 0) /
      Object.keys(categoryScores).length
    ) || 0;

    return {
      providerName,
      benchmarkVersion: this.config.benchmarkVersion,
      totalImages: results.length,
      successful: successful.length,
      failed: results.filter((r) => !r.success).length,
      averageLatencyMs: Math.round(avgLatency),
      averageCost: Math.round(avgCost * 10000) / 10000,
      categoryScores,
      overallScore,
      lastBenchmarkAt: new Date().toISOString(),
    };
  }

  getSummary(providerName: string): QualityLabSummary | undefined {
    const results = this.results.get(providerName);
    if (!results) return undefined;
    return this.computeSummary(providerName);
  }

  getAllSummaries(): QualityLabSummary[] {
    const summaries: QualityLabSummary[] = [];
    for (const providerName of this.providers.keys()) {
      const summary = this.getSummary(providerName);
      if (summary) summaries.push(summary);
    }
    return summaries;
  }

  getResults(providerName: string): BenchmarkResult[] | undefined {
    return this.results.get(providerName);
  }

  clearResults(): void {
    this.results.clear();
  }

  getDatasetManager(): GoldenBenchmarkDatasetManager {
    return this.datasetManager;
  }

  getMetricsCalculator(): QualityMetricsCalculator {
    return this.metricsCalculator;
  }
}
