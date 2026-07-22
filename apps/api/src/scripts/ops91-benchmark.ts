import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { ReplicateProvider } from "../restoration-providers/providers/ReplicateProvider";
import { OpenAIProvider } from "../restoration-providers/providers/OpenAIProvider";
import { QualityMetricsCalculator } from "../restoration-providers/quality/QualityMetricsCalculator";
import { PackageRoutingService } from "../restoration-providers/routing/PackageRoutingService";
import type { RestorationRequest } from "../restoration-providers/interfaces/IRestorationProvider";
import type { AppConfig } from "../config/env";

const OLD_IMAGES_DIR = join(process.cwd(), "..", "..", "old images");
const RESULTS_DIR = join(OLD_IMAGES_DIR, "results");

interface ImageInfo {
  fileName: string;
  filePath: string;
  sizeBytes: number;
}

interface BenchmarkRecord {
  provider: string;
  imageName: string;
  startTime: string;
  finishTime: string;
  elapsedMs: number;
  httpStatus: number;
  requestId: string;
  outputWidth: number;
  outputHeight: number;
  outputSizeBytes: number;
  retryCount: number;
  failureReason: string;
  actualCost: number;
  estimatedCost: number;
  costSource: string;
  actualGPUSeconds: number;
  providerVersion: string;
  ssim: number;
  psnr: number;
  sharpness: number;
  noise: number;
  contrast: number;
  brightness: number;
  printQuality: number;
  success: boolean;
  inputWidth: number;
  inputHeight: number;
}

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

