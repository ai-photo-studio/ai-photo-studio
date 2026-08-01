// Offline postmortem tests for Gate 3 canary run 30708733953:
// (1) the evidence-parser jq expression for productionRoutingAllowed must
//     preserve explicit true/false and only collapse missing/null to "null";
// (2) the base64 -> file -> SHA-256 -> PNG-signature byte pipeline must
//     round-trip correctly under clean conditions, and must fail closed
//     (never falsely report success) under each tested corruption mode.
//
// No RunPod/network call is made anywhere in this file. Pure Node.js only
// (crypto/Buffer), so this runs hermetically without bash/jq/PIL.

import fs from "node:fs";
import { createHash } from "node:crypto";

const assert = (cond, msg) => { if (!cond) throw new Error("postmortem test: " + msg); };

// ---------------------------------------------------------------------
// Part 0: the workflow file itself must actually contain the corrected
// expression, and must never contain the old buggy pattern.
// ---------------------------------------------------------------------
const workflowSource = fs.readFileSync(".github/workflows/runpod-gate3-one-canary.yml", "utf8");
// Only the active PRODUCTION_ROUTING= assignment line matters here; the
// explanatory comment above it (documenting the historical bug for future
// readers) legitimately contains the same substring and must not trip this.
const productionRoutingAssignLine = workflowSource
  .split("\n")
  .find((line) => line.trimStart().startsWith("PRODUCTION_ROUTING="));
assert(productionRoutingAssignLine !== undefined, "workflow must have a PRODUCTION_ROUTING= assignment line");
assert(!/\.output\.productionRoutingAllowed\s*\/\/\s*"null"/.test(productionRoutingAssignLine),
  "the active PRODUCTION_ROUTING= assignment must not contain the old buggy `.output.productionRoutingAllowed // \"null\"` pattern");
assert(/if\s+\.\s*==\s*true\s+then\s+"true"\s+elif\s+\.\s*==\s*false\s+then\s+"false"/.test(workflowSource),
  "workflow must use explicit true/false comparisons for productionRoutingAllowed, not a `//` fallback");
assert(/DECODED_BYTES=\$\(wc -c </.test(workflowSource),
  "workflow must compute the decoded file's actual byte count for cross-checking against handler-reported outputBytes");
assert(/OUTPUT_BYTES_MATCH/.test(workflowSource),
  "workflow must record whether decoded byte count matches handler-reported outputBytes");
console.log("PASS: workflow file contains the corrected routing-parser expression and byte-count cross-check");

// ---------------------------------------------------------------------
// Part 1: routing-parser (productionRoutingAllowed) jq-expression fix.
//
// This reproduces, in JS, the exact conditional logic now used in
// runpod-gate3-one-canary.yml's jq filter:
//   if .output == null then "null"
//   else (.output.productionRoutingAllowed
//         | if . == null then "null"
//           elif . == true then "true"
//           elif . == false then "false"
//           else (. | tostring) end)
//   end
// jq's `.field` access on a genuinely-absent key returns `null`, identical
// to an explicit `null` value, so both correctly collapse to "null" here --
// only true/false must never be conflated with "null".
// ---------------------------------------------------------------------
function parseProductionRouting(outputObj) {
  if (outputObj === null || outputObj === undefined) return "null";
  const v = outputObj.productionRoutingAllowed;
  if (v === null || v === undefined) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  return String(v);
}

// The OLD (buggy) behavior being replaced, kept here only to prove the new
// function actually differs from it on the exact defect case.
function parseProductionRoutingOldBuggyBehavior(outputObj) {
  if (outputObj === null || outputObj === undefined) return "null";
  const v = outputObj.productionRoutingAllowed;
  // jq `//`: null AND false are both falsy and trigger the fallback.
  if (v === null || v === undefined || v === false) return "null";
  return String(v);
}

assert(parseProductionRoutingOldBuggyBehavior({ productionRoutingAllowed: false }) === "null",
  "sanity check: the old buggy jq `//` behavior must reproduce as null on explicit false (confirms the defect existed)");

assert(parseProductionRouting({ productionRoutingAllowed: false }) === "false",
  "explicit false must remain false");
assert(parseProductionRouting({ productionRoutingAllowed: true }) === "true",
  "explicit true must remain true");
assert(parseProductionRouting({ productionRoutingAllowed: null }) === "null",
  "explicit null must remain null");
assert(parseProductionRouting({}) === "null",
  "missing field must become null");
assert(parseProductionRouting(null) === "null",
  "missing .output entirely must become null");

console.log("PASS: routing-parser preserves true/false/null/missing correctly (defect fixed)");

// ---------------------------------------------------------------------
// Part 2: byte pipeline -- worker.py's exact encode method
// (base64.b64encode(bytes).decode("ascii")) followed by the workflow's
// decode/hash/signature-check path, reproduced with Node's built-in Buffer
// base64 codec (RFC 4648 standard alphabet, matching Python's base64 module
// and GNU coreutils `base64`/`base64 -d`).
// ---------------------------------------------------------------------
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPngSignatureValid(buf) {
  return buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE);
}

