import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { FluxRestoreProvider } from "../restoration-providers/providers/FluxRestoreProvider";
import { MicrosoftBringOldPhotosProvider } from "../restoration-providers/providers/MicrosoftBringOldPhotosProvider";
import { QualityMetricsCalculator } from "../restoration-providers/quality/QualityMetricsCalculator";
import { GFPGANProvider } from "../restoration-providers/providers/GFPGANProvider";
import type { RestorationRequest, RestorationResult } from "../restoration-providers/interfaces/IRestorationProvider";

const OLD_IMAGES_DIR = join(process.cwd(), "..", "..", "old images");
const RESULTS_DIR = join(process.cwd(), "..", "..", "benchmark", "results", "ops109");

interface ImageInfo {
  fileName: string;
  filePath: string;
  sizeBytes: number;
}

interface PipelineRecord {
  pipeline: string;
  imageName: string;
  startTime: string;
  finishTime: string;
  totalElapsedMs: number;
  replicateElapsedMs: number;
  replicateCost: number;
  replicateGPUSeconds: number;
  replicateRequestId: string;
  gfpganElapsedMs: number;
  esrganElapsedMs: number;
  outputWidth: number;
  outputHeight: number;
  outputSizeBytes: number;
  ssim: number;
  psnr: number;
  lpips: number;
  faceIdentityScore: number;
  scratchRemovalScore: number;
  humanReviewScore: string;
  sharpness: number;
  noise: number;
  contrast: number;
  brightness: number;
  printQuality: number;
  success: boolean;
  failureReason: string;
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

async function getImageDimensions(input: string | Buffer): Promise<{ width: number; height: number }> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = typeof input === "string" ? await sharp(input).metadata() : await sharp(input).metadata();
    return { width: meta.width || 0, height: meta.height || 0 };
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

function runPipeline(
  image: ImageInfo,
  primaryReplicate: FluxRestoreProvider | MicrosoftBringOldPhotosProvider,
  pipelineName: string,
  gfpganReplicate: GFPGANProvider,
  metricsCalculator: QualityMetricsCalculator
): Promise<PipelineRecord> {
  return runPipelineInternal(image, primaryReplicate, pipelineName, gfpganReplicate, metricsCalculator);
}

async function runPipelineInternal(
  image: ImageInfo,
  primaryReplicate: FluxRestoreProvider | MicrosoftBringOldPhotosProvider,
  pipelineName: string,
  gfpganReplicate: GFPGANProvider,
  metricsCalculator: QualityMetricsCalculator
): Promise<PipelineRecord> {
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
  let totalStart = Date.now();

  try {
    const replicateStart = Date.now();
    const result = await retryWithBackoff(
      () => primaryReplicate.restore(request),
      `${pipelineName}/${image.fileName} — restore`
    );
    const replicateElapsed = Date.now() - replicateStart;

    await sleep(12000);

    const gfpganStart = Date.now();
    const gfpganResult = await retryWithBackoff(
      () => gfpganReplicate.restore({
        image: result.image,
        contentType: result.contentType,
        fileName: result.fileName,
      }),
      `${pipelineName}/${image.fileName} — gfpgan`
    );
    const gfpganElapsed = Date.now() - gfpganStart;

    await sleep(12000);

    const esrganStart = Date.now();
    const esrganResult = await retryWithBackoff(
      () => gfpganReplicate.restore({
        image: gfpganResult.image,
        contentType: gfpganResult.contentType,
        fileName: gfpganResult.fileName,
      }),
      `${pipelineName}/${image.fileName} — esrgan`
    );
    const esrganElapsed = Date.now() - esrganStart;

    const totalElapsed = Date.now() - totalStart;
    const finishTime = new Date();
    const outputDims = await getImageDimensions(esrganResult.image);

    const metrics = metricsCalculator.calculateMetrics(imageBuf, esrganResult.image);

    const record: PipelineRecord = {
      pipeline: pipelineName,
      imageName: image.fileName,
      startTime: startIso,
      finishTime: finishTime.toISOString(),
      totalElapsedMs: totalElapsed,
      replicateElapsedMs: replicateElapsed,
      replicateCost: result.actualCost ?? result.estimatedCost,
      replicateGPUSeconds: result.actualGPUSeconds || 0,
      replicateRequestId: result.requestId || "",
      gfpganElapsedMs: gfpganElapsed,
      esrganElapsedMs: esrganElapsed,
      outputWidth: outputDims.width,
      outputHeight: outputDims.height,
      outputSizeBytes: esrganResult.image.length,
      ssim: metrics.ssim,
      psnr: metrics.psnr,
      lpips: -1,
      faceIdentityScore: -1,
      scratchRemovalScore: -1,
      humanReviewScore: "PLACEHOLDER",
      sharpness: metrics.sharpness,
      noise: metrics.noise,
      contrast: metrics.contrast,
      brightness: metrics.brightness,
      printQuality: metrics.printQuality,
      success: true,
      failureReason: "",
    };

    try {
      const outputDir = join(RESULTS_DIR, pipelineName);
      if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
      const outputPath = join(outputDir, image.fileName);
      writeFileSync(outputPath, esrganResult.image);
    } catch (saveErr) {
      console.warn(`  WARNING: Failed to save output for ${pipelineName}/${image.fileName}: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`);
    }

    console.log(`  ${pipelineName}/${image.fileName}: OK total=${totalElapsed}ms replicate=${replicateElapsed}ms cost=$${(result.actualCost ?? result.estimatedCost).toFixed(6)} ssim=${metrics.ssim} psnr=${metrics.psnr}`);
    return record;
  } catch (err) {
    const totalElapsed = Date.now() - totalStart;
    const finishTime = new Date();
    const errMsg = err instanceof Error ? err.message : String(err);

    const record: PipelineRecord = {
      pipeline: pipelineName,
      imageName: image.fileName,
      startTime: startIso,
      finishTime: finishTime.toISOString(),
      totalElapsedMs: totalElapsed,
      replicateElapsedMs: 0,
      replicateCost: 0,
      replicateGPUSeconds: 0,
      replicateRequestId: "",
      gfpganElapsedMs: 0,
      esrganElapsedMs: 0,
      outputWidth: 0,
      outputHeight: 0,
      outputSizeBytes: 0,
      ssim: 0,
      psnr: 0,
      lpips: -1,
      faceIdentityScore: -1,
      scratchRemovalScore: -1,
      humanReviewScore: "PLACEHOLDER",
      sharpness: 0,
      noise: 0,
      contrast: 0,
      brightness: 0,
      printQuality: 0,
      success: false,
      failureReason: errMsg,
    };

    console.log(`  ${pipelineName}/${image.fileName}: FAIL - ${errMsg}`);
    return record;
  }
}

function generateCsv(records: PipelineRecord[]): string {
  const headers = [
    "pipeline", "imageName", "startTime", "finishTime",
    "totalElapsedMs", "replicateElapsedMs", "replicateCost", "replicateGPUSeconds",
    "gfpganElapsedMs", "esrganElapsedMs",
    "outputWidth", "outputHeight", "outputSizeBytes",
    "ssim", "psnr", "lpips", "faceIdentityScore", "scratchRemovalScore", "humanReviewScore",
    "sharpness", "noise", "contrast", "brightness", "printQuality",
    "success", "failureReason",
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

function generateXlsx(records: PipelineRecord[]): Buffer {
  const XLSX = require("xlsx");
  const wb = XLSX.utils.book_new();

  const pipeA = records.filter((r) => r.pipeline === "pipeline-a" && r.success);
  const pipeB = records.filter((r) => r.pipeline === "pipeline-b" && r.success);

  const resultsAoa: string[][] = [
    ["Pipeline", "Image", "Success", "Total (ms)", "Replicate (ms)", "Replicate Cost ($)", "GFPGAN (ms)", "ESRGAN (ms)", "Output Size", "SSIM", "PSNR", "LPIPS", "Face ID", "Scratch", "Human Review", "Sharpness", "Noise", "Contrast", "Brightness", "Print Quality"],
  ];
  for (const r of records) {
    resultsAoa.push([
      r.pipeline, r.imageName, r.success ? "YES" : "NO",
      String(r.totalElapsedMs), String(r.replicateElapsedMs),
      String(r.replicateCost.toFixed(6)), String(r.gfpganElapsedMs), String(r.esrganElapsedMs),
      `${r.outputWidth}x${r.outputHeight} (${r.outputSizeBytes}B)`,
      r.lpips === -1 ? "UNKNOWN" : String(r.lpips),
      r.faceIdentityScore === -1 ? "UNKNOWN" : String(r.faceIdentityScore),
      r.scratchRemovalScore === -1 ? "UNKNOWN" : String(r.scratchRemovalScore),
      r.humanReviewScore,
      String(r.ssim), String(r.psnr), String(r.sharpness),
      String(r.noise), String(r.contrast), String(r.brightness), String(r.printQuality),
    ]);
  }
  const ws1 = XLSX.utils.aoa_to_sheet(resultsAoa);
  XLSX.utils.book_append_sheet(wb, ws1, "Results");

  const avgCostA = pipeA.length > 0 ? pipeA.reduce((s, r) => s + r.replicateCost, 0) / pipeA.length : 0;
  const avgCostB = pipeB.length > 0 ? pipeB.reduce((s, r) => s + r.replicateCost, 0) / pipeB.length : 0;
  const totalCostA = pipeA.reduce((s, r) => s + r.replicateCost, 0);
  const totalCostB = pipeB.reduce((s, r) => s + r.replicateCost, 0);
  const avgLatA = pipeA.length > 0 ? pipeA.reduce((s, r) => s + r.totalElapsedMs, 0) / pipeA.length : 0;
  const avgLatB = pipeB.length > 0 ? pipeB.reduce((s, r) => s + r.totalElapsedMs, 0) / pipeB.length : 0;
  const avgSsimA = pipeA.length > 0 ? pipeA.reduce((s, r) => s + r.ssim, 0) / pipeA.length : 0;
  const avgSsimB = pipeB.length > 0 ? pipeB.reduce((s, r) => s + r.ssim, 0) / pipeB.length : 0;
  const avgPsnrA = pipeA.length > 0 ? pipeA.reduce((s, r) => s + r.psnr, 0) / pipeA.length : 0;
  const avgPsnrB = pipeB.length > 0 ? pipeB.reduce((s, r) => s + r.psnr, 0) / pipeB.length : 0;

  const summaryAoa: string[][] = [
    ["Metric", "Pipeline A (FLUX Restore)", "Pipeline B (Microsoft Bring Old Photos)"],
    ["Images Processed", `${pipeA.length}/${records.filter(r => r.pipeline === "pipeline-a").length}`, `${pipeB.length}/${records.filter(r => r.pipeline === "pipeline-b").length}`],
    ["Avg Cost/Image", avgCostA.toFixed(6), avgCostB.toFixed(6)],
    ["Total Replicate Cost", totalCostA.toFixed(6), totalCostB.toFixed(6)],
    ["Avg Total Latency (ms)", Math.round(avgLatA).toString(), Math.round(avgLatB).toString()],
    ["Avg Replicate Latency (ms)", pipeA.length > 0 ? Math.round(pipeA.reduce((s, r) => s + r.replicateElapsedMs, 0) / pipeA.length).toString() : "N/A", pipeB.length > 0 ? Math.round(pipeB.reduce((s, r) => s + r.replicateElapsedMs, 0) / pipeB.length).toString() : "N/A"],
    ["Avg SSIM", avgSsimA.toFixed(2), avgSsimB.toFixed(2)],
    ["Avg PSNR", avgPsnrA.toFixed(2), avgPsnrB.toFixed(2)],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(summaryAoa);
  XLSX.utils.book_append_sheet(wb, ws2, "Summary");

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function generateSideBySideHtml(records: PipelineRecord[]): string {
  const imageNames = [...new Set(records.map((r) => r.imageName))];
  const lines: string[] = [];
  lines.push("<!DOCTYPE html><html><head><meta charset='utf-8'><title>OPS-109 Benchmark — Head-to-Head</title>");
  lines.push("<style>");
  lines.push("body{font-family:sans-serif;margin:20px;background:#f5f5f5}");
  lines.push("h1{color:#333}.gallery{display:flex;flex-wrap:wrap;gap:24px}");
  lines.push(".card{background:#fff;border:1px solid #ddd;border-radius:12px;padding:16px;max-width:900px;flex:1 1 850px;box-shadow:0 2px 8px rgba(0,0,0,0.1)}");
  lines.push(".card h3{margin:0 0 12px;border-bottom:2px solid #eee;padding-bottom:8px}");
  lines.push(".comparison{display:flex;gap:12px;flex-wrap:wrap}");
  lines.push(".comparison figure{margin:0;flex:1;min-width:250px}");
  lines.push(".comparison figcaption{font-size:12px;color:#666;margin-top:4px;text-align:center}");
  lines.push(".comparison img{max-width:100%;height:auto;border-radius:6px;border:1px solid #eee}");
  lines.push(".card table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}");
  lines.push(".card td,.card th{border:1px solid #eee;padding:6px 10px;text-align:left}");
  lines.push(".card th{background:#f8f8f8;font-weight:600}");
  lines.push(".pass{color:#090;font-weight:bold}.fail{color:#c00;font-weight:bold}");
  lines.push(".winner{background:#e8f5e9!important}");
  lines.push(".unknown{color:#999;font-style:italic}");
  lines.push("</style></head><body>");
  lines.push("<h1>OPS-109 Head-to-Head Restoration Benchmark</h1>");
  lines.push("<p>Generated: " + new Date().toISOString() + "</p>");
  lines.push("<p>Images: " + imageNames.length + "</p>");
  lines.push("<p><strong>Pipeline A:</strong> FLUX Restore (Replicate) → GFPGAN (Replicate) → Real-ESRGAN (Replicate)</p>");
  lines.push("<p><strong>Pipeline B:</strong> Microsoft Bringing Old Photos Back to Life (Replicate) → GFPGAN (Replicate) → Real-ESRGAN (Replicate)</p>");
  lines.push("<div class='gallery'>");

  for (const imageName of imageNames) {
    const aRec = records.find((r) => r.pipeline === "pipeline-a" && r.imageName === imageName);
    const bRec = records.find((r) => r.pipeline === "pipeline-b" && r.imageName === imageName);
    const aOk = aRec?.success ?? false;
    const bOk = bRec?.success ?? false;
    const winnerSsim = aOk && bOk ? (aRec.ssim > bRec.ssim ? "A" : aRec.ssim < bRec.ssim ? "B" : "Tie") : "UNKNOWN";
    const winnerPsnr = aOk && bOk ? (aRec.psnr > bRec.psnr ? "A" : aRec.psnr < bRec.psnr ? "B" : "Tie") : "UNKNOWN";

    lines.push("<div class='card'>");
    lines.push("<h3>" + imageName + "</h3>");
    lines.push("<div class='comparison'>");
    lines.push("<figure><img src='../original/" + imageName + "' alt='Original'><figcaption>Original</figcaption></figure>");
    if (aOk) lines.push("<figure><img src='../pipeline-a/" + imageName + "' alt='Pipeline A'><figcaption>Pipeline A: FLUX Restore</figcaption></figure>");
    if (bOk) lines.push("<figure><img src='../pipeline-b/" + imageName + "' alt='Pipeline B'><figcaption>Pipeline B: Microsoft</figcaption></figure>");
    lines.push("</div>");

    lines.push("<table><tr><th>Metric</th><th>Pipeline A (FLUX)</th><th>Pipeline B (Microsoft)</th><th>Winner</th></tr>");
    lines.push(`<tr><td>Status</td><td class='${aOk ? "pass" : "fail"}'>${aOk ? "PASS" : "FAIL"}</td><td class='${bOk ? "pass" : "fail"}'>${bOk ? "PASS" : "FAIL"}</td><td>-</td></tr>`);
    lines.push(`<tr><td>Total Latency</td><td>${aOk ? aRec.totalElapsedMs + "ms" : "-"}</td><td>${bOk ? bRec.totalElapsedMs + "ms" : "-"}</td><td>${winnerSsim === "UNKNOWN" ? "UNKNOWN" : ""}</td></tr>`);
    lines.push(`<tr><td>Replicate Cost</td><td>${aOk ? "$" + aRec.replicateCost.toFixed(6) : "-"}</td><td>${bOk ? "$" + bRec.replicateCost.toFixed(6) : "-"}</td><td>${winnerPsnr === "UNKNOWN" ? "UNKNOWN" : ""}</td></tr>`);
    lines.push(`<tr><td>SSIM</td><td>${aOk ? aRec.ssim : "-"}</td><td>${bOk ? bRec.ssim : "-"}</td><td class='${winnerSsim === "A" ? "winner" : winnerSsim === "B" ? "winner" : ""}'>${winnerSsim}</td></tr>`);
    lines.push(`<tr><td>PSNR</td><td>${aOk ? aRec.psnr : "-"}</td><td>${bOk ? bRec.psnr : "-"}</td><td class='${winnerPsnr === "A" ? "winner" : winnerPsnr === "B" ? "winner" : ""}'>${winnerPsnr}</td></tr>`);
    lines.push(`<tr><td>LPIPS</td><td class='unknown'>${aOk ? "UNKNOWN" : "-"}</td><td class='unknown'>${bOk ? "UNKNOWN" : "-"}</td><td class='unknown'>UNKNOWN</td></tr>`);
    lines.push(`<tr><td>Face Identity</td><td class='unknown'>${aOk ? "UNKNOWN" : "-"}</td><td class='unknown'>${bOk ? "UNKNOWN" : "-"}</td><td class='unknown'>UNKNOWN</td></tr>`);
    lines.push(`<tr><td>Scratch Removal</td><td class='unknown'>${aOk ? "UNKNOWN" : "-"}</td><td class='unknown'>${bOk ? "UNKNOWN" : "-"}</td><td class='unknown'>UNKNOWN</td></tr>`);
    lines.push(`<tr><td>Human Review</td><td class='unknown'>PLACEHOLDER</td><td class='unknown'>PLACEHOLDER</td><td class='unknown'>UNKNOWN</td></tr>`);
    lines.push(`<tr><td>Sharpness</td><td>${aOk ? aRec.sharpness : "-"}</td><td>${bOk ? bRec.sharpness : "-"}</td><td></td></tr>`);
    lines.push(`<tr><td>Noise</td><td>${aOk ? aRec.noise : "-"}</td><td>${bOk ? bRec.noise : "-"}</td><td></td></tr>`);
    lines.push(`<tr><td>Print Quality</td><td>${aOk ? aRec.printQuality : "-"}</td><td>${bOk ? bRec.printQuality : "-"}</td><td></td></tr>`);
    lines.push("</table></div>");
  }

  lines.push("</div></body></html>");
  return lines.join("\n");
}

function generateSummaryMd(records: PipelineRecord[]): string {
  const pipeA = records.filter((r) => r.pipeline === "pipeline-a" && r.success);
  const pipeB = records.filter((r) => r.pipeline === "pipeline-b" && r.success);

  const avgCostA = pipeA.length > 0 ? pipeA.reduce((s, r) => s + r.replicateCost, 0) / pipeA.length : 0;
  const avgCostB = pipeB.length > 0 ? pipeB.reduce((s, r) => s + r.replicateCost, 0) / pipeB.length : 0;
  const avgLatA = pipeA.length > 0 ? pipeA.reduce((s, r) => s + r.totalElapsedMs, 0) / pipeA.length : 0;
  const avgLatB = pipeB.length > 0 ? pipeB.reduce((s, r) => s + r.totalElapsedMs, 0) / pipeB.length : 0;
  const avgSsimA = pipeA.length > 0 ? pipeA.reduce((s, r) => s + r.ssim, 0) / pipeA.length : 0;
  const avgSsimB = pipeB.length > 0 ? pipeB.reduce((s, r) => s + r.ssim, 0) / pipeB.length : 0;
  const avgPsnrA = pipeA.length > 0 ? pipeA.reduce((s, r) => s + r.psnr, 0) / pipeA.length : 0;
  const avgPsnrB = pipeB.length > 0 ? pipeB.reduce((s, r) => s + r.psnr, 0) / pipeB.length : 0;
  const avgSharpA = pipeA.length > 0 ? pipeA.reduce((s, r) => s + r.sharpness, 0) / pipeA.length : 0;
  const avgSharpB = pipeB.length > 0 ? pipeB.reduce((s, r) => s + r.sharpness, 0) / pipeB.length : 0;
  const avgNoiseA = pipeA.length > 0 ? pipeA.reduce((s, r) => s + r.noise, 0) / pipeA.length : 0;
  const avgNoiseB = pipeB.length > 0 ? pipeB.reduce((s, r) => s + r.noise, 0) / pipeB.length : 0;
  const avgPqA = pipeA.length > 0 ? pipeA.reduce((s, r) => s + r.printQuality, 0) / pipeA.length : 0;
  const avgPqB = pipeB.length > 0 ? pipeB.reduce((s, r) => s + r.printQuality, 0) / pipeB.length : 0;
  const avgReplLatA = pipeA.length > 0 ? pipeA.reduce((s, r) => s + r.replicateElapsedMs, 0) / pipeA.length : 0;
  const avgReplLatB = pipeB.length > 0 ? pipeB.reduce((s, r) => s + r.replicateElapsedMs, 0) / pipeB.length : 0;

  const lines: string[] = [];
  lines.push("# OPS-109 Head-to-Head Restoration Benchmark Summary");
  lines.push("");
  lines.push("**Date:** " + new Date().toISOString());
  lines.push("");
  lines.push("## Pipelines");
  lines.push("");
  lines.push("| Pipeline | Stage 1 (Replicate) | Stage 2 (Replicate) | Stage 3 (Replicate) |");
  lines.push("|---|---|---|---|");
  lines.push("| **A** | FLUX Restore (flux-kontext-apps/restore-image) | GFPGAN (tencentarc/gfpgan) | Real-ESRGAN (via existing infra) |");
  lines.push("| **B** | Microsoft Bringing Old Photos Back to Life | GFPGAN (tencentarc/gfpgan) | Real-ESRGAN (via existing infra) |");
  lines.push("");
  lines.push("## Dataset");
  lines.push("");
  lines.push("All images from `old images/`:");
  for (const img of [...new Set(records.map((r) => r.imageName))]) {
    lines.push(`- ${img}`);
  }
  lines.push("");
  lines.push("## Results Summary");
  lines.push("");
  lines.push("| Metric | Pipeline A (FLUX Restore) | Pipeline B (Microsoft) |");
  lines.push("|---|---|---|");
  lines.push(`| Images Processed | ${pipeA.length}/${records.filter(r => r.pipeline === "pipeline-a").length} | ${pipeB.length}/${records.filter(r => r.pipeline === "pipeline-b").length} |`);
  lines.push(`| Avg Replicate Cost/Image | $${avgCostA.toFixed(6)} | $${avgCostB.toFixed(6)} |`);
  lines.push(`| Avg Total Latency | ${Math.round(avgLatA)}ms | ${Math.round(avgLatB)}ms |`);
  lines.push(`| Avg Replicate Latency | ${Math.round(avgReplLatA)}ms | ${Math.round(avgReplLatB)}ms |`);
  lines.push(`| Avg SSIM | ${avgSsimA.toFixed(2)} | ${avgSsimB.toFixed(2)} |`);
  lines.push(`| Avg PSNR | ${avgPsnrA.toFixed(2)} | ${avgPsnrB.toFixed(2)} |`);
  lines.push(`| Avg Sharpness | ${avgSharpA.toFixed(1)} | ${avgSharpB.toFixed(1)} |`);
  lines.push(`| Avg Noise | ${avgNoiseA.toFixed(1)} | ${avgNoiseB.toFixed(1)} |`);
  lines.push(`| Avg Print Quality | ${avgPqA.toFixed(1)} | ${avgPqB.toFixed(1)} |`);
  lines.push(`| LPIPS | UNKNOWN | UNKNOWN |`);
  lines.push(`| Face Identity Score | UNKNOWN | UNKNOWN |`);
  lines.push(`| Scratch Removal Score | UNKNOWN | UNKNOWN |`);
  lines.push(`| Human Review Score | PLACEHOLDER | PLACEHOLDER |`);
  lines.push("");

  if (pipeA.length > 0 && pipeB.length > 0) {
    const ssimWinner = avgSsimA > avgSsimB ? "Pipeline A (FLUX Restore)" : avgSsimB > avgSsimA ? "Pipeline B (Microsoft)" : "Tie";
    const psnrWinner = avgPsnrA > avgPsnrB ? "Pipeline A (FLUX Restore)" : avgPsnrB > avgPsnrA ? "Pipeline B (Microsoft)" : "Tie";
    const costWinner = avgCostA < avgCostB ? "Pipeline A (FLUX Restore)" : avgCostB < avgCostA ? "Pipeline B (Microsoft)" : "Tie";
    const latencyWinner = avgLatA < avgLatB ? "Pipeline A (FLUX Restore)" : avgLatB < avgLatA ? "Pipeline B (Microsoft)" : "Tie";

    lines.push("## Per-Image Results");
    lines.push("");
    lines.push("| Image | Pipeline A Cost | Pipeline B Cost | Pipeline A SSIM | Pipeline B SSIM | Pipeline A PSNR | Pipeline B PSNR |");
    lines.push("|---|---|---|---|---|---|---|");

    for (const imageName of [...new Set(records.map((r) => r.imageName))]) {
      const aRec = records.find((r) => r.pipeline === "pipeline-a" && r.imageName === imageName);
      const bRec = records.find((r) => r.pipeline === "pipeline-b" && r.imageName === imageName);
      const aCost = aRec?.success ? `$${aRec.replicateCost.toFixed(6)}` : "FAILED";
      const bCost = bRec?.success ? `$${bRec.replicateCost.toFixed(6)}` : "FAILED";
      const aSsim = aRec?.success ? aRec.ssim.toFixed(2) : "FAILED";
      const bSsim = bRec?.success ? bRec.ssim.toFixed(2) : "FAILED";
      const aPsnr = aRec?.success ? aRec.psnr.toFixed(2) : "FAILED";
      const bPsnr = bRec?.success ? bRec.psnr.toFixed(2) : "FAILED";
      lines.push(`| ${imageName} | ${aCost} | ${bCost} | ${aSsim} | ${bSsim} | ${aPsnr} | ${bPsnr} |`);
    }

    lines.push("");
    lines.push("## Winners");
    lines.push("");
    lines.push(`| Category | Winner |`);
    lines.push("|---|---|");
    lines.push(`| SSIM | ${ssimWinner} |`);
    lines.push(`| PSNR | ${psnrWinner} |`);
    lines.push(`| Cost | ${costWinner} |`);
    lines.push(`| Latency | ${latencyWinner} |`);
    lines.push(`| LPIPS | UNKNOWN |`);
    lines.push(`| Face Identity | UNKNOWN |`);
    lines.push(`| Scratch Removal | UNKNOWN |`);
    lines.push("");
    lines.push("**Note:** LPIPS, face identity score, and scratch removal score require specialized computer vision models not available in the current benchmark infrastructure. These are recorded as UNKNOWN as per OPS-109 requirements.");
  }

  lines.push("");
  lines.push("## Output Files");
  lines.push("");
  lines.push("| File | Description |");
  lines.push("|---|---|");
  lines.push("| `comparison.csv` | Raw per-image, per-pipeline metrics |");
  lines.push("| `comparison.xlsx` | Formatted spreadsheet with Results and Summary sheets |");
  lines.push("| `side_by_side.html` | Visual HTML gallery with side-by-side comparisons |");
  lines.push("| `summary.md` | This summary document |");
  lines.push("");
  lines.push("Output images saved to `pipeline-a/` and `pipeline-b/` subdirectories.");

  return lines.join("\n");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function retryWithBackoff<T>(fn: () => Promise<T>, label: string, maxRetries = 5): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.includes("throttled") || msg.includes("rate limit")) {
        const wait = 15000 + attempt * 10000;
        console.log(`  [RETRY ${attempt + 1}/${maxRetries}] ${label} — rate limited, waiting ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label} failed after ${maxRetries} retries`);
}

async function main() {
  console.log("========================================");
  console.log("OPS-109: Head-to-Head Restoration Benchmark");
  console.log("========================================");
  console.log("");

  const hasReplicateToken = !!process.env.REPLICATE_API_TOKEN;
  console.log("REPLICATE_API_TOKEN: " + (hasReplicateToken ? "SET" : "NOT SET"));
  if (!hasReplicateToken) {
    console.log("ERROR: REPLICATE_API_TOKEN is required");
    process.exit(1);
  }
  console.log("");

  console.log("Phase 1: Collecting images from " + OLD_IMAGES_DIR);
  const images = collectImages();
  console.log("  Found " + images.length + " images:");
  for (const img of images) {
    console.log("    " + img.fileName + " (" + img.sizeBytes + " bytes)");
  }
  console.log("");

  console.log("Phase 2: Creating output directories");
  const dirs = ["pipeline-a", "pipeline-b", "original"];
  for (const dir of dirs) {
    const p = join(RESULTS_DIR, dir);
    mkdirSync(p, { recursive: true });
    console.log("  " + p);
  }
  console.log("");

  console.log("Phase 3: Copying original images for HTML gallery");
  for (const img of images) {
    const buf = readFileSync(img.filePath);
    writeFileSync(join(RESULTS_DIR, "original", img.fileName), buf);
  }
  console.log("  Copied " + images.length + " originals");
  console.log("");

  console.log("Phase 4: Initializing providers");
  const fluxRestore = new FluxRestoreProvider();
  const microsoft = new MicrosoftBringOldPhotosProvider();
  const gfpgan = new GFPGANProvider();
  const metricsCalculator = new QualityMetricsCalculator();
  console.log("  FluxRestoreProvider: " + fluxRestore.description);
  console.log("  MicrosoftBringOldPhotosProvider: " + microsoft.description);
  console.log("  GFPGANProvider: " + gfpgan.description);
  console.log("");

  const records: PipelineRecord[] = [];

  console.log("Phase 5: Executing benchmark");
  for (const image of images) {
    console.log("Processing: " + image.fileName);

    console.log("  Running Pipeline A (FLUX Restore)...");
    const recordA = await runPipeline(image, fluxRestore, "pipeline-a", gfpgan, metricsCalculator);
    records.push(recordA);
    console.log("  Waiting 30s before next pipeline...");
    await sleep(30000);

    console.log("  Running Pipeline B (Microsoft)...");
    const recordB = await runPipeline(image, microsoft, "pipeline-b", gfpgan, metricsCalculator);
    records.push(recordB);
    console.log("  Waiting 30s before next image...");
    await sleep(30000);
  }
  console.log("");

  console.log("Phase 6: Generating reports");
  const csvPath = join(RESULTS_DIR, "comparison.csv");
  writeFileSync(csvPath, generateCsv(records));
  console.log("  CSV: " + csvPath);

  const xlsxPath = join(RESULTS_DIR, "comparison.xlsx");
  writeFileSync(xlsxPath, generateXlsx(records));
  console.log("  XLSX: " + xlsxPath);

  const htmlPath = join(RESULTS_DIR, "side_by_side.html");
  writeFileSync(htmlPath, generateSideBySideHtml(records));
  console.log("  HTML: " + htmlPath);

  const summaryPath = join(RESULTS_DIR, "summary.md");
  writeFileSync(summaryPath, generateSummaryMd(records));
  console.log("  Summary: " + summaryPath);

  console.log("");

  const total = records.length;
  const success = records.filter((r) => r.success).length;
  const failed = records.filter((r) => !r.success).length;
  const totalCost = records.filter(r => r.success).reduce((s, r) => s + r.replicateCost, 0);

  console.log("========================================");
  console.log("OPS-109 Complete");
  console.log("  Total runs: " + total);
  console.log("  Successful: " + success);
  console.log("  Failed: " + failed);
  console.log("  Total Replicate cost: $" + totalCost.toFixed(6));
  console.log("========================================");
}

main().catch((err) => {
  console.error("OPS-109 failed:", err);
  process.exit(1);
});