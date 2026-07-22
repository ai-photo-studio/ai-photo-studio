import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ReplicateProvider } from "../restoration-providers/providers/ReplicateProvider";
import { OpenAIProvider } from "../restoration-providers/providers/OpenAIProvider";
import { QualityMetricsCalculator } from "../restoration-providers/quality/QualityMetricsCalculator";
import type { RestorationRequest, RestorationResult } from "../restoration-providers/interfaces/IRestorationProvider";
import type { AppConfig } from "../config/env";

const OLD_IMAGES_DIR = join(process.cwd(), "..", "..", "old images");
const BENCHMARK_DIR = join(process.cwd(), "..", "..", "benchmark", "results");
const DOCS_DIR = join(process.cwd(), "..", "..", "docs");

const mockConfig: AppConfig = {
  NODE_ENV: "development", PORT: 4000,
  DATABASE_URL: "postgresql://user:password@localhost:5432/ai_photo_studio",
  REDIS_URL: "redis://localhost:6379", STORAGE_PROVIDER: "mock",
  BACKGROUND_API_URL: "", PRODUCT_CLASSIFIER_URL: "", REAL_ESRGAN_URL: "", IC_LIGHT_LAB_URL: "",
  WHATSAPP_VERIFY_TOKEN: "test", WHATSAPP_ACCESS_TOKEN: "", WHATSAPP_PHONE_NUMBER_ID: "",
  PAYMENT_GATEWAY_NAME: "manual", PAYMENT_GATEWAY_BASE_URL: "", PAYMENT_GATEWAY_SECRET: "",
  AI_PROVIDER: "mock", AI_PROVIDER_NAME: "mock", PHOTOROOM_API_KEY: "", FAL_API_KEY: "",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  FAL_AI_API_KEY: process.env.FAL_AI_API_KEY || "",
  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || "",
  PROVIDER_MODE: "automatic", YOLO_DETECTOR_URL: "",
  R2_ACCOUNT_ID: "", R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "", R2_BUCKET_NAME: "",
  R2_PUBLIC_BASE_URL: "", R2_ENDPOINT: "", AI_PROVIDER_API_KEY: "", RESTORATION_ENDPOINT_URL: "",
  QUEUE_TIMEOUT_SECONDS: 60, PROCESSING_TIMEOUT_SECONDS: 90, ABSOLUTE_TIMEOUT_SECONDS: 150,
  ADMIN_JWT_SECRET: "test", JWT_SECRET: "test", DELIVERY_MODE: "LOG_ONLY", ALLOWED_ORIGINS: "",
  aiProvider: "mock", paymentProvider: "manual", whatsappDryRun: true, storageDryRun: true,
  queueDryRun: true, deliveryMode: "LOG_ONLY", providerMode: "automatic",
};

