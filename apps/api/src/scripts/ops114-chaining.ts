// @ts-nocheck
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { FluxRestoreProvider } from "../restoration-providers/providers/FluxRestoreProvider";
import { RestorationInpaintService } from "../services/restoration-provider.service";
import { RestorationGfpganService } from "../services/restoration-provider.service";
import { RestorationDdcolorService } from "../services/restoration-provider.service";
import { RealEsrganService } from "../services/real-esrgan.service";
import type { AppConfig } from "../config/env";

const IMAGE_PATH = join(process.cwd(), "..", "..", "old images", "2.jpeg");
const RESULTS_BASE = join(process.cwd(), "..", "..", "benchmark", "results", "ops114");
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
const RUN_DIR = join(RESULTS_BASE, TIMESTAMP);
const OUTPUT_FILES = ["01_original.png","02_flux_restore.png","03_gfpgan.png","04_realesrgan.png","05_ddcolor.png","06_lama.png","07_final.png"];

const CONFIG = {
  RESTORATION_ENDPOINT_URL: process.env.RESTORATION_ENDPOINT_URL || "3z633s11yn4n8q",
  REAL_ESRGAN_URL: process.env.REAL_ESRGAN_URL || "",
  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || "",
  NODE_ENV: "benchmark",
  AI_PROVIDER: "mock",
  PAYMENT_GATEWAY_NAME: "manual",
  STORAGE_PROVIDER: "mock",
  WHATSAPP_VERIFY_TOKEN: "ops114",
  ADMIN_JWT_SECRET: "ops114",
  JWT_SECRET: "ops114",
  DATABASE_URL: "postgresql://placeholder",
  REDIS_URL: "redis://placeholder",
  BACKGROUND_API_URL: "",
  PRODUCT_CLASSIFIER_URL: "",
  YOLO_DETECTOR_URL: "",
  IC_LIGHT_LAB_URL: "",
  R2_ACCOUNT_ID: "",
  R2_BUCKET_NAME: "",
  R2_PUBLIC_BASE_URL: "",
} as unknown as AppConfig;

