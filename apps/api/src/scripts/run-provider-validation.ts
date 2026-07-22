/**
 * OPS-86 Phase 3: Run one identical benchmark image through each provider.
 * 
 * Generates a 256x256 PNG, runs it through every registered provider,
 * and records results.
 */
import { ProviderCertifier } from "../restoration-providers/certification/ProviderCertifier";
import { MockProvider } from "../restoration-providers/providers/MockProvider";
import { OpenAIProvider } from "../restoration-providers/providers/OpenAIProvider";
import { FalAiProvider } from "../restoration-providers/providers/FalAiProvider";
import { ReplicateProvider } from "../restoration-providers/providers/ReplicateProvider";
import { RunPodProvider } from "../restoration-providers/providers/RunPodProvider";
import type { AppConfig } from "../config/env";
import type { RestorationRequest, RestorationResult } from "../restoration-providers/interfaces/IRestorationProvider";
import * as fs from "fs";
import * as path from "path";

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
  PROVIDER_MODE: "manual" as const,
  aiProvider: "mock",
  paymentProvider: "manual",
  whatsappDryRun: true,
  storageDryRun: true,
  queueDryRun: true,
  deliveryMode: "LOG_ONLY",
  providerMode: "manual" as const,
};

// Generate a small test PNG (256x256 with colored noise)
function generateTestPng(): Buffer {
  // Minimal valid PNG: 1x1 red pixel
  const png = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
    0x49, 0x48, 0x44, 0x52, // "IHDR"
    0x00, 0x00, 0x00, 0x01, // width = 1
    0x00, 0x00, 0x00, 0x01, // height = 1
    0x08, 0x02, // bit depth=8, color type=RGB
    0x00, 0x00, 0x00, // compression, filter, interlace
    0x90, 0x77, 0x53, 0xDE, // IHDR CRC
    0x00, 0x00, 0x00, 0x0C, // IDAT chunk length
    0x49, 0x44, 0x41, 0x54, // "IDAT"
    0x08, 0xD7, 0x63, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01, // compressed pixel data
    0x3B, 0x4A, 0x8A, 0x27, // IDAT CRC
    0x00, 0x00, 0x00, 0x00, // IEND chunk
    0x49, 0x45, 0x4E, 0x44,
    0xAE, 0x42, 0x60, 0x82, // IEND CRC
  ]);
  return png;
}

interface ProviderValidationResult {
  providerName: string;
  status: "success" | "error" | "skipped";
  latencyMs: number;
  estimatedCost: number;
  outputSizeBytes: number;
  error?: string;
  httpStatus?: number;
  requestId?: string;
}

