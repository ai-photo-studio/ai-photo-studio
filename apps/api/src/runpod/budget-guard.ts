export const validateCanaryBudget = (input: { approved?: boolean; endpointId?: string; templateId?: string; ratePerSecond?: number | null; budget?: number | null; timeoutSeconds?: number; maximumJobs?: number; retries?: number; concurrency?: number; productionRoutingAllowed?: boolean; immutableImageDigest?: string; expectedDigest?: string }) => {
  if (input.approved !== true) throw new Error("approval required");
  if (!input.endpointId?.trim() || !input.templateId?.trim()) throw new Error("endpoint and template are required");
  if (input.ratePerSecond == null || input.budget == null) throw new Error("verified rate and budget are required");
  if ((input.maximumJobs ?? 0) === 0) throw new Error("at least one job is required");
  if ((input.retries ?? 0) > 0) throw new Error("retries must remain zero");
  if ((input.timeoutSeconds ?? 0) !== 120) throw new Error("timeout must be 120 seconds");
  if ((input.concurrency ?? 0) !== 1) throw new Error("concurrency must be one");
  if (input.productionRoutingAllowed === true) throw new Error("production routing is prohibited");
  if ((input.immutableImageDigest || "") !== (input.expectedDigest || "")) throw new Error("digest mismatch");
  return true;
};
