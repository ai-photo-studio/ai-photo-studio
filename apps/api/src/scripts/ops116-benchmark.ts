// @ts-nocheck
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";
import { ReplicatePipelineProvider } from "../restoration-providers/providers/ReplicatePipelineProvider";
import { QualityMetricsCalculator } from "../restoration-providers/quality/QualityMetricsCalculator";
import type { RestorationRequest, RestorationResult } from "../restoration-providers/interfaces/IRestorationProvider";

const OLD_IMAGES_DIR = join(process.cwd(), "..", "..", "old images");
const RESULTS_BASE = join(process.cwd(), "..", "..", "benchmark", "results", "ops116");
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
const RUN_DIR = join(RESULTS_BASE, TIMESTAMP);
const OPS109_RESULTS = join(process.cwd(), "..", "..", "benchmark", "results", "ops109");
const PROJECT_ROOT = join(process.cwd(), "..", "..");

function ensureDir(d: string) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }
function sha256(buf: Buffer): string { return createHash("sha256").update(buf).digest("hex"); }
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function getDims(buf: Buffer): Promise<{ w: number; h: number }> {
  try {
    const sharp = (await import("sharp")).default;
    const m = await sharp(buf).metadata();
    return { w: m.width || 0, h: m.height || 0 };
  } catch { return { w: 0, h: 0 }; }
}

async function retryWithBackoff<T>(fn: () => Promise<T>, label: string, maxRetries = 5): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try { return await fn(); } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.includes("throttled") || msg.includes("rate limit")) {
        const wait = 20000 + attempt * 15000;
        console.log(`  [RETRY ${attempt + 1}/${maxRetries}] ${label} — rate limited, waiting ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label} failed after ${maxRetries} retries`);
}

interface ImageInfo {
  fileName: string; filePath: string; sizeBytes: number;
}

interface StageRecord {
  stage: string; provider: string; model: string;
  predictionId: string; runtimeMs: number; cost: number;
  inputSha: string; outputSha: string;
  inputW: number; inputH: number; outputW: number; outputH: number;
  inputBytes: number; outputBytes: number;
  status: string; error?: string;
  timestamp: string;
}

interface PerImageResult {
  fileName: string; stages: StageRecord[];
  totalRuntimeMs: number; totalCost: number;
  ssim: number; psnr: number; sharpness: number; noise: number;
  printQuality: number;
  ops109Ssim?: number; ops109Psnr?: number;
}

function collectImages(): ImageInfo[] {
  const entries = readdirSync(OLD_IMAGES_DIR, { withFileTypes: true });
  const images: ImageInfo[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() || entry.name.startsWith(".")) continue;
    const ext = extname(entry.name).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"].includes(ext)) continue;
    const filePath = join(OLD_IMAGES_DIR, entry.name);
    try {
      const buf = readFileSync(filePath);
      images.push({ fileName: entry.name, filePath, sizeBytes: buf.length });
    } catch {}
  }
  return images;
}

