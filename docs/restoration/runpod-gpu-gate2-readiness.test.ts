import fs from "node:fs";
import path from "node:path";

const manifestPath = path.join(__dirname, "runpod-gpu-gate2-readiness.json");
const m = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;

const pinnedSha = "e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad";
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

assert(m.approved === false, "readiness must remain unapproved");
assert(m.publicationAllowed === false, "publication must remain disabled");
assert(typeof m.sourceCommit === "string" && m.sourceCommit.length > 0, "source SHA is required");
assert(m.floatingTagAllowed === false, "floating tags are prohibited");
assert(m.weightBundled === false, "weight must not be bundled");
assert(m.runtimeDownloadAllowed === false, "runtime download must be disabled");
assert(m.externalWeightPath === "/models/GFPGANv1.4.pth", "external weight path is fixed");
assert(Number(m.expectedWeightSize) === 348632874, "weight size must match official asset");
assert(String(m.expectedWeightSha256).toLowerCase() === pinnedSha, "weight checksum must be pinned");
assert(m.gate3ExecutionAllowed === false, "Gate 3 execution must be disabled");
assert(m.productionRoutingAllowed === false, "production routing must be disabled");

// For readiness-only state, repository/digest must be empty.
if (m.approved === false && m.publicationAllowed === false) {
  assert(m.imageRepository === "" && m.immutableTag === "" && m.expectedDigest === "", "must not reference a repository/digest while unapproved");
}

console.log("runpod gpu gate2 readiness manifest passed");