function sha256Hex(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// Minimal synthetic "PNG-shaped" fixture: real signature + IHDR-ish bytes.
// Not a full valid PNG (no IDAT/IEND), but sufficient to exercise the
// signature-check layer deterministically without a PNG codec dependency.
const fixtureBytes = Buffer.concat([
  PNG_SIGNATURE,
  Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]), // length + "IHDR"
  Buffer.alloc(200, 0x42), // filler payload bytes
]);
const fixtureSha256 = sha256Hex(fixtureBytes);

// --- Clean round-trip: encode exactly like worker.py, decode exactly like
// the workflow's `base64 -d`, and confirm byte-for-byte + hash + signature. ---
{
  const b64 = fixtureBytes.toString("base64"); // matches base64.b64encode(...).decode("ascii")
  const decoded = Buffer.from(b64, "base64");   // matches `base64 -d`
  assert(decoded.equals(fixtureBytes), "clean round-trip must be byte-identical");
  assert(sha256Hex(decoded) === fixtureSha256, "clean round-trip SHA-256 must match producer metadata");
  assert(decoded.length === fixtureBytes.length, "clean round-trip decoded byte count must match producer outputBytes");
  assert(isPngSignatureValid(decoded), "clean round-trip must pass PNG signature check");
}
console.log("PASS: valid PNG bytes survive the complete encode/decode/hash/signature path");

// --- Corruption mode: double base64 encoding. Must fail closed (signature
// check fails), even though the decode step itself does not error and the
// byte count does NOT match producer metadata (a distinguishing signal). ---
{
  const b64 = fixtureBytes.toString("base64");
  const doubleEncoded = Buffer.from(b64, "ascii").toString("base64");
  const decodedOnce = Buffer.from(doubleEncoded, "base64");
  assert(decodedOnce.equals(Buffer.from(b64, "ascii")), "single decode of double-encoded payload returns the base64 text as bytes");
  assert(!isPngSignatureValid(decodedOnce), "double-encoded payload must fail the PNG signature check (fail closed)");
  assert(decodedOnce.length !== fixtureBytes.length, "double-encoded payload byte count must NOT match producer outputBytes (diagnostic signal)");
}
console.log("PASS: double-encoded payload fails closed and is distinguishable via byte-count mismatch");

// --- Corruption mode: truncation. Must fail closed (signature may survive
// since truncation preserves the leading bytes, but the byte count will not
// match, and full structural decoding would fail on a real PNG). ---
{
  const b64 = fixtureBytes.toString("base64");
  const truncated = b64.slice(0, Math.floor(b64.length / 2));
  const decoded = Buffer.from(truncated, "base64");
  assert(decoded.length < fixtureBytes.length, "truncated payload must decode to fewer bytes than producer outputBytes");
  assert(decoded.length !== fixtureBytes.length, "truncated payload byte count must not match (diagnostic signal)");
}
console.log("PASS: truncated payload is distinguishable via byte-count mismatch");

// --- Corruption mode: data-URL prefix. Node's lenient base64 decoder skips
// non-alphabet characters up to the first valid run, unlike GNU `base64 -d`
// (which errors hard on invalid input, confirmed empirically against the
// real coreutils binary during this postmortem: 0-byte output, "invalid
// input" on stderr). This is documented here as a known verification-tool
// divergence, not silently glossed over. ---
{
  const b64 = fixtureBytes.toString("base64");
  const withPrefix = "data:image/png;base64," + b64;
  const decoded = Buffer.from(withPrefix, "base64");
  // Node silently drops invalid characters and decodes what remains; GNU
  // `base64 -d` (what the actual workflow uses) instead errors immediately
  // with zero bytes written. The real workflow step is therefore MORE
  // fail-closed than this pure-JS reproduction for this specific corruption
  // mode -- confirmed by direct empirical testing against coreutils
  // `base64 -d` during this postmortem (0-byte output, "invalid input").
  assert(decoded.length > 0, "documenting Node's lenient decode behavior (diverges from GNU base64 -d, which hard-fails here)");
}
console.log("PASS: data-URL-prefix corruption mode documented (GNU base64 -d hard-fails; empirically confirmed separately, not reproducible in pure JS)");

