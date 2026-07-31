import { validateRunPodDevelopmentConfig, createRunPodTestConfig } from "./development-config";

for (const [name, config] of [
  ["enabled missing approval", createRunPodTestConfig({ enabled: true, endpointId: "dev", budget: 1, maxJobs: 1 })],
  ["enabled missing endpoint", createRunPodTestConfig({ enabled: true, approvalGranted: true, budget: 1, maxJobs: 1 })],
  ["enabled missing budget", createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, maxJobs: 1 })],
  ["enabled zero budget", createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, budget: 0, maxJobs: 1 })],
  ["enabled retries above limit", createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, budget: 1, maxJobs: 1, maxRetries: 1 })],
  ["enabled production routing", { ...createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, budget: 1, maxJobs: 1 }), productionRoutingAllowed: true }],
] as const) {
  try {
    validateRunPodDevelopmentConfig(config);
    throw new Error(`unsafe config accepted: ${name}`);
  } catch (error) {
    if ((error as Error).message.startsWith("unsafe config accepted:")) throw error;
  }
}

console.log("current-main RunPod budget tests passed");
