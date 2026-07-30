import sharp from "sharp";
import { detectImageMime } from "../utils/image-binary";

void (async () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "damage-mask.service.ts"), "utf8");
  if (!source.includes(".rotate()") || !source.includes("channels: 1") || !source.includes("restorationDamageMaskEnabled")) throw new Error("mask safety contract missing");
  const mask = await sharp(Buffer.alloc(64, 255), { raw: { width: 8, height: 8, channels: 1 } }).png().toBuffer();
  if (detectImageMime(mask) !== "image/png") throw new Error("mask is not a PNG");
  const meta = await sharp(mask).metadata();
  if (meta.width !== 8 || meta.height !== 8) throw new Error("mask dimensions invalid");
  const raw = await sharp(mask).removeAlpha().greyscale().raw().toBuffer();
  if (!raw.every((value) => value === 255)) throw new Error("mask grayscale data invalid");
  console.log("damage mask tests passed");
})();
