export const validateCanaryBudget = (input: { ratePerSecond?: number; budget?: number; timeoutSeconds?: number; maximumJobs?: number; retries?: number }) => {
  if (!input.ratePerSecond || input.ratePerSecond <= 0 || !input.budget || input.budget <= 0) throw new Error("verified rate and budget are required");
  if ((input.maximumJobs ?? 0) !== 0 || (input.retries ?? 0) !== 0) throw new Error("remote canaries remain disabled");
  if ((input.timeoutSeconds ?? 120) * input.ratePerSecond > input.budget) throw new Error("budget below maximum billed time");
  return true;
};
