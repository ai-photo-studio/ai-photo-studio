import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { FluxRestoreProvider } from "../restoration-providers/providers/FluxRestoreProvider";
import { UnifiedLocalRestorationProvider } from "../restoration-providers/providers/UnifiedLocalRestorationProvider";
import { QualityMetricsCalculator } from "../restoration-providers/quality/QualityMetricsCalculator";
import { PipelineOrchestrator } from "../restoration-providers/pipeline/PipelineOrchestrator";
import type { RestorationRequest } from "../restoration-providers/interfaces/IRestorationProvider";

const IMAGE_PATH = join(process.cwd(), "..", "..", "old images", "2.jpeg");
const RESULTS_DIR = join(process.cwd(), "..", "..", "benchmark", "results", "ops112");
const REPLICATE_API_BASE = "https://api.replicate.com/v1";
const REPLICATE_TOKEN = process.env.REPLICATE_API_TOKEN || "";

const mockConfig = {
  NODE_ENV: "development" as const,
  PORT: 4000,
  DATABASE_URL: "postgresql://user:password@localhost:5432/ai_photo_studio",
  REDIS_URL: "redis://localhost:6379",
  STORAGE_PROVIDER: "mock" as const,
  BACKGROUND_API_URL: process.env.BACKGROUND_API_URL || "",
  PRODUCT_CLASSIFIER_URL: process.env.PRODUCT_CLASSIFIER_URL || "",
  REAL_ESRGAN_URL: process.env.REAL_ESRGAN_URL || "",
  IC_LIGHT_LAB_URL: process.env.IC_LIGHT_LAB_URL || "",
  WHATSAPP_VERIFY_TOKEN: "test",
  WHATSAPP_ACCESS_TOKEN: "",
  WHATSAPP_PHONE_NUMBER_ID: "",
  PAYMENT_GATEWAY_NAME: "manual" as const,
  PAYMENT_GATEWAY_BASE_URL: "",
  PAYMENT_GATEWAY_SECRET: "",
  AI_PROVIDER: "mock",
  AI_PROVIDER_NAME: "mock",
  PHOTOROOM_API_KEY: "",
  FAL_API_KEY: "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  FAL_AI_API_KEY: process.env.FAL_AI_API_KEY || "",
  REPLICATE_API_TOKEN: REPLICATE_TOKEN,
  PROVIDER_MODE: "automatic" as const,
  YOLO_DETECTOR_URL: process.env.YOLO_DETECTOR_URL || "",
  R2_ACCOUNT_ID: "",
  R2_ACCESS_KEY_ID: "",
  R2_SECRET_ACCESS_KEY: "",
  R2_BUCKET_NAME: "",
  R2_PUBLIC_BASE_URL: "",
  R2_ENDPOINT: "",
  AI_PROVIDER_API_KEY: "",
  RESTORATION_ENDPOINT_URL: process.env.RESTORATION_ENDPOINT_URL || "",
  QUEUE_TIMEOUT_SECONDS: 60,
  PROCESSING_TIMEOUT_SECONDS: 90,
  ABSOLUTE_TIMEOUT_SECONDS: 150,
  ADMIN_JWT_SECRET: "test",
  JWT_SECRET: "test",
  DELIVERY_MODE: "LOG_ONLY" as const,
  ALLOWED_ORIGINS: "",
  aiProvider: "mock" as const,
  paymentProvider: "manual" as const,
  whatsappDryRun: true,
  storageDryRun: true,
  queueDryRun: true,
  deliveryMode: "LOG_ONLY" as const,
  providerMode: "automatic" as const,
};

function ensureDir(dir: string) { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); }
function sha256(buf: Buffer): string { return createHash("sha256").update(buf).digest("hex"); }

async function retryReplicate<T>(fn: () => Promise<T>, label: string, maxRetries = 10): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.includes("throttled") || msg.includes("rate limit")) {
        const wait = 15000 + attempt * 5000;
        console.log(`      Rate limited, waiting ${wait}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label} failed after ${maxRetries} retries due to rate limiting`);
}

