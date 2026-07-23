import type { PackageTier, RoutingContext, RoutingDecision } from "../interfaces/IRestorationProvider";

export type ProviderMode = "automatic" | "manual" | "benchmark" | "shadow";

export interface PackagePolicy {
  tier: PackageTier;
  primaryProvider: string;
  fallbackProvider: string | null;
  shadowProvider: string | null;
  costCapPerImage: number;
  qualityTarget: number;
  description: string;
}

export interface ProviderScore {
  providerName: string;
  restorationScore: number;
  colorizationScore: number;
  faceRestorationScore: number;
  printQualityScore: number;
  costScore: number;
  latencyScore: number;
  reliabilityScore: number;
  overallScore: number;
  lastUpdated: string;
}

export interface DynamicRoutingConfig {
  mode: ProviderMode;
  benchmarkWeights: {
    restoration: number;
    colorization: number;
    faceRestoration: number;
    printQuality: number;
    cost: number;
    latency: number;
    reliability: number;
  };
  minScoreThreshold: number;
  maxCostOverride: number;
}

export interface PolicyConfig {
  policies: PackagePolicy[];
  defaultTier: PackageTier;
  shadowMode: boolean;
  shadowProvider: string | null;
  dynamicRouting: DynamicRoutingConfig;
  providerScores: Map<string, ProviderScore>;
  disabledProviders: string[];
}

export const DEFAULT_DYNAMIC_ROUTING: DynamicRoutingConfig = {
  mode: "automatic",
  benchmarkWeights: {
    restoration: 0.25,
    colorization: 0.15,
    faceRestoration: 0.15,
    printQuality: 0.15,
    cost: 0.10,
    latency: 0.10,
    reliability: 0.10,
  },
  minScoreThreshold: 30,
  maxCostOverride: 0.100,
};

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  policies: [
    {
      tier: "preview",
      primaryProvider: "flux-restore",
      fallbackProvider: "unified-local",
      shadowProvider: null,
      costCapPerImage: 0.005,
      qualityTarget: 40,
      description: "Preview tier - FLUX Restore primary, unified-local fallback",
    },
    {
      tier: "basic",
      primaryProvider: "flux-restore",
      fallbackProvider: "unified-local",
      shadowProvider: null,
      costCapPerImage: 0.010,
      qualityTarget: 50,
      description: "Basic tier - FLUX Restore primary, unified-local fallback",
    },
    {
      tier: "premium",
      primaryProvider: "flux-restore",
      fallbackProvider: "unified-local",
      shadowProvider: null,
      costCapPerImage: 0.050,
      qualityTarget: 85,
      description: "Premium tier - FLUX Restore primary, unified-local fallback",
    },
    {
      tier: "print",
      primaryProvider: "flux-restore",
      fallbackProvider: "unified-local",
      shadowProvider: null,
      costCapPerImage: 0.100,
      qualityTarget: 90,
      description: "Print tier - FLUX Restore primary, unified-local fallback",
    },
    {
      tier: "archive",
      primaryProvider: "flux-restore",
      fallbackProvider: "unified-local",
      shadowProvider: null,
      costCapPerImage: 0.010,
      qualityTarget: 50,
      description: "Archive tier - FLUX Restore primary, unified-local fallback",
    },
  ],
  defaultTier: "basic",
  shadowMode: false,
  shadowProvider: null,
  dynamicRouting: DEFAULT_DYNAMIC_ROUTING,
  providerScores: new Map(),
  disabledProviders: ["runpod"],
};

export class ProviderPolicyEngine {
  private readonly config: PolicyConfig;

  constructor(config?: Partial<PolicyConfig>) {
    this.config = {
      policies: config?.policies ?? DEFAULT_POLICY_CONFIG.policies,
      defaultTier: config?.defaultTier ?? DEFAULT_POLICY_CONFIG.defaultTier,
      shadowMode: config?.shadowMode ?? DEFAULT_POLICY_CONFIG.shadowMode,
      shadowProvider: config?.shadowProvider ?? DEFAULT_POLICY_CONFIG.shadowProvider,
      dynamicRouting: config?.dynamicRouting ?? DEFAULT_DYNAMIC_ROUTING,
      providerScores: config?.providerScores ?? new Map(),
      disabledProviders: config?.disabledProviders ? [...config.disabledProviders] : [...DEFAULT_POLICY_CONFIG.disabledProviders],
    };
  }

  getPolicy(tier: PackageTier): PackagePolicy {
    const policy = this.config.policies.find((p) => p.tier === tier);
    if (!policy) {
      return this.config.policies.find((p) => p.tier === this.config.defaultTier)!;
    }
    return policy;
  }

  getPolicyForContext(context: RoutingContext): PackagePolicy {
    return this.getPolicy(context.packageTier);
  }

