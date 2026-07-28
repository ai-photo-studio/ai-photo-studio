import type { CustomerPackage, PackageRoutingDecision } from "../interfaces/IRestorationProvider";

export interface PackageSpec {
  packageName: CustomerPackage;
  displayName: string;
  qualityThreshold: number;
  maxCostPerImage: number;
  resolution: string;
  description: string;
}

export interface ProviderBenchmarkData {
  providerName: string;
  avgSSIM: number;
  avgPSNR: number;
  avgSharpness: number;
  avgNoise: number;
  avgPrintQuality: number;
  avgCostPerImage: number;
  successRate: number;
  avgLatencyMs: number;
  totalImages: number;
  successfulImages: number;
}

export const PACKAGE_SPECS: PackageSpec[] = [
  {
    packageName: "original_restore",
    displayName: "Original Restore",
    qualityThreshold: 60,
    maxCostPerImage: 0.010,
    resolution: "1024x1024",
    description: "Standard restoration with automatic provider selection",
  },
  {
    packageName: "hd_2x",
    displayName: "HD 2x",
    qualityThreshold: 75,
    maxCostPerImage: 0.050,
    resolution: "1024x1024",
    description: "High-definition restoration with 2x upscaling",
  },
  {
    packageName: "premium_printable",
    displayName: "Premium Printable",
    qualityThreshold: 85,
    maxCostPerImage: 0.100,
    resolution: "1024x1024",
    description: "Premium quality restoration optimized for print",
  },
];

export class PackageRoutingService {
  private readonly benchmarks: Map<string, ProviderBenchmarkData> = new Map();

  registerBenchmarkData(data: ProviderBenchmarkData): void {
    this.benchmarks.set(data.providerName, data);
  }

  getPackageSpec(packageName: CustomerPackage): PackageSpec | undefined {
    return PACKAGE_SPECS.find((p) => p.packageName === packageName);
  }

  getAllPackageSpecs(): PackageSpec[] {
    return [...PACKAGE_SPECS];
  }

  routePackage(packageName: CustomerPackage): PackageRoutingDecision {
    const spec = this.getPackageSpec(packageName);
    if (!spec) {
      throw new Error(`Unknown package: ${packageName}`);
    }

    const providers = Array.from(this.benchmarks.values());

    if (providers.length === 0) {
      return {
        packageName,
        primaryProvider: "replicate",
        fallbackProvider: "openai",
        reason: "No benchmark data available — using default policy",
        qualityScore: 0,
        costPerImage: spec.maxCostPerImage,
      };
    }

    const eligible = providers.filter((p) => p.successRate > 0);

    if (eligible.length === 0) {
      return {
        packageName,
        primaryProvider: "replicate",
        fallbackProvider: "openai",
        reason: "No providers with successful benchmark results — using default policy",
        qualityScore: 0,
        costPerImage: spec.maxCostPerImage,
      };
    }

    let primary: ProviderBenchmarkData;
    let fallback: ProviderBenchmarkData | null = null;
    let reason: string;

    if (packageName === "original_restore") {
      // Lowest-cost provider that meets quality threshold
      const qualified = eligible.filter((p) => this.computeQualityScore(p) >= spec.qualityThreshold);
      if (qualified.length === 0) {
        primary = eligible.reduce((a, b) => (a.avgCostPerImage < b.avgCostPerImage ? a : b));
        reason = `No provider meets quality threshold (${spec.qualityThreshold}); selected lowest cost: ${primary.providerName}`;
      } else {
        primary = qualified.reduce((a, b) => (a.avgCostPerImage < b.avgCostPerImage ? a : b));
        reason = `Lowest-cost provider meeting quality threshold: ${primary.providerName}`;
      }
      const others = eligible.filter((p) => p.providerName !== primary.providerName);
      fallback = others.length > 0 ? others[0] : null;
    } else if (packageName === "hd_2x") {
      // Best quality/cost ratio
      const scored = eligible.map((p) => ({
        provider: p,
        ratio: this.computeQualityScore(p) / (p.avgCostPerImage > 0 ? p.avgCostPerImage : 0.001),
      }));
      scored.sort((a, b) => b.ratio - a.ratio);
      primary = scored[0].provider;
      reason = `Best quality/cost ratio: ${primary.providerName}`;
      const others = eligible.filter((p) => p.providerName !== primary.providerName);
      fallback = others.length > 0 ? others[0] : null;
    } else {
      // premium_printable: highest measured quality
      primary = eligible.reduce((a, b) => (this.computeQualityScore(b) > this.computeQualityScore(a) ? b : a));
      reason = `Highest measured quality: ${primary.providerName}`;
      const others = eligible.filter((p) => p.providerName !== primary.providerName);
      fallback = others.length > 0 ? others[0] : null;
    }

    return {
      packageName,
      primaryProvider: primary.providerName,
      fallbackProvider: fallback?.providerName ?? null,
      reason,
      qualityScore: this.computeQualityScore(primary),
      costPerImage: primary.avgCostPerImage,
    };
  }

  routeAllPackages(): PackageRoutingDecision[] {
    return PACKAGE_SPECS.map((spec) => this.routePackage(spec.packageName));
  }

  private computeQualityScore(p: ProviderBenchmarkData): number {
    const ssimNorm = Math.min(100, p.avgSSIM * 125);
    const psnrNorm = Math.min(100, (p.avgPSNR / 50) * 100);
    const sharpnessNorm = Math.min(100, p.avgSharpness);
    const noiseNorm = Math.min(100, 100 - p.avgNoise);
    const printNorm = Math.min(100, p.avgPrintQuality);

    return Math.round(
      ssimNorm * 0.25 +
        psnrNorm * 0.20 +
        sharpnessNorm * 0.20 +
        noiseNorm * 0.15 +
        printNorm * 0.20
    );
  }
}
