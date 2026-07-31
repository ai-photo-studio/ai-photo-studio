import { createDisabledRunPodConfig, createRunPodTestConfig, validateRunPodDevelopmentConfig } from "./development-config";

const disabled = createDisabledRunPodConfig();
if (disabled.endpointId !== "" || disabled.maxJobs !== 0 || disabled.maxRetries !== 0) throw new Error("disabled defaults are unsafe");
if (validateRunPodDevelopmentConfig(createRunPodTestConfig({ productionRoutingAllowed: true })).productionRoutingAllowed) throw new Error("production routing became enabled");

for (const [name, config] of [
  ["missing approval", createRunPodTestConfig({ enabled: true, endpointId: "dev", budget: 1, maxJobs: 1 })],
  ["missing endpoint", createRunPodTestConfig({ enabled: true, approvalGranted: true, budget: 1, maxJobs: 1 })],
  ["missing budget", createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, maxJobs: 1 })],
  ["zero budget", createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, budget: 0, maxJobs: 1 })],
  ["negative budget", createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, budget: -1, maxJobs: 1 })],
  ["zero jobs", createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, budget: 1, maxJobs: 0 })],
  ["retry limit exceeded", createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, budget: 1, maxJobs: 1, maxRetries: 1 })],
] as const) {
  try {
    validateRunPodDevelopmentConfig(config);
    throw new Error(`unsafe config accepted: ${name}`);
  } catch (error) {
    if ((error as Error).message.startsWith("unsafe config accepted:")) throw error;
  }
}

console.log("current-main RunPod isolation tests passed");
