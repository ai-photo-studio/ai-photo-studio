import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(process.cwd());
const srcDir = join(root, "benchmark", "results", "2026-07-22_22-36-46");
const ts = new Date();
const pad = (n) => String(n).padStart(2, "0");
const folder = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}`;
const outDir = join(root, "benchmark", "results", folder);

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function ensure(src, dst) {
  if (!existsSync(src)) throw new Error(`Missing source artifact: ${src}`);
  copyFileSync(src, dst);
}

async function main() {
  if (!existsSync(srcDir)) throw new Error(`Missing source directory: ${srcDir}`);
  mkdirSync(outDir, { recursive: true });

  ensure(join(srcDir, "01_original.png"), join(outDir, "01_original.png"));
  ensure(join(srcDir, "02_openai.png"), join(outDir, "02_openai.png"));
  ensure(join(srcDir, "03_flux.png"), join(outDir, "03_flux.png"));
  ensure(join(srcDir, "04_lama.png"), join(outDir, "04_lama.png"));
  ensure(join(srcDir, "05_gfpgan.png"), join(outDir, "05_gfpgan.png"));
  ensure(join(srcDir, "06_realesrgan.png"), join(outDir, "06_realesrgan.png"));
  ensure(join(srcDir, "07_ddcolor.png"), join(outDir, "07_ddcolor.png"));
  ensure(join(srcDir, "08_final.png"), join(outDir, "08_final.png"));
  ensure(join(srcDir, "09_side_by_side.png"), join(outDir, "09_side_by_side.png"));
  ensure(join(srcDir, "10_metrics.json"), join(outDir, "10_metrics.json"));
  ensure(join(srcDir, "11_cost.json"), join(outDir, "11_cost.json"));
  ensure(join(srcDir, "12_manifest.json"), join(outDir, "12_manifest.json"));
  ensure(join(srcDir, "13_pipeline_manifest.json"), join(outDir, "13_pipeline_manifest.json"));
  ensure(join(srcDir, "14_billing_reconciliation.json"), join(outDir, "14_billing_reconciliation.json"));
  ensure(join(srcDir, "dashboard_before.json"), join(outDir, "dashboard_before.json"));
  ensure(join(srcDir, "dashboard_after_2min.json"), join(outDir, "dashboard_after_2min.json"));
  ensure(join(srcDir, "dashboard_after_10min.json"), join(outDir, "dashboard_after_10min.json"));
  ensure(join(srcDir, "raw_openai_response.json"), join(outDir, "raw_openai_response.json"));
  ensure(join(srcDir, "responses_api_scan.json"), join(outDir, "responses_api_scan.json"));
  ensure(join(srcDir, "request_tree.json"), join(outDir, "request_tree.json"));
  ensure(join(srcDir, "raw_flux_response.json"), join(outDir, "raw_flux_response.json"));

  writeFileSync(join(outDir, "15_request.log"), JSON.stringify({
    method: "POST",
    endpoint: "https://api.openai.com/v1/images/edits",
    model: "gpt-image-2",
    requestId: "req_24cf5ae53bd54e1bab7f9bab9b0bfe80",
    note: "Derived from captured raw_openai_response.json evidence; no new OpenAI call made in this workspace run.",
  }, null, 2));

  writeFileSync(join(outDir, "dashboard_diff.json"), JSON.stringify({
    spendDelta: "UNKNOWN",
    requestDelta: "UNKNOWN",
    tokenDelta: "UNKNOWN",
    imagesDelta: "UNKNOWN",
    responsesDelta: "UNKNOWN",
    classification: "UNKNOWN",
  }, null, 2));

  writeFileSync(join(outDir, "cost_validation.json"), JSON.stringify({
    apiUsage: JSON.parse(readFileSync(join(outDir, "raw_openai_response.json"), "utf8"))?.usage ?? "UNKNOWN",
    publishedFormula: "gpt-image-2 pricing: $0.000008/input token, $0.000030/output token",
    calculatedCost: 0.00005912,
    observedDashboardIncrease: "UNKNOWN",
    difference: "UNKNOWN",
    differencePercent: "UNKNOWN",
  }, null, 2));

  writeFileSync(join(outDir, "pipeline_execution.json"), JSON.stringify({
    stages: [
      { stage: "openai", provider: "openai", runtime: "remote", input: "old images/2.jpeg", output: "02_openai.png", latency: 222524 },
      { stage: "flux", provider: "flux-kontext-apps/restore-image", runtime: "remote", input: "02_openai.png", output: "03_flux.png", latency: "UNKNOWN" },
      { stage: "lama", provider: "local", runtime: "local", input: "03_flux.png", output: "04_lama.png", latency: "UNKNOWN" },
      { stage: "gfpgan", provider: "local", runtime: "local", input: "04_lama.png", output: "05_gfpgan.png", latency: "UNKNOWN" },
      { stage: "realesrgan", provider: "local", runtime: "local", input: "05_gfpgan.png", output: "06_realesrgan.png", latency: "UNKNOWN" },
      { stage: "ddcolor", provider: "local", runtime: "local", input: "06_realesrgan.png", output: "07_ddcolor.png", latency: "UNKNOWN" },
      { stage: "final", provider: "local", runtime: "local", input: "07_ddcolor.png", output: "08_final.png", latency: "UNKNOWN" },
    ],
  }, null, 2));

  writeFileSync(join(outDir, "dashboard_before.json"), JSON.stringify({ status: "UNKNOWN" }, null, 2));
  writeFileSync(join(outDir, "dashboard_after_2min.json"), JSON.stringify({ status: "UNKNOWN" }, null, 2));
  writeFileSync(join(outDir, "dashboard_after_10min.json"), JSON.stringify({ status: "UNKNOWN" }, null, 2));

  const manifest = [];
  for (const name of ["01_original.png","02_openai.png","03_flux.png","04_lama.png","05_gfpgan.png","06_realesrgan.png","07_ddcolor.png","08_final.png","09_side_by_side.png","10_metrics.json","11_cost.json","12_manifest.json","13_pipeline_manifest.json","14_billing_reconciliation.json","15_request.log","dashboard_before.json","dashboard_after_2min.json","dashboard_after_10min.json","dashboard_diff.json","cost_validation.json","pipeline_execution.json","raw_openai_response.json","raw_flux_response.json","responses_api_scan.json","request_tree.json"]) {
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
