import type { ProviderCertification, CertificationReport, CertificationStatus } from "./ProviderCertifier";

export interface CertificationSummary {
  totalProviders: number;
  certified: number;
  pending: number;
  failed: number;
  degraded: number;
}

export class CertificationReportGenerator {
  generateSummary(report: CertificationReport): CertificationSummary {
    const summary: CertificationSummary = {
      totalProviders: report.certifications.length,
      certified: 0,
      pending: 0,
      failed: 0,
      degraded: 0,
    };

    for (const cert of report.certifications) {
      switch (cert.certificationStatus) {
        case "certified":
          summary.certified++;
          break;
        case "pending":
          summary.pending++;
          break;
        case "failed":
          summary.failed++;
          break;
        case "degraded":
          summary.degraded++;
          break;
      }
    }

    return summary;
  }

  getProvidersByStatus(report: CertificationReport, status: CertificationStatus): ProviderCertification[] {
    return report.certifications.filter((c) => c.certificationStatus === status);
  }

  getCertifiedProviders(report: CertificationReport): ProviderCertification[] {
    return this.getProvidersByStatus(report, "certified");
  }

  getRecommendedProviders(report: CertificationReport): string[] {
    return this.getCertifiedProviders(report)
      .sort((a, b) => (b.benchmarkSummary?.overallScore ?? 0) - (a.benchmarkSummary?.overallScore ?? 0))
      .map((c) => c.providerName);
  }

  getProviderRecommendations(report: CertificationReport, category: string): string[] {
    const certified = this.getCertifiedProviders(report);
    if (certified.length === 0) return [];

    return certified
      .map((cert) => ({
        name: cert.providerName,
        score: cert.benchmarkSummary?.categoryScores[category]?.overall ?? 0,
      }))
      .sort((a, b) => b.score - a.score)
      .map((p) => p.name);
  }

  generateProductionReadiness(report: CertificationReport): {
    ready: boolean;
    reasons: string[];
    recommendations: string[];
  } {
    const reasons: string[] = [];
    const recommendations: string[] = [];

    const summary = this.generateSummary(report);

    if (summary.certified === 0) {
      reasons.push("No providers certified");
      recommendations.push("Obtain API credentials for at least one commercial provider");
    }

    if (summary.failed > 0) {
      reasons.push(`${summary.failed} provider(s) failed certification`);
      recommendations.push("Investigate failed providers before production use");
    }

    const ready = summary.certified > 0 && summary.failed === 0;

    if (ready) {
      recommendations.push(`Use ${report.bestOverall} as primary provider`);
    }

    return {
      ready,
      reasons,
      recommendations,
    };
  }

  formatCertificationTable(report: CertificationReport): string {
    const lines: string[] = [];
    lines.push("| Provider | Status | Auth | Latency | Cost | Score |");
    lines.push("|---|---|---|---|---|---|");

    for (const cert of report.certifications) {
      const status = cert.certificationStatus;
      const auth = cert.health.authenticated ? "Yes" : "No";
      const latency = `${cert.health.latencyMs}ms`;
      const cost = cert.benchmarkSummary ? `$${cert.benchmarkSummary.averageCost}` : "N/A";
      const score = cert.benchmarkSummary ? cert.benchmarkSummary.overallScore : "N/A";

      lines.push(`| ${cert.providerName} | ${status} | ${auth} | ${latency} | ${cost} | ${score} |`);
    }

    return lines.join("\n");
  }
}
