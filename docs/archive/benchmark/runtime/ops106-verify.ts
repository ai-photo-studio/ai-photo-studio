/**
 * OPS-106 End-to-End Runtime Verification Script
 *
 * This script performs a complete live verification:
 * 1. Captures a live OpenAI POST /v1/images/edits request+response with full instrumentation
 * 2. Records dashboard deltas (before/after)
 * 3. Runs Python local restoration pipeline (LaMa → GFPGAN → Real-ESRGAN → DDColor → NAFNet)
 * 4. Outputs all artifacts to benchmark/runtime/YYYY-MM-DD_HH-MM-SS/
 *
 * Usage: npx tsx benchmark/runtime/ops106-verify.ts [--image path/to/image.jpg]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { RuntimeCaptureSession, type DashboardSnapshot } from "../../apps/api/src/utils/runtime-capture";

// ============================================================
// CONFIG
// ============================================================
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || "";
const RESTORATION_SERVICE_URL = process.env.RESTORATION_SERVICE_URL || "http://localhost:8000";

// Default test image - look for existing benchmark images
const DEFAULT_IMAGE_PATH = path.join(process.cwd(), "benchmark", "results", "2026-07-22_19-35-52_original.png");

interface VerificationResult {
  openai: {
    sessionDir: string;
    requestId: string;
    model: string;
    processingTimeMs: number;
    usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    costEstimated: number;
    imageSha256: string;
  } | null;
  replicate: {
    sessionDir: string;
    predictionId: string;
    model: string;
    processingTimeMs: number;
    gpuSeconds: number;
    costEstimated: number;
  } | null;
  localRestoration: {
    outputPath: string;
    stages: string[];
    success: boolean;
  } | null;
  dashboard: {
    spendDelta?: number;
    tokenDelta?: number;
    requestDelta?: number;
    imagesDelta?: number;
    reconciled: boolean;
    discrepancies: string[];
  };
  errors: string[];
}

// ============================================================
// HELPERS
// ============================================================
function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

// ============================================================
// PART 1-2: LIVE OPENAI VERIFICATION
// ============================================================
async function verifyOpenAI(imagePath: string): Promise<VerificationResult["openai"]> {
  console.log("\n" + "=".repeat(70));
  console.log("PART 1-2: OPENAI LIVE VERIFICATION");
  console.log("=".repeat(70));

  if (!OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY not set in environment");
    return null;
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`ERROR: Image not found at ${imagePath}`);
    return null;
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const imageExt = path.extname(imagePath).toLowerCase();
  const mimeType = imageExt === ".png" ? "image/png" : imageExt === ".webp" ? "image/webp" : "image/jpeg";
  const base64Image = imageBuffer.toString("base64");
  const imageSha256 = sha256(imageBuffer);

  console.log(`Image: ${imagePath}`);
  console.log(`Size: ${imageBuffer.length} bytes`);
  console.log(`SHA256: ${imageSha256}`);

  // Create capture session
  const capture = new RuntimeCaptureSession();
  const sessionDir = capture.sessionDir;

  // Build the request
  const model = "gpt-image-2";
  const prompt = "Restore this damaged photograph. Remove scratches, reduce noise, enhance contrast and sharpness, and improve overall quality while preserving the original character of the image.";
  const quality = "auto";
  const outputFormat = "png";

  // Build FormData (for capture logging)
  const formData = new FormData();
  formData.append("model", model);
  formData.append("prompt", prompt);
  formData.append("n", "1");
  formData.append("size", "1024x1024");
  formData.append("quality", quality);
  formData.append("output_format", outputFormat);
  const blob = new Blob([imageBuffer], { type: mimeType });
  formData.append("image", blob, path.basename(imagePath));

  // Capture the request
  capture.captureRequest({
    method: "POST",
    url: "https://api.openai.com/v1/images/edits",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "multipart/form-data",
    },
    formDataFields: [
      { name: "model", value: model },
      { name: "prompt", value: prompt },
      { name: "n", value: "1" },
      { name: "size", value: "1024x1024" },
      { name: "quality", value: quality },
      { name: "output_format", value: outputFormat },
      { name: "image", value: blob, isFile: true, filename: path.basename(imagePath), contentType: mimeType },
    ],
    imageBuffer,
    model,
    prompt,
  });

  // Send the request
  console.log("\nSending POST /v1/images/edits...");
  const requestStart = Date.now();

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  const elapsedMs = Date.now() - requestStart;

  if (!response.ok) {
    const body = await response.text();
    console.error(`OpenAI API failed: ${response.status} ${response.statusText}`);
    console.error(body.slice(0, 500));
    return null;
  }

  const result = (await response.json()) as {
    created: number;
    data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  };

  // Extract returned image
  let returnedImageBuffer: Buffer | undefined;
  if (result.data?.[0]?.b64_json) {
    returnedImageBuffer = Buffer.from(result.data[0].b64_json, "base64");
  } else if (result.data?.[0]?.url) {
    const imgResp = await fetch(result.data[0].url);
    returnedImageBuffer = Buffer.from(await imgResp.arrayBuffer());
  }

  // Capture response
  capture.captureResponse({
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    processingTimeMs: elapsedMs,
    usage: result.usage ? {
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      total_tokens: result.usage.total_tokens,
    } : undefined,
    responseSize: returnedImageBuffer?.length,
    returnedImage: returnedImageBuffer,
    returnedImageContentType: "image/png",
  });

  // Calculate cost
  const GPT_IMAGE_PRICING: Record<string, { input: number; output: number }> = {
    "gpt-image-2": { input: 0.000008, output: 0.000030 },
  };
  const pricing = GPT_IMAGE_PRICING[model] ?? GPT_IMAGE_PRICING["gpt-image-2"];
  const inputCost = ((result.usage?.input_tokens || 0) / 1000) * pricing.input;
  const outputCost = ((result.usage?.output_tokens || 0) / 1000) * pricing.output;
  const costEstimated = Math.round((inputCost + outputCost) * 100000) / 100000;

  // Get request ID from headers
  let requestId = "";
  response.headers.forEach((v, k) => {
    if (k === "x-request-id") requestId = v;
  });

  console.log(`\nStatus: ${response.status}`);
  console.log(`Request ID: ${requestId}`);
  console.log(`Processing time: ${elapsedMs}ms`);
  console.log(`Usage: input=${result.usage?.input_tokens} output=${result.usage?.output_tokens} total=${result.usage?.total_tokens}`);
  console.log(`Cost (calculated): $${costEstimated}`);
  console.log(`Returned image size: ${returnedImageBuffer?.length || 0} bytes`);
  console.log(`Session saved to: ${sessionDir}`);

  // Finalize capture
  capture.finalize();

  return {
    sessionDir,
    requestId,
    model,
    processingTimeMs: elapsedMs,
    usage: {
      input_tokens: result.usage?.input_tokens,
      output_tokens: result.usage?.output_tokens,
      total_tokens: result.usage?.total_tokens,
    },
    costEstimated,
    imageSha256,
  };
}

// ============================================================
// PART 4: DASHBOARD DELTA
// ============================================================
async function captureDashboardDelta(apiUsage: { input_tokens?: number; output_tokens?: number; total_tokens?: number }): Promise<VerificationResult["dashboard"]> {
  console.log("\n" + "=".repeat(70));
  console.log("PART 4: DASHBOARD DELTA");
  console.log("=".repeat(70));

  // We can't automate the OpenAI dashboard, so we record what we know
  // and flag what needs manual verification
  const before: DashboardSnapshot = {
    timestamp: new Date().toISOString(),
    source: "manual",
    notes: "OPS-106: This must be captured from the OpenAI dashboard BEFORE the request. See dashboard_before.json for the timestamp to record.",
  };

  const after: DashboardSnapshot = {
    timestamp: new Date().toISOString(),
    source: "manual",
    notes: "OPS-106: This must be captured from the OpenAI dashboard AFTER the request. See dashboard_after.json for the timestamp to record.",
  };

  const discrepancies: string[] = [];
  discrepancies.push("Dashboard snapshots require manual capture from https://platform.openai.com/usage");

  const reconciled = false;

  console.log("Dashboard deltas require manual capture from OpenAI dashboard.");
  console.log("API returned usage:");
  console.log(`  input_tokens: ${apiUsage.input_tokens}`);
  console.log(`  output_tokens: ${apiUsage.output_tokens}`);
  console.log(`  total_tokens: ${apiUsage.total_tokens}`);

  return {
    before: before as unknown as DashboardSnapshot,
    after: after as unknown as DashboardSnapshot,
    reconciled,
    discrepancies,
  };
}

// ============================================================
// PART 5: LOCAL RESTORATION PIPELINE (Python)
// ============================================================
async function runLocalRestoration(imagePath: string, outputDir: string): Promise<VerificationResult["localRestoration"]> {
  console.log("\n" + "=".repeat(70));
  console.log("PART 5: LOCAL RESTORATION PIPELINE");
  console.log("=".repeat(70));

  const outputPath = path.join(outputDir, "local_restored.jpg");

  // Check if restoration service is available
  const restorationScript = path.join(process.cwd(), "services", "restoration", "app.py");
  if (!fs.existsSync(restorationScript)) {
    console.log("Restoration service not available locally. Skipping.");
    console.log(`To run locally: uvicorn services.restoration.app:app --host 0.0.0.0 --port 8000`);
    return {
      outputPath,
      stages: [],
      success: false,
    };
  }

  // Try to call the local restoration service
  try {
    console.log(`Calling local restoration service at ${RESTORATION_SERVICE_URL}/restore...`);
    const imageBuffer = fs.readFileSync(imagePath);

    const response = await fetch(`${RESTORATION_SERVICE_URL}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "image/png",
        "X-File-Name": path.basename(imagePath),
      },
      body: imageBuffer,
    });

    if (!response.ok) {
      console.error(`Local restoration failed: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error(text.slice(0, 500));
      return {
        outputPath,
        stages: [],
        success: false,
      };
    }

    const stages = (response.headers.get("x-processing-stages") || "").split(",").filter(Boolean);
    const credits = response.headers.get("x-credits-used") || "0";
    const outputBuffer = Buffer.from(await response.arrayBuffer());

    fs.writeFileSync(outputPath, outputBuffer);
    console.log(`Local restoration complete`);
    console.log(`  Stages: ${stages.join(" → ")}`);
    console.log(`  Credits: ${credits}`);
    console.log(`  Output: ${outputPath} (${outputBuffer.length} bytes)`);

    return {
      outputPath,
      stages,
      success: true,
    };
  } catch (err) {
    console.error(`Local restoration service not reachable: ${err instanceof Error ? err.message : String(err)}`);
    console.log(`Start it with: cd services/restoration && python app.py`);
    return {
      outputPath,
      stages: [],
      success: false,
    };
  }
}

// ============================================================
// MAIN
// ============================================================
async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("OPS-106: END-TO-END RUNTIME VERIFICATION");
  console.log("=".repeat(70));
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Model: gpt-image-2`);

  // Parse CLI args
  const args = process.argv.slice(2);
  const imageArg = args.find((a) => !a.startsWith("--"));
  const imagePath = imageArg || DEFAULT_IMAGE_PATH;

  if (!fs.existsSync(imagePath)) {
    console.error(`ERROR: No test image found. Please provide one with --image path/to/img.jpg`);
    console.error(`Looked at: ${imagePath}`);
    process.exit(1);
  }

  const result: VerificationResult = {
    openai: null,
    replicate: null,
    localRestoration: null,
    dashboard: { reconciled: false, discrepancies: [] },
    errors: [],
  };

  // PART 1-3: OpenAI live verification
  try {
    result.openai = await verifyOpenAI(imagePath);
    if (result.openai) {
      result.dashboard = await captureDashboardDelta(result.openai.usage);
    }
  } catch (err) {
    const msg = `OpenAI verification failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(msg);
    result.errors.push(msg);
  }

  // PART 5: Local restoration
  const localOutputDir = result.openai?.sessionDir || path.join(process.cwd(), "benchmark", "runtime", "latest");
  ensureDir(localOutputDir);
  try {
    result.localRestoration = await runLocalRestoration(imagePath, localOutputDir);
  } catch (err) {
    const msg = `Local restoration failed: ${err instanceof Error ? err.message : String(err)}`;
    console.error(msg);
    result.errors.push(msg);
  }

  // FINAL REPORT
  console.log("\n" + "=".repeat(70));
  console.log("VERIFICATION SUMMARY");
  console.log("=".repeat(70));

  console.log("\n✓ Complete outbound HTTP captured:", result.openai ? "YES" : "NO");
  console.log("✓ Complete inbound HTTP captured:", result.openai ? "YES" : "NO");
  console.log("✓ Returned usage preserved:", result.openai?.usage ? "YES" : "NO");
  console.log("✓ Dashboard deltas measured:", result.dashboard.reconciled ? "RECONCILED" : "PENDING MANUAL");
  console.log("✓ Final restored image generated:", result.localRestoration?.success ? "YES" : "NO (service not available)");

  if (result.openai?.sessionDir) {
    console.log(`\nArtifacts: ${result.openai.sessionDir}`);
  }

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
  }

  // Save final report
  const reportDir = result.openai?.sessionDir || path.join(process.cwd(), "benchmark", "runtime", "latest");
  const reportPath = path.join(reportDir, "verification_report.json");
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2) + "\n");
  console.log(`\nReport saved to: ${reportPath}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
