import fs from "node:fs";
import path from "node:path";
import { createMockConfig } from "../config/env";

const config = createMockConfig();
if (config.runpodEnabled !== false || config.runpodGfpganEnabled !== false || config.runpodBenchmarkEnabled !== false || config.runpodEndpointId !== "" || config.runpodMaxRetries !== 0 || config.runpodJobTimeoutSeconds !== 120) throw new Error("RunPod defaults are unsafe");
const orchestrator = fs.readFileSync(path.join(__dirname, "..", "restoration-providers", "pipeline", "PipelineOrchestrator.ts"), "utf8");
if (orchestrator.includes("runpod/worker") || orchestrator.includes("RUNPOD_")) throw new Error("RunPod worker is registered in production routing");
const worker = fs.readFileSync(path.join(__dirname, "worker.ts"), "utf8");
if (/RUNPOD_API_KEY|fetch\(|https?:\/\//.test(worker) || worker.includes("UnifiedLocalRestorationProvider")) throw new Error("worker can access secrets, network, or legacy provider");
console.log("runpod isolation tests passed");