async function getImageDimensions(input: string | Buffer): Promise<{ width: number; height: number }> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = typeof input === "string" ? await sharp(input).metadata() : await sharp(input).metadata();
    return { width: meta.width || 0, height: meta.height || 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

function getImageDimensionsSync(filePath: string): { width: number; height: number } {
  try {
    const buf = readFileSync(filePath);
    const len = buf.length;
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      for (let i = 2; i < Math.min(len, 5000); i++) {
        if (buf[i] === 0xFF && buf[i + 1] === 0xC0) {
          const height = (buf[i + 5] << 8) + buf[i + 6];
          const width = (buf[i + 7] << 8) + buf[i + 8];
          return { width, height };
        }
        if (buf[i] === 0xFF && buf[i + 1] === 0xC2) {
          const height = (buf[i + 5] << 8) + buf[i + 6];
          const width = (buf[i + 7] << 8) + buf[i + 8];
          return { width, height };
        }
      }
    }
    return { width: 0, height: 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

function collectImages(): ImageInfo[] {
  const entries = readdirSync(OLD_IMAGES_DIR, { withFileTypes: true });
  const images: ImageInfo[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const ext = extname(entry.name).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"].includes(ext)) continue;
    const filePath = join(OLD_IMAGES_DIR, entry.name);
    try {
      const buf = readFileSync(filePath);
      images.push({ fileName: entry.name, filePath, sizeBytes: buf.length });
    } catch {
      console.error("SKIPPED (unreadable): " + entry.name);
    }
  }
  return images;
}

async function benchmarkSingleImage(
  image: ImageInfo,
  providerName: string,
  records: BenchmarkRecord[],
  metricsCalculator: QualityMetricsCalculator
): Promise<void> {
  const dims = getImageDimensionsSync(image.filePath);
  const imageBuf = readFileSync(image.filePath);
  const ext = extname(image.fileName).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : "image/jpeg";

  const request: RestorationRequest = {
    image: imageBuf,
    contentType,
    fileName: image.fileName,
    options: { restoreFaces: true, upscale: true, upscaleScale: 2 },
  };

  const startTime = new Date();
  const startIso = startTime.toISOString();

  let provider;
  try {
    if (providerName === "replicate") {
      provider = new ReplicateProvider();
    } else if (providerName === "openai") {
      provider = new OpenAIProvider(mockConfig);
    } else {
      throw new Error("Unknown provider: " + providerName);
    }

    const result = await provider.restore(request);
    const finishTime = new Date();
    const elapsedMs = finishTime.getTime() - startTime.getTime();
    const outputDims = await getImageDimensions(result.image);

    const metrics = metricsCalculator.calculateMetrics(imageBuf, result.image);

    const record: BenchmarkRecord = {
      provider: providerName,
      imageName: image.fileName,
      startTime: startIso,
      finishTime: finishTime.toISOString(),
      elapsedMs,
      httpStatus: 200,
      requestId: result.requestId || "",
      outputWidth: outputDims.width,
      outputHeight: outputDims.height,
      outputSizeBytes: result.image.length,
      retryCount: 0,
      failureReason: "",
      actualCost: result.actualCost ?? result.estimatedCost,
      estimatedCost: result.estimatedCost,
      costSource: result.costSource || "estimated",
      actualGPUSeconds: result.actualGPUSeconds || 0,
      providerVersion: result.providerVersion || "",
      ssim: metrics.ssim,
      psnr: metrics.psnr,
      sharpness: metrics.sharpness,
      noise: metrics.noise,
      contrast: metrics.contrast,
      brightness: metrics.brightness,
      printQuality: metrics.printQuality,
      success: true,
      inputWidth: dims.width,
      inputHeight: dims.height,
    };

    try {
      const outputDir = join(RESULTS_DIR, providerName);
      if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
      const outputPath = join(outputDir, image.fileName);
      writeFileSync(outputPath, result.image);
    } catch (saveErr) {
      console.warn(`  WARNING: Failed to save output image for ${providerName}/${image.fileName}: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
    }

    try {
      const metadataDir = join(RESULTS_DIR, "metadata");
      if (!existsSync(metadataDir)) mkdirSync(metadataDir, { recursive: true });
      const metaPath = join(metadataDir, `${providerName}_${image.fileName}.json`);
      writeFileSync(metaPath, JSON.stringify(record, null, 2));
    } catch (saveErr) {
      console.warn(`  WARNING: Failed to write metadata for ${providerName}/${image.fileName}: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
    }

    records.push(record);
    console.log(`  ${providerName}/${image.fileName}: OK ${elapsedMs}ms cost=$${result.estimatedCost} ${metrics.ssim}ssim ${metrics.psnr}psnr`);
  } catch (err) {
    const finishTime = new Date();
    const elapsedMs = finishTime.getTime() - startTime.getTime();
    const errMsg = err instanceof Error ? err.message : String(err);

    const record: BenchmarkRecord = {
      provider: providerName,
      imageName: image.fileName,
      startTime: startIso,
      finishTime: finishTime.toISOString(),
      elapsedMs,
      httpStatus: errMsg.includes("not configured") || errMsg.includes("not set") || errMsg.includes("not found") ? 0 : 500,
      requestId: "",
      outputWidth: 0,
      outputHeight: 0,
      outputSizeBytes: 0,
      retryCount: 0,
      failureReason: errMsg,
      actualCost: 0,
      estimatedCost: 0,
      costSource: "",
      actualGPUSeconds: 0,
      providerVersion: "",
      ssim: 0,
      psnr: 0,
      sharpness: 0,
      noise: 0,
      contrast: 0,
      brightness: 0,
      printQuality: 0,
      success: false,
      inputWidth: dims.width,
      inputHeight: dims.height,
    };

    try {
      const metadataDir = join(RESULTS_DIR, "metadata");
      if (!existsSync(metadataDir)) mkdirSync(metadataDir, { recursive: true });
      const metaPath = join(metadataDir, `${providerName}_${image.fileName}.json`);
      writeFileSync(metaPath, JSON.stringify(record, null, 2));
    } catch (saveErr) {
      console.warn(`  WARNING: Failed to write metadata for ${providerName}/${image.fileName}: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
    }

    records.push(record);
    console.log(`  ${providerName}/${image.fileName}: FAIL - ${errMsg}`);
  }
}

function generateCsv(records: BenchmarkRecord[]): string {
  const headers = [
    "provider", "imageName", "startTime", "finishTime", "elapsedMs",
    "httpStatus", "requestId", "outputWidth", "outputHeight", "outputSizeBytes",
    "retryCount", "failureReason", "actualCost", "estimatedCost", "costSource",
    "actualGPUSeconds", "providerVersion",
    "ssim", "psnr", "sharpness", "noise", "contrast", "brightness", "printQuality",
    "success", "inputWidth", "inputHeight",
  ];
  const rows = records.map((r) =>
    headers.map((h) => {
      const val = (r as any)[h] ?? "";
      const str = String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

function generateXlsx(records: BenchmarkRecord[]): Buffer {
  const XLSX = require("xlsx");
  const wb = XLSX.utils.book_new();

  const resultsAoa = [
    ["Provider", "Image", "Success", "Elapsed (ms)", "Actual Cost ($)", "Est. Cost ($)", "Cost Source", "GPU Secs", "Request ID", "SSIM", "PSNR", "Sharpness", "Noise", "Contrast", "Brightness", "Print Quality", "Input WxH", "Output WxH", "Failure Reason"],
  ];
  for (const r of records) {
    resultsAoa.push([
      r.provider, r.imageName, r.success ? "YES" : "NO", String(r.elapsedMs),
      String(r.actualCost.toFixed(6)), String(r.estimatedCost.toFixed(6)), r.costSource,
      String(r.actualGPUSeconds), r.requestId,
      String(r.ssim), String(r.psnr), String(r.sharpness), String(r.noise),
      String(r.contrast), String(r.brightness), String(r.printQuality),
      `${r.inputWidth}x${r.inputHeight}`, `${r.outputWidth}x${r.outputHeight}`,
      r.failureReason,
    ]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(resultsAoa);
  XLSX.utils.book_append_sheet(wb, ws1, "Results");

  const replicateRecords = records.filter((r) => r.provider === "replicate" && r.success);
  const openaiRecords = records.filter((r) => r.provider === "openai" && r.success);

  const avgCostR = replicateRecords.length > 0 ? replicateRecords.reduce((s, r) => s + r.actualCost, 0) / replicateRecords.length : 0;
  const avgCostO = openaiRecords.length > 0 ? openaiRecords.reduce((s, r) => s + r.actualCost, 0) / openaiRecords.length : 0;
  const totalCostR = replicateRecords.reduce((s, r) => s + r.actualCost, 0);
  const totalCostO = openaiRecords.reduce((s, r) => s + r.actualCost, 0);
  const avgLatR = replicateRecords.length > 0 ? replicateRecords.reduce((s, r) => s + r.elapsedMs, 0) / replicateRecords.length : 0;
  const avgLatO = openaiRecords.length > 0 ? openaiRecords.reduce((s, r) => s + r.elapsedMs, 0) / openaiRecords.length : 0;
  const avgSsimR = replicateRecords.length > 0 ? replicateRecords.reduce((s, r) => s + r.ssim, 0) / replicateRecords.length : 0;
  const avgSsimO = openaiRecords.length > 0 ? openaiRecords.reduce((s, r) => s + r.ssim, 0) / openaiRecords.length : 0;
  const avgPsnrR = replicateRecords.length > 0 ? replicateRecords.reduce((s, r) => s + r.psnr, 0) / replicateRecords.length : 0;
  const avgPsnrO = openaiRecords.length > 0 ? openaiRecords.reduce((s, r) => s + r.psnr, 0) / openaiRecords.length : 0;

  const summaryAoa = [
    ["Metric", "Replicate", "OpenAI"],
    ["Processed", `${replicateRecords.length}/${records.filter(r => r.provider === "replicate").length}`, `${openaiRecords.length}/${records.filter(r => r.provider === "openai").length}`],
    ["Avg Cost/Image", avgCostR.toFixed(6), avgCostO.toFixed(6)],
    ["Total Cost", totalCostR.toFixed(6), totalCostO.toFixed(6)],
    ["Avg Latency (ms)", Math.round(avgLatR).toString(), Math.round(avgLatO).toString()],
    ["Avg SSIM", avgSsimR.toFixed(2), avgSsimO.toFixed(2)],
    ["Avg PSNR", avgPsnrR.toFixed(2), avgPsnrO.toFixed(2)],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(summaryAoa);
  XLSX.utils.book_append_sheet(wb, ws2, "Summary");

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function generateProviderComparisonMd(records: BenchmarkRecord[]): string {
  const replicateRecords = records.filter((r) => r.provider === "replicate" && r.success);
  const openaiRecords = records.filter((r) => r.provider === "openai" && r.success);

  const avgSsimR = replicateRecords.length > 0 ? (replicateRecords.reduce((s, r) => s + r.ssim, 0) / replicateRecords.length).toFixed(2) : "N/A";
  const avgSsimO = openaiRecords.length > 0 ? (openaiRecords.reduce((s, r) => s + r.ssim, 0) / openaiRecords.length).toFixed(2) : "N/A";
  const avgPsnrR = replicateRecords.length > 0 ? (replicateRecords.reduce((s, r) => s + r.psnr, 0) / replicateRecords.length).toFixed(2) : "N/A";
  const avgPsnrO = openaiRecords.length > 0 ? (openaiRecords.reduce((s, r) => s + r.psnr, 0) / openaiRecords.length).toFixed(2) : "N/A";
  const avgSharpR = replicateRecords.length > 0 ? (replicateRecords.reduce((s, r) => s + r.sharpness, 0) / replicateRecords.length).toFixed(1) : "N/A";
  const avgSharpO = openaiRecords.length > 0 ? (openaiRecords.reduce((s, r) => s + r.sharpness, 0) / openaiRecords.length).toFixed(1) : "N/A";
  const avgNoiseR = replicateRecords.length > 0 ? (replicateRecords.reduce((s, r) => s + r.noise, 0) / replicateRecords.length).toFixed(1) : "N/A";
  const avgNoiseO = openaiRecords.length > 0 ? (openaiRecords.reduce((s, r) => s + r.noise, 0) / openaiRecords.length).toFixed(1) : "N/A";
  const avgPqR = replicateRecords.length > 0 ? (replicateRecords.reduce((s, r) => s + r.printQuality, 0) / replicateRecords.length).toFixed(1) : "N/A";
  const avgPqO = openaiRecords.length > 0 ? (openaiRecords.reduce((s, r) => s + r.printQuality, 0) / openaiRecords.length).toFixed(1) : "N/A";
  const avgLatR = replicateRecords.length > 0 ? Math.round(replicateRecords.reduce((s, r) => s + r.elapsedMs, 0) / replicateRecords.length).toString() : "N/A";
  const avgLatO = openaiRecords.length > 0 ? Math.round(openaiRecords.reduce((s, r) => s + r.elapsedMs, 0) / openaiRecords.length).toString() : "N/A";

  const lines: string[] = [];
  lines.push("# Provider Comparison");
  lines.push("");
  lines.push("**Generated:** " + new Date().toISOString());
  lines.push("**Source:** OPS-91 Real Production Benchmark (7 images)");
  lines.push("");
  lines.push("## Per-Image Results");
  lines.push("");
  lines.push("| Image | Replicate SSIM | Replicate PSNR | Replicate Sharpness | OpenAI SSIM | OpenAI PSNR | OpenAI Sharpness |");
  lines.push("|---|---|---|---|---|---|---|");

  for (const imageName of [...new Set(records.map((r) => r.imageName))]) {
    const rRec = records.find((r) => r.provider === "replicate" && r.imageName === imageName);
    const oRec = records.find((r) => r.provider === "openai" && r.imageName === imageName);
    const rVal = rRec?.success ? `${rRec.ssim} / ${rRec.psnr} / ${rRec.sharpness}` : "FAILED";
    const oVal = oRec?.success ? `${oRec.ssim} / ${oRec.psnr} / ${oRec.sharpness}` : "FAILED";
    lines.push(`| ${imageName} | ${rVal} | ${oVal} |`);
  }

  lines.push("");
  lines.push("## Average Metrics");
  lines.push("");
  lines.push("| Metric | Replicate | OpenAI | Winner |");
  lines.push("|---|---|---|---|");
  const cmp = (a: string, b: string, higherBetter: boolean): string => {
    if (a === "N/A" && b === "N/A") return "N/A";
    if (a === "N/A") return b + " (OpenAI)";
    if (b === "N/A") return a + " (Replicate)";
    const na = parseFloat(a), nb = parseFloat(b);
    if (higherBetter) return na > nb ? `${a} (Replicate)` : `${b} (OpenAI)`;
    return na < nb ? `${a} (Replicate)` : `${b} (OpenAI)`;
  };
  lines.push(`| SSIM | ${avgSsimR} | ${avgSsimO} | ${cmp(avgSsimR, avgSsimO, true)} |`);
  lines.push(`| PSNR | ${avgPsnrR} | ${avgPsnrO} | ${cmp(avgPsnrR, avgPsnrO, true)} |`);
  lines.push(`| Sharpness | ${avgSharpR} | ${avgSharpO} | ${cmp(avgSharpR, avgSharpO, true)} |`);
  lines.push(`| Noise (lower better) | ${avgNoiseR} | ${avgNoiseO} | ${cmp(avgNoiseR, avgNoiseO, false)} |`);
  lines.push(`| Print Quality | ${avgPqR} | ${avgPqO} | ${cmp(avgPqR, avgPqO, true)} |`);
  lines.push(`| Avg Latency (ms) | ${avgLatR} | ${avgLatO} | ${cmp(avgLatR, avgLatO, false)} |`);
  lines.push("");
  lines.push("## Verdict");
  lines.push("");
  lines.push("TBD from measured data — see Phase 7 for production routing recommendation.");
  lines.push("");

  return lines.join("\n");
}

function generateCostAnalysisMd(records: BenchmarkRecord[]): string {
  const replicateRecords = records.filter((r) => r.provider === "replicate");
  const openaiRecords = records.filter((r) => r.provider === "openai");
  const replicateSuccess = replicateRecords.filter((r) => r.success);
  const openaiSuccess = openaiRecords.filter((r) => r.success);

  const avgCostR = replicateSuccess.length > 0 ? (replicateSuccess.reduce((s, r) => s + r.actualCost, 0) / replicateSuccess.length) : 0;
  const avgCostO = openaiSuccess.length > 0 ? (openaiSuccess.reduce((s, r) => s + r.actualCost, 0) / openaiSuccess.length) : 0;
  const totalCostR = replicateSuccess.reduce((s, r) => s + r.actualCost, 0);
  const totalCostO = openaiSuccess.reduce((s, r) => s + r.actualCost, 0);

  const lines: string[] = [];
  lines.push("# Provider Cost Analysis");
  lines.push("");
  lines.push("**Generated:** " + new Date().toISOString());
  lines.push("**Source:** OPS-91 Real Production Benchmark");
  lines.push("");
  lines.push("## Per-Image Cost");
  lines.push("");
  lines.push("| Image | Replicate Cost | OpenAI Cost |");
  lines.push("|---|---|---|");

  for (const imageName of [...new Set(records.map((r) => r.imageName))]) {
    const rRec = records.find((r) => r.provider === "replicate" && r.imageName === imageName);
    const oRec = records.find((r) => r.provider === "openai" && r.imageName === imageName);
    const rCost = rRec?.success ? `$${rRec.actualCost.toFixed(6)}` : "FAILED";
    const oCost = oRec?.success ? `$${oRec.actualCost.toFixed(6)}` : "FAILED";
    lines.push(`| ${imageName} | ${rCost} | ${oCost} |`);
  }

  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Replicate (sczhou/codeformer) | OpenAI (dall-e-3) |");
  lines.push("|---|---|---|");
  lines.push(`| Official Price | $0.0034/run | $0.04/image |`);
  lines.push(`| Images Processed | ${replicateSuccess.length}/${replicateRecords.length} | ${openaiSuccess.length}/${openaiRecords.length} |`);
  lines.push(`| Average Cost/Image | $${avgCostR.toFixed(6)} | $${avgCostO.toFixed(6)} |`);
  lines.push(`| Total Cost | $${totalCostR.toFixed(6)} | $${totalCostO.toFixed(6)} |`);
  lines.push(`| Total Both Providers | $${(totalCostR + totalCostO).toFixed(6)} | |`);
  lines.push(`| Cost Ratio | 1x | ${avgCostO > 0 && avgCostR > 0 ? (avgCostO / avgCostR).toFixed(1) : "N/A"}x |`);
  lines.push("");

  return lines.join("\n");
}

function generateGalleryHtml(records: BenchmarkRecord[]): string {
  const imageNames = [...new Set(records.map((r) => r.imageName))];
  const lines: string[] = [];
  lines.push("<!DOCTYPE html><html><head><meta charset='utf-8'><title>OPS-91 Benchmark Gallery</title>");
  lines.push("<style>body{font-family:sans-serif;margin:20px}.gallery{display:flex;flex-wrap:wrap;gap:20px}");
  lines.push(".card{border:1px solid #ddd;border-radius:8px;padding:12px;max-width:600px;flex:1 1 500px}");
  lines.push(".card h3{margin:0 0 8px}.card img{max-width:100%;height:auto;border-radius:4px}");
  lines.push(".card table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}");
  lines.push(".card td,.card th{border:1px solid #eee;padding:4px 8px;text-align:left}");
  lines.push(".pass{color:#090}.fail{color:#c00}</style></head><body>");
  lines.push("<h1>OPS-91 Benchmark Gallery</h1>");
  lines.push("<p>Generated: " + new Date().toISOString() + "</p>");
  lines.push("<p>Images: " + imageNames.length + "</p>");
  lines.push("<div class='gallery'>");

  for (const imageName of imageNames) {
    const rRec = records.find((r) => r.provider === "replicate" && r.imageName === imageName);
    const oRec = records.find((r) => r.provider === "openai" && r.imageName === imageName);
    const rOk = rRec?.success ?? false;
    const oOk = oRec?.success ?? false;

    lines.push("<div class='card'>");
    lines.push("<h3>" + imageName + "</h3>");
    lines.push("<table><tr><th>Metric</th><th>Replicate</th><th>OpenAI</th></tr>");
    lines.push(`<tr><td>Status</td><td class='${rOk ? "pass" : "fail"}'>${rOk ? "PASS" : "FAIL"}</td><td class='${oOk ? "pass" : "fail"}'>${oOk ? "PASS" : "FAIL"}</td></tr>`);
    lines.push(`<tr><td>Latency</td><td>${rOk ? rRec.elapsedMs + "ms" : "-"}</td><td>${oOk ? oRec.elapsedMs + "ms" : "-"}</td></tr>`);
    lines.push(`<tr><td>Cost</td><td>${rOk ? "$" + rRec.actualCost.toFixed(6) : "-"}</td><td>${oOk ? "$" + oRec.actualCost.toFixed(6) : "-"}</td></tr>`);
    lines.push(`<tr><td>SSIM</td><td>${rOk ? rRec.ssim : "-"}</td><td>${oOk ? oRec.ssim : "-"}</td></tr>`);
    lines.push(`<tr><td>PSNR</td><td>${rOk ? rRec.psnr : "-"}</td><td>${oOk ? oRec.psnr : "-"}</td></tr>`);
    lines.push(`<tr><td>Sharpness</td><td>${rOk ? rRec.sharpness : "-"}</td><td>${oOk ? oRec.sharpness : "-"}</td></tr>`);
    lines.push(`<tr><td>Noise</td><td>${rOk ? rRec.noise : "-"}</td><td>${oOk ? oRec.noise : "-"}</td></tr>`);
    lines.push(`<tr><td>Print Quality</td><td>${rOk ? rRec.printQuality : "-"}</td><td>${oOk ? oRec.printQuality : "-"}</td></tr>`);
    lines.push("</table></div>");
  }

  lines.push("</div></body></html>");
  return lines.join("\n");
}

function generateRoutingRecommendation(records: BenchmarkRecord[]): string {
  const replicateSuccess = records.filter((r) => r.provider === "replicate" && r.success);
  const openaiSuccess = records.filter((r) => r.provider === "openai" && r.success);

  const avgSsimR = replicateSuccess.length > 0 ? replicateSuccess.reduce((s, r) => s + r.ssim, 0) / replicateSuccess.length : 0;
  const avgSsimO = openaiSuccess.length > 0 ? openaiSuccess.reduce((s, r) => s + r.ssim, 0) / openaiSuccess.length : 0;
  const avgPsnrR = replicateSuccess.length > 0 ? replicateSuccess.reduce((s, r) => s + r.psnr, 0) / replicateSuccess.length : 0;
  const avgPsnrO = openaiSuccess.length > 0 ? openaiSuccess.reduce((s, r) => s + r.psnr, 0) / openaiSuccess.length : 0;
  const avgPqR = replicateSuccess.length > 0 ? replicateSuccess.reduce((s, r) => s + r.printQuality, 0) / replicateSuccess.length : 0;
  const avgPqO = openaiSuccess.length > 0 ? openaiSuccess.reduce((s, r) => s + r.printQuality, 0) / openaiSuccess.length : 0;
  const avgCostR = replicateSuccess.length > 0 ? replicateSuccess.reduce((s, r) => s + r.actualCost, 0) / replicateSuccess.length : 0;
  const avgCostO = openaiSuccess.length > 0 ? openaiSuccess.reduce((s, r) => s + r.actualCost, 0) / openaiSuccess.length : 0;
  const successRateR = records.filter(r => r.provider === "replicate").length > 0 ? (replicateSuccess.length / records.filter(r => r.provider === "replicate").length) * 100 : 0;
  const successRateO = records.filter(r => r.provider === "openai").length > 0 ? (openaiSuccess.length / records.filter(r => r.provider === "openai").length) * 100 : 0;

  const overallR = avgSsimR * 0.25 + (avgPsnrR / 50) * 0.25 + (avgPqR / 100) * 0.25 + (1 - avgCostR / 0.05) * 0.15 + (successRateR / 100) * 0.1;
  const overallO = avgSsimO * 0.25 + (avgPsnrO / 50) * 0.25 + (avgPqO / 100) * 0.25 + (1 - avgCostO / 0.05) * 0.15 + (successRateO / 100) * 0.1;

  const qualityWinner = overallR >= overallO ? "replicate" : "openai";
  const costWinner = avgCostR <= avgCostO ? "replicate" : "openai";

  const lines: string[] = [];
  lines.push("# Production Provider Routing Recommendation");
  lines.push("");
  lines.push("**Generated:** " + new Date().toISOString());
  lines.push("**Source:** OPS-91 Real Production Benchmark (Measured Data Only)");
  lines.push("");
  lines.push("## Measured Scores");
  lines.push("");
  lines.push("| Metric | Replicate | OpenAI |");
  lines.push("|---|---|---|");
  lines.push(`| Quality Score | ${overallR.toFixed(2)} | ${overallO.toFixed(2)} |`);
  lines.push(`| Avg Cost/Image | $${avgCostR.toFixed(6)} | $${avgCostO.toFixed(6)} |`);
  lines.push(`| Success Rate | ${successRateR.toFixed(0)}% | ${successRateO.toFixed(0)}% |`);
  lines.push(`| Avg SSIM | ${avgSsimR.toFixed(2)} | ${avgSsimO.toFixed(2)} |`);
  lines.push(`| Avg PSNR | ${avgPsnrR.toFixed(2)} | ${avgPsnrO.toFixed(2)} |`);
  lines.push(`| Avg Print Quality | ${avgPqR.toFixed(1)} | ${avgPqO.toFixed(1)} |`);
  lines.push("");
  lines.push("## Tier Routing");
  lines.push("");
  lines.push("| Tier | Primary | Fallback | Rationale |");
  lines.push("|---|---|---|---|");

  const tiers = [
    { name: "Preview", qualityThreshold: 0 },
    { name: "Basic", qualityThreshold: 0 },
    { name: "Premium", qualityThreshold: 0.5 },
    { name: "Print", qualityThreshold: 0.7 },
    { name: "Archive", qualityThreshold: 0 },
  ];

  for (const tier of tiers) {
    let primary: string;
    let fallback: string;
    let rationale: string;

    if (overallR === 0 && overallO === 0) {
      primary = "replicate";
      fallback = "openai";
      rationale = "Default policy (no successful benchmark data available)";
    } else if (overallR >= overallO) {
      primary = "replicate";
      fallback = "openai";
      if (overallR > overallO) {
        rationale = `Replicate leads in quality score (${overallR.toFixed(2)} vs ${overallO.toFixed(2)}) and cost ($${avgCostR.toFixed(6)} vs $${avgCostO.toFixed(6)})`;
      } else {
        rationale = `Replicate leads in cost ($${avgCostR.toFixed(6)} vs $${avgCostO.toFixed(6)}) with equal quality`;
      }
    } else {
      primary = "openai";
      fallback = "replicate";
      rationale = `OpenAI leads in quality score (${overallO.toFixed(2)} vs ${overallR.toFixed(2)})`;
    }

    if (qualityWinner === "openai" && costWinner === "replicate") {
      if (tier.qualityThreshold >= 0.5) {
        primary = "openai";
        fallback = "replicate";
        rationale = `OpenAI quality (${overallO.toFixed(2)}) meets premium threshold, Replicate fallback for cost savings`;
      } else {
        primary = "replicate";
        fallback = "openai";
        rationale = `Replicate cost-effective ($${avgCostR.toFixed(6)}) for this tier, OpenAI quality fallback available`;
      }
    }

    lines.push(`| ${tier.name} | ${primary} | ${fallback} | ${rationale} |`);
  }

  lines.push("");
  lines.push("## Cost Projection (1000 images)");
  lines.push("");
  lines.push("| Provider | Cost/Image | 1000 Images |");
  lines.push("|---|---|---|");
  const successR = records.filter(r => r.provider === "replicate" && r.success);
  const successO = records.filter(r => r.provider === "openai" && r.success);
  const costPerR = successR.length > 0 ? successR.reduce((s, r) => s + r.actualCost, 0) / successR.length : 0.0034;
  const costPerO = successO.length > 0 ? successO.reduce((s, r) => s + r.actualCost, 0) / successO.length : 0.04;
  lines.push(`| Replicate | $${costPerR.toFixed(6)} | $${(costPerR * 1000).toFixed(2)} |`);
  lines.push(`| OpenAI | $${costPerO.toFixed(6)} | $${(costPerO * 1000).toFixed(2)} |`);
  lines.push("");
  lines.push("## Note on measured benchmark data");
  lines.push("");
  lines.push("These recommendations are based solely on measured benchmark data from " + records.length + " API calls (2 providers x 7 images).");
  lines.push("If API keys were unavailable during benchmark execution, the recommendation falls back to existing policy defaults.");
  lines.push("");
  lines.push("Re-run benchmark with valid API keys to update these recommendations with live production data.");
  lines.push("");

  return lines.join("\n");
}

function generateBillingCsv(records: BenchmarkRecord[]): string {
  const headers = [
    "provider", "imageName", "requestId", "actualCost", "estimatedCost",
    "costSource", "actualGPUSeconds", "providerVersion", "success", "failureReason",
  ];
  const rows = records.map((r) =>
    headers.map((h) => {
      const val = (r as any)[h] ?? "";
      const str = String(val);
      return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

function generateBillingXlsx(records: BenchmarkRecord[]): Buffer {
  const XLSX = require("xlsx");
  const wb = XLSX.utils.book_new();

  const billingAoa = [
    ["Provider", "Image", "Request ID", "Actual Cost ($)", "Est. Cost ($)", "Cost Source", "GPU Seconds", "Provider Version", "Success", "Failure Reason"],
  ];
  for (const r of records) {
    billingAoa.push([
      r.provider, r.imageName, r.requestId,
      String(r.actualCost.toFixed(6)), String(r.estimatedCost.toFixed(6)),
      r.costSource, String(r.actualGPUSeconds), r.providerVersion,
      r.success ? "YES" : "NO", r.failureReason,
    ]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(billingAoa);
  XLSX.utils.book_append_sheet(wb, ws1, "Billing");

  const replicateSuccess = records.filter((r) => r.provider === "replicate" && r.success);
  const openaiSuccess = records.filter((r) => r.provider === "openai" && r.success);

  const totalActualR = replicateSuccess.reduce((s, r) => s + r.actualCost, 0);
  const totalActualO = openaiSuccess.reduce((s, r) => s + r.actualCost, 0);
  const totalEstR = replicateSuccess.reduce((s, r) => s + r.estimatedCost, 0);
  const totalEstO = openaiSuccess.reduce((s, r) => s + r.estimatedCost, 0);
  const totalGpuR = replicateSuccess.reduce((s, r) => s + r.actualGPUSeconds, 0);

  const summaryAoa = [
    ["Metric", "Replicate", "OpenAI"],
    ["Successful Calls", String(replicateSuccess.length), String(openaiSuccess.length)],
    ["Total Actual Cost ($)", totalActualR.toFixed(6), totalActualO.toFixed(6)],
    ["Total Estimated Cost ($)", totalEstR.toFixed(6), totalEstO.toFixed(6)],
    ["Avg Actual Cost/Image ($)", replicateSuccess.length > 0 ? (totalActualR / replicateSuccess.length).toFixed(6) : "0", openaiSuccess.length > 0 ? (totalActualO / openaiSuccess.length).toFixed(6) : "0"],
    ["Total GPU Seconds", totalGpuR.toFixed(2), "N/A"],
    ["Avg GPU Seconds/Image", replicateSuccess.length > 0 ? (totalGpuR / replicateSuccess.length).toFixed(2) : "0", "N/A"],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(summaryAoa);
  XLSX.utils.book_append_sheet(wb, ws2, "Billing Summary");

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function generatePackageRoutingReport(records: BenchmarkRecord[]): string {
  const routingService = new PackageRoutingService();

  const replicateSuccess = records.filter((r) => r.provider === "replicate" && r.success);
  const openaiSuccess = records.filter((r) => r.provider === "openai" && r.success);

  if (replicateSuccess.length > 0) {
    routingService.registerBenchmarkData({
      providerName: "replicate",
      avgSSIM: replicateSuccess.reduce((s, r) => s + r.ssim, 0) / replicateSuccess.length,
      avgPSNR: replicateSuccess.reduce((s, r) => s + r.psnr, 0) / replicateSuccess.length,
      avgSharpness: replicateSuccess.reduce((s, r) => s + r.sharpness, 0) / replicateSuccess.length,
      avgNoise: replicateSuccess.reduce((s, r) => s + r.noise, 0) / replicateSuccess.length,
      avgPrintQuality: replicateSuccess.reduce((s, r) => s + r.printQuality, 0) / replicateSuccess.length,
      avgCostPerImage: replicateSuccess.reduce((s, r) => s + r.actualCost, 0) / replicateSuccess.length,
      successRate: 100,
      avgLatencyMs: replicateSuccess.reduce((s, r) => s + r.elapsedMs, 0) / replicateSuccess.length,
      totalImages: records.filter((r) => r.provider === "replicate").length,
      successfulImages: replicateSuccess.length,
    });
  }

  if (openaiSuccess.length > 0) {
    routingService.registerBenchmarkData({
      providerName: "openai",
      avgSSIM: openaiSuccess.reduce((s, r) => s + r.ssim, 0) / openaiSuccess.length,
      avgPSNR: openaiSuccess.reduce((s, r) => s + r.psnr, 0) / openaiSuccess.length,
      avgSharpness: openaiSuccess.reduce((s, r) => s + r.sharpness, 0) / openaiSuccess.length,
      avgNoise: openaiSuccess.reduce((s, r) => s + r.noise, 0) / openaiSuccess.length,
      avgPrintQuality: openaiSuccess.reduce((s, r) => s + r.printQuality, 0) / openaiSuccess.length,
      avgCostPerImage: openaiSuccess.reduce((s, r) => s + r.actualCost, 0) / openaiSuccess.length,
      successRate: 100,
      avgLatencyMs: openaiSuccess.reduce((s, r) => s + r.elapsedMs, 0) / openaiSuccess.length,
      totalImages: records.filter((r) => r.provider === "openai").length,
      successfulImages: openaiSuccess.length,
    });
  }

  const decisions = routingService.routeAllPackages();

  const lines: string[] = [];
  lines.push("# Package Routing Report");
  lines.push("");
  lines.push("**Generated:** " + new Date().toISOString());
  lines.push("**Source:** OPS-93 Real Production Benchmark");
  lines.push("");
  lines.push("> Provider names are hidden from customers. This report is for internal routing logic only.");
  lines.push("");
  lines.push("## Customer Packages");
  lines.push("");
  lines.push("| Package | Display Name | Primary | Fallback | Quality Score | Cost/Image | Rationale |");
  lines.push("|---|---|---|---|---|---|---|");

  for (const d of decisions) {
    lines.push(`| ${d.packageName} | ${d.primaryProvider} | ${d.primaryProvider} | ${d.fallbackProvider ?? "none"} | ${d.qualityScore.toFixed(2)} | $${d.costPerImage.toFixed(6)} | ${d.reason} |`);
  }

  lines.push("");
  lines.push("## Measured Provider Data");
  lines.push("");
  lines.push("| Provider | SSIM | PSNR | Sharpness | Noise | Print Quality | Cost/Image | Success Rate | Latency (ms) |");
  lines.push("|---|---|---|---|---|---|---|---|---|");

  const providerEntries: { providerName: string; data: any }[] = [];
  if (replicateSuccess.length > 0) {
    providerEntries.push({
      providerName: "replicate",
      data: {
        avgSSIM: replicateSuccess.reduce((s, r) => s + r.ssim, 0) / replicateSuccess.length,
        avgPSNR: replicateSuccess.reduce((s, r) => s + r.psnr, 0) / replicateSuccess.length,
        avgSharpness: replicateSuccess.reduce((s, r) => s + r.sharpness, 0) / replicateSuccess.length,
        avgNoise: replicateSuccess.reduce((s, r) => s + r.noise, 0) / replicateSuccess.length,
        avgPrintQuality: replicateSuccess.reduce((s, r) => s + r.printQuality, 0) / replicateSuccess.length,
        avgCostPerImage: replicateSuccess.reduce((s, r) => s + r.actualCost, 0) / replicateSuccess.length,
        successRate: 100,
        avgLatencyMs: replicateSuccess.reduce((s, r) => s + r.elapsedMs, 0) / replicateSuccess.length,
      },
    });
  }
  if (openaiSuccess.length > 0) {
    providerEntries.push({
      providerName: "openai",
      data: {
        avgSSIM: openaiSuccess.reduce((s, r) => s + r.ssim, 0) / openaiSuccess.length,
        avgPSNR: openaiSuccess.reduce((s, r) => s + r.psnr, 0) / openaiSuccess.length,
        avgSharpness: openaiSuccess.reduce((s, r) => s + r.sharpness, 0) / openaiSuccess.length,
        avgNoise: openaiSuccess.reduce((s, r) => s + r.noise, 0) / openaiSuccess.length,
        avgPrintQuality: openaiSuccess.reduce((s, r) => s + r.printQuality, 0) / openaiSuccess.length,
        avgCostPerImage: openaiSuccess.reduce((s, r) => s + r.actualCost, 0) / openaiSuccess.length,
        successRate: 100,
        avgLatencyMs: openaiSuccess.reduce((s, r) => s + r.elapsedMs, 0) / openaiSuccess.length,
      },
    });
  }

  for (const entry of providerEntries) {
    const d = entry.data;
    lines.push(`| ${entry.providerName} | ${d.avgSSIM.toFixed(2)} | ${d.avgPSNR.toFixed(2)} | ${d.avgSharpness.toFixed(1)} | ${d.avgNoise.toFixed(1)} | ${d.avgPrintQuality.toFixed(1)} | $${d.avgCostPerImage.toFixed(6)} | ${d.successRate.toFixed(0)}% | ${Math.round(d.avgLatencyMs)} |`);
  }

  lines.push("");
  lines.push("## Package Definitions");
  lines.push("");
  lines.push("| Package | Quality Threshold | Max Cost/Image | Resolution |");
  lines.push("|---|---|---|---|");
  lines.push("| original_restore | 60 | $0.010 | 1024x1024 |");
  lines.push("| hd_2x | 75 | $0.050 | 1024x1024 |");
  lines.push("| premium_printable | 85 | $0.100 | 1024x1024 |");
  lines.push("");
  lines.push("## Routing Logic");
  lines.push("");
  lines.push("- **Original Restore**: Lowest-cost provider meeting quality threshold (60)");
  lines.push("- **HD 2x**: Best quality/cost ratio");
  lines.push("- **Premium Printable**: Highest measured quality provider");
  lines.push("");
  lines.push("Provider names are NOT exposed to customers. Customers see package names only.");
  lines.push("");

  return lines.join("\n");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("========================================");
  console.log("OPS-91: Real Production Benchmark");
  console.log("========================================");
  console.log("");

  const hasReplicateToken = !!process.env.REPLICATE_API_TOKEN;
  const hasOpenAiKey = !!process.env.OPENAI_API_KEY;

  console.log("Checking API keys...");
  console.log("  REPLICATE_API_TOKEN: " + (hasReplicateToken ? "SET" : "NOT SET"));
  console.log("  OPENAI_API_KEY: " + (hasOpenAiKey ? "SET" : "NOT SET"));
  console.log("");

  if (!hasReplicateToken) console.log("WARNING: Replicate API token not available. Replicate benchmark will report failures.");
  if (!hasOpenAiKey) console.log("WARNING: OpenAI API key not available. OpenAI benchmark will report failures.");
  if (!hasReplicateToken && !hasOpenAiKey) {
    console.log("WARNING: No API keys available. All images will report failures.");
    console.log("Set REPLICATE_API_TOKEN and/or OPENAI_API_KEY environment variables to run the benchmark.");
  }
  console.log("");

  console.log("Phase 1: Collecting images from " + OLD_IMAGES_DIR);
  const images = collectImages();
  console.log("  Found " + images.length + " images:");
  for (const img of images) {
    const dims = getImageDimensionsSync(img.filePath);
    console.log("    " + img.fileName + " (" + dims.width + "x" + dims.height + ", " + img.sizeBytes + " bytes)");
  }
  console.log("");

  console.log("Phase 2: Creating output directories");
  const dirs = ["openai", "replicate", "comparison", "BenchmarkGallery", "metadata"];
  for (const dir of dirs) {
    const p = join(RESULTS_DIR, dir);
    mkdirSync(p, { recursive: true });
    console.log("  " + p);
  }
  console.log("");

  const metricsCalculator = new QualityMetricsCalculator();
  const records: BenchmarkRecord[] = [];

  console.log("Phase 3: Executing benchmark");
  for (const image of images) {
    console.log("Processing: " + image.fileName);
    await benchmarkSingleImage(image, "replicate", records, metricsCalculator);
    await sleep(3000);
    await benchmarkSingleImage(image, "openai", records, metricsCalculator);
    await sleep(3000);
  }
  console.log("");

  console.log("Phase 4: Cost analysis");
  const replicateSuccess = records.filter((r) => r.provider === "replicate" && r.success);
  const openaiSuccess = records.filter((r) => r.provider === "openai" && r.success);
  const avgCostR = replicateSuccess.length > 0 ? (replicateSuccess.reduce((s, r) => s + r.actualCost, 0) / replicateSuccess.length) : 0;
  const avgCostO = openaiSuccess.length > 0 ? (openaiSuccess.reduce((s, r) => s + r.actualCost, 0) / openaiSuccess.length) : 0;
  console.log("  Replicate: " + replicateSuccess.length + " successful, avg $" + avgCostR.toFixed(6));
  console.log("  OpenAI: " + openaiSuccess.length + " successful, avg $" + avgCostO.toFixed(6));
  console.log("");

  console.log("Phase 5: Generating reports");
  const csvPath = join(RESULTS_DIR, "RealBenchmarkResults.csv");
  writeFileSync(csvPath, generateCsv(records));
  console.log("  CSV: " + csvPath);

  const xlsxPath = join(RESULTS_DIR, "RealBenchmarkResults.xlsx");
  writeFileSync(xlsxPath, generateXlsx(records));
  console.log("  XLSX: " + xlsxPath);

  const comparisonPath = join(RESULTS_DIR, "ProviderComparison.md");
  writeFileSync(comparisonPath, generateProviderComparisonMd(records));
  console.log("  ProviderComparison.md: " + comparisonPath);

  const costPath = join(RESULTS_DIR, "ProviderCostAnalysis.md");
  writeFileSync(costPath, generateCostAnalysisMd(records));
  console.log("  ProviderCostAnalysis.md: " + costPath);

  const galleryPath = join(RESULTS_DIR, "BenchmarkGallery", "index.html");
  writeFileSync(galleryPath, generateGalleryHtml(records));
  console.log("  Gallery: " + galleryPath);

  const billingCsvPath = join(RESULTS_DIR, "RealProviderBilling.csv");
  writeFileSync(billingCsvPath, generateBillingCsv(records));
  console.log("  Billing CSV: " + billingCsvPath);

  const billingXlsxPath = join(RESULTS_DIR, "RealProviderBilling.xlsx");
  writeFileSync(billingXlsxPath, generateBillingXlsx(records));
  console.log("  Billing XLSX: " + billingXlsxPath);

  const routingReportPath = join(RESULTS_DIR, "PackageRoutingReport.md");
  writeFileSync(routingReportPath, generatePackageRoutingReport(records));
  console.log("  Package Routing Report: " + routingReportPath);

  console.log("");

  console.log("Phase 6: Routing recommendation");
  const routingPath = join(RESULTS_DIR, "ProductionRoutingRecommendation.md");
  writeFileSync(routingPath, generateRoutingRecommendation(records));
  console.log("  " + routingPath);

  console.log("");

  const total = records.length;
  const success = records.filter((r) => r.success).length;
  const failed = records.filter((r) => !r.success).length;

  console.log("========================================");
  console.log("OPS-91 Complete");
  console.log("  Total API calls: " + total);
  console.log("  Successful: " + success);
  console.log("  Failed: " + failed);
  console.log("  Total cost: $" + (replicateSuccess.reduce((s, r) => s + r.actualCost, 0) + openaiSuccess.reduce((s, r) => s + r.actualCost, 0)).toFixed(6));
  console.log("========================================");
}

main().catch((err) => {
  console.error("OPS-91 failed:", err);
  process.exit(1);
});
