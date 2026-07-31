import { validateCanaryBudget } from "./budget-guard";

const digest = "sha256:2ae480156b955e10d5c678aa5600e23ae22139bf8cba78b9bf2144c1f96d1278";

const invalidInputs = [
  {},
  { approved: false, endpointId: "ep", templateId: "tpl", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest },
  { approved: true, endpointId: "", templateId: "tpl", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest },
  { approved: true, endpointId: "ep", templateId: "", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest },
  { approved: true, endpointId: "ep", templateId: "tpl", budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest },
  { approved: true, endpointId: "ep", templateId: "tpl", ratePerSecond: .001, maximumJobs: 0, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest },
  { approved: true, endpointId: "ep", templateId: "tpl", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 1, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest },
  { approved: true, endpointId: "ep", templateId: "tpl", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: true, immutableImageDigest: digest, expectedDigest: digest },
  { approved: true, endpointId: "ep", templateId: "tpl", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: "sha256:bad", expectedDigest: digest }
];

for (const input of invalidInputs) {
  try {
    validateCanaryBudget(input as never);
    throw new Error("unsafe input accepted");
  } catch (error) {
    if ((error as Error).message === "unsafe input accepted") throw error;
  }
}

if (!validateCanaryBudget({ approved: true, endpointId: "ep", templateId: "tpl", ratePerSecond: .0001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest })) throw new Error("valid budget rejected");
console.log("budget guard tests passed");
