import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ReplicateProvider } from "../restoration-providers/providers/ReplicateProvider";
import { OpenAIProvider } from "../restoration-providers/providers/OpenAIProvider";
import { FluxRestoreProvider } from "../restoration-providers/providers/FluxRestoreProvider";
import { GFPGANProvider } from "../restoration-providers/providers/GFPGANProvider";
import { DDColorProvider } from "../restoration-providers/providers/DDColorProvider";
import { NAFNetProvider } from "../restoration-providers/providers/NAFNetProvider";
import { QualityMetricsCalculator } from "../restoration-providers/quality/QualityMetricsCalculator";
import { PipelineOrchestrator } from "../restoration-providers/pipeline/PipelineOrchestrator";
import type { IRestorationProvider, RestorationRequest } from "../restoration-providers/interfaces/IRestorationProvider";
import type { AppConfig } from "../config/env";

// ============================================================
// OPS-96: Production Pipeline Modernization Benchmark
// ============================================================

const OLD_IMAGES_DIR = join(process.cwd(), "..", "..", "old images");
const RESULTS_DIR = join(OLD_IMAGES_DIR, "results");
const BENCHMARK_DIR = join(process.cwd(), "..", "..", "benchmark", "results");

function getTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return [d.getFullYear(), "-", pad(d.getMonth() + 1), "-", pad(d.getDate()), "_", pad(d.getHours()), "-", pad(d.getMinutes()), "-", pad(d.getSeconds())].join("");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function fd(n: number): string { return n.toFixed(6); }
function f2(n: number): string { return n.toFixed(2); }

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
};

interface BenchmarkEntry {
  provider: string;
  model: string;
  latencyMs: number;
  inputSizeBytes: number;
  outputSizeBytes: number;
  estimatedCost: number;
  actualCost: number;
  costSource: string;
  gpuSeconds: number;
  ssim: number;
  psnr: number;
  sharpness: number;
  noise: number;
  contrast: number;
  brightness: number;
  printQuality: number;
  success: boolean;
  failureReason: string;
  timestamp: string;
  stages: string[];
}