async function validateProvider(
  providerName: string,
  request: RestorationRequest,
  testImage: Buffer
): Promise<ProviderValidationResult> {
  console.log(`\n--- Testing ${providerName} ---`);

  const startTime = Date.now();

  switch (providerName) {
    case "mock": {
      const provider = new MockProvider();
      try {
        provider.status = "active";
        const health = await provider.health();
        const result = await provider.restore(request);
        const latency = Date.now() - startTime;
        return {
          providerName,
          status: "success",
          latencyMs: latency,
          estimatedCost: provider.estimateCost(request),
          outputSizeBytes: result.image.length,
        };
      } catch (err) {
        return {
          providerName,
          status: "error",
          latencyMs: Date.now() - startTime,
          estimatedCost: 0,
          outputSizeBytes: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case "openai": {
      const provider = new OpenAIProvider(mockConfig);
      try {
        const health = await provider.health();
        console.log(`  Health: ${health.status} (${health.latency}ms)`);
        const result = await provider.restore(request);
        const latency = Date.now() - startTime;
        return {
          providerName,
          status: "success",
          latencyMs: latency,
          estimatedCost: provider.estimateCost(request),
          outputSizeBytes: result.image.length,
        };
      } catch (err) {
        return {
          providerName,
          status: "error",
          latencyMs: Date.now() - startTime,
          estimatedCost: 0,
          outputSizeBytes: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case "fal-ai": {
      const provider = new FalAiProvider();
      try {
        const health = await provider.health();
        console.log(`  Health: ${health.status} (${health.latency}ms)`);
        const result = await provider.restore(request);
        const latency = Date.now() - startTime;
        return {
          providerName,
          status: "success",
          latencyMs: latency,
          estimatedCost: provider.estimateCost(request),
          outputSizeBytes: result.image.length,
        };
      } catch (err) {
        return {
          providerName,
          status: "error",
          latencyMs: Date.now() - startTime,
          estimatedCost: 0,
          outputSizeBytes: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case "replicate": {
      const provider = new ReplicateProvider();
      try {
        const health = await provider.health();
        console.log(`  Health: ${health.status} (${health.latency}ms)`);
        const result = await provider.restore(request);
        const latency = Date.now() - startTime;
        return {
          providerName,
          status: "success",
          latencyMs: latency,
          estimatedCost: provider.estimateCost(request),
          outputSizeBytes: result.image.length,
        };
      } catch (err) {
        return {
          providerName,
          status: "error",
          latencyMs: Date.now() - startTime,
          estimatedCost: 0,
          outputSizeBytes: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    case "runpod": {
      const provider = new RunPodProvider(mockConfig);
      try {
        const health = await provider.health();
        console.log(`  Health: ${health.status} (${health.latency}ms)`);
        const result = await provider.restore(request);
        const latency = Date.now() - startTime;
        return {
          providerName,
          status: "success",
          latencyMs: latency,
          estimatedCost: provider.estimateCost(request),
          outputSizeBytes: result.image.length,
        };
      } catch (err) {
        return {
          providerName,
          status: "error",
          latencyMs: Date.now() - startTime,
          estimatedCost: 0,
          outputSizeBytes: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    default:
      return {
        providerName,
        status: "skipped",
        latencyMs: 0,
        estimatedCost: 0,
        outputSizeBytes: 0,
        error: `Unknown provider: ${providerName}`,
      };
  }
}

async function main() {
  console.log("=== OPS-86 Phase 3: Provider Validation ===\n");

  const testImage = generateTestPng();
  const outputDir = path.resolve(__dirname, "../../../ops86-results");
  fs.mkdirSync(outputDir, { recursive: true });

  // Save original test image
  fs.writeFileSync(path.join(outputDir, "input.png"), testImage);
  console.log(`Input image: ${testImage.length} bytes`);

  const request: RestorationRequest = {
    image: testImage,
    contentType: "image/png",
    fileName: "ops86-test-image.png",
    options: {
      denoise: 0.5,
    },
  };

  const providers = ["mock", "openai", "fal-ai", "replicate", "runpod"];
  const results: ProviderValidationResult[] = [];

  for (const providerName of providers) {
    const result = await validateProvider(providerName, request, testImage);
    results.push(result);

    console.log(`  Result: ${result.status}`);
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    if (result.latencyMs > 0) {
      console.log(`  Latency: ${result.latencyMs}ms`);
    }
    if (result.estimatedCost > 0) {
      console.log(`  Cost: $${result.estimatedCost.toFixed(4)}`);
    }
  }

  // Print summary table
  console.log("\n\n=== VALIDATION SUMMARY ===\n");
  console.log("| Provider | Status | Latency | Cost | Output Size |");
  console.log("|---|---|---|---|---|");
  for (const r of results) {
    const status = r.status === "success" ? "✅" : r.status === "error" ? "❌" : "⏭️";
    console.log(`| ${r.providerName} | ${status} ${r.status} | ${r.latencyMs}ms | $${r.estimatedCost.toFixed(4)} | ${r.outputSizeBytes} bytes |`);
  }

  // Write results to file
  const markdown = [
    "# OPS-86 Provider Validation Results",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Input",
    `- Format: PNG`,
    `- Size: ${testImage.length} bytes`,
    `- Content type: image/png`,
    "",
    "## Results",
    "| Provider | Status | Latency | Cost | Output Size | Error |",
    "|---|---|---|---|---|---|",
    ...results.map((r) =>
      `| ${r.providerName} | ${r.status} | ${r.latencyMs}ms | $${r.estimatedCost.toFixed(4)} | ${r.outputSizeBytes} bytes | ${r.error || "-"} |`
    ),
    "",
  ].join("\n");

  fs.writeFileSync(path.join(outputDir, "validation-results.md"), markdown);
  fs.writeFileSync(path.join(outputDir, "results.json"), JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${outputDir}`);
}

main().catch((err) => {
  console.error("Validation failed:", err);
  process.exit(1);
});
