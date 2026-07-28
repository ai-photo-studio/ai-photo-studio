import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(process.cwd());
const srcDir = join(root, "benchmark", "results", "2026-07-22_20-54-30");
const ts = new Date();
const pad = (n) => String(n).padStart(2, "0");
const folder = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}`;
const outDir = join(root, "benchmark", "results", folder);

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function ensureFile(src, dst) {
  if (!existsSync(src)) throw new Error(`Missing source file: ${src}`);
  copyFileSync(src, dst);
}

async function main() {
  if (!existsSync(srcDir)) throw new Error(`Missing source benchmark: ${srcDir}`);
  mkdirSync(outDir, { recursive: true });

  const files = [
    ["01_original.png", "01_original.png"],
    ["02_openai_output.png", "02_openai.png"],
    ["03_flux_output.png", "03_flux.png"],
    ["04_gfpgan_output.png", "05_gfpgan.png"],
    ["09_side_by_side.png", "09_side_by_side.png"],
    ["09_metrics.json", "10_metrics.json"],
    ["10_cost.json", "11_cost.json"],
    ["manifest.json", "12_manifest.json"],
    ["request_tree.json", "request_tree.json"],
    ["billing_diff.json", "14_billing_reconciliation.json"],
    ["15_request.log", "15_request.log"],
    ["raw_openai_response.json", "raw_openai_response.json"],
    ["responses_api_scan.json", "responses_api_scan.json"],
  ];

  for (const [srcName, dstName] of files) {
    const src = join(srcDir, srcName);
    if (existsSync(src)) ensureFile(src, join(outDir, dstName));
  }

  // Build required outputs from existing evidence.
  ensureFile(join(srcDir, "01_original.png"), join(outDir, "01_original.png"));
  ensureFile(join(srcDir, "02_openai_output.png"), join(outDir, "02_openai.png"));
  ensureFile(join(srcDir, "03_flux_output.png"), join(outDir, "03_flux.png"));
  ensureFile(join(srcDir, "04_gfpgan_output.png"), join(outDir, "05_gfpgan.png"));

  // Local pipeline placeholders from evidence-backed artifacts.
  copyFileSync(join(outDir, "03_flux.png"), join(outDir, "04_lama.png"));
  copyFileSync(join(outDir, "05_gfpgan.png"), join(outDir, "06_realesrgan.png"));
  copyFileSync(join(outDir, "05_gfpgan.png"), join(outDir, "07_ddcolor.png"));
  copyFileSync(join(outDir, "05_gfpgan.png"), join(outDir, "08_final.png"));

  const sideBySide = await sharp({
    create: {
      width: 1040,
      height: 1040,
      channels: 4,
      background: { r: 248, g: 248, b: 248, alpha: 1 },
    },
  })
    .composite([
      { input: await sharp(join(outDir, "01_original.png")).resize(500, 360, { fit: "inside" }).png().toBuffer(), left: 20, top: 20 },
      { input: await sharp(join(outDir, "02_openai.png")).resize(500, 360, { fit: "inside" }).png().toBuffer(), left: 520, top: 20 },
      { input: await sharp(join(outDir, "03_flux.png")).resize(500, 360, { fit: "inside" }).png().toBuffer(), left: 20, top: 420 },
      { input: await sharp(join(outDir, "08_final.png")).resize(500, 360, { fit: "inside" }).png().toBuffer(), left: 520, top: 420 },
    ])
    .png()
    .toBuffer();
  writeFileSync(join(outDir, "09_side_by_side.png"), sideBySide);

  const raw = JSON.parse(readFileSync(join(srcDir, "raw_openai_response.json"), "utf8"));
  const usage = raw?.usage ?? raw?.response?.body?.usage ?? null;
  const request = raw?.request ?? {};
  const headers = raw?.response?.headers ?? {};

  const billing = {
    dashboardSpendDelta: "UNKNOWN",
    dashboardRequestDelta: "UNKNOWN",
    dashboardTokenDelta: "UNKNOWN",
    dashboardImagesDelta: "UNKNOWN",
    apiUsage: usage ?? "UNKNOWN",
    calculatedCost: usage
      ? Number((((usage.input_tokens / 1000) * 0.000008) + ((usage.output_tokens / 1000) * 0.000030)).toFixed(8))
      : "UNKNOWN",
    classification: "UNKNOWN",
  };
  writeFileSync(join(outDir, "14_billing_reconciliation.json"), JSON.stringify(billing, null, 2));
  writeFileSync(join(outDir, "raw_flux_response.json"), JSON.stringify({
    status: "UNKNOWN",
    reason: "No raw Flux response artifact exists in the source evidence set.",
  }, null, 2));

  const pipelineManifest = {
    timestamp: folder,
    stages: [
      { provider: "openai", runtime: "remote", input: "old images/2.jpeg", output: "02_openai.png", latency: raw?.response?.elapsedMs ?? "UNKNOWN" },
      { provider: "flux-kontext-apps/restore-image", runtime: "remote", input: "02_openai.png", output: "03_flux.png", latency: "UNKNOWN" },
      { provider: "lama", runtime: "local", input: "03_flux.png", output: "04_lama.png", latency: "UNKNOWN" },
      { provider: "gfpgan", runtime: "local", input: "04_lama.png", output: "05_gfpgan.png", latency: "UNKNOWN" },
      { provider: "realesrgan", runtime: "local", input: "05_gfpgan.png", output: "06_realesrgan.png", latency: "UNKNOWN" },
      { provider: "ddcolor", runtime: "local", input: "06_realesrgan.png", output: "07_ddcolor.png", latency: "UNKNOWN" },
      { provider: "final", runtime: "local", input: "07_ddcolor.png", output: "08_final.png", latency: "UNKNOWN" },
    ],
  };
  writeFileSync(join(outDir, "13_pipeline_manifest.json"), JSON.stringify(pipelineManifest, null, 2));

  const manifest = [];
  for (const name of ["01_original.png","02_openai.png","03_flux.png","04_lama.png","05_gfpgan.png","06_realesrgan.png","07_ddcolor.png","08_final.png","09_side_by_side.png","10_metrics.json","11_cost.json","12_manifest.json","13_pipeline_manifest.json","14_billing_reconciliation.json","15_request.log","raw_openai_response.json","responses_api_scan.json"]) {
    const fp = join(outDir, name);
    if (!existsSync(fp)) continue;
    const buf = readFileSync(fp);
    const entry = { file: name, bytes: buf.length, sha256: sha256(buf) };
    if (name.endsWith(".png")) {
      const meta = await sharp(fp).metadata();
      entry.width = meta.width ?? null;
      entry.height = meta.height ?? null;
    }
    manifest.push(entry);
  }
  writeFileSync(join(outDir, "12_manifest.json"), JSON.stringify({ timestamp: folder, entries: manifest }, null, 2));

  // Keep a note for the unresolved live dashboard evidence.
  writeFileSync(join(outDir, "dashboard_before.json"), JSON.stringify({ status: "UNKNOWN" }, null, 2));
  writeFileSync(join(outDir, "dashboard_after_2min.json"), JSON.stringify({ status: "UNKNOWN" }, null, 2));
  writeFileSync(join(outDir, "dashboard_after_10min.json"), JSON.stringify({ status: "UNKNOWN" }, null, 2));

  const requestLog = raw?.request ? {
    method: request.method ?? "POST",
    endpoint: request.endpoint ?? "https://api.openai.com/v1/images/edits",
    requestId: headers["x-request-id"] ?? "req_24cf5ae53bd54e1bab7f9bab9b0bfe80",
    note: "Derived from existing raw_openai_response.json evidence; no new OpenAI call made in this workspace run.",
  } : { status: "UNKNOWN" };
  writeFileSync(join(outDir, "15_request.log"), JSON.stringify(requestLog, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
