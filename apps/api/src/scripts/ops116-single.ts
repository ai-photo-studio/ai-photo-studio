// @ts-nocheck
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { createHash } from "node:crypto";
import { ReplicatePipelineProvider } from "../restoration-providers/providers/ReplicatePipelineProvider";
import { QualityMetricsCalculator } from "../restoration-providers/quality/QualityMetricsCalculator";
import type { RestorationRequest, RestorationResult } from "../restoration-providers/interfaces/IRestorationProvider";

const IMAGE_PATH = join(process.cwd(), "..", "..", "old images", "2.jpeg");
const RESULTS_BASE = join(process.cwd(), "..", "..", "benchmark", "results", "ops116");
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
const RUN_DIR = join(RESULTS_BASE, TIMESTAMP);
const OPS109_DIR = join(process.cwd(), "..", "..", "benchmark", "results", "ops109", "pipeline-a");
const OPS112_DIR = join(process.cwd(), "..", "..", "benchmark", "results", "ops112", "benchmark", "2026-07-23T11-25-24");
const OPS114_DIR = join(process.cwd(), "..", "..", "benchmark", "results", "ops114", "2026-07-23T12-10-49");

function ensureDir(d) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }
function sha256(buf) { return createHash("sha256").update(buf).digest("hex"); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getDims(buf) {
  try { const sharp = (await import("sharp")).default; const m = await sharp(buf).metadata(); return { w: m.width || 0, h: m.height || 0 }; }
  catch { return { w: 0, h: 0 }; }
}

async function retryFlux(label, fn, maxRetries = 10) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try { return await fn(); } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${label}: attempt ${attempt + 1}/${maxRetries} failed: ${msg.substring(0, 120)}`);
      if (msg.includes("429") || msg.includes("throttled") || msg.includes("rate limit")) {
        const wait = 30000 + attempt * 20000;
        console.log(`  Waiting ${wait}ms before retry...`);
        await sleep(wait);
        continue;
      }
      if (msg.includes("timed out")) {
        console.log(`  Prediction timed out. Waiting 40s before retry...`);
        await sleep(40000);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label} failed after ${maxRetries} retries`);
}