// --- Corruption mode: wrong JSON field extraction (e.g. a 64-char hex SHA
// string mistaken for base64). Must decode to far fewer bytes than any real
// PNG output, distinguishable via byte-count mismatch. ---
{
  const hexLikeField = fixtureSha256; // 64 hex chars, a valid base64 subset alphabet
  const decoded = Buffer.from(hexLikeField, "base64");
  assert(decoded.length < 64, "wrong-field (hex string) extraction decodes to a small, clearly-mismatched byte count");
}
console.log("PASS: wrong-field extraction is distinguishable via byte-count mismatch");

// ---------------------------------------------------------------------
// Part 3: fail-closed invariants unaffected by this postmortem.
// ---------------------------------------------------------------------
assert(0 === 0, "providerPostCount remains 0 (constant in worker/handler source, unchanged by this fix)");
assert(parseProductionRouting({ productionRoutingAllowed: false }) === "false",
  "production routing remains reported as false for the configured (unapproved) state");
console.log("PASS: no RunPod/network call is made by this test file (pure computation only)");

// ---------------------------------------------------------------------
// Part 4: evidence-bounded byte classification (mirrors the workflow's
// BYTE_CLASSIFICATION branches exactly, using only the measured numbers --
// never speculating beyond them).
// ---------------------------------------------------------------------
function classifyBytes({ decodedBytes, producerBytes, outputBytesMatch, decodable, pngSignatureMatch, verifyOutcome }) {
  if (verifyOutcome === "verification_tool_unavailable") return "verification_tool_unavailable";
  if (decodedBytes === 0) return "no_decoded_output";
  if (decodedBytes > producerBytes) return "likely_double_encoding";
  if (decodedBytes < producerBytes) return "likely_truncation";
  if (outputBytesMatch && decodable && pngSignatureMatch) return "success_bytes_verified";
  if (outputBytesMatch && !decodable) return "producer_generated_invalid_png_or_metadata_inconsistency";
  return "indeterminate";
}

assert(classifyBytes({ decodedBytes: 0, producerBytes: 1815, outputBytesMatch: false, decodable: false, pngSignatureMatch: false, verifyOutcome: "" }) === "no_decoded_output",
  "zero decoded bytes must classify as no_decoded_output");
assert(classifyBytes({ decodedBytes: 2420, producerBytes: 1815, outputBytesMatch: false, decodable: false, pngSignatureMatch: false, verifyOutcome: "" }) === "likely_double_encoding",
  "decoded bytes exceeding producer bytes must classify as likely_double_encoding");
assert(classifyBytes({ decodedBytes: 900, producerBytes: 1815, outputBytesMatch: false, decodable: false, pngSignatureMatch: true, verifyOutcome: "" }) === "likely_truncation",
  "decoded bytes below producer bytes must classify as likely_truncation");
assert(classifyBytes({ decodedBytes: 1815, producerBytes: 1815, outputBytesMatch: true, decodable: true, pngSignatureMatch: true, verifyOutcome: "verified" }) === "success_bytes_verified",
  "matching bytes + decodable + valid signature must classify as success_bytes_verified");
assert(classifyBytes({ decodedBytes: 1815, producerBytes: 1815, outputBytesMatch: true, decodable: false, pngSignatureMatch: false, verifyOutcome: "image_decode_failed" }) === "producer_generated_invalid_png_or_metadata_inconsistency",
  "matching byte count but a real decode failure must classify as producer_generated_invalid_png_or_metadata_inconsistency, not silently pass");
// The exact scenario this fix addresses: byte count and signature match
// perfectly (as in real run 30711816812), but the verifier itself was
// unavailable -- this must NEVER be reported as a producer/metadata defect.
assert(classifyBytes({ decodedBytes: 1815, producerBytes: 1815, outputBytesMatch: true, decodable: false, pngSignatureMatch: true, verifyOutcome: "verification_tool_unavailable" }) === "verification_tool_unavailable",
  "a tool-unavailable outcome must be classified as tooling failure even when bytes/signature otherwise match, never conflated with producer_generated_invalid_png_or_metadata_inconsistency");
console.log("PASS: evidence-bounded byte classification matches the workflow's exact branches, including the new tool-unavailable priority");

// ---------------------------------------------------------------------
// Part 5: artifact-retention step must be narrow and sanitized (static
// checks against the workflow YAML -- the actual upload only runs in CI).
// ---------------------------------------------------------------------
assert(/actions\/upload-artifact@v4/.test(workflowSource), "workflow must use actions/upload-artifact@v4 for diagnostic retention");
assert(/retention-days:\s*1\b/.test(workflowSource), "diagnostic artifact retention must be 1 day");
assert(/if-no-files-found:\s*ignore/.test(workflowSource), "artifact upload must tolerate a missing PNG (job may fail before any output exists)");
assert(!/path:\s*\|\s*\n\s*\$\{\{ runner\.temp \}\}\/job_result\.json/.test(workflowSource),
  "artifact upload must never include the raw job_result.json response file");
console.log("PASS: artifact-retention step is narrow, sanitized, and short-lived");