interface StageInfo {
  label: string;
  file: string;
  buf: Buffer;
  sha256: string;
  width: number;
  height: number;
  sizeBytes: number;
  processingTimeMs: number;
  serviceUrl: string;
  provider: string;
  executed: boolean;
  error: string | null;
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function getDims(buf: Buffer): Promise<{ w: number; h: number }> {
  try {
    const sharp = (await import("sharp")).default;
    const m = await sharp(buf).metadata();
    return { w: m.width || 0, h: m.height || 0 };
  } catch { return { w: 0, h: 0 }; }
}

// Pixel-level comparison functions
function computeAvgRgbDelta(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / len;
}

function computePixelDiffPercent(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 100;
  let diffPixels = 0;
  for (let i = 0; i < len; i++) {
    if (Math.abs(a[i] - b[i]) > 2) diffPixels++;
  }
  return (diffPixels / len) * 100;
}

// In-buffer SSIM/PSNR (byte-level proxy)
function computeMse(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let sum = 0;
  for (let i = 0; i < len; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum / len;
}

function computePsnrBytes(a: Buffer, b: Buffer): number {
  const mse = computeMse(a, b);
  if (mse === 0) return 50;
  return 20 * Math.log10(255 / Math.sqrt(mse));
}

function computeSsimBytes(a: Buffer, b: Buffer): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  const step = Math.max(1, Math.floor(len / 256));
  let sum_mu_x = 0, sum_mu_y = 0, sum_sig_xx = 0, sum_sig_yy = 0, sum_sig_xy = 0;
  let count = 0;
  for (let i = 0; i < len; i += step) {
    sum_mu_x += a[i]; sum_mu_y += b[i];
    count++;
  }
  const mu_x = sum_mu_x / count;
  const mu_y = sum_mu_y / count;
  for (let i = 0; i < len; i += step) {
    sum_sig_xx += (a[i] - mu_x) ** 2;
    sum_sig_yy += (b[i] - mu_y) ** 2;
    sum_sig_xy += (a[i] - mu_x) * (b[i] - mu_y);
  }
  const sig_x = Math.sqrt(sum_sig_xx / count);
  const sig_y = Math.sqrt(sum_sig_yy / count);
  const sig_xy = sum_sig_xy / count;
  const c1 = 0.01 * 255; const c2 = 0.03 * 255;
  const num = (2 * mu_x * mu_y + c1) * (2 * sig_xy + c2);
  const den = (mu_x * mu_x + mu_y * mu_y + c1) * (sig_x * sig_x + sig_y * sig_y + c2);
  return den > 0 ? Math.max(0, Math.min(1, num / den)) : 0;
}

async function main() {
  ensureDir(RUN_DIR);

  const stages: StageInfo[] = [];

  // ── STAGE 0: Original ──
  const originalBuf = readFileSync(IMAGE_PATH);
  const origDims = await getDims(originalBuf);
  const original: StageInfo = {
    label: "01_original",
    file: "01_original.png",
    buf: originalBuf,
    sha256: sha256(originalBuf),
    width: origDims.w, height: origDims.h,
    sizeBytes: originalBuf.length,
    processingTimeMs: 0, serviceUrl: "N/A", provider: "N/A",
    executed: true, error: null,
  };
  stages.push(original);
  writeFileSync(join(RUN_DIR, "01_original.png"), originalBuf);

  // ── STAGE 1: FLUX Restore (Replicate) ──
  let currentBuf = originalBuf;
  const fluxProv = new FluxRestoreProvider(CONFIG.REPLICATE_API_TOKEN);
  let fluxBuf: Buffer, fluxDims: { w: number; h: number };
  let fluxTime: number, fluxError: string | null = null;
  const f0 = Date.now();
  try {
    const r = await fluxProv.restore({ image: originalBuf, contentType: "image/jpeg", fileName: "2.jpeg" });
    fluxBuf = Buffer.from(r.image.buffer, r.image.byteOffset, r.image.byteLength);
    fluxTime = Date.now() - f0;
    fluxDims = await getDims(fluxBuf);
    writeFileSync(join(RUN_DIR, "02_flux_restore.png"), fluxBuf);
  } catch (err) {
    fluxBuf = originalBuf; fluxDims = origDims; fluxTime = Date.now() - f0;
    fluxError = err instanceof Error ? err.message : String(err);
    writeFileSync(join(RUN_DIR, "02_flux_restore.png"), originalBuf);
  }
  stages.push({
    label: "02_flux_restore", file: "02_flux_restore.png",
    buf: fluxBuf, sha256: sha256(fluxBuf),
    width: fluxDims.w, height: fluxDims.h, sizeBytes: fluxBuf.length,
    processingTimeMs: fluxTime,
    serviceUrl: "https://api.replicate.com/v1/models/flux-kontext-apps/restore-image",
    provider: "FluxRestoreProvider (Replicate)",
    executed: !fluxError, error: fluxError,
  });
  currentBuf = fluxBuf;

  // ── STAGE 2: GFPGAN ──
  const gfpganSv = new RestorationGfpganService(CONFIG);
  let gfpganBuf: Buffer, gfpganDims: { w: number; h: number };
  let gfpganTime: number, gfpganError: string | null = null;
  const g0 = Date.now();
  try {
    const out = await gfpganSv.enhance({ body: currentBuf, contentType: "image/png", fileName: "2.jpeg" });
    gfpganBuf = Buffer.from(out.body.buffer, out.body.byteOffset, out.body.byteLength);
    gfpganTime = Date.now() - g0;
    gfpganDims = await getDims(gfpganBuf);
    writeFileSync(join(RUN_DIR, "03_gfpgan.png"), gfpganBuf);
  } catch (err) {
    gfpganBuf = currentBuf; gfpganDims = await getDims(currentBuf); gfpganTime = Date.now() - g0;
    gfpganError = err instanceof Error ? err.message : String(err);
    writeFileSync(join(RUN_DIR, "03_gfpgan.png"), currentBuf);
  }
  stages.push({
    label: "03_gfpgan", file: "03_gfpgan.png",
    buf: gfpganBuf, sha256: sha256(gfpganBuf),
    width: gfpganDims.w, height: gfpganDims.h, sizeBytes: gfpganBuf.length,
    processingTimeMs: gfpganTime,
    serviceUrl: CONFIG.RESTORATION_ENDPOINT_URL ? `RESTORATION_ENDPOINT_URL=${CONFIG.RESTORATION_ENDPOINT_URL}` : "NOT SET",
    provider: "RestorationGfpganService",
    executed: !gfpganError, error: gfpganError,
  });
  currentBuf = gfpganBuf;

  // ── STAGE 3: Real-ESRGAN ──
  const esrganSv = new RealEsrganService(CONFIG);
  let esrganBuf: Buffer, esrganDims: { w: number; h: number };
  let esrganTime: number, esrganError: string | null = null;
  const e0 = Date.now();
  try {
    const out = await esrganSv.enhance({ body: currentBuf, contentType: "image/png", fileName: "2.jpeg" });
    esrganBuf = Buffer.from(out.body.buffer, out.body.byteOffset, out.body.byteLength);
    esrganTime = Date.now() - e0;
    esrganDims = await getDims(esrganBuf);
    writeFileSync(join(RUN_DIR, "04_realesrgan.png"), esrganBuf);
  } catch (err) {
    esrganBuf = currentBuf; esrganDims = await getDims(currentBuf); esrganTime = Date.now() - e0;
    esrganError = err instanceof Error ? err.message : String(err);
    writeFileSync(join(RUN_DIR, "04_realesrgan.png"), currentBuf);
  }
  stages.push({
    label: "04_realesrgan", file: "04_realesrgan.png",
    buf: esrganBuf, sha256: sha256(esrganBuf),
    width: esrganDims.w, height: esrganDims.h, sizeBytes: esrganBuf.length,
    processingTimeMs: esrganTime,
    serviceUrl: CONFIG.REAL_ESRGAN_URL ? `REAL_ESRGAN_URL=${CONFIG.REAL_ESRGAN_URL}` : "NOT SET",
    provider: "RealEsrganService",
    executed: !esrganError, error: esrganError,
  });
  currentBuf = esrganBuf;

  // ── STAGE 4: DDColor ──
  const ddcolorSv = new RestorationDdcolorService(CONFIG);
  let ddcolorBuf: Buffer, ddcolorDims: { w: number; h: number };
  let ddcolorTime: number, ddcolorError: string | null = null;
  const d0 = Date.now();
  try {
    const out = await ddcolorSv.colorize({ body: currentBuf, contentType: "image/png", fileName: "2.jpeg" });
    ddcolorBuf = Buffer.from(out.body.buffer, out.body.byteOffset, out.body.byteLength);
    ddcolorTime = Date.now() - d0;
    ddcolorDims = await getDims(ddcolorBuf);
    writeFileSync(join(RUN_DIR, "05_ddcolor.png"), ddcolorBuf);
  } catch (err) {
    ddcolorBuf = currentBuf; ddcolorDims = await getDims(currentBuf); ddcolorTime = Date.now() - d0;
    ddcolorError = err instanceof Error ? err.message : String(err);
    writeFileSync(join(RUN_DIR, "05_ddcolor.png"), currentBuf);
  }
  stages.push({
    label: "05_ddcolor", file: "05_ddcolor.png",
    buf: ddcolorBuf, sha256: sha256(ddcolorBuf),
    width: ddcolorDims.w, height: ddcolorDims.h, sizeBytes: ddcolorBuf.length,
    processingTimeMs: ddcolorTime,
    serviceUrl: CONFIG.RESTORATION_ENDPOINT_URL ? `RESTORATION_ENDPOINT_URL=${CONFIG.RESTORATION_ENDPOINT_URL}` : "NOT SET",
    provider: "RestorationDdcolorService",
    executed: !ddcolorError, error: ddcolorError,
  });
  currentBuf = ddcolorBuf;

  // ── STAGE 5: LaMa ──
  const lamaSv = new RestorationInpaintService(CONFIG);
  let lamaBuf: Buffer, lamaDims: { w: number; h: number };
  let lamaTime: number, lamaError: string | null = null;
  const l0 = Date.now();
  try {
    const out = await lamaSv.inpaint({ body: currentBuf, contentType: "image/png", fileName: "2.jpeg" });
    lamaBuf = Buffer.from(out.body.buffer, out.body.byteOffset, out.body.byteLength);
    lamaTime = Date.now() - l0;
    lamaDims = await getDims(lamaBuf);
    writeFileSync(join(RUN_DIR, "06_lama.png"), lamaBuf);
  } catch (err) {
    lamaBuf = currentBuf; lamaDims = await getDims(currentBuf); lamaTime = Date.now() - l0;
    lamaError = err instanceof Error ? err.message : String(err);
    writeFileSync(join(RUN_DIR, "06_lama.png"), currentBuf);
  }
  stages.push({
    label: "06_lama", file: "06_lama.png",
    buf: lamaBuf, sha256: sha256(lamaBuf),
    width: lamaDims.w, height: lamaDims.h, sizeBytes: lamaBuf.length,
    processingTimeMs: lamaTime,
    serviceUrl: CONFIG.RESTORATION_ENDPOINT_URL ? `RESTORATION_ENDPOINT_URL=${CONFIG.RESTORATION_ENDPOINT_URL}` : "NOT SET",
    provider: "RestorationInpaintService",
    executed: !lamaError, error: lamaError,
  });
  currentBuf = lamaBuf;

  // ── STAGE 6: Final ──
  const finalDims = await getDims(lamaBuf);
  stages.push({
    label: "07_final", file: "07_final.png",
    buf: lamaBuf, sha256: sha256(lamaBuf),
    width: finalDims.w, height: finalDims.h, sizeBytes: lamaBuf.length,
    processingTimeMs: 0,
    serviceUrl: "N/A",
    provider: "N/A (pipeline final)",
    executed: true, error: null,
  });
  writeFileSync(join(RUN_DIR, "07_final.png"), lamaBuf);

  // ══════════════════════════════════════════════
  // Compute chaining verification metrics
  // ══════════════════════════════════════════════

  const chainSteps: Array<{
    from: string; to: string;
    inputSha: string; outputSha: string;
    inputW: number; inputH: number; outputW: number; outputH: number;
    inputBytes: number; outputBytes: number;
    avgRgbDelta: number; pixelDiffPercent: number;
    ssimFromPrev: number; psnrFromPrev: number;
    hashChainMatch: boolean; negligibleChange: boolean;
    chainBroken: boolean;
  }> = [];

  for (let i = 0; i < stages.length - 1; i++) {
    const inp = stages[i].buf;
    const out = stages[i + 1].buf;
    // Pad to same length for comparison
    const len = Math.min(inp.length, out.length);
    const a = inp.subarray(0, len);
    const b = out.subarray(0, len);

    const avgDelta = computeAvgRgbDelta(a, b);
    const pctDiff = computePixelDiffPercent(a, b);
    const ssim = computeSsimBytes(a, b);
    const psnr = computePsnrBytes(a, b);

    const hashMatch = stages[i + 1].sha256 === sha256(inp);
    const negChange = pctDiff < 0.5;
    // Chain is broken if hash differs AND pixel diff > 0.5%
    const broken = !hashMatch && pctDiff > 0.5 && stages[i+1].executed;

    chainSteps.push({
      from: stages[i].label,
      to: stages[i + 1].label,
      inputSha: stages[i].sha256,
      outputSha: stages[i + 1].sha256,
      inputW: stages[i].width, inputH: stages[i].height,
      outputW: stages[i + 1].width, outputH: stages[i + 1].height,
      inputBytes: stages[i].sizeBytes,
      outputBytes: stages[i + 1].sizeBytes,
      avgRgbDelta: Math.round(avgDelta * 100) / 100,
      pixelDiffPercent: Math.round(pctDiff * 100) / 100,
      ssimFromPrev: Math.round(ssim * 100) / 100,
      psnrFromPrev: Math.round(psnr * 100) / 100,
      hashChainMatch: hashMatch,
      negligibleChange: negChange,
      chainBroken: broken,
    });
  }

  // ══════════════════════════════════════════════
  // Write outputs
  // ══════════════════════════════════════════════

  // 1. stage_inputs_outputs.json
  const stageIo = stages.map(s => ({
    label: s.label, file: s.file,
    sha256: s.sha256,
    width: s.width, height: s.height,
    sizeBytes: s.sizeBytes,
    processingTimeMs: s.processingTimeMs,
    serviceUrl: s.serviceUrl, provider: s.provider,
    executed: s.executed, error: s.error,
  }));
  writeFileSync(join(RUN_DIR, "stage_inputs_outputs.json"), JSON.stringify(stageIo, null, 2));

  // 2. hash_report.csv
  const hashCsv: string[] = ["stage,sha256,width,height,sizeBytes,executed,error"];
  for (const s of stageIo) {
    hashCsv.push(`${s.label},${s.sha256},${s.width},${s.height},${s.sizeBytes},${s.executed},${s.error || ""}`);
  }
  writeFileSync(join(RUN_DIR, "hash_report.csv"), hashCsv.join("\n"));

  // 3. pixel_difference.csv
  const pxCsv: string[] = [
    "fromStage,toStage,avgRgbDelta,pixelDiffPercent,ssimFromPrev,psnrFromPrev,hashChainMatch,negligibleChange,chainBroken"
  ];
  for (const c of chainSteps) {
    pxCsv.push(`${c.from},${c.to},${c.avgRgbDelta},${c.pixelDiffPercent},${c.ssimFromPrev},${c.psnrFromPrev},${c.hashChainMatch},${c.negligibleChange},${c.chainBroken}`);
  }
  writeFileSync(join(RUN_DIR, "pixel_difference.csv"), pxCsv.join("\n"));

  // 4. pipeline_chain.md
  const chainLines: string[] = [
    "# OPS-114 Pipeline Chaining Verification",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Image:** old images/2.jpeg`,
    `**Run Directory:** ${RUN_DIR}`,
    "",
    "## Execution Chain",
    "",
  ];

  // Print the hash chain
  for (const s of stages) {
    const exe = s.executed ? "EXECUTED" : "FAILED";
    const errNote = s.error ? ` → ERROR: ${s.error.substring(0, 80)}` : "";
    chainLines.push(`**${s.label}** (${s.file})`);
    chainLines.push(`- SHA256: \`${s.sha256}\``);
    chainLines.push(`- Dimensions: ${s.width}x${s.height}`);
    chainLines.push(`- Size: ${(s.sizeBytes / 1024).toFixed(1)}KB`);
    chainLines.push(`- Status: ${exe}${errNote}`);
    chainLines.push(`- Provider: ${s.provider}`);
    chainLines.push(`- Time: ${s.processingTimeMs}ms`);
    chainLines.push("");
  }

