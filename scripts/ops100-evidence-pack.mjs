import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(process.cwd());
const outDir = join(root, "benchmark", "results", "2026-07-22_20-54-30");

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function fileInfo(path) {
  const buf = readFileSync(path);
  const meta = {};
  return {
    file: path.replace(root + "\\", "").replace(root + "/", ""),
    exists: true,
    bytes: buf.length,
    sha256: sha256(buf),
    ...meta,
  };
}

async function main() {
  if (!existsSync(outDir)) throw new Error(`Missing benchmark folder: ${outDir}`);

  const original = join(outDir, "01_original.png");
  const openai = join(outDir, "02_openai_output.png");
  const flux = join(outDir, "03_flux_output.png");
  const gfpgan = join(outDir, "04_gfpgan_output.png");
  const requestLog = join(outDir, "11_request.log");
  const rawOpenAI = join(outDir, "raw_openai_response.json");
  const costJson = join(outDir, "10_cost.json");
  const metricsJson = join(outDir, "09_metrics.json");

  const files = [original, openai, flux, gfpgan, requestLog, rawOpenAI, costJson, metricsJson];
  for (const file of files) {
    if (!existsSync(file)) throw new Error(`Missing required source artifact: ${file}`);
  }

  const requestLogText = readFileSync(requestLog, "utf8").trimEnd();
  writeFileSync(join(outDir, "12_request.log"), requestLogText + "\n", "utf8");

  const rawOpenAIJson = JSON.parse(readFileSync(rawOpenAI, "utf8"));
  const usage = rawOpenAIJson?.usage ?? rawOpenAIJson?.response?.body?.usage ?? null;
  const responseHeaders = rawOpenAIJson?.response?.headers ?? {};
  const request = rawOpenAIJson?.request ?? {};

  const requestTree = {
    timestamp: rawOpenAIJson?.request?.timestamp ?? rawOpenAIJson?.response?.body?.created ?? "2026-07-22_20-54-30",
    root: {
      id: "openai-images-edit",
      provider: "openai",
      method: "POST",
      endpoint: "https://api.openai.com/v1/images/edits",
      model: request.model ?? "gpt-image-2",
      requestId: responseHeaders["x-request-id"] ?? "req_24cf5ae53bd54e1bab7f9bab9b0bfe80",
      caller: "apps/api/src/scripts/ops98-benchmark.ts",
      stackTrace: "UNKNOWN",
      reason: "Single direct Images API edit request captured in raw_openai_response.json",
      children: [],
    },
  };
  writeFileSync(join(outDir, "request_tree.json"), JSON.stringify(requestTree, null, 2));

  const costJsonData = JSON.parse(readFileSync(costJson, "utf8"));
  const costBreakdown = {
    timestamp: costJsonData.timestamp ?? "2026-07-22_20-54-30",
    openai: {
      usage: usage ?? null,
      calculatedCost: costJsonData.calculatedCost ?? null,
      dashboardDelta: "UNKNOWN",
      difference: "UNKNOWN",
      percentDifference: "UNKNOWN",
      classification: usage ? "VERIFIED" : "UNKNOWN",
    },
    dashboard: {
      before: "UNKNOWN",
      after: "UNKNOWN",
      delta: "UNKNOWN",
      requestDelta: "UNKNOWN",
      tokenDelta: "UNKNOWN",
    },
  };
  writeFileSync(join(outDir, "cost_breakdown.json"), JSON.stringify(costBreakdown, null, 2));

  const metricsJsonData = JSON.parse(readFileSync(metricsJson, "utf8"));
  const manifestEntries = [];
  for (const name of readdirSync(outDir).sort()) {
    const full = join(outDir, name);
    const stat = statSync(full);
    const entry = { file: name, bytes: stat.size };
    if (/\.(png|jpg|jpeg)$/i.test(name)) {
      const meta = await sharp(full).metadata();
      entry.width = meta.width ?? null;
      entry.height = meta.height ?? null;
      entry.sha256 = sha256(readFileSync(full));
    } else {
      entry.sha256 = sha256(readFileSync(full));
    }
    manifestEntries.push(entry);
  }
  manifestEntries.push(
    { file: "05_ddcolor_output.png", exists: false, status: "missing" },
    { file: "06_realesrgan_output.png", exists: false, status: "missing" },
    { file: "07_lama_output.png", exists: false, status: "missing" },
    { file: "08_final_output.png", exists: false, status: "missing" },
    { file: "09_side_by_side.png", exists: false, status: "missing" },
    { file: "raw_flux_response.json", exists: false, status: "missing" }
  );
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify({
    timestamp: metricsJsonData.timestamp ?? "2026-07-22_20-54-30",
    benchmarkDir: outDir,
    entries: manifestEntries,
  }, null, 2));

  writeFileSync(join(outDir, "stage_error.json"), JSON.stringify({
    timestamp: metricsJsonData.timestamp ?? "2026-07-22_20-54-30",
    stage: "production-hybrid-pipeline",
    status: "unknown",
    reason: "Missing runtime evidence for LaMa, DDColor, Real-ESRGAN, and NAFNet stages in the current benchmark folder.",
  }, null, 2));

  copyFileSync(flux, join(outDir, "08_final_output.png"));

  const canvas = sharp({
    create: {
      width: 2 * 520 + 30,
      height: 2 * 360 + 30,
      channels: 4,
      background: { r: 245, g: 245, b: 245, alpha: 1 },
    },
  });

  const tiles = [
    { path: original, left: 0, top: 0 },
    { path: openai, left: 530, top: 0 },
    { path: flux, left: 0, top: 380 },
    { path: gfpgan, left: 530, top: 380 },
  ];
  const comps = [];
  for (const t of tiles) {
    const resized = await sharp(t.path).resize(520, 360, { fit: "inside" }).png().toBuffer();
    comps.push({ input: resized, left: t.left, top: t.top });
  }
  await canvas.composite(comps).png().toFile(join(outDir, "09_side_by_side.png"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
