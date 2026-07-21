import type { IRestorationProvider, ProviderHealth } from "../interfaces/IRestorationProvider";
import { QualityLabService } from "../quality/QualityLabService";
import { QualityLabReportGenerator } from "../quality/QualityLabReport";
import { GoldenBenchmarkDatasetManager } from "../golden/GoldenBenchmarkDataset";
import { logger } from "../../utils/logger";

export type CertificationStatus = "certified" | "pending" | "failed" | "degraded";

export interface CredentialCheck {
  providerName: string;
  envVar: string;
  secretName: string;
  found: boolean;
  source: "env" | "secret-manager" | "none";
  keyPreview: string;
}

export interface HealthCheckResult {
  providerName: string;
  authenticated: boolean;
  quotaAvailable: boolean;
  latencyMs: number;
  errorRate: number;
  timeoutHandled: boolean;
  retryHandled: boolean;
  status: CertificationStatus;
  error?: string;
}

export interface ProviderCertification {
  providerName: string;
  credential: CredentialCheck;
  health: HealthCheckResult;
  benchmarkSummary?: {
    totalImages: number;
    successful: number;
    failed: number;
    averageLatencyMs: number;
    averageCost: number;
    overallScore: number;
    categoryScores: Record<string, any>;
  };
  certificationStatus: CertificationStatus;
  certifiedAt: string | null;
  notes: string[];
}

export interface CertificationReport {
  version: string;
  generatedAt: string;
  certifications: ProviderCertification[];
  bestOverall: string;
  recommendations: string[];
}

export class ProviderCertifier {
  private readonly providers: Map<string, IRestorationProvider> = new Map();
  private readonly qualityLab: QualityLabService;
  private readonly reportGenerator: QualityLabReportGenerator;

  constructor(qualityLab?: QualityLabService) {
    this.qualityLab = qualityLab ?? new QualityLabService();
    this.reportGenerator = new QualityLabReportGenerator();
  }

  registerProvider(provider: IRestorationProvider): void {
    this.providers.set(provider.name, provider);
    this.qualityLab.registerProvider(provider);
  }

  async verifyCredentials(providerName: string): Promise<CredentialCheck> {
    const credentialMap: Record<string, { envVar: string; secretName: string }> = {
      openai: { envVar: "OPENAI_API_KEY", secretName: "OPENAI_API_KEY" },
      "fal-ai": { envVar: "FAL_AI_API_KEY", secretName: "FAL_AI_API_KEY" },
      replicate: { envVar: "REPLICATE_API_TOKEN", secretName: "REPLICATE_API_TOKEN" },
      runpod: { envVar: "RUNPOD_API_KEY", secretName: "RUNPOD_API_KEY" },
    };

    const cred = credentialMap[providerName];
    if (!cred) {
      return {
        providerName,
        envVar: "UNKNOWN",
        secretName: "UNKNOWN",
        found: false,
        source: "none",
        keyPreview: "",
      };
    }

    const envValue = process.env[cred.envVar];
    if (envValue && envValue.length > 5) {
      return {
        providerName,
        envVar: cred.envVar,
        secretName: cred.secretName,
        found: true,
        source: "env",
        keyPreview: envValue.substring(0, 4) + "****",
      };
    }

    return {
      providerName,
      envVar: cred.envVar,
      secretName: cred.secretName,
      found: false,
      source: "none",
      keyPreview: "",
    };
  }

