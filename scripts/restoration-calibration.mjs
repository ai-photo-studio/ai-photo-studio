import fs from "node:fs";
import path from "node:path";
const root = process.cwd();
const manifestPath = path.join(root, "apps/api/src/benchmarks/restoration-calibration-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
for (const fixture of manifest.fixtures) {
  if (fixture.evidenceType !== "archived" && fixture.evidenceType !== "synthetic") throw new Error(`invalid evidence type: ${fixture.id}`);
  for (const key of ["originalPath", "maskPath", "fluxPath", "gfpganPath", "finalPath"]) if (fixture[key] && !fs.existsSync(path.join(root, fixture[key]))) throw new Error(`missing referenced file: ${fixture[key]}`);
  if (fixture.evidenceType === "archived" && fixture.category !== "not_classified" && !fixture.evidenceLimitations) throw new Error(`fabricated classification: ${fixture.id}`);
}
const output = { providerPostCount: 0, fixtures: manifest.fixtures.map(({ id, evidenceType, availableStages, missingStages, componentScores, finalScore, route, evidenceLimitations }) => ({ id, evidenceType, availableStages, missingStages, componentScores, finalScore, route, evidenceLimitations })), missingEvidence: manifest.missingEvidence, metricsCalculated: ["referenced_file_presence"], metricsUnavailable: ["identity_embedding", "landmarks", "damage_scores", "route"] };
fs.mkdirSync(path.join(root, "test", "reports"), { recursive: true });
fs.writeFileSync(path.join(root, "test", "reports", "restoration-calibration.json"), JSON.stringify(output, null, 2));
fs.writeFileSync(path.join(root, "test", "reports", "restoration-calibration.md"), `# Restoration Calibration\n\nVerified fixtures: ${output.fixtures.length}\n\nMissing evidence: ${output.missingEvidence.join(", ")}\n`);
console.log(JSON.stringify(output));
