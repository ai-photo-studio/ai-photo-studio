import fs from "node:fs";
import path from "node:path";

const p = path.join(__dirname, "basicsr-v142-minimal-patch.json");
const d = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };

assert(String(d.v142TagCommit) === "651835a1b9d38dbbdaf45750f56906be2364f01a", "v1.4.2 commit missing");
assert(/^[a-f0-9]{64}$/.test(String(d.sourceArchiveSha256)), "source archive SHA-256 missing/malformed");
assert(/^[a-f0-9]{64}$/.test(String(d.patchSha256)), "patch SHA-256 missing/malformed");
assert(Number(d.patchLinesChanged) === 1, "patch must change exactly one line");
assert(d.patchFile === "basicsr/data/degradations.py", "patch target file must be degradations.py");
assert(d.extraChanges === false, "patch must have no extra changes");
assert(d.licence === "Apache-2.0", "licence must be Apache-2.0");
const c = d.compatibility as Record<string, unknown>;
assert(c.importsSucceeded === true, "compatibility imports did not succeed");
assert(c.gfpganerConstructionSucceeded === true, "GFPGANer construction must succeed");
assert(c.functionalTensorErrorAbsent === true, "functional_tensor error must be absent");
assert(c.gpuExecutionUnverified === true, "GPU execution must remain unverified");
assert(d.candidateModified === false, "candidate must not be modified");
assert(d.adoptionApproved === false, "adoption not approved");
assert(d.publicationAllowed === false, "publication not allowed");
assert(d.runtimeDownloadAllowed === false, "runtime download not allowed");
assert(d.weightBundlingAllowed === false, "weight bundling not allowed");
assert(d.productionRoutingAllowed === false, "production routing not allowed");

console.log("basicsr v1.4.2 minimal patch validator passed");
