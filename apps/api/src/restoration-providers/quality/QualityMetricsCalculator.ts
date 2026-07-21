import type { GoldenBenchmarkImage } from "../golden/GoldenBenchmarkDataset";

export interface QualityMetrics {
  ssim: number;
  psnr: number;
  sharpness: number;
  noise: number;
  contrast: number;
  brightness: number;
  printQuality: number;
}

export interface BenchmarkResult {
  providerName: string;
  imageId: string;
  imageCategory: string;
  processingTimeMs: number;
  estimatedCost: number;
  success: boolean;
  error?: string;
  outputImage?: Buffer;
  outputContentType?: string;
  metrics: QualityMetrics;
}

export class QualityMetricsCalculator {
  calculateMetrics(original: Buffer, restored: Buffer): QualityMetrics {
    const ssim = this.calculateSSIM(original, restored);
    const psnr = this.calculatePSNR(original, restored);
    const sharpness = this.calculateSharpness(restored);
    const noise = this.calculateNoise(restored);
    const contrast = this.calculateContrast(restored);
    const brightness = this.calculateBrightness(restored);
    const printQuality = this.calculatePrintQuality(restored, { ssim, psnr, sharpness, noise, contrast, brightness });

    return {
      ssim: Math.round(ssim * 100) / 100,
      psnr: Math.round(psnr * 100) / 100,
      sharpness: Math.round(sharpness),
      noise: Math.round(noise),
      contrast: Math.round(contrast),
      brightness: Math.round(brightness),
      printQuality: Math.round(printQuality),
    };
  }

  private calculateSSIM(original: Buffer, restored: Buffer): number {
    const originalSize = original.length;
    const restoredSize = restored.length;

    if (originalSize === 0 || restoredSize === 0) return 0;

    const sizeRatio = Math.min(restoredSize / originalSize, 2);
    const baseScore = 0.5 + (sizeRatio - 1) * 0.3;

    const originalEntropy = this.calculateEntropy(original);
    const restoredEntropy = this.calculateEntropy(restored);
    const entropyDiff = Math.abs(originalEntropy - restoredEntropy);

    return Math.max(0, Math.min(1, baseScore - entropyDiff * 0.01));
  }

  private calculatePSNR(original: Buffer, restored: Buffer): number {
    if (original.length === 0 || restored.length === 0) return 0;

    const mse = this.calculateMSE(original, restored);
    if (mse === 0) return 50;

    const maxPixel = 255;
    return 20 * Math.log10(maxPixel / Math.sqrt(mse));
  }

  private calculateMSE(original: Buffer, restored: Buffer): number {
    const len = Math.min(original.length, restored.length);
    if (len === 0) return 0;

    let sum = 0;
    for (let i = 0; i < len; i++) {
      const diff = original[i] - restored[i];
      sum += diff * diff;
    }
    return sum / len;
  }

  private calculateSharpness(image: Buffer): number {
    if (image.length < 10) return 0;

    const laplacianSum = this.calculateLaplacianVariance(image);
    const sizeFactor = Math.min(image.length / 10000, 10);

    return Math.max(0, Math.min(100, laplacianSum * sizeFactor * 0.5));
  }

  private calculateLaplacianVariance(image: Buffer): number {
    if (image.length < 9) return 0;

    const laplacianKernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
    let sum = 0;
    let count = 0;

    const step = Math.max(1, Math.floor(image.length / 100));

    for (let i = 4; i < image.length - 4; i += step) {
      const pixel = image[i];
      const neighbors = [
        image[i - 1] || pixel,
        image[i + 1] || pixel,
        image[i - 2] || pixel,
        image[i + 2] || pixel,
      ];

      let laplacian = 0;
      for (let k = 0; k < 4; k++) {
        laplacian += neighbors[k] * laplacianKernel[k + 1];
      }
      laplacian += pixel * laplacianKernel[4];

      sum += laplacian * laplacian;
      count++;
    }

    return count > 0 ? sum / count : 0;
  }

  private calculateNoise(image: Buffer): number {
    if (image.length < 10) return 0;

    const step = Math.max(1, Math.floor(image.length / 50));
    let sum = 0;
    let sumSq = 0;
    let count = 0;

    for (let i = 0; i < image.length - step; i += step) {
      const diff = Math.abs(image[i] - image[i + step]);
      sum += diff;
      sumSq += diff * diff;
      count++;
    }

    if (count === 0) return 0;

    const mean = sum / count;
    const variance = sumSq / count - mean * mean;

    return Math.max(0, Math.min(100, variance * 0.5));
  }

  private calculateContrast(image: Buffer): number {
    if (image.length < 10) return 0;

    const step = Math.max(1, Math.floor(image.length / 100));
    const values: number[] = [];

    for (let i = 0; i < image.length; i += step) {
      values.push(image[i]);
    }

    if (values.length < 2) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return Math.max(0, Math.min(100, stdDev * 2));
  }

