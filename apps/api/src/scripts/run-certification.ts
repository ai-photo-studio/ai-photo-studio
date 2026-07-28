import { ProviderCertifier } from "../restoration-providers/certification/ProviderCertifier";
import { CertificationReportGenerator } from "../restoration-providers/certification/CertificationReport";
import { MockProvider } from "../restoration-providers/providers/MockProvider";
import { OpenAIProvider } from "../restoration-providers/providers/OpenAIProvider";
import { FalAiProvider } from "../restoration-providers/providers/FalAiProvider";
import { ReplicateProvider } from "../restoration-providers/providers/ReplicateProvider";
import { RunPodProvider } from "../restoration-providers/providers/RunPodProvider";
import type { AppConfig } from "../config/env";

const mockConfig: AppConfig = {
  NODE_ENV: "development",
  PORT: 4000,
  DATABASE_URL: "postgresql://user:password@localhost:5432/ai_photo_studio",
  REDIS_URL: "redis://localhost:6379",
  STORAGE_PROVIDER: "mock",
  BACKGROUND_API_URL: "",
  PRODUCT_CLASSIFIER_URL: "",
  REAL_ESRGAN_URL: "",
  IC_LIGHT_LAB_URL: "",
  WHATSAPP_VERIFY_TOKEN: "test",
  WHATSAPP_ACCESS_TOKEN: "",
  WHATSAPP_PHONE_NUMBER_ID: "",
  PAYMENT_GATEWAY_NAME: "manual",
  PAYMENT_GATEWAY_BASE_URL: "",
  PAYMENT_GATEWAY_SECRET: "",
  AI_PROVIDER: "mock",
  AI_PROVIDER_NAME: "mock",
  PHOTOROOM_API_KEY: "",
  FAL_API_KEY: "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  FAL_AI_API_KEY: process.env.FAL_AI_API_KEY || "",
  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || "",
  PROVIDER_MODE: "automatic",
  YOLO_DETECTOR_URL: "",
  R2_ACCOUNT_ID: "",
  R2_ACCESS_KEY_ID: "",
  R2_SECRET_ACCESS_KEY: "",
  R2_BUCKET_NAME: "",
  R2_PUBLIC_BASE_URL: "",
  R2_ENDPOINT: "",
  AI_PROVIDER_API_KEY: "",
  RESTORATION_ENDPOINT_URL: "",
  QUEUE_TIMEOUT_SECONDS: 60,
  PROCESSING_TIMEOUT_SECONDS: 90,
  ABSOLUTE_TIMEOUT_SECONDS: 150,
  ADMIN_JWT_SECRET: "test",
  JWT_SECRET: "test",
  DELIVERY_MODE: "LOG_ONLY",
  ALLOWED_ORIGINS: "",
  aiProvider: "mock",
  paymentProvider: "manual",
  whatsappDryRun: true,
  storageDryRun: true,
  queueDryRun: true,
  deliveryMode: "LOG_ONLY",
  providerMode: "automatic",
  restorationPipeline: "replicate" as const,
};

const certifier = new ProviderCertifier();

certifier.registerProvider(new MockProvider());
certifier.registerProvider(new OpenAIProvider(mockConfig));
certifier.registerProvider(new FalAiProvider());
certifier.registerProvider(new ReplicateProvider());
certifier.registerProvider(new RunPodProvider(mockConfig));

async function main() {
  console.log("=== OPS-85: Live Provider Certification ===");
  console.log("");

  const providerNames = ["openai", "fal-ai", "replicate", "runpod"];
  const report = await certifier.certifyAll(providerNames);

  console.log("=== Certification Report ===");
  console.log("");

  const reportText = certifier.generateReportText(report);
  console.log(reportText);

  console.log("");
  console.log("=== Production Readiness ===");
  const reportGen = new CertificationReportGenerator();
  const readiness = reportGen.generateProductionReadiness(report);
  console.log(`Ready: ${readiness.ready}`);
  console.log(`Reasons: ${readiness.reasons.join(", ") || "None"}`);
  console.log(`Recommendations: ${readiness.recommendations.join(", ")}`);

  console.log("");
  console.log("=== Certification Table ===");
  console.log(reportGen.formatCertificationTable(report));

  return report;
}

main().catch((err) => {
  console.error("Certification failed:", err);
  process.exit(1);
});
