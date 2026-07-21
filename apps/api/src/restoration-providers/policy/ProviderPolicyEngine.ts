import type { PackageTier, RoutingContext, RoutingDecision } from "../interfaces/IRestorationProvider";

export interface PackagePolicy {
  tier: PackageTier;
  primaryProvider: string;
  fallbackProvider: string | null;
  shadowProvider: string | null;
  costCapPerImage: number;
  qualityTarget: number;
  description: string;
}

export interface PolicyConfig {
  policies: PackagePolicy[];
  defaultTier: PackageTier;
  shadowMode: boolean;
  shadowProvider: string | null;
}

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  policies: [
    {
      tier: "preview",
      primaryProvider: "runpod",
      fallbackProvider: null,
      shadowProvider: null,
      costCapPerImage: 0.005,
      qualityTarget: 40,
      description: "Preview tier - own models only, lowest cost",
    },
    {
      tier: "basic",
      primaryProvider: "runpod",
      fallbackProvider: null,
      shadowProvider: null,
      costCapPerImage: 0.010,
      qualityTarget: 50,
      description: "Basic tier - own models only, cost-effective",
    },
    {
      tier: "premium",
      primaryProvider: "fal-ai",
      fallbackProvider: "replicate",
      shadowProvider: null,
      costCapPerImage: 0.050,
      qualityTarget: 85,
      description: "Premium tier - commercial providers for best quality",
    },
    {
      tier: "print",
      primaryProvider: "fal-ai",
      fallbackProvider: "replicate",
      shadowProvider: null,
      costCapPerImage: 0.100,
      qualityTarget: 90,
      description: "Print tier - highest quality commercial providers",
    },
    {
      tier: "archive",
      primaryProvider: "runpod",
      fallbackProvider: null,
      shadowProvider: null,
      costCapPerImage: 0.010,
      qualityTarget: 50,
      description: "Archive tier - own models for long-term storage",
    },
  ],
  defaultTier: "basic",
  shadowMode: false,
  shadowProvider: null,
};

export class ProviderPolicyEngine {
  private readonly config: PolicyConfig;

  constructor(config?: Partial<PolicyConfig>) {
    this.config = {
      policies: config?.policies ?? DEFAULT_POLICY_CONFIG.policies,
      defaultTier: config?.defaultTier ?? DEFAULT_POLICY_CONFIG.defaultTier,
      shadowMode: config?.shadowMode ?? DEFAULT_POLICY_CONFIG.shadowMode,
      shadowProvider: config?.shadowProvider ?? DEFAULT_POLICY_CONFIG.shadowProvider,
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

    let shadowProvider: string | null = null;
    if (this.config.shadowMode && this.config.shadowProvider) {
      shadowProvider = this.config.shadowProvider;
    }

    return {
      primaryProvider: policy.primaryProvider,
      fallbackProvider: policy.fallbackProvider,
      shadowProvider,
      reason: `Package tier '${context.packageTier}' maps to policy: ${policy.description}`,
    };
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

  updateConfig(config: Partial<PolicyConfig>): void {
    this.config.policies = config.policies ?? this.config.policies;
    this.config.defaultTier = config.defaultTier ?? this.config.defaultTier;
    this.config.shadowMode = config.shadowMode ?? this.config.shadowMode;
    this.config.shadowProvider = config.shadowProvider ?? this.config.shadowProvider;
  }
}
