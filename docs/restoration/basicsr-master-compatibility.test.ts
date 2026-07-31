import fs from "node:fs";
import path from "node:path";

const p = path.join(__dirname, "basicsr-master-compatibility.json");
const d = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
const assert = (cond: unknown, msg: string) => { if (!cond) throw new Error(msg); };

assert(d.officialCommit === "8d56e3a045f9fb3e1d8872f92ee4a4f07f886b0a", "official commit missing");
assert(d.officialRepository === "https://github.com/XPixelGroup/BasicSR", "source must be official BasicSR");
assert(typeof d.sourceArchiveSha256 === "string" && /^[a-f0-9]{64}$/.test(String(d.sourceArchiveSha256)), "source archive SHA-256 missing/malformed");
assert(d.licence === "Apache-2.0", "licence must be Apache-2.0");
const cr = d.compatibilityResult as Record<string, unknown>;
assert(cr.importsSucceeded === true, "compatibility imports did not succeed");
assert(cr.gfpganerConstructionSucceeded === true, "GFPGANer construction did not succeed");
assert(cr.functionalTensorErrorResolved === true, "functional_tensor error not resolved");
assert(cr.gpuExecutionUnverified === true, "GPU execution must remain unverified");
const sl = d.safeLoadResult as Record<string, unknown>;
assert(sl.torchForceWeightsOnlyLoad === true, "TORCH_FORCE_WEIGHTS_ONLY_LOAD not enforced");
assert(sl.noWeightsOnlyFalseFallback === true, "weights_only=false fallback present");
assert(d.adoptionRecommended === false, "adoption not recommended must be recorded as false");
assert(d.candidateModified === false, "candidate must not be modified");
assert(d.publicationAllowed === false, "publication not allowed");
assert(d.productionRoutingAllowed === false, "production routing not allowed");
const dv = d.diffV14_2 as Record<string, unknown>;
assert(dv.additionalChangesPresent === true, "diff review must record unrelated changes");

console.log("basicsr master compatibility validator passed");
