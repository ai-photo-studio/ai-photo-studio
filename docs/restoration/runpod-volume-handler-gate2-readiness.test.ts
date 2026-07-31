import fs from "node:fs";
import path from "node:path";

const p = path.join(__dirname, "runpod-volume-handler-gate2-readiness.json");
const m = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
const assert = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };

const expectedSource = "158bbbcb82b02db0ca0a2e66bc88a2ccfdb6e374";
const expectedSubtree = "716fc09fc35bb966637bef26f3d4840a7088891b";
const expectedBaseDigest = "sha256:1a74aefec1a7f77ebdbf7fd19ba2b9a816600f1e3d43ac7ce10b3b87367a3895";

assert(m.approved === true, "approval must be true (Gate 2 consumed)");
assert(m.publicationConsumed === true, "publication must be consumed");
assert(m.publicationAllowed === false, "publication must be disabled after consumption (not reusable)");
assert(String(m.imageRepository) === "ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-volume-dev", "imageRepository must be set");
assert(String(m.immutableTag) === "158bbbcb82b02db0ca0a2e66bc88a2ccfdb6e374", "immutableTag must be set to full source SHA");
assert(String(m.publishedDigest) === "sha256:29ca5aa0aae46ab03719c52ae25fa98a61830adbbc8b317bd244ffb7ff837d9b", "publishedDigest must match the published image");
assert(String(m.sourceCommit) === expectedSource, "sourceCommit mismatch");
assert(String(m.sourceSubtree) === expectedSubtree, "sourceSubtree mismatch");
assert(m.floatingTagAllowed === false, "floating tags prohibited");
assert(m.weightBundled === false, "no bundled weights");
assert(m.runtimeDownloadAllowed === false, "no runtime download");
assert(String(m.immutableBaseDigest) === expectedBaseDigest, "immutable base digest mismatch");
assert(m.sdkVersion === "runpod==1.11.0", "runpod SDK must be pinned");
assert(String(m.buildOnlyCiHeadSha) === expectedSource, "CI must have tested the exact frozen source commit");
assert(m.zeroCritical === true, "zero CRITICAL required");
assert(m.cve202532434Absent === true, "CVE-2025-32434 must be absent");

const tests = (m.mountContractTests ?? {}) as Record<string, unknown>;
assert(tests.testAValidMapping === "PASS", "mount-contract Test A must pass");
assert(tests.testBMissingVolumeFailsClosed === "PASS", "mount-contract Test B must pass");
assert(tests.testCInvalidWeightFailsClosed === "PASS", "mount-contract Test C must pass");
assert(tests.testDSecurity === "PASS", "mount-contract Test D must pass");

assert(m.gate3ExecutionAllowed === false, "Gate 3 disabled");
assert(m.productionRoutingAllowed === false, "production routing disabled");

console.log("runpod volume-handler gate2 readiness manifest passed");
