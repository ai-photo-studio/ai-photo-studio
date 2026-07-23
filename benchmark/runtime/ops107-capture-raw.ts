/**
 * OPS-107: Raw HTTP capture script
 * Makes a raw fetch to OpenAI and captures EVERY field including unknown fields
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const imagePath = path.join(process.cwd(), "benchmark", "results", "2026-07-22_19-35-52_original.png");

async function main() {
  if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not set");
    process.exit(1);
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");
  const imageSha256 = crypto.createHash("sha256").update(imageBuffer).digest("hex");

  console.log("Input image SHA256:", imageSha256);
  console.log("Input image size:", imageBuffer.length, "bytes");

  const formData = new FormData();
  formData.append("model", "gpt-image-2");
  formData.append("prompt", "Restore this damaged photograph. Remove scratches, reduce noise, enhance contrast and sharpness, and improve overall quality while preserving the original character of the image.");
  formData.append("n", "1");
  formData.append("size", "1024x1024");
  formData.append("quality", "auto");
  formData.append("output_format", "png");
  formData.append("image", new Blob([imageBuffer], { type: "image/png" }), "input.png");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  // Capture ALL headers
  const allHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => { allHeaders[k] = v; });

  // Capture raw body
  const rawBody = await response.text();
  let parsed: any;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    parsed = { raw: rawBody };
  }

  // Create output directory
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const outDir = path.join(process.cwd(), "benchmark", "runtime", ts);
  fs.mkdirSync(outDir, { recursive: true });

  // Save complete raw response
  fs.writeFileSync(
    path.join(outDir, "raw_response.json"),
    JSON.stringify({
      status: response.status,
      statusText: response.statusText,
      headers: allHeaders,
      body: parsed,
      rawBodyLength: rawBody.length,
    }, null, 2) + "\n"
  );

  // Save complete raw headers
  fs.writeFileSync(
    path.join(outDir, "raw_headers.json"),
    JSON.stringify(allHeaders, null, 2) + "\n"
  );

  // Save usage object with all fields
  if (parsed.usage) {
    fs.writeFileSync(
      path.join(outDir, "usage_full.json"),
      JSON.stringify(parsed.usage, null, 2) + "\n"
    );
  }

  // Save returned image
  if (parsed.data?.[0]?.b64_json) {
    const imgBuffer = Buffer.from(parsed.data[0].b64_json, "base64");
    fs.writeFileSync(path.join(outDir, "returned_image.png"), imgBuffer);
    const imgSha = crypto.createHash("sha256").update(imgBuffer).digest("hex");
    fs.writeFileSync(path.join(outDir, "returned_image_sha256.txt"), imgSha + "\n");
    console.log("Returned image SHA256:", imgSha);
    console.log("Returned image size:", imgBuffer.length, "bytes");
  }

  // Save timing
  fs.writeFileSync(
    path.join(outDir, "timing.json"),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      openai_processing_ms: allHeaders["openai-processing-ms"],
      request_id: allHeaders["x-request-id"],
    }, null, 2) + "\n"
  );

  console.log("\n=== COMPLETE RESPONSE ===");
  console.log("Status:", response.status);
  console.log("Headers:", JSON.stringify(allHeaders, null, 2));
  console.log("Body:", JSON.stringify(parsed, null, 2));
  console.log("\nOutput directory:", outDir);
}

main().catch(console.error);
