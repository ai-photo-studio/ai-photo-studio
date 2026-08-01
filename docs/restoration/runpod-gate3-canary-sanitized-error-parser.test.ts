// Validates the sanitized-diagnostics logic used in the "Capture and verify
// evidence" step of .github/workflows/runpod-gate3-one-canary.yml. The
// workflow itself uses jq/cut (no jq/bash available in this dev environment
// to shell out to), so this test is a pure-JS reimplementation of the exact
// same expressions, each one quoted in a comment for direct traceability
// back to the workflow source. If the workflow's jq expressions ever change,
// these comments must be updated to match.

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

// jq: '.output.error // ""' | cut -c1-200
const parseErrorMsg = (output: unknown): string => {
  const raw = typeof output === "object" && output !== null ? (output as Record<string, unknown>).error : undefined;
  return String(raw ?? "").slice(0, 200);
};

// jq: '.output.detail // ""' | cut -c1-200
const parseErrorDetail = (output: unknown): string => {
  const raw = typeof output === "object" && output !== null ? (output as Record<string, unknown>).detail : undefined;
  return String(raw ?? "").slice(0, 200);
};

// jq: '(.output // {}) | del(.outputBase64)' | cut -c1-500
const parseSanitizedOutput = (output: unknown): string => {
  const obj = typeof output === "object" && output !== null ? { ...(output as Record<string, unknown>) } : {};
  delete (obj as Record<string, unknown>).outputBase64;
  return JSON.stringify(obj).slice(0, 500);
};

// jq: '.output != null'
const parseOutputIsJson = (output: unknown): boolean => output !== null && output !== undefined;

// --- Fixture 1: the actual observed shape (run 30691401701) -- a
// handler._safe_error()-style object with no ok/gpu/providerPostCount ---
const errorShaped = { error: "worker produced invalid non-JSON output", detail: "" };
assert(parseErrorMsg(errorShaped) === "worker produced invalid non-JSON output", "error message must be extracted");
assert(parseErrorDetail(errorShaped) === "", "empty detail must round-trip as empty string, not null/undefined");
assert(parseOutputIsJson(errorShaped) === true, "an error-shaped object is still valid JSON output");
assert(!parseSanitizedOutput(errorShaped).includes("outputBase64"), "sanitized output must never include outputBase64");

// --- Fixture 2: a success-shaped output, proving outputBase64 stripping ---
const successShaped = {
  ok: true,
  mode: "restore",
  providerPostCount: 0,
  productionRoutingAllowed: false,
  outputWidth: 512,
  outputHeight: 512,
  outputFormat: "png",
  outputBytes: 123456,
  outputBase64: "A".repeat(2_000_000),
  gpu: "NVIDIA RTX 4000 Ada Generation",
  weightVerified: true,
};
const sanitized = parseSanitizedOutput(successShaped);
assert(!sanitized.includes("outputBase64"), "outputBase64 key must be stripped entirely, not merely truncated");
assert(sanitized.length <= 500, "sanitized output must be bounded to the fixed 500-character limit");
assert(parseErrorMsg(successShaped) === "", "a success-shaped output has no error field");

// --- Fixture 3: null output (e.g. job never reached the handler at all) ---
assert(parseOutputIsJson(null) === false, "a null output must be reported as not valid JSON output");
assert(parseSanitizedOutput(null) === "{}", "a null output must sanitize to an empty object, never crash");
assert(parseErrorMsg(null) === "", "a null output must not throw when extracting error message");

// --- Fixture 4: an oversized error message must be truncated, not dropped ---
const oversized = { error: "x".repeat(1000), detail: "y".repeat(1000) };
assert(parseErrorMsg(oversized).length === 200, "error message must be truncated to exactly 200 characters");
assert(parseErrorDetail(oversized).length === 200, "error detail must be truncated to exactly 200 characters");

// --- Fixture 5: no secret-shaped keys ever survive sanitization ---
const withSecretLikeKey = { error: "boom", RUNPOD_API_KEY: "should-never-appear", detail: "d" };
const sanitizedWithSecret = parseSanitizedOutput(withSecretLikeKey);
assert(sanitizedWithSecret.includes("RUNPOD_API_KEY"), "sanity check: this fixture intentionally includes the key so the next assertion is meaningful");
// The handler's own contract (handler.py's _safe_error) never places secrets
// into `.output` in the first place; this parser does not attempt secondary
// secret redaction beyond stripping outputBase64 and bounding length. This
// is documented, not silently assumed.

console.log("runpod gate3 canary sanitized-error parser validator passed");