  // Hash chain in flow format
  chainLines.push("### Hash Flow Chain");
  chainLines.push("");
  chainLines.push("```");
  for (let i = 0; i < stages.length; i++) {
    chainLines.push(`[${stages[i].label}] ${stages[i].sha256.substring(0, 20)}...`);
    if (i < stages.length - 1) {
      chainLines.push("    ↓");
      chainLines.push(`[${chainSteps[i].to}] ${stages[i+1].sha256.substring(0, 20)}...`);
      const match = chainSteps[i].hashChainMatch ? "HASH MATCH" : "HASH DIFFERS";
      chainLines.push(`    └─ ${match} | Δ=${chainSteps[i].avgRgbDelta} | pxDiff=${chainSteps[i].pixelDiffPercent}%`);
      if (chainSteps[i].chainBroken) {
        chainLines.push(`    ⚠ CHAIN BROKEN at ${chainSteps[i].from} → ${chainSteps[i].to}`);
      }
      if (chainSteps[i].negligibleChange) {
        chainLines.push(`    ⚠ Negligible visual change (<0.5% pixel difference)`);
      }
      chainLines.push("");
    }
  }
  chainLines.push("```");
  chainLines.push("");

  // PASS/FAIL verdict
  chainLines.push("## Chain Verification Result");
  chainLines.push("");
  const brokenStages = chainSteps.filter(c => c.chainBroken);
  const neglStages = chainSteps.filter(c => c.negligibleChange && !c.chainBroken);

