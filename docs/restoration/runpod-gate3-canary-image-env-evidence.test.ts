import fs from "node:fs";
import path from "node:path";

const manifestPath = path.join(__dirname, "runpod-gate3-canary-image-env-evidence.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const expectedDigest = "sha256:29ca5aa0aae46ab03719c52ae25fa98a61830adbbc8b317bd244ffb7ff837d9b";

assert(manifest.imageDigest === expectedDigest, "image digest must match the Gate 3 approved digest");
assert(manifest.method === "anonymous GHCR Docker Registry HTTP API v2 (no docker pull, no registry login, no packages token)", "capture method must be read-only and anonymous");

const config = (manifest.config ?? {}) as Record<string, unknown>;
assert(config.User === "workeruser", "runtime user must be the non-root workeruser");
assert(Array.isArray(config.Env), "image Env must be an array");
const envList = config.Env as string[];
assert(envList.includes("TORCH_FORCE_WEIGHTS_ONLY_LOAD=1"), "image Env must already bake in TORCH_FORCE_WEIGHTS_ONLY_LOAD=1");
assert(Array.isArray(config.Cmd) && (config.Cmd as string[]).join(" ") === "python3.10 -u /srv/handler/handler.py", "image Cmd must match the published handler entrypoint");
assert(manifest.torchForceWeightsOnlyLoadBakedIn === true, "torchForceWeightsOnlyLoadBakedIn flag must be true");
assert(manifest.runtimeUserNonRoot === true, "runtime user must be recorded as non-root");

const hyp = (manifest.rootCauseHypothesis ?? {}) as Record<string, unknown>;
assert(hyp.classification === "CONTRADICTED", "root-cause hypothesis classification must be CONTRADICTED");
assert(Array.isArray(hyp.evidence) && (hyp.evidence as string[]).length >= 2, "at least two independent pieces of evidence must be recorded");
assert(typeof hyp.realRootCause === "string" && (hyp.realRootCause as string).length > 0, "must honestly record that the real root cause remains unconfirmed, not fabricate one");
assert((hyp.realRootCause as string).toLowerCase().startsWith("unconfirmed"), "must honestly lead with 'unconfirmed', not claim the real root cause was established");

console.log("runpod gate3 canary image env evidence validator passed");
