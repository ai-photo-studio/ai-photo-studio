import fs from "node:fs";
import path from "node:path";

const p = path.join(__dirname, "gfpgan-aux-weight-provenance.json");
const d = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
const ws = d.weights as Array<Record<string, unknown>>;
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };

assert(Array.isArray(ws) && ws.length >= 2, "expected at least two auxiliary weights");
for (const w of ws) {
  assert(typeof w.name === "string" && String(w.name).length > 0, "weight name missing");
  assert(String(w.officialRepository).startsWith("https://github.com/xinntao/facexlib"), "source must be official facexlib");
  assert(typeof w.assetUrl === "string" && String(w.assetUrl).startsWith("https://github.com/xinntao/facexlib/releases/download/"), "asset URL must be official");
  assert(/^[a-f0-9]{64}$/i.test(String(w.sha256)), "sha256 missing/malformed");
  assert(Number(w.expectedSize) > 0, "expected size missing");
  assert(w.checksumSource === "independently-calculated", "checksum source must be independently-calculated (no publisher digest)");
  assert(w.redistributionApproved === false, "redistribution not approved");
  assert(w.loadCallsUseWeightsOnly === false, "must record that load calls omit weights_only (require env enforcement)");
}
assert(d.runtimeDownloadAllowed === false, "runtime download not allowed");
assert(d.weightBundlingAllowed === false, "weight bundling not allowed");
assert(d.productionRoutingAllowed === false, "production routing not allowed");
assert(d.offlineConstructionResult === "blocked", "offline construction must be blocked (provenance unresolved)");

console.log("gfpgan aux weight provenance validator passed");