  private calculateBrightness(image: Buffer): number {
    if (image.length === 0) return 0;

    const step = Math.max(1, Math.floor(image.length / 100));
    let sum = 0;
    let count = 0;

    for (let i = 0; i < image.length; i += step) {
      sum += image[i];
      count++;
    }

    return count > 0 ? Math.max(0, Math.min(100, sum / count)) : 0;
  }

  private calculateEntropy(image: Buffer): number {
    if (image.length === 0) return 0;

    const histogram: number[] = new Array(256).fill(0);
    const step = Math.max(1, Math.floor(image.length / 256));

    for (let i = 0; i < image.length; i += step) {
      histogram[image[i]]++;
    }

    let entropy = 0;
    const total = image.length / step;

    for (const count of histogram) {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  private calculatePrintQuality(
    image: Buffer,
    metrics: { ssim: number; psnr: number; sharpness: number; noise: number; contrast: number; brightness: number }
  ): number {
    const score =
      metrics.sharpness * 0.35 +
      metrics.contrast * 0.25 +
      metrics.brightness * 0.15 +
      (100 - metrics.noise) * 0.15 +
      metrics.psnr * 0.10;

    const sizeBonus = image.length > 200 * 1024 ? 5 : 0;

    return Math.max(0, Math.min(100, score + sizeBonus));
  }

  calculateCategoryScore(results: BenchmarkResult[], category: string): {
    restoration: number;
    colorization: number;
    faceRestoration: number;
    printQuality: number;
    cost: number;
    latency: number;
    reliability: number;
    overall: number;
  } {
    const categoryResults = results.filter((r) => r.imageCategory === category && r.success);

    if (categoryResults.length === 0) {
      return {
        restoration: 0,
        colorization: 0,
        faceRestoration: 0,
        printQuality: 0,
        cost: 0,
        latency: 0,
        reliability: 0,
        overall: 0,
      };
    }

    const avgSsim = categoryResults.reduce((sum, r) => sum + r.metrics.ssim, 0) / categoryResults.length;
    const avgPsnr = categoryResults.reduce((sum, r) => sum + r.metrics.psnr, 0) / categoryResults.length;
    const avgSharpness = categoryResults.reduce((sum, r) => sum + r.metrics.sharpness, 0) / categoryResults.length;
    const avgNoise = categoryResults.reduce((sum, r) => sum + r.metrics.noise, 0) / categoryResults.length;
    const avgContrast = categoryResults.reduce((sum, r) => sum + r.metrics.contrast, 0) / categoryResults.length;
    const avgBrightness = categoryResults.reduce((sum, r) => sum + r.metrics.brightness, 0) / categoryResults.length;
    const avgPrintQuality = categoryResults.reduce((sum, r) => sum + r.metrics.printQuality, 0) / categoryResults.length;
    const avgLatency = categoryResults.reduce((sum, r) => sum + r.processingTimeMs, 0) / categoryResults.length;
    const avgCost = categoryResults.reduce((sum, r) => sum + r.estimatedCost, 0) / categoryResults.length;

    const restoration = Math.min(100, Math.round(avgSsim * 0.4 + avgPsnr * 0.3 + avgSharpness * 0.3));
    const colorization = Math.min(100, Math.round(avgContrast * 0.5 + avgBrightness * 0.5));
    const faceRestoration = Math.min(100, Math.round(avgSharpness * 0.4 + (100 - avgNoise) * 0.3 + avgSsim * 0.3));
    const printQuality = Math.round(avgPrintQuality);
    const cost = this.scoreCost(avgCost);
    const latency = this.scoreLatency(avgLatency);
    const reliability = 100;

    const overall = Math.round(
      restoration * 0.25 +
      colorization * 0.15 +
      faceRestoration * 0.15 +
      printQuality * 0.15 +
      cost * 0.10 +
      latency * 0.10 +
      reliability * 0.10
    );

    return {
      restoration,
      colorization,
      faceRestoration,
      printQuality,
      cost,
      latency,
      reliability,
      overall,
    };
  }

  private scoreCost(avgCost: number): number {
    if (avgCost < 0.005) return 100;
    if (avgCost < 0.01) return 90;
    if (avgCost < 0.02) return 75;
    if (avgCost < 0.05) return 60;
    if (avgCost < 0.10) return 40;
    return 20;
  }

  private scoreLatency(avgLatency: number): number {
    if (avgLatency < 2000) return 100;
    if (avgLatency < 5000) return 85;
    if (avgLatency < 10000) return 70;
    if (avgLatency < 30000) return 50;
    if (avgLatency < 60000) return 30;
    return 15;
  }
}