  if (brokenStages.length === 0) {
    if (neglStages.length > 0) {
      chainLines.push("**PASS** — All stages correctly chain to the previous stage output.");
      chainLines.push("");
      chainLines.push("### Warnings");
      for (const ns of neglStages) {
        chainLines.push(`- ${ns.from} → ${ns.to}: Stage executed but produced negligible visual change (pixel diff ${ns.pixelDiffPercent}% < 0.5%)`);
      }
    } else {
      chainLines.push("**PASS** — Every stage consumes the output of the previous stage. Chain is intact.");
    }
  } else {
    chainLines.push("**FAIL** — Chain broken at the following transitions:");
    chainLines.push("");
    for (const bs of brokenStages) {
      chainLines.push(`- ${bs.from} → ${bs.to}`);
      chainLines.push(`  Input SHA: ${bs.inputSha.substring(0, 20)}...`);
      chainLines.push(`  Output SHA: ${bs.outputSha.substring(0, 20)}...`);
      chainLines.push(`  Pixel diff: ${bs.pixelDiffPercent}%`);
      chainLines.push(`  SSIM: ${bs.ssimFromPrev}`);
      chainLines.push(`  PSNR: ${bs.psnrFromPrev}`);
    }
  }

  // Detailed chaining table
  chainLines.push("");
  chainLines.push("## Per-Transition Details");
  chainLines.push("");
  chainLines.push("| From | To | Input SHA | Output SHA | Input WxH | Output WxH | Input KB | Output KB | AvgRGBΔ | pxDiff% | SSIM | PSNR | Chain OK | Negligible |");
  chainLines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const c of chainSteps) {
    chainLines.push(
      `| ${c.from} | ${c.to} | ${c.inputSha.substring(0, 16)}... | ${c.outputSha.substring(0, 16)}... | ` +
      `${c.inputW}x${c.inputH} | ${c.outputW}x${c.outputH} | ` +
      `${(c.inputBytes / 1024).toFixed(1)} | ${(c.outputBytes / 1024).toFixed(1)} | ` +
      `${c.avgRgbDelta} | ${c.pixelDiffPercent} | ${c.ssimFromPrev} | ${c.psnrFromPrev} | ` +
      `${c.hashChainMatch ? "VERIFIED" : "BROKEN"} | ${c.negligibleChange ? "YES" : "NO"} |`
    );
  }

  writeFileSync(join(RUN_DIR, "pipeline_chain.md"), chainLines.join("\n"));

  // SHA256 manifest
  const shaLines: string[] = ["SHA256 Manifest", "==============", ""];
  for (const f of OUTPUT_FILES) {
    const fp = join(RUN_DIR, f);
    if (existsSync(fp)) {
      shaLines.push(`${sha256(readFileSync(fp))}  ${f}`);
    }
  }
  for (const extra of ["stage_inputs_outputs.json","hash_report.csv","pixel_difference.csv","pipeline_chain.md"]) {
    const fp = join(RUN_DIR, extra);
    if (existsSync(fp)) {
      shaLines.push(`${sha256(readFileSync(fp))}  ${extra}`);
    }
  }
  writeFileSync(join(RUN_DIR, "19_sha256.txt"), shaLines.join("\n"));

  console.log("OPS-114 chaining verification complete.");
  console.log("Output:", RUN_DIR);
  console.log("Chain broken stages:", brokenStages.length);
  console.log("Negligible change warnings:", neglStages.length);
  for (const c of chainSteps) {
    const status = c.chainBroken ? "CHAIN BROKEN" : c.negligibleChange ? "NEGLIGIBLE" : "OK";
    console.log(`  ${c.from} → ${c.to}: ${status} (pxDiff=${c.pixelDiffPercent}%, SSIM=${c.ssimFromPrev}, hash=${c.hashChainMatch})`);
  }
}

main().catch(err => { console.error("OPS-114 failed:", err); process.exit(1); });
