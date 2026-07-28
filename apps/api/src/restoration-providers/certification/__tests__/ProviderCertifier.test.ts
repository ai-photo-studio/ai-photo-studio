import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { ProviderCertifier } from "../ProviderCertifier";
import { CertificationReportGenerator } from "../CertificationReport";
import { MockProvider } from "../../providers/MockProvider";

describe("ProviderCertifier", () => {
  let certifier: ProviderCertifier;
  let mockProvider: MockProvider;

  before(() => {
    certifier = new ProviderCertifier();
    mockProvider = new MockProvider();
    certifier.registerProvider(mockProvider);
  });

  describe("registerProvider", () => {
    it("should register a provider", () => {
      assert.ok(certifier.getQualityLab().getProvider("mock"));
    });
  });

  describe("verifyCredentials", () => {
    it("should check credentials for openai", async () => {
      const cred = await certifier.verifyCredentials("openai");
      assert.strictEqual(cred.providerName, "openai");
      assert.strictEqual(cred.envVar, "OPENAI_API_KEY");
      assert.strictEqual(cred.secretName, "OPENAI_API_KEY");
    });

    it("should check credentials for fal-ai", async () => {
      const cred = await certifier.verifyCredentials("fal-ai");
      assert.strictEqual(cred.providerName, "fal-ai");
      assert.strictEqual(cred.envVar, "FAL_AI_API_KEY");
    });

    it("should check credentials for replicate", async () => {
      const cred = await certifier.verifyCredentials("replicate");
      assert.strictEqual(cred.providerName, "replicate");
      assert.strictEqual(cred.envVar, "REPLICATE_API_TOKEN");
    });

    it("should check credentials for runpod", async () => {
      const cred = await certifier.verifyCredentials("runpod");
      assert.strictEqual(cred.providerName, "runpod");
      assert.strictEqual(cred.envVar, "RUNPOD_API_KEY");
    });

    it("should return not found for unknown provider", async () => {
      const cred = await certifier.verifyCredentials("unknown");
      assert.strictEqual(cred.found, false);
      assert.strictEqual(cred.source, "none");
    });
  });

  describe("runHealthCheck", () => {
    it("should run health check for registered provider", async () => {
      const health = await certifier.runHealthCheck("mock");
      assert.strictEqual(health.providerName, "mock");
      assert.ok(health.authenticated);
      assert.ok(health.latencyMs >= 0);
    });

    it("should return failed for unregistered provider", async () => {
      const health = await certifier.runHealthCheck("nonexistent");
      assert.strictEqual(health.status, "failed");
      assert.ok(health.error);
    });
  });

  describe("certifyProvider", () => {
    it("should certify a provider", async () => {
      const cert = await certifier.certifyProvider("mock");
      assert.strictEqual(cert.providerName, "mock");
      assert.ok(cert.credential);
      assert.ok(cert.health);
      assert.ok(cert.certificationStatus);
      assert.ok(Array.isArray(cert.notes));
    });

    it("should return pending for provider without credentials", async () => {
      const cert = await certifier.certifyProvider("openai");
      assert.strictEqual(cert.certificationStatus, "pending");
      assert.ok(cert.notes.length > 0);
    });
  });

  describe("certifyAll", () => {
    it("should certify multiple providers", async () => {
      const report = await certifier.certifyAll(["mock", "openai"]);

      assert.strictEqual(report.version, "1.0.0");
      assert.ok(report.generatedAt);
      assert.ok(report.certifications.length >= 2);
      assert.ok(report.bestOverall);
      assert.ok(Array.isArray(report.recommendations));
    });

    it("should handle provider failures gracefully", async () => {
      const report = await certifier.certifyAll(["nonexistent"]);

      assert.strictEqual(report.certifications.length, 1);
      assert.ok(["failed", "pending"].includes(report.certifications[0].certificationStatus));
    });
  });

  describe("generateReportText", () => {
    it("should generate text report", async () => {
      const report = await certifier.certifyAll(["mock"]);
      const text = certifier.generateReportText(report);

      assert.ok(text.includes("Provider Certification Report"));
      assert.ok(text.includes("mock"));
    });
  });
});