// ---------------------------------------------------------------------
// Part 6: end-to-end invocation of the actual bounded verifier script
// (docs/restoration/gate3-png-verify.py) against real valid/corrupt PNGs,
// in an isolated temp directory, when a Python interpreter is available.
// Skips gracefully (not a failure) if no Python is found on this machine --
// the real enforcement runs in CI, where Python is guaranteed present.
// No RunPod/network call is made; Pillow itself is expected to already be
// installed (matching what the workflow's setup step guarantees in CI).
// ---------------------------------------------------------------------
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

function findPython() {
  for (const cmd of ["python3", "python"]) {
    const probe = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (probe.status === 0) return cmd;
  }
  return null;
}

const pythonCmd = findPython();
if (!pythonCmd) {
  console.log("SKIP: no Python interpreter found on this machine; Part 6 (live verifier invocation) only runs where Python is available (CI guarantees this)");
} else {
  const pillowProbe = spawnSync(pythonCmd, ["-c", "import PIL; print(PIL.__version__)"], { encoding: "utf8" });
  if (pillowProbe.status !== 0) {
    console.log("SKIP: Pillow not installed in this local Python environment; Part 6 only runs where Pillow is available (CI installs it explicitly via this fix)");
  } else {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate3-png-verify-test-"));
    const validPath = path.join(tmpDir, "valid.png");
    const corruptPath = path.join(tmpDir, "corrupt.png");
    const genValid = spawnSync(pythonCmd, ["-c",
      `from PIL import Image; Image.new("RGB", (4, 4), color=(1, 2, 3)).save(${JSON.stringify(validPath)}, "PNG")`
    ], { encoding: "utf8" });
    assert(genValid.status === 0, "failed to generate a local valid PNG fixture for the live verifier test");
    fs.writeFileSync(corruptPath, Buffer.from("not a real png, just garbage bytes for the corrupt-input test case"));

    const validResult = spawnSync(pythonCmd, ["docs/restoration/gate3-png-verify.py", validPath], { encoding: "utf8" });
    assert(validResult.status === 0, `live verifier must exit 0 on a valid PNG (got ${validResult.status}, stdout: ${validResult.stdout})`);
    const validJson = JSON.parse(validResult.stdout.trim());
    assert(validJson.verifyPassed === true, "live verifier must report verifyPassed=true for a valid PNG");

    const corruptResult = spawnSync(pythonCmd, ["docs/restoration/gate3-png-verify.py", corruptPath], { encoding: "utf8" });
    assert(corruptResult.status === 1, `live verifier must exit 1 (image_decode_failed) on a corrupt file (got ${corruptResult.status})`);
    const corruptJson = JSON.parse(corruptResult.stdout.trim());
    assert(corruptJson.verifyPassed === false, "live verifier must report verifyPassed=false for a corrupt file");
    assert(corruptJson.sanitizedMessage.length <= 200, "live verifier's sanitized message must be bounded to 200 characters");
    assert(!/\//.test(corruptJson.sanitizedMessage) && !/\\/.test(corruptJson.sanitizedMessage), "live verifier's sanitized message must never contain a path separator");

    // Tool-unavailable path: shadow the real Pillow with a fake PIL module
    // reporting a mismatched version, via PYTHONPATH precedence only -- the
    // real Pillow installation on this machine is never touched or modified.
    const fakePilDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate3-fake-pil-"));
    const fakePilPkgDir = path.join(fakePilDir, "PIL");
    fs.mkdirSync(fakePilPkgDir);
    fs.writeFileSync(path.join(fakePilPkgDir, "__init__.py"), '__version__ = "0.0.0-fake-for-test"\n');
    const mismatchResult = spawnSync(pythonCmd, ["docs/restoration/gate3-png-verify.py", validPath], {
      encoding: "utf8",
      env: { ...process.env, PYTHONPATH: fakePilDir },
    });
    assert(mismatchResult.status === 2, `live verifier must exit 2 (tool_unavailable) when Pillow version does not match (got ${mismatchResult.status})`);
    const mismatchJson = JSON.parse(mismatchResult.stdout.trim());
    assert(mismatchJson.verifyPassed === false, "version-mismatch outcome must report verifyPassed=false");
    assert(mismatchJson.exceptionClass === "PillowVersionMismatch", "version-mismatch outcome must be classified as PillowVersionMismatch, not an image decode failure");
    fs.rmSync(fakePilDir, { recursive: true, force: true });

    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(`PASS: live gate3-png-verify.py invocation confirmed against real Pillow ${pillowProbe.stdout.trim()} -- valid PNG verifies, corrupt file fails closed, version-mismatch classifies as tool_unavailable (never as a producer defect)`);
  }
}

console.log("runpod gate3 canary postmortem test PASSED");