  makeRoutingDecision(context: RoutingContext): RoutingDecision {
    const policy = this.getPolicyForContext(context);
    const mode = this.config.dynamicRouting.mode;

    let primaryProvider = policy.primaryProvider;
    let fallbackProvider = policy.fallbackProvider;
    let reason: string;

    if (mode === "benchmark" || mode === "automatic") {
      const bestProvider = this.selectBestProviderByScore(context);
      if (bestProvider) {
        primaryProvider = bestProvider;
        reason = `Dynamic routing: selected '${bestProvider}' based on benchmark scores for tier '${context.packageTier}'`;
      } else {
        reason = `Package tier '${context.packageTier}' maps to policy: ${policy.description}`;
      }
    } else {
      reason = `Package tier '${context.packageTier}' maps to policy: ${policy.description}`;
    }

    if (mode === "manual") {
      reason = `Manual mode: using policy-defined provider for tier '${context.packageTier}'`;
    }

    if (mode === "shadow") {
      reason = `Shadow mode: using policy-defined provider with shadow for tier '${context.packageTier}'`;
    }

    let shadowProvider: string | null = null;
    if (this.config.shadowMode && this.config.shadowProvider) {
      shadowProvider = this.config.shadowProvider;
    }

    return {
      primaryProvider,
      fallbackProvider,
      shadowProvider,
      reason,
    };
  }

  private selectBestProviderByScore(context: RoutingContext): string | null {
    if (this.config.providerScores.size === 0) {
      return null;
    }

    const weights = this.config.dynamicRouting.benchmarkWeights;
    const costCap = this.getPolicyForContext(context).costCapPerImage;

    let bestProvider: string | null = null;
    let bestScore = -1;

    for (const [providerName, score] of this.config.providerScores) {
      if (score.overallScore < this.config.dynamicRouting.minScoreThreshold) {
        continue;
      }

      const estimatedCost = this.estimateProviderCost(providerName, context);
      if (estimatedCost > costCap) {
        continue;
      }

      const weightedScore =
        score.restorationScore * weights.restoration +
        score.colorizationScore * weights.colorization +
        score.faceRestorationScore * weights.faceRestoration +
        score.printQualityScore * weights.printQuality +
        score.costScore * weights.cost +
        score.latencyScore * weights.latency +
        score.reliabilityScore * weights.reliability;

      if (weightedScore > bestScore) {
        bestScore = weightedScore;
        bestProvider = providerName;
      }
    }

    return bestProvider;
  }

  private estimateProviderCost(providerName: string, context: RoutingContext): number {
    const sizeBytes = context.imageSizeBytes ?? 500 * 1024;
    const sizeMb = sizeBytes / (1024 * 1024);

    const costMap: Record<string, number> = {
      openai: 0.04, // DALL-E 3 edit: $0.04/image
      "fal-ai": 0.04, // fal.ai photo restoration: $0.04/image
      replicate: 0.0037, // CodeFormer: ~$0.0037/run
      runpod: sizeMb < 1 ? 0.003 : sizeMb < 4 ? 0.008 : 0.015,
    };

    return costMap[providerName] ?? 0.05;
  }

  getAllPolicies(): PackagePolicy[] {
    return [...this.config.policies];
  }

  getDefaultTier(): PackageTier {
    return this.config.defaultTier;
  }

  isShadowModeEnabled(): boolean {
    return this.config.shadowMode;
  }

  getShadowProvider(): string | null {
    return this.config.shadowProvider;
  }

  getProviderMode(): ProviderMode {
    return this.config.dynamicRouting.mode;
  }

  getProviderScore(providerName: string): ProviderScore | undefined {
    return this.config.providerScores.get(providerName);
  }

  getAllProviderScores(): ProviderScore[] {
    return Array.from(this.config.providerScores.values());
  }

  updateProviderScore(score: ProviderScore): void {
    this.config.providerScores.set(score.providerName, score);
  }

  updateConfig(config: Partial<PolicyConfig>): void {
    this.config.policies = config.policies ?? this.config.policies;
    this.config.defaultTier = config.defaultTier ?? this.config.defaultTier;
    this.config.shadowMode = config.shadowMode ?? this.config.shadowMode;
    this.config.shadowProvider = config.shadowProvider ?? this.config.shadowProvider;
    this.config.dynamicRouting = config.dynamicRouting ?? this.config.dynamicRouting;
    this.config.providerScores = config.providerScores ?? this.config.providerScores;
    this.config.disabledProviders = config.disabledProviders ?? this.config.disabledProviders;
  }

  setProviderMode(mode: ProviderMode): void {
    this.config.dynamicRouting.mode = mode;
  }

  getDisabledProviders(): string[] {
    return [...this.config.disabledProviders];
  }

  isProviderDisabled(providerName: string): boolean {
    return this.config.disabledProviders.includes(providerName);
  }

  enableProvider(providerName: string): void {
    this.config.disabledProviders = this.config.disabledProviders.filter((p) => p !== providerName);
  }

  disableProvider(providerName: string): void {
    if (!this.config.disabledProviders.includes(providerName)) {
      this.config.disabledProviders.push(providerName);
    }
  }
}