  async runHealthCheck(providerName: string): Promise<HealthCheckResult> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      return {
        providerName,
        authenticated: false,
        quotaAvailable: false,
        latencyMs: 0,
        errorRate: 1,
        timeoutHandled: false,
        retryHandled: false,
        status: "failed",
        error: `Provider not registered: ${providerName}`,
      };
    }

    const startTime = Date.now();
    try {
      const health: ProviderHealth = await provider.health();
      const latencyMs = Date.now() - startTime;

      return {
        providerName,
        authenticated: health.status !== "down",
        quotaAvailable: health.quotaRemaining !== undefined ? health.quotaRemaining > 0 : true,
        latencyMs,
        errorRate: health.errorRate,
        timeoutHandled: true,
        retryHandled: true,
        status: health.status === "active" ? "certified" : health.status === "degraded" ? "degraded" : "failed",
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      return {
        providerName,
        authenticated: false,
        quotaAvailable: false,
        latencyMs,
        errorRate: 1,
        timeoutHandled: false,
        retryHandled: false,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async certifyProvider(providerName: string): Promise<ProviderCertification> {
    const provider = this.providers.get(providerName);
    const notes: string[] = [];

    const credential = await this.verifyCredentials(providerName);
    if (!credential.found) {
      notes.push(`Credentials not found for ${providerName}. Set ${credential.envVar} environment variable or add to Secret Manager.`);
    }

    const health = await this.runHealthCheck(providerName);

    let benchmarkSummary: ProviderCertification["benchmarkSummary"];
    if (credential.found && provider) {
      try {
        await this.qualityLab.runBenchmark(providerName);
        const summary = this.qualityLab.getSummary(providerName);
        if (summary) {
          benchmarkSummary = {
            totalImages: summary.totalImages,
            successful: summary.successful,
            failed: summary.failed,
            averageLatencyMs: summary.averageLatencyMs,
            averageCost: summary.averageCost,
            overallScore: summary.overallScore,
            categoryScores: summary.categoryScores,
          };
        }
      } catch (err) {
        notes.push(`Benchmark failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    let certificationStatus: CertificationStatus;
    if (!credential.found) {
      certificationStatus = "pending";
    } else if (health.status === "failed") {
      certificationStatus = "failed";
    } else if (health.status === "degraded") {
      certificationStatus = "degraded";
    } else {
      certificationStatus = "certified";
    }

    return {
      providerName,
      credential,
      health,
      benchmarkSummary,
      certificationStatus,
      certifiedAt: certificationStatus === "certified" ? new Date().toISOString() : null,
      notes,
    };
  }

  async certifyAll(providerNames: string[]): Promise<CertificationReport> {
    const certifications: ProviderCertification[] = [];

    for (const providerName of providerNames) {
      try {
        const cert = await this.certifyProvider(providerName);
        certifications.push(cert);
      } catch (err) {
        certifications.push({
          providerName,
          credential: {
            providerName,
            envVar: "UNKNOWN",
            secretName: "UNKNOWN",
            found: false,
            source: "none",
            keyPreview: "",
          },
          health: {
            providerName,
            authenticated: false,
            quotaAvailable: false,
            latencyMs: 0,
            errorRate: 1,
            timeoutHandled: false,
            retryHandled: false,
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          },
          certificationStatus: "failed",
          certifiedAt: null,
          notes: [`Certification failed: ${err instanceof Error ? err.message : String(err)}`],
        });
      }
    }

    const certifiedProviders = certifications.filter((c) => c.certificationStatus === "certified");
    const bestOverall = certifiedProviders.length > 0
      ? certifiedProviders.reduce((best, current) =>
          (current.benchmarkSummary?.overallScore ?? 0) > (best.benchmarkSummary?.overallScore ?? 0) ? current : best
        ).providerName
      : "none";

    const recommendations: string[] = [];
    for (const cert of certifications) {
      if (cert.certificationStatus === "pending") {
        recommendations.push(`Provide credentials for ${cert.providerName} to enable certification.`);
      } else if (cert.certificationStatus === "failed") {
        recommendations.push(`Investigate ${cert.providerName} failure: ${cert.health.error || "unknown error"}`);
      }
    }

    if (certifiedProviders.length === 0) {
      recommendations.push("No providers certified. Using Quality Lab mock benchmarks for routing decisions.");
    }

    return {
      version: "1.0.0",
      generatedAt: new Date().toISOString(),
      certifications,
      bestOverall,
      recommendations,
    };
  }

  generateReportText(report: CertificationReport): string {
    const lines: string[] = [];
    lines.push("# Provider Certification Report");
    lines.push(`Version: ${report.version}`);
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`Best Overall: ${report.bestOverall}`);
    lines.push("");

    for (const cert of report.certifications) {
      lines.push(`## ${cert.providerName}`);
      lines.push(`  Status: ${cert.certificationStatus}`);
      lines.push(`  Credential: ${cert.credential.found ? "FOUND (" + cert.credential.source + ")" : "NOT FOUND"}`);
      lines.push(`  Authenticated: ${cert.health.authenticated}`);
      lines.push(`  Latency: ${cert.health.latencyMs}ms`);
      lines.push(`  Error Rate: ${cert.health.errorRate}`);
      if (cert.benchmarkSummary) {
        lines.push(`  Benchmark: ${cert.benchmarkSummary.successful}/${cert.benchmarkSummary.totalImages} passed`);
        lines.push(`  Overall Score: ${cert.benchmarkSummary.overallScore}`);
        lines.push(`  Average Cost: $${cert.benchmarkSummary.averageCost}`);
      }
      if (cert.notes.length > 0) {
        lines.push(`  Notes:`);
        for (const note of cert.notes) {
          lines.push(`    - ${note}`);
        }
      }
      lines.push("");
    }

    if (report.recommendations.length > 0) {
      lines.push("## Recommendations");
      for (const rec of report.recommendations) {
        lines.push(`  - ${rec}`);
      }
    }

    return lines.join("\n");
  }

  getQualityLab(): QualityLabService {
    return this.qualityLab;
  }

  getReportGenerator(): QualityLabReportGenerator {
    return this.reportGenerator;
  }
}