async function benchmarkProvider(
  provider: IRestorationProvider,
  providerName: string,
  modelLabel: string,
  imageBuf: Buffer,
  requestOpts?: Partial<RestorationRequest>
): Promise<BenchmarkEntry> {
  const metricsCalc = new QualityMetricsCalculator();
  const timestamp = getTimestamp();

  const request: RestorationRequest = {
    image: imageBuf,
    contentType: "image/jpeg",
    fileName: "benchmark.jpeg",
    options: {
      restoreFaces: true,
      upscale: false,
      quality: "auto",
      outputFormat: "png",
      ...(requestOpts?.options || {}),
    },
  };

  const startTime = Date.now();
  try {
    const result = await provider.restore(request);
    const latencyMs = Date.now() - startTime;
    const metrics = metricsCalc.calculateMetrics(imageBuf, result.image);

    return {
      provider: providerName,
      model: modelLabel,
      latencyMs,
      inputSizeBytes: imageBuf.length,
      outputSizeBytes: result.image.length,
      estimatedCost: result.estimatedCost,
      actualCost: result.actualCost ?? result.estimatedCost,
      costSource: result.costSource || "estimated",
      gpuSeconds: result.actualGPUSeconds || 0,
      ssim: metrics.ssim,
      psnr: metrics.psnr,
      sharpness: metrics.sharpness,
      noise: metrics.noise,
      contrast: metrics.contrast,
      brightness: metrics.brightness,
      printQuality: metrics.printQuality,
      success: true,
      failureReason: "",
      timestamp,
      stages: result.stages || [providerName],
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    return {
      provider: providerName,
      model: modelLabel,
      latencyMs,
      inputSizeBytes: imageBuf.length,
      outputSizeBytes: 0,
      estimatedCost: 0,
      actualCost: 0,
      costSource: "estimated",
      gpuSeconds: 0,
      ssim: 0, psnr: 0, sharpness: 0, noise: 0, contrast: 0, brightness: 0, printQuality: 0,
      success: false,
      failureReason: err instanceof Error ? err.message : String(err),
      timestamp,
      stages: [],
    };
  }
}

async function main() {
  console.log("========================================");
  console.log("OPS-96: Production Pipeline Modernization");
  console.log("========================================");
  console.log("");

  const hasReplicateToken = !!process.env.REPLICATE_API_TOKEN;
  const hasOpenAiKey = !!process.env.OPENAI_API_KEY;
  console.log("Checking API keys...");
  console.log("  REPLICATE_API_TOKEN: " + (hasReplicateToken ? "SET" : "NOT SET"));
  console.log("  OPENAI_API_KEY: " + (hasOpenAiKey ? "SET" : "NOT SET"));
  if (!hasReplicateToken || !hasOpenAiKey) {
    console.error("Both API keys are required.");
    process.exit(1);
  }
  console.log("");

  // Use ONE benchmark image (2.jpeg as per OPS-96 spec)
  const imagePath = join(OLD_IMAGES_DIR, "2.jpeg");
  if (!existsSync(imagePath)) {
    console.error("Benchmark image not found:", imagePath);
    process.exit(1);
  }
  const imageBuf = readFileSync(imagePath);
  const timestamp = getTimestamp();
  console.log("Benchmark image:", imagePath, `(${formatBytes(imageBuf.length)})`);
  console.log("Timestamp:", timestamp);
  console.log("");

  // Create output directories
  const outputDir = join(BENCHMARK_DIR, `ops96-${timestamp}`);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const entries: BenchmarkEntry[] = [];

  // ============================================================
  // PHASE 1: Individual Provider Benchmarks
  // ============================================================
  console.log("=== PHASE 1: Individual Provider Benchmarks ===");
  console.log("");

  // 1.1 GPT Image 1.5 (OpenAI)
  console.log("1.1 GPT Image 1.5 (OpenAI)...");
  const openai15Request: RestorationRequest = {
    image: imageBuf, contentType: "image/jpeg", fileName: "2.jpeg",
    options: { quality: "auto", outputFormat: "png" },
  };
  // We reuse the existing OpenAIProvider which now auto-detects best model
  const openai = new OpenAIProvider(mockConfig);
  const openaiResult = await benchmarkProvider(openai, "GPT Image 1.5", "gpt-image-1.5", imageBuf, { options: { quality: "auto", outputFormat: "png" } });
  entries.push(openaiResult);
  if (openaiResult.success) {
    const outPath = join(outputDir, `${timestamp}_gpt-image-1.5.png`);
    // Need the actual output buffer
  }
  console.log("  Result:", openaiResult.success ? "OK" : "FAIL", `| ${openaiResult.latencyMs}ms | $${fd(openaiResult.actualCost)}`);
  console.log("");

  // 1.2 FLUX Restore
  console.log("1.2 FLUX Restore...");
  const fluxRestore = new FluxRestoreProvider();
  const fluxResult = await benchmarkProvider(fluxRestore, "FLUX Restore", "flux-kontext-apps/restore-image", imageBuf);
  entries.push(fluxResult);
  console.log("  Result:", fluxResult.success ? "OK" : "FAIL", `| ${fluxResult.latencyMs}ms | $${fd(fluxResult.actualCost)}`);
  console.log("");

  // 1.3 GFPGAN
  console.log("1.3 GFPGAN...");
  const gfpgan = new GFPGANProvider();
  const gfpganResult = await benchmarkProvider(gfpgan, "GFPGAN", "tencentarc/gfpgan", imageBuf);
  entries.push(gfpganResult);
  console.log("  Result:", gfpganResult.success ? "OK" : "FAIL", `| ${gfpganResult.latencyMs}ms | $${fd(gfpganResult.actualCost)}`);
  console.log("");

  // 1.4 DDColor
  console.log("1.4 DDColor...");
  const ddcolor = new DDColorProvider();
  const ddcolorResult = await benchmarkProvider(ddcolor, "DDColor", "piddnad/ddcolor", imageBuf, { options: { colorize: true } });
  entries.push(ddcolorResult);
  console.log("  Result:", ddcolorResult.success ? "OK" : "FAIL", `| ${ddcolorResult.latencyMs}ms | $${fd(ddcolorResult.actualCost)}`);
  console.log("");

  // 1.5 NAFNet
  console.log("1.5 NAFNet...");
  const nafnet = new NAFNetProvider();
  const nafnetResult = await benchmarkProvider(nafnet, "NAFNet", "megvii-research/nafnet", imageBuf);
  entries.push(nafnetResult);
  console.log("  Result:", nafnetResult.success ? "OK" : "FAIL", `| ${nafnetResult.latencyMs}ms | $${fd(nafnetResult.actualCost)}`);
  console.log("");

  // ============================================================
  // PHASE 2: Combined Pipeline Benchmarks
  // ============================================================
  console.log("=== PHASE 2: Combined Pipeline Benchmarks ===");
  console.log("");

  const pipeline = new PipelineOrchestrator(mockConfig);

  // 2.1 Light pipeline (GPT Image 1.5)
  console.log("2.1 Light Pipeline...");
  try {
    const lightResult = await pipeline.execute({
      image: imageBuf, contentType: "image/jpeg", fileName: "2.jpeg",
      options: { quality: "auto", outputFormat: "png" },
    }, "light");
    entries.push({
      provider: "Light Pipeline",
      model: "GPT Image 1.5",
      latencyMs: lightResult.totalProcessingTimeMs,
      inputSizeBytes: imageBuf.length,
      outputSizeBytes: lightResult.final.image.length,
      estimatedCost: lightResult.totalEstimatedCost,
      actualCost: lightResult.totalActualCost,
      costSource: "calculated",
      gpuSeconds: 0,
      ssim: 0, psnr: 0, sharpness: 0, noise: 0, contrast: 0, brightness: 0, printQuality: 0,
      success: true,
      failureReason: "",
      timestamp,
      stages: lightResult.final.stages,
    });
    writeFileSync(join(outputDir, `${timestamp}_light_pipeline.png`), lightResult.final.image);
    console.log("  Result: OK", `| ${lightResult.totalProcessingTimeMs}ms | $${fd(lightResult.totalActualCost)}`);
  } catch (err: any) {
    console.log("  Result: FAIL", err.message);
  }
  console.log("");

  // 2.2 HD Pipeline (FLUX Restore → GFPGAN)
  console.log("2.2 HD Pipeline...");
  try {
    const hdResult = await pipeline.execute({
      image: imageBuf, contentType: "image/jpeg", fileName: "2.jpeg",
      options: { quality: "auto", outputFormat: "png" },
    }, "hd");
    entries.push({
      provider: "HD Pipeline",
      model: "FLUX Restore → GFPGAN",
      latencyMs: hdResult.totalProcessingTimeMs,
      inputSizeBytes: imageBuf.length,
      outputSizeBytes: hdResult.final.image.length,
      estimatedCost: hdResult.totalEstimatedCost,
      actualCost: hdResult.totalActualCost,
      costSource: "calculated",
      gpuSeconds: 0,
      ssim: 0, psnr: 0, sharpness: 0, noise: 0, contrast: 0, brightness: 0, printQuality: 0,
      success: true,
      failureReason: "",
      timestamp,
      stages: hdResult.final.stages,
    });
    writeFileSync(join(outputDir, `${timestamp}_hd_pipeline.png`), hdResult.final.image);
    console.log("  Result: OK", `| ${hdResult.totalProcessingTimeMs}ms | $${fd(hdResult.totalActualCost)}`);
  } catch (err: any) {
    console.log("  Result: FAIL", err.message);
  }
  console.log("");

  // 2.3 Premium Pipeline (FLUX Restore → GFPGAN → DDColor → GPT Image 2)
  console.log("2.3 Premium Pipeline...");
  try {
    const premiumResult = await pipeline.execute({
      image: imageBuf, contentType: "image/jpeg", fileName: "2.jpeg",
      options: { quality: "auto", outputFormat: "png" },
    }, "premium");
    entries.push({
      provider: "Premium Pipeline",
      model: "FLUX Restore → GFPGAN → DDColor → GPT Image 2",
      latencyMs: premiumResult.totalProcessingTimeMs,
      inputSizeBytes: imageBuf.length,
      outputSizeBytes: premiumResult.final.image.length,
      estimatedCost: premiumResult.totalEstimatedCost,
      actualCost: premiumResult.totalActualCost,
      costSource: "calculated",
      gpuSeconds: 0,
      ssim: 0, psnr: 0, sharpness: 0, noise: 0, contrast: 0, brightness: 0, printQuality: 0,
      success: true,
      failureReason: "",
      timestamp,
      stages: premiumResult.final.stages,
    });
    writeFileSync(join(outputDir, `${timestamp}_premium_pipeline.png`), premiumResult.final.image);
    console.log("  Result: OK", `| ${premiumResult.totalProcessingTimeMs}ms | $${fd(premiumResult.totalActualCost)}`);
  } catch (err: any) {
    console.log("  Result: FAIL", err.message);
  }
  console.log("");

  // ============================================================
  // PHASE 3: Benchmark Report
  // ============================================================
  console.log("=== PHASE 3: Benchmark Report ===");
  console.log("");

  // Compute quality metrics for all successful entries
  const metricsCalc = new QualityMetricsCalculator();
  for (const entry of entries) {
    if (entry.success) {
      // Calculate quality scores
      const qualityScores = {
        scratchRemoval: Math.min(100, Math.round(entry.sharpness * 6 + Math.max(0, 30 - entry.noise) + entry.ssim * 37.5)),
        crackRepair: Math.min(100, Math.round(entry.ssim * 62.5 + entry.printQuality * 5)),
        colorFidelity: Math.min(100, Math.round(entry.contrast * 3.5 + Math.max(0, 100 - Math.abs(entry.brightness - 128)))),
        identityPreservation: Math.min(100, Math.round(entry.ssim * 75 + entry.psnr * 5)),
        printReadiness: Math.min(100, entry.printQuality),
        overall: 0,
      };
      qualityScores.overall = Math.round(
        (qualityScores.scratchRemoval + qualityScores.crackRepair +
         qualityScores.colorFidelity + qualityScores.identityPreservation +
         qualityScores.printReadiness) / 5
      );
      // Store temp score for reporting
      (entry as any).qualityScores = qualityScores;
    }
  }

  // Generate consolidated report
  const reportLines: string[] = [];
  reportLines.push("# OPS-96 Production Pipeline Modernization Report");
  reportLines.push("");
  reportLines.push("**Date:** " + new Date().toISOString());
  reportLines.push("**Image:** 2.jpeg (" + formatBytes(imageBuf.length) + ")");
  reportLines.push("");
  reportLines.push("## Individual Provider Benchmarks");
  reportLines.join("\n");

  console.log("Report generated.");
  console.log("");

  // ============================================================
  // PHASE 4: Analysis Summary
  // ============================================================
  console.log("=== PHASE 4: Provider Ranking (by overall quality score) ===");
  const ranked = entries.filter((e) => e.success).sort((a, b) => {
    const aScore = ((a as any).qualityScores?.overall ?? 0);
    const bScore = ((b as any).qualityScores?.overall ?? 0);
    return bScore - aScore;
  });
  console.log("");
  console.log("Rank | Provider | Latency | Cost | Quality");
  console.log("---------------------------------------------");
  ranked.forEach((e, i) => {
    const q = (e as any).qualityScores?.overall ?? 0;
    console.log(`  ${i + 1}  | ${e.provider.padEnd(20)} | ${String(e.latencyMs).padEnd(7)}ms | $${fd(e.actualCost).padEnd(10)} | ${q}/100`);
  });
  console.log("");

  // ============================================================
  // PHASE 5: Cost Analysis
  // ============================================================
  console.log("=== PHASE 5: Cost Analysis ===");
  console.log("");
  const totalCost = entries.reduce((s, e) => s + e.actualCost, 0);
  const successfulCost = entries.filter((e) => e.success).reduce((s, e) => s + e.actualCost, 0);
  console.log("Total benchmark cost: $" + fd(totalCost));
  console.log("Successful runs cost: $" + fd(successfulCost));
  console.log("");

  // Calculate recommended selling prices
  // Target: 3x-5x cost for commercial viability
  const costByProvider: Record<string, number> = {};
  for (const e of entries) {
    if (e.success) {
      costByProvider[e.provider] = (costByProvider[e.provider] || 0) + e.actualCost;
    }
  }

  console.log("Provider | Cost/Image | Recommended Price (3x) | Recommended Price (5x) | Pakistan Margin (40%)");
  console.log("----------------------------------------------------------------------------------------------------");
  for (const [provider, cost] of Object.entries(costByProvider)) {
    const price3x = cost * 3;
    const price5x = cost * 5;
    const pkMargin3x = price3x * 0.4;
    const pkMargin5x = price5x * 0.4;
    console.log(`${provider.padEnd(22)} | $${fd(cost).padEnd(10)} | $${fd(price3x).padEnd(10)} | $${fd(price5x).padEnd(10)} | $${fd(pkMargin3x).padEnd(10)} / $${fd(pkMargin5x)}`);
  }
  console.log("");

  // ============================================================
  // PHASE 6: Save Report
  // ============================================================
  const reportPath = join(outputDir, "OPS96-BenchmarkReport.md");
  const reportContent = [
    "# OPS-96 Benchmark Report",
    "",
    "**Date:** " + new Date().toISOString(),
    "**Image:** 2.jpeg",
    "",
    "## Results",
    "",
    "| Provider | Status | Latency (ms) | Cost ($) | SSIM | PSNR | Sharpness | Print Quality |",
    "|---|---|---|---|---|---|---|---|",
    ...entries.map((e) =>
      `| ${e.provider} | ${e.success ? "✅" : "❌"} | ${e.latencyMs} | ${fd(e.actualCost)} | ${e.ssim} | ${f2(e.psnr)} | ${e.sharpness} | ${e.printQuality} |`
    ),
    "",
    "## Quality Scores",
    "",
    "| Provider | Identity Preservation | Scratch Removal | Crack Repair | Color Fidelity | Print Readiness | Overall |",
    "|---|---|---|---|---|---|---|",
    ...ranked.map((e) => {
      const q = (e as any).qualityScores || {};
      return `| ${e.provider} | ${q.identityPreservation || 0} | ${q.scratchRemoval || 0} | ${q.crackRepair || 0} | ${q.colorFidelity || 0} | ${q.printReadiness || 0} | ${q.overall || 0} |`;
    }),
    "",
    "## Cost Analysis",
    "",
    "| Provider | Cost/Image | 3x Price | 5x Price | 40% Margin (3x) | 40% Margin (5x) |",
    "|---|---|---|---|---|---|",
    ...Object.entries(costByProvider).map(([p, c]) =>
      `| ${p} | $${fd(c)} | $${fd(c * 3)} | $${fd(c * 5)} | $${fd(c * 3 * 0.4)} | $${fd(c * 5 * 0.4)} |`
    ),
    "",
    "## Cost Source Classification",
    "| Label | Definition |",
    "|---|---|",
    "| **ACTUAL** | Value from provider's billing API or invoice |",
    "| **CALCULATED** | Value computed from measured usage × official pricing |",
    "| **ESTIMATED** | Value based on fixed per-operation pricing |",
    "",
    "## Notes",
    "",
    "- All new providers (FLUX Restore, GFPGAN, DDColor, NAFNet) use Replicate's Nvidia L40S GPU at ~$0.0023/GPU-second",
    "- OpenAI pricing updated to gpt-image-2 token rates ($0.000008/input token, $0.000030/output token)",
    "- DALL-E 2/3 references removed (deprecated May 2026)",
    "- Existing CodeFormer provider kept unchanged",
    "",
  ].join("\n");

  writeFileSync(reportPath, reportContent);
  console.log("Report saved:", reportPath);

  // Save comparison HTML
  const htmlPath = join(outputDir, "index.html");
  const htmlContent = [
    "<!DOCTYPE html>",
    "<html><head><meta charset='utf-8'><title>OPS-96 Benchmark</title>",
    "<style>",
    "body{font-family:sans-serif;margin:20px;background:#f5f5f5}",
    "h1{color:#333}",
    "table{border-collapse:collapse;width:100%;margin:16px 0;background:#fff}",
    "th,td{border:1px solid #ddd;padding:8px;text-align:left}",
    "th{background:#fafafa;font-weight:600}",
    ".pass{color:#090;font-weight:bold}",
    ".fail{color:#c00;font-weight:bold}",
    ".gallery{display:flex;flex-wrap:wrap;gap:20px}",
    ".card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:16px;max-width:500px}",
    ".card img{max-width:100%}",
    "</style></head><body>",
    "<h1>OPS-96 Benchmark Results</h1>",
    "<p>Timestamp: " + timestamp + "</p>",
    "<h2>Individual Providers</h2>",
    "<table><tr><th>Provider</th><th>Status</th><th>Latency</th><th>Cost</th><th>Quality</th></tr>",
    ...entries.map((e) => {
      const q = (e as any).qualityScores?.overall ?? 0;
      return `<tr><td>${e.provider}</td><td class="${e.success ? "pass" : "fail"}">${e.success ? "PASS" : "FAIL"}</td><td>${e.latencyMs}ms</td><td>$${fd(e.actualCost)}</td><td>${e.success ? q + "/100" : "N/A"}</td></tr>`;
    }),
    "</table>",
    "<h2>Cost Analysis</h2>",
    "<table><tr><th>Provider</th><th>Cost/Image</th><th>3x Price</th><th>5x Price</th><th>Pakistan Margin (40%)</th></tr>",
    ...Object.entries(costByProvider).map(([p, c]) =>
      `<tr><td>${p}</td><td>$${fd(c)}</td><td>$${fd(c * 3)}</td><td>$${fd(c * 5)}</td><td>$${fd(c * 3 * 0.4)} - $${fd(c * 5 * 0.4)}</td></tr>`
    ),
    "</table>",
    "<p>Output files: " + outputDir + "</p>",
    "</body></html>",
  ].join("\n");

  writeFileSync(htmlPath, htmlContent);
  console.log("HTML report saved:", htmlPath);
  console.log("");
  console.log("========================================");
  console.log("OPS-96 Benchmark Complete");
  const successCount = entries.filter((e) => e.success).length;
  const failCount = entries.filter((e) => !e.success).length;
  console.log("  Successful:", successCount, "| Failed:", failCount);
  console.log("  Total cost: $" + fd(totalCost));
  console.log("========================================");
}

main().catch(function(err) {
  console.error("OPS-96 benchmark failed:", err);
  process.exit(1);
});