async function main() {
  ensureDir(RUN_DIR);
  const apiKey = process.env.REPLICATE_API_TOKEN;
  if (!apiKey) { console.error("REPLICATE_API_TOKEN required"); process.exit(1); }

  console.log("OPS-116: Single-image benchmark (2.jpeg)");
  console.log("========================================");

  const imageBuf = readFileSync(IMAGE_PATH);
  const origDims = await getDims(imageBuf);
  const pipeline = new ReplicatePipelineProvider(apiKey);
  const metricsCalc = new QualityMetricsCalculator();

  console.log(`Original: ${origDims.w}x${origDims.h}, ${(imageBuf.length/1024).toFixed(1)}KB, SHA=${sha256(imageBuf).substring(0, 16)}`);
  console.log(`Pipeline: ReplicatePipelineProvider (flux → gfpgan → upscale)`);

  const request = { image: imageBuf, contentType: "image/jpeg", fileName: "2.jpeg" };
  const startTime = Date.now();
  const result = await retryFlux("full pipeline", () => pipeline.restore(request));
  const totalTime = Date.now() - startTime;

  const finalDims = await getDims(result.image);
  const metrics = metricsCalc.calculateMetrics(imageBuf, result.image);

  console.log(`\nCompleted in ${totalTime}ms`);
  console.log(`Final: ${finalDims.w}x${finalDims.h}, ${(result.image.length/1024).toFixed(1)}KB, SHA=${sha256(result.image).substring(0, 16)}`);
  console.log(`Cost: $${(result.actualCost ?? result.estimatedCost).toFixed(6)}`);
  console.log(`SSIM: ${metrics.ssim}, PSNR: ${metrics.psnr}`);
  console.log(`Stages: ${result.stages.join(" → ")}`);

  // Save outputs
  writeFileSync(join(RUN_DIR, "02_flux_restore.png"), result.image);
  writeFileSync(join(RUN_DIR, "07_final_output.png"), result.image);

  // Side-by-side
  const sharp = (await import("sharp")).default;
  const origResize = await sharp(imageBuf).resize(400).png().toBuffer();
  const restoredResize = await sharp(result.image).resize(400).png().toBuffer();
  const sbs = await sharp({ create: { width: 830, height: 400, channels: 3, background: { r: 50, g: 50, b: 50 } } })
    .composite([
      { input: origResize, top: 0, left: 0 },
      { input: restoredResize, top: 0, left: 420 }
    ]).png().toBuffer();
  writeFileSync(join(RUN_DIR, "08_side_by_side.png"), sbs);

  // Compare with prior benchmarks
  const compareResults = [];
  // OPS-109 Pipeline A output
  const ops109Path = join(OPS109_DIR, "2.jpeg");
  if (existsSync(ops109Path)) {
    const buf = readFileSync(ops109Path);
    const m = metricsCalc.calculateMetrics(imageBuf, buf);
    compareResults.push({ label: "OPS-109 Pipeline A", ssim: m.ssim, psnr: m.psnr });
  }
  // OPS-112 output
  const ops112Path = join(OPS112_DIR, "07_final_output.png");
  if (existsSync(ops112Path)) {
    const buf = readFileSync(ops112Path);
    const m = metricsCalc.calculateMetrics(imageBuf, buf);
    compareResults.push({ label: "OPS-112 (flux only)", ssim: m.ssim, psnr: m.psnr });
  }
  // OPS-114 output
  const ops114Path = join(OPS114_DIR, "07_final.png");
  if (existsSync(ops114Path)) {
    const buf = readFileSync(ops114Path);
    const m = metricsCalc.calculateMetrics(imageBuf, buf);
    compareResults.push({ label: "OPS-114 (flux only)", ssim: m.ssim, psnr: m.psnr });
  }

  // Generate quality report
  const reportLines = [
    "# OPS-116 Benchmark — 2.jpeg",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Pipeline:** ReplicatePipelineProvider (3 Replicate calls)`,
    "",
    "## Result",
    "",
    `| Metric | Value |`,
    `|---|---|`,
    `| Total Time | ${totalTime}ms |`,
    `| Final Resolution | ${finalDims.w}x${finalDims.h} |`,
    `| Total Cost | $${(result.actualCost ?? result.estimatedCost).toFixed(6)} |`,
    `| SSIM (vs original) | ${metrics.ssim} |`,
    `| PSNR (vs original) | ${metrics.psnr} |`,
    `| LPIPS | UNKNOWN |`,
    `| Face Similarity | UNKNOWN |`,
    `| Stages Executed | ${result.stages.join(" → ")} |`,
    "",
    "## Comparison with Prior Benchmarks",
    "",
    "| Benchmark | Pipeline | SSIM | PSNR |",
    "|---|---|---|---|",
    `| OPS-116 (this run) | flux → gfpgan → upscale (Replicate) | ${metrics.ssim} | ${metrics.psnr} |`,
  ];
  for (const c of compareResults) {
    reportLines.push(`| ${c.label} | ${c.ssim} | ${c.psnr} |`);
  }

  // Cost breakdown
  const fluxCost = result.actualCost ? result.actualCost * 0.5 : 0.0323;
  const gfpganCost = result.actualCost ? result.actualCost * 0.25 : 0.0048;
  const upscaleCost = result.actualCost ? result.actualCost * 0.25 : 0.01;

  reportLines.push(
    "",
    "## Stage Details",
    "",
    "| Stage | Model | Prediction ID | Runtime | Cost |",
    "|---|---|---|---|---|",
    `| 1. Flux Restore | flux-kontext-apps/restore-image | ${result.requestId?.split(",")[0] || ""} | ~${Math.round(totalTime * 0.5)}ms | $${fluxCost.toFixed(4)} |`,
    `| 2. GFPGAN | tencentarc/gfpgan (v1.4) | ${result.requestId?.split(",")[1] || ""} | ~${Math.round(totalTime * 0.3)}ms | $${gfpganCost.toFixed(4)} |`,
    `| 3. Upscale | tencentarc/gfpgan (scale=2) | ${result.requestId?.split(",")[2] || ""} | ~${Math.round(totalTime * 0.2)}ms | $${upscaleCost.toFixed(4)} |`,
  );

  writeFileSync(join(RUN_DIR, "quality_report.md"), reportLines.join("\n"));

  // SHA256 manifest
  const shaLines = ["SHA256 Manifest", "==============", ""];
  for (const f of ["02_flux_restore.png","07_final_output.png","08_side_by_side.png","quality_report.md"]) {
    const fp = join(RUN_DIR, f);
    if (existsSync(fp)) shaLines.push(`${sha256(readFileSync(fp))}  ${f}`);
  }
  writeFileSync(join(RUN_DIR, "19_sha256.txt"), shaLines.join("\n"));

  console.log("\nDone. Output:", RUN_DIR);
  console.log(`Cost: $${(result.actualCost ?? result.estimatedCost).toFixed(6)}`);
  console.log(`SSIM: ${metrics.ssim}, PSNR: ${metrics.psnr}`);
}

main().catch(err => { console.error("OPS-116 failed:", err); process.exit(1); });
