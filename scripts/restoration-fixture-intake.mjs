import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const categories = new Set(["clear-face-background-damage", "blurred-face", "scratched", "torn", "severe-missing-region", "multiple-faces", "low-resolution", "unclassified"]);
const flags = new Set(["id", "category", "original", "mask", "flux", "gfpgan", "final", "synthetic", "reason"]);
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i];
  if (!token.startsWith("--")) throw new Error(`Unexpected positional argument: ${token}`);
  const [name, inline] = token.slice(2).split("=", 2);
  if (!flags.has(name)) throw new Error(`Unknown flag: --${name}`);
  if (Object.hasOwn(args, name)) throw new Error(`Duplicate flag: --${name}`);
  const value = inline ?? process.argv[++i];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
  args[name] = value;
}
if (!args.id || !categories.has(args.category) || !args.original) throw new Error("Required: --id --category --original");
const stages = { originalPath: args.original, maskPath: args.mask, fluxPath: args.flux, gfpganPath: args.gfpgan, finalPath: args.final };
const inspect = async (file) => {
  if (!file) return null;
  if (!fs.existsSync(file)) throw new Error(`nonexistent file: ${file}`);
  const body = fs.readFileSync(file); if (!body.length) throw new Error(`empty file: ${file}`);
  const meta = await sharp(body).metadata(); if (!meta.width || !meta.height || !["jpeg", "png", "webp"].includes(meta.format || "")) throw new Error(`corrupt or unsupported image: ${file}`);
  return { path: file, width: meta.width, height: meta.height, format: meta.format, checksum: crypto.createHash("sha256").update(body).digest("hex") };
};
const inspected = Object.fromEntries(await Promise.all(Object.entries(stages).map(async ([key, file]) => [key, await inspect(file)])));
const checksums = Object.values(inspected).filter(Boolean).map((value) => value.checksum);
if (new Set(checksums).size !== checksums.length) throw new Error("duplicate stage checksum");
const fixture = { id: args.id, evidenceType: args.synthetic === "true" ? "synthetic" : "archived", category: args.category, ...stages, availableStages: Object.entries(inspected).filter(([, value]) => value).map(([key]) => key.replace("Path", "")), missingStages: Object.entries(inspected).filter(([, value]) => !value).map(([key]) => key.replace("Path", "")), componentScores: null, finalScore: null, route: null, evidenceLimitations: args.reason || "Operator-provided fixture; identity and landmark metrics unavailable.", intake: inspected };
console.log(JSON.stringify(fixture, null, 2));
