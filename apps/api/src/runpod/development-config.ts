export type RunPodDevelopmentConfig = {
  enabled: boolean;
  gfpganEnabled: boolean;
  benchmarkEnabled: boolean;
  endpointId: string;
  timeoutSeconds: number;
  maxRetries: number;
  maxJobs: number;
  productionRoutingAllowed: boolean;
  approvalGranted?: boolean;
  budget?: number;
};

export const createDisabledRunPodConfig = (): RunPodDevelopmentConfig => ({
  enabled: false,
  gfpganEnabled: false,
  benchmarkEnabled: false,
  endpointId: "",
  timeoutSeconds: 120,
  maxRetries: 0,
  maxJobs: 0,
  productionRoutingAllowed: false,
});

export const createRunPodTestConfig = (
  overrides: Partial<RunPodDevelopmentConfig> = {}
): RunPodDevelopmentConfig => ({ ...createDisabledRunPodConfig(), ...overrides, productionRoutingAllowed: false });

export const validateRunPodDevelopmentConfig = (config: RunPodDevelopmentConfig): RunPodDevelopmentConfig => {
  if (config.productionRoutingAllowed) throw new Error("production routing is prohibited");
  if (!Number.isInteger(config.timeoutSeconds) || config.timeoutSeconds < 1 || config.timeoutSeconds > 120) {
    throw new Error("timeout must be an integer from 1 to 120");
  }
  if (!Number.isInteger(config.maxRetries) || config.maxRetries < 0) throw new Error("retries must be a non-negative integer");
  if (!Number.isInteger(config.maxJobs) || config.maxJobs < 0) throw new Error("jobs must be a non-negative integer");
  if (!config.enabled) {
    if (config.maxJobs !== 0 || config.maxRetries !== 0 || config.endpointId || config.approvalGranted || config.budget) {
      throw new Error("disabled development routing requires empty endpoint and zero jobs retries approval and budget");
    }
    return config;
  }
  if (!config.endpointId.trim() || !config.approvalGranted || !config.budget || config.budget <= 0) {
    throw new Error("enabled development routing requires endpoint, budget, and approval");
  }
  if (config.maxJobs <= 0 || config.maxRetries !== 0) throw new Error("enabled development routing requires positive jobs and zero retries");
  return config;
};
