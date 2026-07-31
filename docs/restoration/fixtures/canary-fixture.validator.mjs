import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = __dirname;
const genPath = path.join(fixtureDir, "gen_canary_face_fixture.py");

const EXPECTED_SHA256 = "f4368b08487cfc366f049becbcbc63c7e2345808902021639e051b9c3e08cc1f";
const MAX_PAYLOAD_BYTES = 8_000_000; // CLI worker input limit; Serverless /run is 10MB
const assert = (cond, msg) => { if (!cond) throw new Error("fixture validator: " + msg); };

// 1) generator must exist (reject missing generator)
assert(fs.existsSync(genPath), "fixture generator is missing");

// 2) generator must not fetch/external assets (reject network/download/URL usage)
const genSrc = fs.readFileSync(genPath, "utf8");
for (const bad of ["http://", "https://", "urllib", "requests.get", "requests.post", "wget", "curl ", "urldownload", "socket."]) {
  assert(!genSrc.toLowerCase().includes(bad.toLowerCase()), `generator fetches external asset: ${bad}`);
}
// reject use of Pillow/open() to read an existing customer/personal image file
for (const bad of ["Image.open(", "imread(", "cv2.imread("]) {
  assert(!genSrc.includes(bad), `generator reads an existing image file: ${bad}`);
}

// 3) regenerate reproducibly and check checksum + size (reject checksum drift / oversized)
const tmp = path.join(fixtureDir, ".tmp-canary.png");
try {
  execFileSync("python", [genPath, "--out", tmp], { stdio: "pipe" }).toString();
  const bytes = fs.readFileSync(tmp);
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  assert(sha === EXPECTED_SHA256, "generated fixture checksum drift");
  assert(bytes.length > 0, "generated fixture is empty");
  assert(bytes.length <= MAX_PAYLOAD_BYTES, "generated fixture exceeds payload limit");
  // Verify the PNG actually decodes (broken-stream PNGs must be rejected).
  execFileSync("python", ["-c", "from PIL import Image; Image.open('" + tmp.replace(/\\/g, "/") + "').load()"], { stdio: "pipe" }).toString();
  console.log(`fixture reproduced: size=${bytes.length} sha256=${sha} (PNG decodes)`);
} finally {
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
}

// 4) no pre-committed binary blob is required (generator is the source of truth)
assert(!fs.existsSync(path.join(fixtureDir, "canary.png")), "fixture must be generated, not committed as a binary");

// 5) inference evidence must be declared by the canary (not fabricated here); the
//    generator only produces the input. Expected inference invariants are recorded
//    in the Gate 3 packet; absence of a generated-output hash is acceptable at
//    readiness time but the canary must capture it at execution (offline CPU run).
console.log("canary fixture generator validator passed");
