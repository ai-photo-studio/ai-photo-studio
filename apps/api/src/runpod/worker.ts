import sharp from "sharp";

export type RunPodWorkerMode = "health" | "dry_run" | "benchmark" | "gfpgan";
export async function runLocalWorker(input: { mode: RunPodWorkerMode; image?: Buffer }) {
  if (input.mode === "health") return { ok: true, mode: "health", providerPostCount: 0 };
  if (!input.image?.length) throw new Error("image is required");
  const meta = await sharp(input.image).metadata();
  if (!meta.width || !meta.height) throw new Error("invalid image");
  return { ok: true, mode: input.mode, providerPostCount: 0, detection: "not_available", embedding: "not_available", gfpgan: "skipped", width: meta.width, height: meta.height };
}
