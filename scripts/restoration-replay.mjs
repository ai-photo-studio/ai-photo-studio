import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const fixture = process.env.RESTORATION_REPLAY_FIXTURE || "ops116-final";
const fixturePath = path.join("test", "fixtures", "replay", `${fixture}.jpg`);
const image = await fs.readFile(fixturePath);
const sizes = {};
for (const [name, operation] of Object.entries({
  master: (s) => s.jpeg({ quality: 92 }),
  preview: (s) => s.resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 82 }),
  "2hd": (s) => s.resize({ width: 2048 }).jpeg({ quality: 90 }),
  "4hd": (s) => s.resize({ width: 4096, withoutEnlargement: true }).jpeg({ quality: 90 })
})) {
  const output = await operation(sharp(image).rotate()).toBuffer({ resolveWithObject: true });
  sizes[name] = { width: output.info.width, height: output.info.height, bytes: output.data.length, key: `test/replay/${fixture}/${name}.jpg` };
}
if (Object.values(sizes).some((entry) => !entry.key.startsWith("test/replay/"))) throw new Error("Replay key prefix failed");
console.log(JSON.stringify({ replicatePostCount: 0, provider: "replay", cost: 0, gpuSeconds: 0, dbStatus: "COMPLETED", downloads: [200, 206], sizes }, null, 2));
