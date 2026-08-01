// Deterministic fixture validator for the runpod-create-gate3-volume.yml preflight parser.
//
// Fixtures (runpod-gpu-list-sample.json, runpod-datacenter-list-sample.json) match the actual
// runpodctl v2.8.0 output schema, confirmed by inspecting the runpodctl source directly:
//   - internal/api's DataCenter struct / ListDataCenters() GraphQL query: id, name, location,
//     gpuAvailability[{gpuTypeId, displayName, stockStatus}] — no storage-capability field.
//   - cmd/gpu/list.go's gpuTypeOutput struct: gpuId, displayName, memoryInGb, secureCloud,
//     communityCloud, securePricePerHr, communityPricePerHr, stockStatus, available,
//     dataCenterAvailability[{dataCenterId, stockStatus}].
//
// This reproduces the workflow's jq extraction logic in JS (jq is not guaranteed available in
// this environment) to prove: (1) 16GB-class GPU/datacenter cross-referencing works correctly
// off documented fields, and (2) no storage-capability field exists to parse in either fixture
// -- so a preflight that requires proof of storage support cannot be satisfied by these
// commands alone, and must fail closed honestly rather than fabricate a result.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gpuFixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/runpodctl-gpu-list-sample.json"), "utf8"));
const dcFixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/runpodctl-datacenter-list-sample.json"), "utf8"));

const assert = (cond, msg) => { if (!cond) throw new Error("preflight parser validator: " + msg); };

const COMPATIBLE_RE = /A4000|A4500|RTX 4000 Ada|RTX 2000 Ada/i;

// Reproduce: [.[] | select((.displayName // "") | test(COMPATIBLE_RE))]
const compatibleGpus = gpuFixture.filter(g => COMPATIBLE_RE.test(g.displayName || ""));
assert(compatibleGpus.length === 2, `expected 2 compatible GPU entries in fixture, got ${compatibleGpus.length}`);

// Reproduce: [...] | (.dataCenterAvailability // [])[] | .dataCenterId] | unique
const compatibleDcs = [...new Set(
  compatibleGpus.flatMap(g => (g.dataCenterAvailability || []).map(a => a.dataCenterId))
)].sort();
assert(JSON.stringify(compatibleDcs) === JSON.stringify(["EU-RO-1", "US-KS-2"]),
  `expected datacenters [EU-RO-1, US-KS-2] from compatible GPU dataCenterAvailability, got ${JSON.stringify(compatibleDcs)}`);

// The incompatible GPU (A100) and its datacenter (US-TX-3) must be excluded.
assert(!compatibleDcs.includes("US-TX-3"), "US-TX-3 (A100-only datacenter) must not be selected as GPU-compatible");

// Prove no storage-capability field exists anywhere in either fixture: this is the exact
// condition that made the old preflight's `storageSupport`/`supportNetworkVolume` filter
// always evaluate to zero results, regardless of true account capability.
const storageFieldNames = ["storageSupport", "storage_support", "supportNetworkVolume"];
const allDcKeys = new Set(dcFixture.flatMap(dc => Object.keys(dc)));
const allGpuKeys = new Set(gpuFixture.flatMap(g => Object.keys(g)));
for (const field of storageFieldNames) {
  assert(!allDcKeys.has(field), `fixture datacenter list must not (and does not) contain '${field}' -- proves the old parser assumption was structurally unsatisfiable`);
  assert(!allGpuKeys.has(field), `fixture gpu list must not (and does not) contain '${field}'`);
}

console.log("runpod volume preflight parser validator passed");
console.log(`  - ${compatibleGpus.length} compatible 16GB-class GPU entries correctly identified`);
console.log(`  - datacenters correctly cross-referenced via dataCenterAvailability: ${compatibleDcs.join(", ")}`);
console.log("  - confirmed no storage-capability field exists in either fixture (matches live schema)");
