import crypto from "node:crypto";
import fs from "node:fs/promises";
import sharp from "sharp";
const MAX_BYTES = 8_000_000;
export async function handle(input) {
  if (input?.mode === "health") return { ok: true, mode: "health", providerPostCount: 0 };
  if (input?.mode !== "dry_run" || typeof input.imageBase64 !== "string") throw new Error("dry_run imageBase64 is required");
  const image = Buffer.from(input.imageBase64, "base64");
  if (!image.length || image.length > MAX_BYTES) throw new Error("invalid image size");
  const meta = await sharp(image, { limitInputPixels: 20_000_000 }).metadata();
  if (!meta.width || !meta.height) throw new Error("invalid image");
  return { ok: true, mode: "dry_run", providerPostCount: 0, gfpgan: "skipped", width: meta.width, height: meta.height, format: meta.format, inputChecksum: crypto.createHash("sha256").update(image).digest("hex") };
}
async function readRequest() {
  const args = process.argv.slice(2); const stdin = args.includes("--stdin"); const fileIndex = args.indexOf("--input-file");
  if (stdin && fileIndex >= 0 || args.filter((arg) => arg === "--stdin" || arg === "--input-file").length > 1) throw new Error("exactly one input source is required");
  let text;
  if (stdin) text = await new Promise((resolve, reject) => { let data = ""; process.stdin.setEncoding("utf8"); process.stdin.on("data", (chunk) => { data += chunk; if (Buffer.byteLength(data) > 16_000_000) reject(new Error("input is oversized")); }); process.stdin.on("end", () => resolve(data)); process.stdin.on("error", reject); });
  else if (fileIndex >= 0) { if (!args[fileIndex + 1] || args[fileIndex + 1].startsWith("--")) throw new Error("input file is required"); text = await fs.readFile(args[fileIndex + 1], "utf8"); }
  else throw new Error("use --stdin or --input-file");
  text = text.replace(/^\uFEFF/, ""); if (!text.trim()) throw new Error("input is empty");
  return JSON.parse(text);
}
if (process.argv.includes("--stdin") || process.argv.includes("--input-file")) readRequest().then(handle).then((out) => console.log(JSON.stringify(out))).catch((err) => { console.error(err.message); process.exitCode = 1; });
