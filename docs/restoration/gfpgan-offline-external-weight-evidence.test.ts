import fs from "node:fs";
import path from "node:path";

const p = path.join(__dirname, "gfpgan-offline-external-weight-evidence.json");
const d = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
const ws = d.weights as Array<Record<string, unknown>>;
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };

assert(d.offlineConstructionVerified === true, "offline construction must be verified true");
assert(d.networkIsolationMethod.includes("--network none"), "network isolation must use --network none");
assert((d.safeLoadEnv as Record<string, unknown>).TORCH_FORCE_WEIGHTS_ONLY_LOAD === true, "TORCH_FORCE_WEIGHTS_ONLY_LOAD must be enforced");
assert((d.safeLoadEnv as Record<string, unknown>).weightsOnlyFalseFallback === false, "no weights_only=false fallback");
assert(d.runtimeDownloadObserved === false, "no runtime download observed");
assert(Array.isArray(ws) && ws.length === 3, "must have exactly three weights");
for (const w of ws) {
  assert(/^[a-f0-9]{64}$/i.test(String(w.sha256)), `sha256 missing/malformed for ${String(w.name)}`);
  assert(Number(w.size) > 0, `size missing for ${String(w.name)}`);
  assert(String(w.officialUrl).startsWith("https://github.com/"), `unofficial URL for ${String(w.name)}`);
  assert(w.loadedOffline === true, `weight not loaded offline: ${String(w.name)}`);
}
assert(d.gpuInferenceExecuted === false, "GPU inference must remain unexecuted");
assert(d.candidateModified === false, "candidate must not be modified");
assert(d.adoptionApproved === false, "adoption not approved");
assert(d.publicationAllowed === false, "publication not allowed");
assert(d.weightBundlingAllowed === false, "weight bundling not allowed");
assert(d.runtimeDownloadAllowed === false, "runtime download not allowed");
assert(d.productionRoutingAllowed === false, "production routing not allowed");

console.log("gfpgan offline external weight evidence validator passed");
