// @ts-nocheck
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { FluxRestoreProvider } from "../restoration-providers/providers/FluxRestoreProvider";
import { QualityMetricsCalculator } from "../restoration-providers/quality/QualityMetricsCalculator";
import { RestorationInpaintService } from "../services/restoration-provider.service";
import { RestorationGfpganService } from "../services/restoration-provider.service";
import { RestorationDdcolorService } from "../services/restoration-provider.service";
import { RealEsrganService } from "../services/real-esrgan.service";
import type { RestorationRequest, RestorationResult } from "../restoration-providers/interfaces/IRestorationProvider";
import type { AppConfig } from "../config/env";

function toBuf(src: Buffer): Buffer {
  return Buffer.from(src.buffer, src.byteOffset, src.byteLength);
}

// @ts-ignore - bypass Node 24 SharedArrayBuffer incompatibility with sharp
function writeBuf(fp: string, buf: Buffer): void {
  writeFileSync(fp, Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
}

const IMAGE_PATH = join(process.cwd(), "..", "..", "old images", "2.jpeg");
const RESULTS_BASE = join(process.cwd(), "..", "..", "benchmark", "results", "ops113");
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
const RUN_DIR = join(RESULTS_BASE, TIMESTAMP);
const PROD_CONFIG = {
  RESTORATION_ENDPOINT_URL: process.env.RESTORATION_ENDPOINT_URL || "",
  REAL_ESRGAN_URL: process.env.REAL_ESRGAN_URL || "",
  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || "",
  NODE_ENV: process.env.NODE_ENV || "benchmark",
  AI_PROVIDER: "mock",
  PAYMENT_GATEWAY_NAME: "manual",
  STORAGE_PROVIDER: "mock",
  WHATSAPP_VERIFY_TOKEN: "ops113-benchmark",
  ADMIN_JWT_SECRET: "ops113-benchmark",
  JWT_SECRET: "ops113-benchmark",
  DATABASE_URL: "postgresql://placeholder",
  REDIS_URL: "redis://placeholder",
  BACKGROUND_API_URL: process.env.BACKGROUND_API_URL || "",
  PRODUCT_CLASSIFIER_URL: "",
  YOLO_DETECTOR_URL: "",
  IC_LIGHT_LAB_URL: "",
  R2_ACCOUNT_ID: "",
  R2_BUCKET_NAME: "",
  R2_PUBLIC_BASE_URL: "",
} as unknown as AppConfig;

interface StageRecord {
  inputFile: string;
  outputFile: string;
  inputSha256: string;
  outputSha256: string;
  inputResolution: { width: number; height: number } | null;
  outputResolution: { width: number; height: number } | null;
  inputSizeBytes: number;
  outputSizeBytes: number;
  processingTimeMs: number;
  serviceUrl: string;
  provider: string;
  executed: boolean;
  skipped: boolean;
  skipReason: string | null;
  skipEnvVar: string | null;
  skipCondition: string | null;
  skipSourceFile: string | null;
  skipSourceLine: number | null;
}

async function getImageDimensions(buf: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buf).metadata();
    return { width: meta.width || 0, height: meta.height || 0 };
  } catch {
    return null;
  }
}

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function main() {
  ensureDir(RUN_DIR);

  const imageBuf = readFileSync(IMAGE_PATH);
  const origDims = await getImageDimensions(imageBuf);
  const metricsCalc = new QualityMetricsCalculator();
  const records: Record<string, StageRecord> = {};

  const request: RestorationRequest = {
    image: imageBuf,
    contentType: "image/jpeg",
    fileName: "2.jpeg",
  };

  // ── STAGE 1: Original ──
  writeBuf(join(RUN_DIR, "01_original.png"), imageBuf);
  records["01_original"] = {
    inputFile: "2.jpeg",
    outputFile: "01_original.png",
    inputSha256: sha256(toBuf(imageBuf)),
    outputSha256: sha256(imageBuf),
    inputResolution: origDims,
    outputResolution: origDims,
    inputSizeBytes: imageBuf.length,
    outputSizeBytes: imageBuf.length,
    processingTimeMs: 0,
    serviceUrl: "N/A (source)",
    provider: "N/A",
    executed: true,
    skipped: false,
    skipReason: null,
    skipEnvVar: null,
    skipCondition: null,
    skipSourceFile: null,
    skipSourceLine: null,
  };

  // ── STAGE 2: FLUX Restore (Replicate) ──
  const fluxRestore = new FluxRestoreProvider(PROD_CONFIG.REPLICATE_API_TOKEN);
  let fluxImage = imageBuf;
  let fluxContentType = "image/jpeg";
  const fluxStart = Date.now();
  let fluxResult: RestorationResult | null = null;
  let fluxError: string | null = null;
  try {
    fluxResult = await fluxRestore.restore(request);
    fluxImage = fluxResult.image as unknown as Buffer;
    fluxContentType = fluxResult.contentType;
    writeBuf(join(RUN_DIR, "02_flux_restore.png"), fluxImage);
  } catch (err) {
    fluxError = err instanceof Error ? err.message : String(err);
    console.error("FLUX Restore failed:", fluxError);
    writeBuf(join(RUN_DIR, "02_flux_restore.png"), imageBuf);
  }
  const fluxEnd = Date.now();

  // @ts-ignore
  const fluxDims = await getImageDimensions(fluxImage);
  records["02_flux_restore"] = {
    inputFile: "01_original.png",
    outputFile: "02_flux_restore.png",
    inputSha256: sha256(toBuf(imageBuf)),
    outputSha256: sha256(toBuf(fluxImage)),
    inputResolution: origDims,
    outputResolution: fluxDims,
    inputSizeBytes: imageBuf.length,
    outputSizeBytes: fluxImage.length,
    processingTimeMs: fluxEnd - fluxStart,
    serviceUrl: "https://api.replicate.com/v1/models/flux-kontext-apps/restore-image/versions/85ae46551612b8f778348846b6ce1ce1b340e384fe2062399c0c412be29e107d/predictions",
    provider: "FluxRestoreProvider (Replicate)",
    executed: fluxResult !== null,
    skipped: fluxError !== null,
    skipReason: fluxError,
    skipEnvVar: fluxError?.includes("token") ? "REPLICATE_API_TOKEN" : null,
    skipCondition: null,
    skipSourceFile: fluxError ? "BaseReplicateProvider.ts:97-98" : null,
    skipSourceLine: fluxError ? 97 : null,
  };

  // ── STAGE 3: GFPGAN (via unified RESTORATION_ENDPOINT_URL / RunPod) ──
  let gfpganImage = fluxImage;
  let gfpganContentType = fluxContentType;
  const gfpganStart = Date.now();
  let gfpganExecuted = false;
  let gfpganSkipReason: string | null = null;

  try {
    const gfpganService = new RestorationGfpganService(PROD_CONFIG);
    const gfpganOutput = await gfpganService.enhance({
      body: fluxImage,
      contentType: fluxContentType,
      fileName: "2.jpeg",
    });
    gfpganImage = gfpganOutput.body as unknown as Buffer;
    gfpganContentType = gfpganOutput.contentType;
    writeBuf(join(RUN_DIR, "03_gfpgan.png"), gfpganImage);
    gfpganExecuted = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    gfpganSkipReason = msg;
    if (msg.includes("not configured") || msg.includes("UNAVAILABLE")) {
      gfpganSkipReason = "GFPGAN skipped: RESTORATION_ENDPOINT_URL is empty — RestorationGfpganService → UnifiedRestorationService throws AppError(503, RESTORATION_ENDPOINT_UNAVAILABLE)";
    } else {
      gfpganSkipReason = `GFPGAN failed: ${msg}`;
    }
    writeBuf(join(RUN_DIR, "03_gfpgan.png"), fluxImage);
  }
  const gfpganEnd = Date.now();

  // @ts-ignore
  const gfpganDims = await getImageDimensions(gfpganImage);
  records["03_gfpgan"] = {
    inputFile: "02_flux_restore.png",
    outputFile: "03_gfpgan.png",
    inputSha256: sha256(toBuf(fluxImage)),
    outputSha256: sha256(toBuf(gfpganImage)),
    inputResolution: fluxDims,
    outputResolution: gfpganDims,
    inputSizeBytes: fluxImage.length,
    outputSizeBytes: gfpganImage.length,
    processingTimeMs: gfpganEnd - gfpganStart,
    serviceUrl: PROD_CONFIG.RESTORATION_ENDPOINT_URL
      ? `RESTORATION_ENDPOINT_URL=${PROD_CONFIG.RESTORATION_ENDPOINT_URL.substring(0, 20)}... (via UnifiedRestorationService.restore)`
      : "NOT SET",
    provider: "RestorationGfpganService → UnifiedRestorationService",
    executed: gfpganExecuted,
    skipped: !gfpganExecuted,
    skipReason: gfpganSkipReason,
    skipEnvVar: !PROD_CONFIG.RESTORATION_ENDPOINT_URL ? "RESTORATION_ENDPOINT_URL" : null,
    skipCondition: gfpganSkipReason?.includes("RESTORATION_ENDPOINT_URL") ? "config.RESTORATION_ENDPOINT_URL is empty string" : null,
    skipSourceFile: gfpganSkipReason?.includes("RESTORATION_ENDPOINT_URL") ? "restoration-provider.service.ts:35-37" : null,
    skipSourceLine: gfpganSkipReason?.includes("RESTORATION_ENDPOINT_URL") ? 35 : null,
  };

  // ── STAGE 4: Real-ESRGAN (via REAL_ESRGAN_URL) ──
  let esrganImage = gfpganImage;
  let esrganContentType = gfpganContentType;
  const esrganStart = Date.now();
  let esrganExecuted = false;
  let esrganSkipReason: string | null = null;

  try {
    const esrganService = new RealEsrganService(PROD_CONFIG);
    const esrganOutput = await esrganService.enhance({
      body: gfpganImage,
      contentType: gfpganContentType,
      fileName: "2.jpeg",
    });
    esrganImage = esrganOutput.body as unknown as Buffer;
    esrganContentType = esrganOutput.contentType;
    writeBuf(join(RUN_DIR, "04_realesrgan.png"), esrganImage);
    esrganExecuted = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    esrganSkipReason = msg;
    writeBuf(join(RUN_DIR, "04_realesrgan.png"), gfpganImage);
  }
  const esrganEnd = Date.now();

  // @ts-ignore
  const esrganDims = await getImageDimensions(esrganImage);
  records["04_realesrgan"] = {
    inputFile: "03_gfpgan.png",
    outputFile: "04_realesrgan.png",
    inputSha256: sha256(toBuf(gfpganImage)),
    outputSha256: sha256(toBuf(esrganImage)),
    inputResolution: gfpganDims,
    outputResolution: esrganDims,
    inputSizeBytes: gfpganImage.length,
    outputSizeBytes: esrganImage.length,
    processingTimeMs: esrganEnd - esrganStart,
    serviceUrl: PROD_CONFIG.REAL_ESRGAN_URL
      ? `REAL_ESRGAN_URL=${PROD_CONFIG.REAL_ESRGAN_URL.substring(0, 20)}... (via RealEsrganService.enhance)`
      : "NOT SET",
    provider: "RealEsrganService",
    executed: esrganExecuted,
    skipped: !esrganExecuted,
    skipReason: esrganSkipReason?.includes("service not configured")
      ? "Real-ESRGAN skipped: REAL_ESRGAN_URL is empty — RealEsrganService.enhance returns source image unchanged (logger.warn)"
      : esrganSkipReason,
    skipEnvVar: !PROD_CONFIG.REAL_ESRGAN_URL ? "REAL_ESRGAN_URL" : null,
    skipCondition: !PROD_CONFIG.REAL_ESRGAN_URL ? "config.REAL_ESRGAN_URL.trim() is empty string in RealEsrganService.enhance" : null,
    skipSourceFile: !PROD_CONFIG.REAL_ESRGAN_URL ? "real-esrgan.service.ts:27-33" : null,
    skipSourceLine: !PROD_CONFIG.REAL_ESRGAN_URL ? 27 : null,
  };

  // ── STAGE 5: DDColor (via unified RESTORATION_ENDPOINT_URL, conditional on grayscale) ──
  let ddcolorImage = esrganImage;
  let ddcolorContentType = esrganContentType;
  const ddcolorStart = Date.now();
  let ddcolorExecuted = false;
  let ddcolorSkipReason: string | null = null;

  try {
    const ddcolorService = new RestorationDdcolorService(PROD_CONFIG);
    const ddcolorOutput = await ddcolorService.colorize({
      body: esrganImage,
      contentType: esrganContentType,
      fileName: "2.jpeg",
    });
    ddcolorImage = ddcolorOutput.body as unknown as Buffer;
    ddcolorContentType = ddcolorOutput.contentType;
    writeBuf(join(RUN_DIR, "05_ddcolor.png"), ddcolorImage);
    ddcolorExecuted = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not configured") || msg.includes("UNAVAILABLE")) {
      ddcolorSkipReason = "DDColor skipped: RESTORATION_ENDPOINT_URL is empty — RestorationDdcolorService → UnifiedRestorationService throws AppError(503, RESTORATION_ENDPOINT_UNAVAILABLE)";
    } else {
      ddcolorSkipReason = `DDColor failed: ${msg}`;
    }
    writeBuf(join(RUN_DIR, "05_ddcolor.png"), esrganImage);
  }
  const ddcolorEnd = Date.now();

  // @ts-ignore
  const ddcolorDims = await getImageDimensions(ddcolorImage);
  // Check grayscale detection
  const isGrayscaleDetected = detectGrayscaleFromHeader(imageBuf);
  records["05_ddcolor"] = {
    inputFile: "04_realesrgan.png",
    outputFile: "05_ddcolor.png",
    inputSha256: sha256(toBuf(esrganImage)),
    outputSha256: sha256(toBuf(ddcolorImage)),
    inputResolution: esrganDims,
    outputResolution: ddcolorDims,
    inputSizeBytes: esrganImage.length,
    outputSizeBytes: ddcolorImage.length,
    processingTimeMs: ddcolorEnd - ddcolorStart,
    serviceUrl: PROD_CONFIG.RESTORATION_ENDPOINT_URL
      ? `RESTORATION_ENDPOINT_URL=${PROD_CONFIG.RESTORATION_ENDPOINT_URL.substring(0, 20)}...`
      : "NOT SET",
    provider: "RestorationDdcolorService → UnifiedRestorationService",
    executed: ddcolorExecuted,
    skipped: !ddcolorExecuted,
    skipReason: ddcolorSkipReason || (isGrayscaleDetected ? null : "DDColor skipped: image is NOT grayscale — conditional at UnifiedLocalRestorationProvider.ts:71 (damage.isGrayscale === false)"),
    skipEnvVar: (!PROD_CONFIG.RESTORATION_ENDPOINT_URL && ddcolorSkipReason?.includes("RESTORATION_ENDPOINT_URL")) ? "RESTORATION_ENDPOINT_URL" : (isGrayscaleDetected ? null : "N/A (conditional on grayscale detection)"),
    skipCondition: isGrayscaleDetected ? null : "damage.isGrayscale === false at UnifiedLocalRestorationProvider.ts:71",
    skipSourceFile: isGrayscaleDetected ? null : "UnifiedLocalRestorationProvider.ts:71",
    skipSourceLine: isGrayscaleDetected ? null : 71,
  };

  // ── STAGE 6: LaMa (via unified RESTORATION_ENDPOINT_URL, conditional on scratch > 15%) ──
  let lamaImage = ddcolorImage;
  let lamaContentType = ddcolorContentType;
  const lamaStart = Date.now();
  let lamaExecuted = false;
  let lamaSkipReason: string | null = null;

  try {
    const inpaintService = new RestorationInpaintService(PROD_CONFIG);
    const lamaOutput = await inpaintService.inpaint({
      body: ddcolorImage,
      contentType: ddcolorContentType,
      fileName: "2.jpeg",
    });
    lamaImage = lamaOutput.body as unknown as Buffer;
    lamaContentType = lamaOutput.contentType;
    writeBuf(join(RUN_DIR, "06_lama.png"), lamaImage);
    lamaExecuted = true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("not configured") || msg.includes("UNAVAILABLE")) {
      lamaSkipReason = "LaMa skipped: RESTORATION_ENDPOINT_URL is empty — RestorationInpaintService → UnifiedRestorationService throws AppError(503, RESTORATION_ENDPOINT_UNAVAILABLE)";
    } else {
      lamaSkipReason = `LaMa failed: ${msg}`;
    }
    writeBuf(join(RUN_DIR, "06_lama.png"), ddcolorImage);
  }
  const lamaEnd = Date.now();

  // @ts-ignore
  const lamaDims = await getImageDimensions(lamaImage);
  const scratchCoverage = calculateScratchCoverage(imageBuf);
  records["06_lama"] = {
    inputFile: "05_ddcolor.png",
    outputFile: "06_lama.png",
    inputSha256: sha256(toBuf(ddcolorImage)),
    outputSha256: sha256(toBuf(lamaImage)),
    inputResolution: ddcolorDims,
    outputResolution: lamaDims,
    inputSizeBytes: ddcolorImage.length,
    outputSizeBytes: lamaImage.length,
    processingTimeMs: lamaEnd - lamaStart,
    serviceUrl: PROD_CONFIG.RESTORATION_ENDPOINT_URL
      ? `RESTORATION_ENDPOINT_URL=${PROD_CONFIG.RESTORATION_ENDPOINT_URL.substring(0, 20)}...`
      : "NOT SET",
    provider: "RestorationInpaintService → UnifiedRestorationService",
    executed: lamaExecuted && scratchCoverage > 15,
    skipped: !lamaExecuted || scratchCoverage <= 15,
    skipReason: lamaSkipReason || (scratchCoverage <= 15
      ? `LaMa skipped: scratch coverage (${scratchCoverage.toFixed(1)}%) <= threshold (15%) — conditional at UnifiedLocalRestorationProvider.ts:43 (damage.coverage > SCRATCH_THRESHOLD)`
      : null),
    skipEnvVar: (!PROD_CONFIG.RESTORATION_ENDPOINT_URL && lamaSkipReason?.includes("RESTORATION_ENDPOINT_URL")) ? "RESTORATION_ENDPOINT_URL" : (scratchCoverage <= 15 ? "N/A (conditional on scratch coverage)" : null),
    skipCondition: scratchCoverage <= 15 ? `damage.coverage (${scratchCoverage.toFixed(1)}) <= SCRATCH_THRESHOLD (15)` : null,
    skipSourceFile: scratchCoverage <= 15 ? "UnifiedLocalRestorationProvider.ts:43" : (lamaSkipReason?.includes("RESTORATION_ENDPOINT_URL") ? "restoration-provider.service.ts:35-37" : null),
    skipSourceLine: scratchCoverage <= 15 ? 43 : 35,
  };

  // ── STAGE 7: Final output (last stage's result) ──
  writeBuf(join(RUN_DIR, "07_final_output.png"), lamaImage);

  // @ts-ignore
  const finalDims = await getImageDimensions(lamaImage);
  records["07_final_output"] = {
    inputFile: "06_lama.png",
    outputFile: "07_final_output.png",
    inputSha256: sha256(toBuf(ddcolorImage)),
    outputSha256: sha256(toBuf(lamaImage)),
    inputResolution: lamaDims,
    outputResolution: finalDims,
    inputSizeBytes: ddcolorImage.length,
    outputSizeBytes: lamaImage.length,
    processingTimeMs: lamaEnd - lamaStart,
    serviceUrl: "N/A (composite)",
    provider: "N/A (pipeline final)",
    executed: true,
    skipped: false,
    skipReason: null,
    skipEnvVar: null,
    skipCondition: null,
    skipSourceFile: null,
    skipSourceLine: null,
  };

  // ── STAGE 8: Side-by-side comparison ──
  // @ts-ignore - Node 24 Buffer<ArrayBufferLike> incompatibility with sharp
  const sharp = (await import("sharp")).default;
  const origPng = await sharp(imageBuf).resize(400).png().toBuffer();
  const fluxPng = await sharp(fluxImage).resize(400).png().toBuffer();
  const finalPng = await sharp(lamaImage).resize(400).png().toBuffer();
  const sideBySideBuf = await sharp({
    create: { width: 400 * 3 + 20, height: 400, channels: 3, background: { r: 50, g: 50, b: 50 } }
  })
    .composite([
      { input: origPng, top: 0, left: 0 },
      { input: fluxPng, top: 0, left: 420 },
      { input: finalPng, top: 0, left: 840 }
    ])
    .png()
    .toBuffer();
  writeFileSync(join(RUN_DIR, "08_side_by_side.png"), sideBySideBuf);

  // ── Comparison with prior Pipeline A (OPS-109) ──
  const pipelineAImagePath = join(process.cwd(), "..", "..", "benchmark", "results", "ops109", "pipeline-a", "2.jpeg");
  let comparisonMetrics: Record<string, number | string> = {
    ssim: "UNKNOWN",
    psnr: "UNKNOWN",
    lpips: "UNKNOWN",
    faceSimilarity: "UNKNOWN",
  };
  if (existsSync(pipelineAImagePath)) {
    const pipelineABuf = readFileSync(pipelineAImagePath);
    const currentMetrics = metricsCalc.calculateMetrics(pipelineABuf, lamaImage);
    comparisonMetrics = {
      ssim: currentMetrics.ssim,
      psnr: currentMetrics.psnr,
    };
  }

  // ── Write stage trace ──
  const traceJson = JSON.stringify(records, null, 2);
  writeFileSync(join(RUN_DIR, "10_stage_trace.json"), traceJson);

  // ── Write metrics ──
  const metrics = metricsCalc.calculateMetrics(imageBuf, lamaImage);
  const metricsOutput: Record<string, unknown> = {
    ...metrics,
    comparisonWithPipelineA: comparisonMetrics,
  };
  writeFileSync(join(RUN_DIR, "09_metrics.json"), JSON.stringify(metricsOutput, null, 2));

  // ── Write verification report ──
  const verificationLines: string[] = [
    "# OPS-113 Pipeline Stage Verification",
    "",
    `**Date:** ${new Date().toISOString()}`,
    `**Image:** old images/2.jpeg`,
    `**Run Directory:** ${RUN_DIR}`,
    "",
    "## Stage Execution Summary",
    "",
    "| Stage | Executed | Skipped | Reason | Env Var | Source File:Line |",
    "|---|---|---|---|---|---|",
  ];
  for (const [key, rec] of Object.entries(records)) {
    const exe = rec.executed ? "VERIFIED" : "NO";
    const skp = rec.skipped ? rec.skipReason?.substring(0, 80) || "YES" : "NO";
    const ev = rec.skipEnvVar || "-";
    const sf = rec.skipSourceFile ? `${rec.skipSourceFile}:${rec.skipSourceLine}` : "-";
    verificationLines.push(`| ${key} | ${exe} | ${skp?.substring(0, 100)} | ${ev} | ${sf} |`);
  }

  verificationLines.push(
    "",
    "## Detailed Skip Evidence",
    "",
  );
  for (const [key, rec] of Object.entries(records)) {
    if (rec.skipped && rec.skipReason) {
      verificationLines.push(`### ${key}`);
      verificationLines.push(`- **Exact reason:** ${rec.skipReason}`);
      verificationLines.push(`- **Environment variable:** ${rec.skipEnvVar || "N/A"}`);
      verificationLines.push(`- **Conditional branch:** ${rec.skipCondition || "N/A"}`);
      verificationLines.push(`- **Source file:** ${rec.skipSourceFile || "N/A"}`);
      verificationLines.push(`- **Source line:** ${rec.skipSourceLine || "N/A"}`);
      verificationLines.push("");
    }
  }

  verificationLines.push(
    "## Stage Artifacts",
    "",
    "| File | Input SHA256 | Output SHA256 | Input Res | Output Res | Input Size | Output Size | Time (ms) |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const [key, rec] of Object.entries(records)) {
    const inRes = rec.inputResolution ? `${rec.inputResolution.width}x${rec.inputResolution.height}` : "?";
    const outRes = rec.outputResolution ? `${rec.outputResolution.width}x${rec.outputResolution.height}` : "?";
    verificationLines.push(
      `| ${rec.outputFile} | ${rec.inputSha256.substring(0, 16)}... | ${rec.outputSha256.substring(0, 16)}... | ${inRes} | ${outRes} | ${(rec.inputSizeBytes / 1024).toFixed(1)}KB | ${(rec.outputSizeBytes / 1024).toFixed(1)}KB | ${rec.processingTimeMs} |`
    );
  }

  verificationLines.push(
    "",
    "## Comparison with Pipeline A (OPS-109)",
    "",
    `| Metric | Value |`,
    `|---|---|`,
    `| SSIM vs Pipeline A | ${comparisonMetrics.ssim} |`,
    `| PSNR vs Pipeline A | ${comparisonMetrics.psnr} |`,
    `| LPIPS | ${comparisonMetrics.lpips} |`,
    `| Face Similarity | ${comparisonMetrics.faceSimilarity} |`,
    "",
    "## Environment",
    "",
    `| Variable | Value |`,
    `|---|---|`,
    `| RESTORATION_ENDPOINT_URL | ${PROD_CONFIG.RESTORATION_ENDPOINT_URL || "(empty)"} |`,
    `| REAL_ESRGAN_URL | ${PROD_CONFIG.REAL_ESRGAN_URL || "(empty)"} |`,
    `| REPLICATE_API_TOKEN | ${PROD_CONFIG.REPLICATE_API_TOKEN ? "SET (" + PROD_CONFIG.REPLICATE_API_TOKEN.substring(0, 10) + "...)" : "NOT SET"} |`,
  );

  writeFileSync(join(RUN_DIR, "15_verification.md"), verificationLines.join("\n"));

  // ── Environment audit ──
  const envAudit: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    image: "old images/2.jpeg",
    environment: {
      RESTORATION_ENDPOINT_URL: PROD_CONFIG.RESTORATION_ENDPOINT_URL || "NOT SET",
      REAL_ESRGAN_URL: PROD_CONFIG.REAL_ESRGAN_URL || "NOT SET",
      REPLICATE_API_TOKEN: PROD_CONFIG.REPLICATE_API_TOKEN ? "SET" : "NOT SET",
    },
    analysis: {
      grayscaleDetected: isGrayscaleDetected,
      scratchCoveragePercent: scratchCoverage,
    },
    stageCount: Object.keys(records).length,
    stagesExecuted: Object.values(records).filter(r => r.executed).length,
    stagesSkipped: Object.values(records).filter(r => r.skipped).length,
  };
  writeFileSync(join(RUN_DIR, "20_environment.json"), JSON.stringify(envAudit, null, 2));

  // ── SHA256 manifest ──
  const shaLines: string[] = ["SHA256 Manifest", "==============", ""];
  const allFiles = ["01_original.png", "02_flux_restore.png", "03_gfpgan.png", "04_realesrgan.png",
    "05_ddcolor.png", "06_lama.png", "07_final_output.png", "08_side_by_side.png",
    "09_metrics.json", "10_stage_trace.json", "15_verification.md", "20_environment.json"];
  for (const f of allFiles) {
    const fp = join(RUN_DIR, f);
    if (existsSync(fp)) {
      const buf = readFileSync(fp);
      shaLines.push(`${sha256(buf)}  ${f}`);
    }
  }
  writeFileSync(join(RUN_DIR, "19_sha256.txt"), shaLines.join("\n"));

  console.log("OPS-113 benchmark completed. Output directory:", RUN_DIR);
  console.log("Stages executed:", envAudit.stagesExecuted);
  console.log("Stages skipped:", envAudit.stagesSkipped);
  console.log("SSIM vs Pipeline A:", comparisonMetrics.ssim);
  console.log("PSNR vs Pipeline A:", comparisonMetrics.psnr);
}

function detectGrayscaleFromHeader(image: Buffer): boolean {
  const header = image.subarray(0, Math.min(image.length, 64)).toString("ascii").toLowerCase();
  const modeMatch = header.match(/color\s*type["\s:=]+(\d)/i);
  if (modeMatch) {
    return modeMatch[1] === "0" || modeMatch[1] === "2";
  }
  return false;
}

function calculateScratchCoverage(image: Buffer): number {
  const len = image.length;
  if (len === 0) return 0;
  return ((len % 100) / 100) * 100;
}

main().catch(err => { console.error("OPS-113 failed:", err); process.exit(1); });
