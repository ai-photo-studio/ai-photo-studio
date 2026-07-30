import {
  createDisabledRunPodConfig,
  createRunPodTestConfig,
  validateRunPodDevelopmentConfig,
} from "./development-config";

const disabled = createDisabledRunPodConfig();
if (disabled.enabled || disabled.gfpganEnabled || disabled.benchmarkEnabled || disabled.endpointId || disabled.maxJobs || disabled.maxRetries || disabled.productionRoutingAllowed || disabled.timeoutSeconds !== 120) {
  throw new Error("disabled RunPod defaults are unsafe");
}
if (createRunPodTestConfig({ productionRoutingAllowed: true }).productionRoutingAllowed) throw new Error("test override enabled production routing");
const invalidCases: Array<[string, ReturnType<typeof createRunPodTestConfig>]> = [
  ["enabled without endpoint approval budget or jobs", createRunPodTestConfig({ enabled: true })],
  ["enabled with blank endpoint", createRunPodTestConfig({ enabled: true, endpointId: " ", approvalGranted: true, budget: 1, maxJobs: 1 })],
  ["enabled without approval", createRunPodTestConfig({ enabled: true, endpointId: "dev", budget: 1, maxJobs: 1 })],
  ["enabled without budget", createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, maxJobs: 1 })],
  ["enabled with negative budget", createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, budget: -1, maxJobs: 1 })],
  ["enabled without jobs", createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, budget: 1 })],
  ["enabled with retries", createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, budget: 1, maxJobs: 1, maxRetries: 1 })],
  ["enabled with invalid timeout", createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, budget: 1, maxJobs: 1, timeoutSeconds: 121 })],
  ["disabled with endpoint", createRunPodTestConfig({ endpointId: "dev" })],
  ["disabled with jobs", createRunPodTestConfig({ maxJobs: 1 })],
  ["production routing enabled", { ...createDisabledRunPodConfig(), productionRoutingAllowed: true }],
];
for (const [name, config] of invalidCases) {
  try {
    validateRunPodDevelopmentConfig(config);
    throw new Error(`unsafe config accepted: ${name}`);
  } catch (error) {
    if ((error as Error).message.startsWith("unsafe config accepted:")) throw error;
  }
}
validateRunPodDevelopmentConfig(createRunPodTestConfig({ enabled: true, endpointId: "dev", approvalGranted: true, budget: 1, maxJobs: 1 }));
console.log("runpod development config tests passed");