describe("CertificationReportGenerator", () => {
  let reportGenerator: CertificationReportGenerator;

  const mockReport = {
    version: "1.0.0",
    generatedAt: "2026-07-21T00:00:00.000Z",
    certifications: [
      {
        providerName: "mock",
        credential: { providerName: "mock", envVar: "MOCK_KEY", secretName: "MOCK_KEY", found: true, source: "env" as const, keyPreview: "****" },
        health: { providerName: "mock", authenticated: true, quotaAvailable: true, latencyMs: 5, errorRate: 0, timeoutHandled: true, retryHandled: true, status: "certified" as const },
        benchmarkSummary: { totalImages: 12, successful: 12, failed: 0, averageLatencyMs: 5, averageCost: 0, overallScore: 75, categoryScores: {} },
        certificationStatus: "certified" as const,
        certifiedAt: "2026-07-21T00:00:00.000Z",
        notes: [],
      },
      {
        providerName: "openai",
        credential: { providerName: "openai", envVar: "OPENAI_API_KEY", secretName: "OPENAI_API_KEY", found: false, source: "none" as const, keyPreview: "" },
        health: { providerName: "openai", authenticated: false, quotaAvailable: false, latencyMs: 0, errorRate: 1, timeoutHandled: false, retryHandled: false, status: "failed" as const },
        certificationStatus: "pending" as const,
        certifiedAt: null,
        notes: ["Credentials not found"],
      },
    ],
    bestOverall: "mock",
    recommendations: ["Provide credentials for openai"],
  };

  before(() => {
    reportGenerator = new CertificationReportGenerator();
  });

  describe("generateSummary", () => {
    it("should generate summary from report", () => {
      const summary = reportGenerator.generateSummary(mockReport as any);

      assert.strictEqual(summary.totalProviders, 2);
      assert.strictEqual(summary.certified, 1);
      assert.strictEqual(summary.pending, 1);
      assert.strictEqual(summary.failed, 0);
    });
  });

  describe("getProvidersByStatus", () => {
    it("should return certified providers", () => {
      const certified = reportGenerator.getProvidersByStatus(mockReport as any, "certified");
      assert.strictEqual(certified.length, 1);
      assert.strictEqual(certified[0].providerName, "mock");
    });

    it("should return pending providers", () => {
      const pending = reportGenerator.getProvidersByStatus(mockReport as any, "pending");
      assert.strictEqual(pending.length, 1);
      assert.strictEqual(pending[0].providerName, "openai");
    });
  });

  describe("getCertifiedProviders", () => {
    it("should return only certified providers", () => {
      const certified = reportGenerator.getCertifiedProviders(mockReport as any);
      assert.strictEqual(certified.length, 1);
    });
  });

  describe("getRecommendedProviders", () => {
    it("should return recommended providers sorted by score", () => {
      const recommended = reportGenerator.getRecommendedProviders(mockReport as any);
      assert.strictEqual(recommended.length, 1);
      assert.strictEqual(recommended[0], "mock");
    });
  });

  describe("generateProductionReadiness", () => {
    it("should return ready=true when providers are certified", () => {
      const readiness = reportGenerator.generateProductionReadiness(mockReport as any);
      assert.strictEqual(readiness.ready, true);
    });

    it("should return ready=false when no providers certified", () => {
      const noCertReport = {
        ...mockReport,
        certifications: mockReport.certifications.map((c) => ({ ...c, certificationStatus: "pending" })),
      };
      const readiness = reportGenerator.generateProductionReadiness(noCertReport as any);
      assert.strictEqual(readiness.ready, false);
    });
  });

  describe("formatCertificationTable", () => {
    it("should format table", () => {
      const table = reportGenerator.formatCertificationTable(mockReport as any);
      assert.ok(table.includes("Provider"));
      assert.ok(table.includes("mock"));
      assert.ok(table.includes("openai"));
    });
  });
});
