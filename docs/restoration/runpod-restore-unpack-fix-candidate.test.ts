import fs from "node:fs";
import path from "node:path";

const manifestPath = path.join(__dirname, "runpod-restore-unpack-fix-candidate.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

assert(manifest.classification === "ROOT_CAUSE_CONFIRMED", "classification must be ROOT_CAUSE_CONFIRMED");

const rootCause = (manifest.confirmedRootCause ?? {}) as Record<string, unknown>;
assert(rootCause.file === "apps/api/runpod-worker-gpu-dev/worker.py", "root cause file must reference the approved candidate's source");
assert(String(rootCause.line).includes("out, _ = model.enhance"), "root cause must quote the exact buggy line");
assert(Array.isArray(rootCause.verifiedSourceReferences) && (rootCause.verifiedSourceReferences as string[]).length >= 2, "must cite verified upstream source references, not memory");
assert(String(rootCause.reproductionMethod).toLowerCase().includes("empirical"), "reproduction must be empirical, not merely theorized");
assert(String(rootCause.reproductionMethod).includes("ValueError"), "reproduction must record the exact exception observed");

const audit = (rootCause.dependencyAbiAudit ?? {}) as Record<string, unknown>;
assert(audit.gfpganerConstructorArgsMatch === true, "GFPGANer constructor args must be verified to match");
assert(audit.enhanceSignatureMatch === true, "enhance() signature must be verified to match");
assert(audit.enhanceReturnArityVerified === 3, "enhance() return arity must be verified as 3");
assert(audit.facexlibZeroFaceHandlingVerified === true, "facexlib zero-face handling must be verified");

const candidate = (manifest.correctionCandidate ?? {}) as Record<string, unknown>;
assert(candidate.path === "apps/api/runpod-worker-gpu-dev-restore-unpack-fix/", "correction candidate must live in a new, separate directory");
assert(candidate.published === false, "candidate must not be published");
assert(candidate.built === false, "candidate must not be built");
assert(candidate.deployed === false, "candidate must not be deployed");
assert(candidate.productionRoutingAllowed === false, "candidate must not allow production routing");
assert(typeof candidate.gate2ReviewStatus === "string" && (candidate.gate2ReviewStatus as string).includes("fresh"), "candidate must require a fresh Gate 2 review before publication");
assert(Array.isArray(candidate.newTests) && (candidate.newTests as string[]).length >= 2, "must record the new regression tests added");

assert(Array.isArray(manifest.gate3ApprovalsConsumed) && (manifest.gate3ApprovalsConsumed as string[]).length === 2, "both prior Gate 3 approvals must be recorded as consumed");
assert(String(manifest.gate3Status).includes("approved=false"), "Gate 3 must remain unapproved");
assert(String(manifest.gate4Status).toLowerCase().includes("prohibited"), "Gate 4 must remain prohibited");
assert(String(manifest.replicateStatus).toLowerCase().includes("production"), "Replicate must remain recorded as production");

console.log("runpod restore-unpack-fix candidate evidence validator passed");