function timestamp(): string {
  const d = new Date(); const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

async function main() {
  const ts = timestamp();
  const imagePath = join(OLD_IMAGES_DIR, "2.jpeg");
  const imageBuf = readFileSync(imagePath);

  // Ensure dirs
  for (const d of [BENCHMARK_DIR, join(BENCHMARK_DIR, "metadata"), DOCS_DIR]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }

  console.log("OPS-95 Forensic Benchmark");
  console.log("Image: 2.jpeg (" + imageBuf.length + " bytes)");
  console.log("Timestamp: " + ts);
  console.log("");

  // Save original
  writeFileSync(join(BENCHMARK_DIR, ts + "_original.png"), imageBuf);
  console.log("Original saved");

  // ── Replicate forensic capture ──
  console.log("\n--- Replicate ---");
  const rStart = Date.now();
  const rProvider = new ReplicateProvider();
  let rResult: RestorationResult;
  let rRawResponse: any = null;
  try {
    rResult = await rProvider.restore({
      image: imageBuf, contentType: "image/jpeg", fileName: "2.jpeg",
      options: { restoreFaces: true, upscale: true, upscaleScale: 2 },
    });
    // Get the raw replicate prediction JSON from the provider's internal state
    const rLatMs = Date.now() - rStart;
    writeFileSync(join(BENCHMARK_DIR, ts + "_replicate.png"), rResult.image);
    console.log("Latency: " + rLatMs + "ms");
    console.log("Output size: " + rResult.image.length + " bytes");
    console.log("Provider version: " + rResult.providerVersion);
    console.log("Request ID: " + (rResult.requestId || "N/A"));
    console.log("GPU seconds: " + (rResult.actualGPUSeconds || 0));
    console.log("Actual cost: $" + (rResult.actualCost || 0).toFixed(6) + " (" + rResult.costSource + ")");
    console.log("Estimated cost: $" + rResult.estimatedCost.toFixed(6));

    // Capture the raw prediction metadata by making a GET to the replicate prediction endpoint
    if (rResult.requestId) {
      try {
        const resp = await fetch("https://api.replicate.com/v1/predictions/" + rResult.requestId, {
          headers: { Authorization: "Bearer " + process.env.REPLICATE_API_TOKEN },
        });
        if (resp.ok) {
          rRawResponse = await resp.json();
          writeFileSync(join(BENCHMARK_DIR, "metadata", ts + "_replicate_prediction.json"), JSON.stringify(rRawResponse, null, 2));
          console.log("Raw prediction JSON saved");
        }
      } catch (e) {
        console.log("Could not fetch prediction details: " + e);
      }
    }
  } catch (e) {
    console.log("Replicate FAILED: " + e);
    process.exit(1);
  }

  // ── OpenAI forensic capture ──
  console.log("\n--- OpenAI ---");
  const oStart = Date.now();
  const oProvider = new OpenAIProvider(mockConfig);
  let oResult: RestorationResult;
  let oRawResponse: any = null;
  try {
    oResult = await oProvider.restore({
      image: imageBuf, contentType: "image/jpeg", fileName: "2.jpeg",
      options: { restoreFaces: true, upscale: true, upscaleScale: 2 },
    });
    const oLatMs = Date.now() - oStart;
    writeFileSync(join(BENCHMARK_DIR, ts + "_openai.png"), oResult.image);
    console.log("Latency: " + oLatMs + "ms");
    console.log("Output size: " + oResult.image.length + " bytes");
    console.log("Provider version (model): " + oResult.providerVersion);
    console.log("Request ID: " + (oResult.requestId || "N/A"));
    console.log("Actual cost: $" + (oResult.actualCost || 0).toFixed(6) + " (" + oResult.costSource + ")");
    console.log("Estimated cost: $" + oResult.estimatedCost.toFixed(6));

    // OpenAI's created timestamp can be used to look up usage
    oRawResponse = {
      created: oResult.requestId,
      estimatedCost: oResult.estimatedCost,
      actualCost: oResult.actualCost,
      costSource: oResult.costSource,
    };
    writeFileSync(join(BENCHMARK_DIR, "metadata", ts + "_openai_response.json"), JSON.stringify(oRawResponse, null, 2));
    console.log("OpenAI metadata saved");
  } catch (e) {
    console.log("OpenAI FAILED: " + e);
    process.exit(1);
  }

  // ── Quality metrics ──
  const calc = new QualityMetricsCalculator();
  const rMetrics = calc.calculateMetrics(imageBuf, rResult.image);
  const oMetrics = calc.calculateMetrics(imageBuf, oResult.image);
  console.log("\n--- Quality Metrics ---");
  console.log("Metric         | Replicate | OpenAI");
  console.log("SSIM           | " + rMetrics.ssim + "       | " + oMetrics.ssim);
  console.log("PSNR           | " + rMetrics.psnr.toFixed(2) + "    | " + oMetrics.psnr.toFixed(2));
  console.log("Sharpness      | " + rMetrics.sharpness + "       | " + oMetrics.sharpness);
  console.log("Noise          | " + rMetrics.noise + "       | " + oMetrics.noise);
  console.log("Contrast       | " + rMetrics.contrast + "       | " + oMetrics.contrast);
  console.log("Brightness     | " + rMetrics.brightness + "      | " + oMetrics.brightness);
  console.log("Print Quality  | " + rMetrics.printQuality + "        | " + oMetrics.printQuality);

  // ── Save comparison HTML ──
  const compHtml = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>OPS-95 Comparison</title><style>"
    + "body{font-family:sans-serif;margin:20px;background:#f5f5f5}"
    + ".gallery{display:flex;flex-wrap:wrap;gap:16px;justify-content:center}"
    + ".card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;max-width:650px;flex:1 1 550px}"
+ ".card h2{margin:0 0 6px;color:#444;font-size:16px}.card img{max-width:100%;height:auto;border:1px solid #eee;border-radius:3px}"
    + "table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}"
    + "td,th{border:1px solid #eee;padding:3px 6px;text-align:left}"
    + "th{background:#fafafa}</style></head><body>"
    + "<h1>OPS-95: Billing Forensics + Restoration Validation</h1>"
    + "<p>Timestamp: " + ts + " | Image: 2.jpeg (38,247 bytes)</p>"
    + "<div class='gallery'>"
    + "<div class='card'><h2>Original</h2><img src='" + ts + "_original.png' alt='original'></div>"
    + "<div class='card'><h2>Replicate</h2><img src='" + ts + "_replicate.png' alt='replicate'><table>"
    + "<tr><td>Latency</td><td>" + (Date.now() - rStart) + "ms</td></tr>"
    + "<tr><td>Cost</td><td>$" + (rResult.actualCost||0).toFixed(6) + " (" + rResult.costSource + ")</td></tr>"
    + "<tr><td>SSIM</td><td>" + rMetrics.ssim + "</td></tr>"
    + "<tr><td>PSNR</td><td>" + rMetrics.psnr.toFixed(2) + "</td></tr>"
    + "<tr><td>Sharpness</td><td>" + rMetrics.sharpness + "</td></tr>"
    + "<tr><td>Noise</td><td>" + rMetrics.noise + "</td></tr>"
    + "<tr><td>Print Quality</td><td>" + rMetrics.printQuality + "</td></tr></table></div>"
    + "<div class='card'><h2>OpenAI</h2><img src='" + ts + "_openai.png' alt='openai'><table>"
    + "<tr><td>Latency</td><td>" + (Date.now() - oStart) + "ms</td></tr>"
    + "<tr><td>Cost</td><td>$" + (oResult.actualCost||0).toFixed(6) + " (" + oResult.costSource + ")</td></tr>"
    + "<tr><td>Model</td><td>" + (oResult.providerVersion||"unknown") + "</td></tr>"
    + "<tr><td>SSIM</td><td>" + oMetrics.ssim + "</td></tr>"
    + "<tr><td>PSNR</td><td>" + oMetrics.psnr.toFixed(2) + "</td></tr>"
    + "<tr><td>Sharpness</td><td>" + oMetrics.sharpness + "</td></tr>"
    + "<tr><td>Noise</td><td>" + oMetrics.noise + "</td></tr>"
    + "<tr><td>Print Quality</td><td>" + oMetrics.printQuality + "</td></tr></table></div></div></body></html>";
  writeFileSync(join(BENCHMARK_DIR, ts + "_comparison.html"), compHtml);
  console.log("\nAll outputs saved to benchmark/results/");
  console.log("OPS-95 forensic capture complete");
}

main().catch((e) => { console.error(e); process.exit(1); });