async function main() {
  ensureDir(RUN_DIR);

  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) {
    console.error("ERROR: REPLICATE_API_TOKEN required");
    process.exit(1);
  }

  console.log("OPS-116: Restore OPS-109 Commercial Pipeline Benchmark");
  console.log("======================================================");

  const images = collectImages();
  console.log(`Found ${images.length} images`);

  const pipeline = new ReplicatePipelineProvider(apiKey);
  const metricsCalc = new QualityMetricsCalculator();
  const results: PerImageResult[] = [];

  // Load OPS-109 comparison data
  const ops109CsvPath = join(OPS109_RESULTS, "comparison.csv");
  const ops109Data: Record<string, { ssim: number; psnr: number }> = {};
  if (existsSync(ops109CsvPath)) {
    const lines = readFileSync(ops109CsvPath, "utf-8").split("\n").slice(1);
    for (const line of lines) {
      const cols = line.split(",");
      if (cols[0] === "pipeline-a" && cols[1]) {
        const name = cols[1];
        const ssim = parseFloat(cols[15]);
        const psnr = parseFloat(cols[16]);
        if (!isNaN(ssim) && !isNaN(psnr)) {
          ops109Data[name] = { ssim, psnr };
        }
      }
    }
    console.log(`Loaded OPS-109 comparison data for ${Object.keys(ops109Data).length} images`);
  }

  for (const img of images) {
    console.log(`\nProcessing: ${img.fileName}`);
    const imageBuf = readFileSync(img.filePath);
    const ext = extname(img.fileName).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : "image/jpeg";
    const origDims = await getDims(imageBuf);

    const request: RestorationRequest = {
      image: imageBuf,
      contentType,
      fileName: img.fileName,
    };

    const stages: StageRecord[] = [];
    let totalStart = Date.now();

    try {
      console.log(`  Running ReplicatePipelineProvider...`);
      const result = await retryWithBackoff(
        () => pipeline.restore(request),
        `${img.fileName}`
      );

      // Parse individual stage records from result
      const stageLabels = ["flux_restore", "gfpgan_face", "gfpgan_upscale"];
      const models = [
        "flux-kontext-apps/restore-image",
        "tencentarc/gfpgan (v1.4)",
        "tencentarc/gfpgan (scale=2)",
      ];
      // The ReplicatePipelineProvider doesn't expose individual prediction IDs for sub-stages,
      // so we record the composite result
      const finalDims = await getDims(result.image);

      // Save output
      const safeName = img.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      writeFileSync(join(RUN_DIR, `output_${safeName}`), result.image);

      stages.push({
        stage: "replicate_pipeline",
        provider: "ReplicatePipelineProvider",
        model: "flux+gfpgan+upscale",
        predictionId: result.requestId || "",
        runtimeMs: result.processingTimeMs,
        cost: result.actualCost ?? result.estimatedCost,
        inputSha: sha256(imageBuf),
        outputSha: sha256(result.image),
        inputW: origDims.w, inputH: origDims.h,
        outputW: finalDims.w, outputH: finalDims.h,
        inputBytes: imageBuf.length,
        outputBytes: result.image.length,
        status: "success",
        timestamp: new Date().toISOString(),
      });

      const metrics = metricsCalc.calculateMetrics(imageBuf, result.image);
      const ops109 = ops109Data[img.fileName];

      results.push({
        fileName: img.fileName,
        stages,
        totalRuntimeMs: result.processingTimeMs,
        totalCost: result.actualCost ?? result.estimatedCost,
        ssim: metrics.ssim, psnr: metrics.psnr,
        sharpness: metrics.sharpness, noise: metrics.noise,
        printQuality: metrics.printQuality,
        ops109Ssim: ops109?.ssim,
        ops109Psnr: ops109?.psnr,
      });

      console.log(`  Completed: ${result.processingTimeMs}ms, $${(result.actualCost ?? result.estimatedCost).toFixed(6)}`);
      console.log(`  SSIM: ${metrics.ssim}, PSNR: ${metrics.psnr}`);

      // Wait between images to avoid rate limiting
      if (images.indexOf(img) < images.length - 1) {
        console.log("  Waiting 30s before next image...");
        await sleep(30000);
      }
    } catch (err) {
      console.error(`  FAILED: ${err instanceof Error ? err.message : String(err)}`);
      results.push({
        fileName: img.fileName, stages, totalRuntimeMs: 0, totalCost: 0,
        ssim: 0, psnr: 0, sharpness: 0, noise: 0, printQuality: 0,
      });
    }
  }

  // ══════════════════════════════════════════════
  // Generate output files
  // ══════════════════════════════════════════════

  // 1. provider_execution.csv
  const provCsv: string[] = ["image,stage,provider,model,predictionId,runtimeMs,cost,inputSha,outputSha,status,error"];
  for (const r of results) {
    for (const s of r.stages) {
      provCsv.push(`${r.fileName},${s.stage},${s.provider},${s.model},${s.predictionId || ""},${s.runtimeMs},${s.cost},${s.inputSha.substring(0, 16)},${s.outputSha.substring(0, 16)},${s.status},${s.error || ""}`);
    }
  }
  writeFileSync(join(RUN_DIR, "provider_execution.csv"), provCsv.join("\n"));

  // 2. replicate_cost.csv
  const costCsv: string[] = ["image,totalRuntimeMs,totalCost,ssim,psnr,sharpness,noise,printQuality,ops109Ssim,ops109Psnr"];
  for (const r of results) {
    costCsv.push(`${r.fileName},${r.totalRuntimeMs},${r.totalCost.toFixed(6)},${r.ssim},${r.psnr},${r.sharpness},${r.noise},${r.printQuality},${r.ops109Ssim ?? ""},${r.ops109Psnr ?? ""}`);
  }
  writeFileSync(join(RUN_DIR, "replicate_cost.csv"), costCsv.join("\n"));

  // 3. quality_report.md
  const qLines: string[] = [
    "# OPS-116 Quality Report",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Pipeline:** ReplicatePipelineProvider (flux → gfpgan → upscale)`,
    "",
    "## Per-Image Results",
    "",
    "| Image | Runtime (ms) | Cost ($) | SSIM | PSNR | Sharpness | Noise | PrintQuality | OPS-109 SSIM | OPS-109 PSNR |",
    "|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of results) {
    qLines.push(`| ${r.fileName} | ${r.totalRuntimeMs} | ${r.totalCost.toFixed(6)} | ${r.ssim} | ${r.psnr} | ${r.sharpness} | ${r.noise} | ${r.printQuality} | ${r.ops109Ssim ?? "UNKNOWN"} | ${r.ops109Psnr ?? "UNKNOWN"} |`);
  }

  const avgSsim = results.filter(r => r.ssim > 0).reduce((s, r) => s + r.ssim, 0) / Math.max(1, results.filter(r => r.ssim > 0).length);
  const avgPsnr = results.filter(r => r.psnr > 0).reduce((s, r) => s + r.psnr, 0) / Math.max(1, results.filter(r => r.psnr > 0).length);
  const avgCost = results.filter(r => r.totalCost > 0).reduce((s, r) => s + r.totalCost, 0) / Math.max(1, results.filter(r => r.totalCost > 0).length);
  const avgTime = results.filter(r => r.totalRuntimeMs > 0).reduce((s, r) => s + r.totalRuntimeMs, 0) / Math.max(1, results.filter(r => r.totalRuntimeMs > 0).length);

  qLines.push(
    "",
    "## Averages",
    "",
    `| Metric | Average |`,
    `|---|---|`,
    `| SSIM | ${avgSsim.toFixed(2)} |`,
    `| PSNR | ${avgPsnr.toFixed(2)} |`,
    `| Cost per image | $${avgCost.toFixed(6)} |`,
    `| Runtime per image | ${Math.round(avgTime)}ms |`,
    "",
    "## OPS-109 Comparison",
    "",
  );

  const comparable = results.filter(r => r.ops109Ssim !== undefined);
  if (comparable.length > 0) {
    const avgSsimNew = comparable.reduce((s, r) => s + r.ssim, 0) / comparable.length;
    const avgSsimOld = comparable.reduce((s, r) => s + (r.ops109Ssim ?? 0), 0) / comparable.length;
    const avgPsnrNew = comparable.reduce((s, r) => s + r.psnr, 0) / comparable.length;
    const avgPsnrOld = comparable.reduce((s, r) => s + (r.ops109Psnr ?? 0), 0) / comparable.length;
    qLines.push(`| Metric | OPS-116 (this run) | OPS-109 (Pipeline A) | Difference |`);
    qLines.push(`|---|---|---|---|`);
    qLines.push(`| Avg SSIM | ${avgSsimNew.toFixed(2)} | ${avgSsimOld.toFixed(2)} | ${(avgSsimNew - avgSsimOld).toFixed(2)} |`);
    qLines.push(`| Avg PSNR | ${avgPsnrNew.toFixed(2)} | ${avgPsnrOld.toFixed(2)} | ${(avgPsnrNew - avgPsnrOld).toFixed(2)} |`);
  } else {
    qLines.push("No OPS-109 comparison data available for these images.");
  }

  writeFileSync(join(RUN_DIR, "quality_report.md"), qLines.join("\n"));

  // 4. pipeline_launch.md
  const pLines: string[] = [
    "# OPS-116 Production Pipeline Launch Configuration",
    "",
    `**Date:** ${new Date().toISOString()}`,
    "",
    "## Feature Flag",
    "",
    "`RESTORATION_PIPELINE=replicate` (default) — OPS-109 proven commercial pipeline restored.",
    "",
    "| Value | Pipeline | Status |",
    "|---|---|---|",
    "| `replicate` | 3 sequential Replicate calls (flux → gfpgan → upscale) | **ACTIVE (default)** |",
    "| `hybrid` | Flux via Replicate, local via RunPod (LEGACY_LOCAL_PIPELINE) | DISABLED (requires RUNPOD_API_KEY) |",
    "| `local` | FLUX Restore only (LEGACY_LOCAL_PIPELINE) | DISABLED |",
    "",
    "## Pipeline Summary",
    "",
    "| # | Stage | Provider | Model | Provider File |",
    "|---|---|---|---|---|",
    "| 1 | Flux Restore | FluxRestoreProvider | flux-kontext-apps/restore-image | FluxRestoreProvider.ts |",
    "| 2 | GFPGAN | GFPGANProvider | tencentarc/gfpgan (v1.4) | GFPGANProvider.ts |",
    "| 3 | Upscaling | GFPGANProvider | tencentarc/gfpgan (scale=2) | GFPGANProvider.ts |",
    "",
    "All stages use REPLICATE_API_TOKEN for authentication via BaseReplicateProvider HTTP transport.",
    "",
    "## Changed Files",
    "",
    "| File | Change |",
    "|---|---|",
    "| `config/env.ts` | Added RESTORATION_PIPELINE env var (replicate/hybrid/local) |",
    "| `providers/ReplicatePipelineProvider.ts` | NEW — orchestrates 3 Replicate calls |",
    "| `pipeline/PipelineOrchestrator.ts` | Added 'replicate' tier, feature flag routing |",
    "| `factory/ProviderFactory.ts` | Added replicate-pipeline provider |",
    "| `providers/UnifiedLocalRestorationProvider.ts` | Marked LEGACY_LOCAL_PIPELINE |",
  ];

  // Add benchmark summary to launch doc
  if (results.length > 0) {
    pLines.push(
      "",
      "## Benchmark Results",
      "",
      `Images processed: ${results.filter(r => r.totalRuntimeMs > 0).length}/${results.length}`,
      `Avg SSIM: ${avgSsim.toFixed(2)}`,
      `Avg PSNR: ${avgPsnr.toFixed(2)}`,
      `Avg cost: $${avgCost.toFixed(6)}`,
      `Avg runtime: ${Math.round(avgTime)}ms`,
    );
  }

  writeFileSync(join(RUN_DIR, "pipeline_launch.md"), pLines.join("\n"));

  // 5. Side-by-side HTML gallery
  const galleryImgs = results.filter(r => r.totalRuntimeMs > 0);
  const galleryLines: string[] = [
    "<!DOCTYPE html><html><head><meta charset='utf-8'>",
    "<title>OPS-116 Benchmark Gallery</title>",
    "<style>body{font-family:sans-serif;margin:20px}",
    ".row{display:flex;gap:20px;margin-bottom:30px;align-items:center}",
    ".col{text-align:center}img{max-width:400px;max-height:400px;border:1px solid #ccc;border-radius:4px}",
    "table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:center}</style>",
    "</head><body>",
    "<h1>OPS-116 Benchmark Gallery</h1>",
    "<p>Pipeline: FLUX Restore → GFPGAN → Upscale (3 Replicate calls)</p>",
    `<p>Date: ${new Date().toISOString()}</p>`,
    "<hr>",
  ];

  for (const r of galleryImgs) {
    const safeName = r.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const outputPath = `output_${safeName}`;
    // Copy original for comparison
    const origBuf = readFileSync(join(OLD_IMAGES_DIR, r.fileName));
    const origSafe = `original_${safeName}`;
    writeFileSync(join(RUN_DIR, origSafe), origBuf);

    galleryLines.push(
      `<h2>${r.fileName}</h2>`,
      "<div class='row'>",
      `<div class='col'><h3>Original</h3><img src='${origSafe}'></div>`,
      `<div class='col'><h3>Restored</h3><img src='${outputPath}'></div>`,
      "</div>",
      `<table><tr><th>Metric</th><th>Value</th><th>OPS-109</th></tr>`,
      `<tr><td>SSIM</td><td>${r.ssim}</td><td>${r.ops109Ssim ?? "UNKNOWN"}</td></tr>`,
      `<tr><td>PSNR</td><td>${r.psnr}</td><td>${r.ops109Psnr ?? "UNKNOWN"}</td></tr>`,
      `<tr><td>Runtime</td><td>${r.totalRuntimeMs}ms</td><td>-</td></tr>`,
      `<tr><td>Cost</td><td>$${r.totalCost.toFixed(6)}</td><td>-</td></tr>`,
      "</table><hr>",
    );
  }

  galleryLines.push("</body></html>");
  writeFileSync(join(RUN_DIR, "benchmark_gallery.html"), galleryLines.join("\n"));

  // SHA256 manifest
  const shaLines = ["SHA256 Manifest", "==============", ""];
  for (const f of ["pipeline_launch.md","provider_execution.csv","replicate_cost.csv","quality_report.md","benchmark_gallery.html"]) {
    const fp = join(RUN_DIR, f);
    if (existsSync(fp)) shaLines.push(`${sha256(readFileSync(fp))}  ${f}`);
  }
  writeFileSync(join(RUN_DIR, "19_sha256.txt"), shaLines.join("\n"));

  console.log("\n=== OPS-116 Complete ===");
  console.log("Output:", RUN_DIR);
  console.log(`Images processed: ${galleryImgs.length}/${results.length}`);
  console.log(`Avg SSIM: ${avgSsim.toFixed(2)}, Avg PSNR: ${avgPsnr.toFixed(2)}, Avg cost: $${avgCost.toFixed(6)}`);
}

main().catch(err => { console.error("OPS-116 failed:", err); process.exit(1); });
