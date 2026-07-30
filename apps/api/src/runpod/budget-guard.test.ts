import { validateCanaryBudget } from "./budget-guard";
for (const input of [{}, { ratePerSecond: .001, budget: .02, maximumJobs: 1 }, { ratePerSecond: .001, budget: .02, retries: 1 }]) { try { validateCanaryBudget(input); throw new Error("unsafe input accepted"); } catch (error) { if ((error as Error).message === "unsafe input accepted") throw error; } }
if (!validateCanaryBudget({ ratePerSecond: .0001, budget: .02, timeoutSeconds: 120 })) throw new Error("valid budget rejected");
console.log("budget guard tests passed");
