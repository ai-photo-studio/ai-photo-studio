import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const traceDir = "docs/archive/benchmark/results/ops113/2026-07-23T11-53-11";
const known = ["01_original.png", "02_flux_restore.png", "03_gfpgan.png", "07_final_output.png"];
const inspect = async (file, label) => {
  const body = fs.readFileSync(path.join(root, traceDir, file)); const meta = await sharp(body).metadata();
  return { label, path: `${traceDir}/${file}`, width: meta.width, height: meta.height, format: meta.format, checksum: crypto.createHash("sha256").update(body).digest("hex") };
};
const stages = await Promise.all(known.map((file) => inspect(file, file.split("_").slice(1).join("_").replace(".png", ""))));
const queue = { generatedAt: new Date(0).toISOString(), candidates: [{ id: "ops113-2jpeg", groupingConfidence: "verified", groupingEvidence: "10_stage_trace.json records original -> Flux -> GFPGAN -> final checksums and dimensions.", operatorCategory: "unclassified", stages, availableStages: ["original", "flux", "final"], missingStages: ["damage_mask"], evidenceLimitations: "GFPGAN trace is skipped/no-op; it remains available as a referenced artifact but not executed evidence." }], ungrouped: ["ops112", "ops114", "ops116", "2026-07-22_20-54-30", "2026-07-22_22-35-45", "2026-07-22_22-36-24", "2026-07-22_22-36-46", "2026-07-22_22-43-56"].map((id) => ({ id, reason: "Stage-like files found without an explicit trace proving all files belong to one job." })) };
fs.mkdirSync(path.join(root, "test", "reports"), { recursive: true });
fs.writeFileSync(path.join(root, "test", "reports", "restoration-review-queue.json"), JSON.stringify(queue, null, 2));
fs.writeFileSync(path.join(root, "test", "reports", "restoration-review-queue.md"), `# Restoration Review Queue\n\nVerified candidates: ${queue.candidates.length}\n\nUngrouped candidates: ${queue.ungrouped.map((x) => x.id).join(", ")}\n\n${stages.map((x) => `![${x.label}](../../${x.path})`).join("\n")}`);
console.log(JSON.stringify({ providerPostCount: 0, candidates: queue.candidates.length, ungrouped: queue.ungrouped.length }));
