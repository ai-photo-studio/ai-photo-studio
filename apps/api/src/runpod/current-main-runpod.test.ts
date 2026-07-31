import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { createDisabledRunPodConfig, createRunPodTestConfig, validateRunPodDevelopmentConfig } from "./development-config";

void (async () => {
  const workerDir = path.join(__dirname, "..", "..", "runpod-worker-dev");
  const workerEntry = path.join(workerDir, "worker.mjs");
  if (!fs.existsSync(workerDir)) throw new Error("worker package missing");
  if (!fs.existsSync(workerEntry)) throw new Error("worker entry missing");

  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } }).png().toBuffer();
  const imageBase64 = image.toString("base64");
  const healthJson = JSON.parse(execFileSync(process.execPath, [workerEntry, "--stdin"], { input: JSON.stringify({ mode: "health" }), encoding: "utf8" }));
  if (healthJson.ok !== true || healthJson.mode !== "health" || healthJson.providerPostCount !== 0) throw new Error("health contract failed");

  const requestFile = path.join(workerDir, "worker-request.json");
  fs.writeFileSync(requestFile, JSON.stringify({ mode: "dry_run", imageBase64 }));
  const dryJson = JSON.parse(execFileSync(process.execPath, [workerEntry, "--input-file", requestFile], { encoding: "utf8" }));
  if (dryJson.ok !== true || dryJson.mode !== "dry_run" || dryJson.providerPostCount !== 0 || dryJson.gfpgan !== "skipped") throw new Error("dry-run contract failed");
  if (dryJson.inputChecksum !== JSON.parse(execFileSync(process.execPath, [workerEntry, "--input-file", requestFile], { encoding: "utf8" })).inputChecksum) throw new Error("dry-run is not deterministic");

  const corruptFile = path.join(workerDir, "worker-corrupt.json");
  fs.writeFileSync(corruptFile, JSON.stringify({ mode: "dry_run", imageBase64: Buffer.from("bad").toString("base64") }));
  let corruptError = "";
  let corruptCode = 0;
  try {
    execFileSync(process.execPath, [workerEntry, "--input-file", corruptFile], { encoding: "utf8" });
  } catch (error: unknown) {
    const captured = error as { status?: number; stderr?: string; message?: string };
    corruptCode = captured.status ?? 1;
    corruptError = String(captured.stderr ?? captured.message ?? error);
  }
  if (corruptCode === 0 || !corruptError.includes("Input buffer contains unsupported image format")) throw new Error("corrupt rejection failed");

  const disabled = createDisabledRunPodConfig();
  if (disabled.enabled || disabled.gfpganEnabled || disabled.benchmarkEnabled || disabled.endpointId || disabled.maxJobs !== 0 || disabled.maxRetries !== 0 || disabled.productionRoutingAllowed !== false) throw new Error("disabled config unsafe");
  if (createRunPodTestConfig({ productionRoutingAllowed: true }).productionRoutingAllowed) throw new Error("production routing override escaped clamp");
  validateRunPodDevelopmentConfig(disabled);
  console.log("current-main RunPod tests passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