async function getImageDimensions(buf: Buffer): Promise<{ width: number; height: number }> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buf).metadata();
    return { width: meta.width || 0, height: meta.height || 0 };
  } catch { return { width: 0, height: 0 }; }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function healthCheck(url: string, label: string): Promise<{ status: string; latencyMs: number; body?: string }> {
  const start = Date.now();
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const latency = Date.now() - start;
    const body = await resp.text().catch(() => "");
    return { status: `${resp.status}`, latencyMs: latency, body: body.slice(0, 500) };
  } catch (err) {
    return { status: "DOWN", latencyMs: Date.now() - start, body: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log("========================================");
  console.log("OPS-112: Production Environment Validation");
  console.log("========================================\n");

  ensureDir(RESULTS_DIR);

  // ===================================================================
  // STEP 1: Environment Audit
  // ===================================================================
  console.log("STEP 1: Environment Audit");
  console.log("-------------------------");

  const RESTORATION_URL = process.env.RESTORATION_ENDPOINT_URL || "";
  const REAL_ESRGAN_URL = process.env.REAL_ESRGAN_URL || "";
  const BG_URL = process.env.BACKGROUND_API_URL || "";
  const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

  const envVars: Array<{ var: string; expected: string; found: string; source: string; required: boolean }> = [];

  const checkEnv = (name: string, expectedPrefix: string, found: string, required: boolean) => {
    const source = found ? (found.length < 30 ? "env var (short ID)" : found.startsWith("http") ? "env var (URL)" : "env var") : "NOT SET";
    envVars.push({ var: name, expected: expectedPrefix, found: found || "NOT SET", source, required });
  };

  checkEnv("REPLICATE_API_TOKEN", "r8_*", REPLICATE_TOKEN ? "SET (" + REPLICATE_TOKEN.slice(0, 8) + "...)" : "", true);
  checkEnv("RESTORATION_ENDPOINT_URL", "RunPod ID or URL", RESTORATION_URL, true);
  checkEnv("REAL_ESRGAN_URL", "URL or RunPod ID", REAL_ESRGAN_URL, false);
  checkEnv("BACKGROUND_API_URL", "RunPod ID", BG_URL, false);
  checkEnv("OPENAI_API_KEY", "sk-*", OPENAI_KEY ? "SET (" + OPENAI_KEY.slice(0, 8) + "...)" : "", false);
  checkEnv("NODE_ENV", "development|production", process.env.NODE_ENV || "not set", false);

  const envLines: string[] = [];
  envLines.push("# OPS-112 Environment Audit");
  envLines.push("");
  envLines.push("**Date:** " + new Date().toISOString());
  envLines.push("");
  envLines.push("## Environment Variables");
  envLines.push("");
  envLines.push("| Variable | Expected | Current | Source | Required | Status |");
  envLines.push("|---|---|---|---|---|---|");
  for (const e of envVars) {
    const status = e.required ? (e.found !== "NOT SET" ? "PRESENT" : "MISSING") : (e.found !== "NOT SET" ? "PRESENT" : "OPTIONAL");
    envLines.push(`| \`${e.var}\` | ${e.expected} | ${e.found} | ${e.source} | ${e.required ? "YES" : "NO"} | ${status} |`);
  }
  envLines.push("");

  // ===================================================================
  // STEP 2: Local Service Health Checks
  // ===================================================================
  console.log("\nSTEP 2: Local Service Health Checks");
  console.log("----------------------------------");

  const services: Array<{ name: string; url: string; healthy: boolean; latencyMs: number; details: string }> = [];

  const checkService = async (name: string, url: string) => {
    if (!url) {
      services.push({ name, url: "NOT CONFIGURED", healthy: false, latencyMs: 0, details: "No URL configured" });
      console.log(`  ${name}: SKIPPED (not configured)`);
      return;
    }
    const baseUrl = url.length < 30 && !url.includes("://") && !url.includes(".")
      ? `https://api.runpod.ai/v2/${url}/health`
      : `${url.replace(/\/$/, "")}/health`;
    const result = await healthCheck(baseUrl, name);
    const ok = result.status.startsWith("20");
    services.push({ name, url, healthy: ok, latencyMs: result.latencyMs, details: ok ? `HTTP ${result.status}` : result.body });
    console.log(`  ${name}: ${ok ? "HEALTHY" : "DOWN"} (${result.latencyMs}ms)`);
  };

  await checkService("Restoration Unified (RunPod)", RESTORATION_URL);
  await checkService("Real-ESRGAN", REAL_ESRGAN_URL);

  const localSvcsLines: string[] = [];
  localSvcsLines.push("## Local Service Health");
  localSvcsLines.push("");
  localSvcsLines.push("| Service | URL | Healthy | Latency (ms) | Details |");
  localSvcsLines.push("|---|---|---|---|---|");
  for (const s of services) {
    localSvcsLines.push(`| ${s.name} | ${s.url} | ${s.healthy ? "YES" : "NO"} | ${s.latencyMs} | ${s.details} |`);
  }
  localSvcsLines.push("");

  const localSvcsJson = services.map(s => ({
    service: s.name, url: s.url, healthy: s.healthy, latencyMs: s.latencyMs, details: s.details,
    gpuAvailable: "UNKNOWN",
    cudaVersion: "UNKNOWN",
    memoryAvailable: "UNKNOWN",
  }));
  writeFileSync(join(RESULTS_DIR, "local_services.json"), JSON.stringify(localSvcsJson, null, 2));

  // ===================================================================
  // STEP 3: Replicate Availability
  // ===================================================================
  console.log("\nSTEP 3: Replicate Availability Check");
  console.log("------------------------------------");

  let replicateAvailable = false;
  let replicateReason = "";
  const replicateLines: string[] = [];
  replicateLines.push("## Replicate Availability");
  replicateLines.push("");

  if (!REPLICATE_TOKEN) {
    replicateReason = "REPLICATE_API_TOKEN not set";
    replicateLines.push("| Check | Result |");
    replicateLines.push("|---|---|");
    replicateLines.push("| Token configured | FAIL (not set) |");
  } else {
    try {
      const resp = await fetch(`${REPLICATE_API_BASE}/account`, {
        headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        replicateLines.push("| Check | Result |");
        replicateLines.push("|---|---|");
        replicateLines.push(`| Token configured | PASS |`);
        replicateLines.push(`| Account | ${data.username} (${data.type}) |`);

        const predResp = await fetch(`${REPLICATE_API_BASE}/models/flux-kontext-apps/restore-image/versions/85ae46551612b8f778348846b6ce1ce1b340e384fe2062399c0c412be29e107d`, {
          headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
        });
        replicateLines.push(`| Model version accessible | ${predResp.ok ? "PASS" : "FAIL (HTTP " + predResp.status + ")"} |`);

        try {
          await retryReplicate(async () => {
            const creditResp = await fetch(`${REPLICATE_API_BASE}/predictions`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${REPLICATE_TOKEN}` },
              body: JSON.stringify({
                version: "85ae46551612b8f778348846b6ce1ce1b340e384fe2062399c0c412be29e107d",
                input: { input_image: "data:image/png;base64,iVBORw0KGgo=", output_format: "png", safety_tolerance: 2 },
              }),
            });
            if (creditResp.status === 402) {
              replicateReason = "Insufficient Replicate credits (HTTP 402)";
              replicateLines.push(`| Credits available | FAIL (402 Insufficient credit) |`);
              return;
            }
            if (!creditResp.ok) {
              const body = await creditResp.text().catch(() => "");
              throw new Error(`HTTP ${creditResp.status}: ${body.slice(0, 200)}`);
            }
            replicateAvailable = true;
            const pred = await creditResp.json();
            replicateLines.push(`| Credits available | PASS (prediction created: ${pred.id}) |`);
            // Cancel the test prediction immediately
            try { await fetch(`${REPLICATE_API_BASE}/predictions/${pred.id}/cancel`, { method: "POST", headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` } }); } catch {}
          }, "Credit check");
        } catch (err) {
          replicateReason = "Cannot verify credits or rate limited: " + (err instanceof Error ? err.message : String(err));
          replicateLines.push(`| Credits available | UNKNOWN (${err instanceof Error ? err.message : String(err)}) |`);
        }
      } else {
        const body = await resp.text().catch(() => "");
        replicateReason = `Replicate authentication failed: HTTP ${resp.status} - ${body.slice(0, 200)}`;
        replicateLines.push("| Check | Result |");
        replicateLines.push("|---|---|");
        replicateLines.push(`| Authentication | FAIL (HTTP ${resp.status}) |`);
      }
    } catch (err) {
      replicateReason = "Cannot reach Replicate API: " + (err instanceof Error ? err.message : String(err));
      replicateLines.push("| Check | Result |");
      replicateLines.push("|---|---|");
      replicateLines.push(`| API reachable | FAIL (${err instanceof Error ? err.message : String(err)}) |`);
    }
  }

  if (!replicateAvailable) {
    replicateLines.push("");
    replicateLines.push("**Result:** Benchmark cannot execute.");
    replicateLines.push(`**Reason:** ${replicateReason}`);
  } else {
    replicateLines.push("");
    replicateLines.push("**Result:** Replicate available. Proceeding to benchmark.");
  }

  const allLocalHealthy = services.every(s => !s.url.includes("NOT CONFIGURED") ? s.healthy : true);

  const envLinesStr = envLines.join("\n");
  const localSvcsStr = localSvcsLines.join("\n");
  const replicateStr = replicateLines.join("\n");

  // ===================================================================
  // STEP 4: Full Benchmark (only if Replicate available & services healthy)
  // ===================================================================
  console.log("\nSTEP 4: Benchmark Execution");
  console.log("--------------------------");

  let benchmarkRan = false;
  let benchmarkReason = "";
  const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const RUN_DIR = join(RESULTS_DIR, "benchmark", TIMESTAMP);

  if (!replicateAvailable) {
    benchmarkReason = `Replicate unavailable: ${replicateReason}`;
    console.log(`  SKIPPED: ${benchmarkReason}`);
  } else if (!allLocalHealthy) {
    const unhealthy = services.filter(s => !s.healthy && s.url !== "NOT CONFIGURED");
    benchmarkReason = `Local services unhealthy: ${unhealthy.map(s => s.name).join(", ")}`;
    console.log(`  SKIPPED: ${benchmarkReason}`);
  } else {
    console.log("  All prerequisites met. Running benchmark...");
    ensureDir(RUN_DIR);

    const imageBuf = readFileSync(IMAGE_PATH);
    const dims = await getImageDimensions(imageBuf);
    const globalStart = Date.now();

    const request: RestorationRequest = {
      image: imageBuf,
      contentType: "image/jpeg",
      fileName: "2.jpeg",
    };

    const metricsCalc = new QualityMetricsCalculator();
    const pipeline = new PipelineOrchestrator(mockConfig as any);
    const stageTimings: Record<string, any> = {};

    try {
      // FLUX Restore
      console.log("    Step: FLUX Restore (Replicate)...");
      console.log("      Waiting 60s for rate limit to fully reset...");
      await sleep(60000);
      const fluxRestore = new FluxRestoreProvider();
      const fluxStart = Date.now();
      const restoreResult = await retryReplicate(
        () => fluxRestore.restore(request),
        "FLUX Restore"
      );
      const fluxEnd = Date.now();
      const fluxDims = await getImageDimensions(restoreResult.image);
      stageTimings.flux_restore = { start: new Date(fluxStart).toISOString(), end: new Date(fluxEnd).toISOString(), durationMs: fluxEnd - fluxStart };
      writeFileSync(join(RUN_DIR, "02_flux_restore.png"), restoreResult.image);
      console.log(`      OK: ${restoreResult.processingTimeMs}ms, cost=$${restoreResult.actualCost}`);

      // Unified Local
      console.log("    Step: UnifiedLocalPostProcessing (local)...");
      const localStart = Date.now();
      const localProvider = new UnifiedLocalRestorationProvider(mockConfig as any);
      const localResult = await localProvider.restore({
        image: restoreResult.image,
        contentType: restoreResult.contentType,
        fileName: "2.jpeg",
      });
      const localEnd = Date.now();
      stageTimings.unified_local = { start: new Date(localStart).toISOString(), end: new Date(localEnd).toISOString(), durationMs: localEnd - localStart };
      writeFileSync(join(RUN_DIR, "07_final_output.png"), localResult.image);
      console.log(`      OK: ${localResult.processingTimeMs}ms, stages: ${localResult.stages.join(", ")}`);

      // Quality metrics
      const metrics = metricsCalc.calculateMetrics(imageBuf, localResult.image);
      const finalDims = await getImageDimensions(localResult.image);
      const totalRuntimeMs = Date.now() - globalStart;

      // Side-by-side
      const totalWidth = 1300;
      const h = 400;
      const sharp = (await import("sharp")).default;
      const origPng = await sharp(imageBuf).resize(400).png().toBuffer();
      const fluxPng = await sharp(restoreResult.image).resize(400).png().toBuffer();
      const finalPng = await sharp(localResult.image).resize(400).png().toBuffer();
      const sideBySide = await sharp({ create: { width: totalWidth, height: h, channels: 3, background: { r: 50, g: 50, b: 50 } } })
        .composite([
          { input: origPng, top: 0, left: 0 },
          { input: fluxPng, top: 0, left: 410 },
          { input: finalPng, top: 0, left: 820 },
        ]).png().toBuffer();
      writeFileSync(join(RUN_DIR, "08_side_by_side.png"), sideBySide);

      // SHA256
      writeFileSync(join(RUN_DIR, "19_sha256.txt"), [
        `01_original.jpg  ${sha256(imageBuf)}`,
        `02_flux_restore.png  ${sha256(restoreResult.image)}`,
        `07_final_output.png  ${sha256(localResult.image)}`,
      ].join("\n") + "\n");

      // 09_metrics
      writeFileSync(join(RUN_DIR, "09_metrics.json"), JSON.stringify({
        ssim: metrics.ssim, psnr: metrics.psnr, lpips: "UNKNOWN",
        faceIdentityScore: "UNKNOWN", scratchRemovalScore: "UNKNOWN",
        sharpness: metrics.sharpness, noise: metrics.noise, contrast: metrics.contrast,
        brightness: metrics.brightness, printQuality: metrics.printQuality,
        originalDimensions: dims, finalDimensions: finalDims,
      }, null, 2));

      // 10_pipeline_trace
      writeFileSync(join(RUN_DIR, "10_pipeline_trace.json"), JSON.stringify({
        tier: "hd", steps: [
          { name: "flux-restore", provider: "FluxRestoreProvider", isReplicate: true },
          { name: "unified-local-postprocessing", provider: "UnifiedLocalRestorationProvider", isReplicate: false, subStages: localResult.stages },
        ],
        stageTimings, totalProcessingTimeMs: totalRuntimeMs,
      }, null, 2));

      // 11_provider_trace
      writeFileSync(join(RUN_DIR, "11_provider_trace.json"), JSON.stringify({
        providers: ["flux-restore", "unified-local"],
        replicateCalls: 1, localCalls: localResult.stages.length, stages: localResult.stages,
      }, null, 2));

      // 12_prediction
      writeFileSync(join(RUN_DIR, "12_prediction.json"), JSON.stringify({
        model: "flux-kontext-apps/restore-image", version: "85ae4655",
        predictionId: restoreResult.requestId, gpuSeconds: restoreResult.actualGPUSeconds,
        actualCost: restoreResult.actualCost, estimatedCost: restoreResult.estimatedCost,
        processingTimeMs: restoreResult.processingTimeMs, requestId: restoreResult.requestId,
      }, null, 2));

      // 13_cost
      writeFileSync(join(RUN_DIR, "13_cost.json"), JSON.stringify({
        totalReplicateCost: restoreResult.actualCost ?? restoreResult.estimatedCost,
        totalLocalCost: 0, totalCost: restoreResult.actualCost ?? restoreResult.estimatedCost,
        currency: "USD", gpuSeconds: restoreResult.actualGPUSeconds,
      }, null, 2));

      // 14_runtime
      writeFileSync(join(RUN_DIR, "14_runtime.json"), JSON.stringify({
        totalRuntimeMs, replicateRuntimeMs: restoreResult.processingTimeMs,
        localRuntimeMs: localResult.processingTimeMs, stageTimings,
      }, null, 2));

      // 15_verification
      writeFileSync(join(RUN_DIR, "15_verification.md"), [
        "# OPS-112 Benchmark Verification",
        "",
        "**Date:** " + new Date().toISOString(),
        "**Image:** old images/2.jpeg",
        "**Replicate Credits:** AVAILABLE",
        "",
        "## Summary",
        "",
        `| Metric | Value |`,
        `|---|---|`,
        `| Total Runtime | ${totalRuntimeMs}ms |`,
        `| Replicate Runtime | ${restoreResult.processingTimeMs}ms |`,
        `| Local Runtime | ${localResult.processingTimeMs}ms |`,
        `| Replicate Cost | $${(restoreResult.actualCost ?? restoreResult.estimatedCost).toFixed(6)} |`,
        `| Local Cost | $0.00 |`,
        `| Total Cost | $${(restoreResult.actualCost ?? restoreResult.estimatedCost).toFixed(6)} |`,
        `| SSIM | ${metrics.ssim} |`,
        `| PSNR | ${metrics.psnr} |`,
        `| LPIPS | UNKNOWN |`,
        `| Face Identity | UNKNOWN |`,
        `| Scratch Removal | UNKNOWN |`,
        `| Replicate Calls | 1 |`,
        `| Local Stages | ${localResult.stages.join(", ")} |`,
        "",
        "## Stage Timings",
        "",
        ...Object.entries(stageTimings).map(([k, v]) => `- **${k}**: ${v.durationMs}ms`),
        "",
      ].join("\n"));

      console.log(`\n  Benchmark complete. Output: ${RUN_DIR}`);
      benchmarkRan = true;
    } catch (err) {
      benchmarkReason = `Benchmark execution failed: ${err instanceof Error ? err.message : String(err)}`;
      console.log(`    FAILED: ${benchmarkReason}`);
    }
  }

  // ===================================================================
  // STEP 5: Failure Analysis
  // ===================================================================
  console.log("\nSTEP 5: Failure Analysis");
  console.log("------------------------");

  const canRun = replicateAvailable && allLocalHealthy;
  const failureLines: string[] = [];
  failureLines.push("## Failure Analysis");
  failureLines.push("");
  const SERVICES_URLS_CONFIGURED = services.some(s => s.url !== "NOT CONFIGURED");

  if (canRun && benchmarkRan) {
    failureLines.push("**Status:** FULL BENCHMARK EXECUTED SUCCESSFULLY");
    failureLines.push("");
    const resultsDir = join(RESULTS_DIR, "benchmark", TIMESTAMP);
    if (existsSync(resultsDir)) {
      const files = require("fs").readdirSync(resultsDir);
      failureLines.push("**Artifacts created:** " + files.length);
      failureLines.push("");
      failureLines.push("| File | Size |");
      failureLines.push("|---|---|");
      for (const f of files) {
        const stat = require("fs").statSync(join(resultsDir, f));
        failureLines.push(`| \`${f}\` | ${stat.size} bytes |`);
      }
    }
  } else {
    failureLines.push("**Status:** BENCHMARK COULD NOT EXECUTE");
    failureLines.push("");
    const reasons: string[] = [];
    if (!REPLICATE_TOKEN) reasons.push("REPLICATE_API_TOKEN not set");
    if (!replicateAvailable && REPLICATE_TOKEN) reasons.push(`Replicate unavailable: ${replicateReason}`);
    if (!allLocalHealthy && SERVICES_URLS_CONFIGURED) {
      const unhealthy = services.filter(s => !s.healthy && s.url !== "NOT CONFIGURED");
      if (unhealthy.length) reasons.push(`Unhealthy services: ${unhealthy.map(s => `${s.name} (${s.details})`).join(", ")}`);
    }
    failureLines.push("**Blocking reasons:**");
    if (reasons.length === 0) reasons.push("See individual step details above");
    for (const r of reasons) failureLines.push(`- ${r}`);
  }


  // ===================================================================
  // Write report
  // ===================================================================
  const reportLines = [
    "# OPS-112 — Production Environment Validation & Full Benchmark",
    "",
    envLinesStr,
    localSvcsStr,
    replicateStr,
    "",
    failureLines.join("\n"),
    "",
    "## Summary",
    "",
    "| Check | Status |",
    "|---|---|",
    `| Environment Verified | ${envVars.every(e => e.required ? e.found !== "NOT SET" : true) ? "PASS" : "FAIL - missing required vars"} |`,
    `| Local Services Healthy | ${allLocalHealthy ? "PASS" : "WARN - some services not configured"} |`,
    `| Replicate Available | ${replicateAvailable ? "PASS" : "FAIL - " + replicateReason} |`,
    `| Benchmark Executed | ${benchmarkRan ? "YES" : "NO - " + benchmarkReason} |`,
  ];
  writeFileSync(join(RESULTS_DIR, "environment_audit.md"), reportLines.join("\n"));

  console.log("\n========================================");
  console.log("OPS-112 Complete");
  console.log("  Report: " + join(RESULTS_DIR, "environment_audit.md"));
  console.log("  Benchmark ran: " + (benchmarkRan ? "YES" : "NO"));
  if (!benchmarkRan) console.log("  Reason: " + benchmarkReason);
  console.log("========================================");
}

main().catch(err => { console.error("OPS-112 failed:", err); process.exit(1); });