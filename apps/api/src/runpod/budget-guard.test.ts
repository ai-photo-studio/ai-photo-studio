import { validateCanaryBudget } from "./budget-guard";

const digest = "sha256:2ae480156b955e10d5c678aa5600e23ae22139bf8cba78b9bf2144c1f96d1278";
const sourceSha = "9926ae6d1ff87e64c805e86c6d66e9c8ca6c2eb7";

const invalidInputs = [
  {},
  { approved: false, endpointId: "ep", templateId: "tpl", gpuType: "A4000", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest, sourceSha, expectedSourceSha: sourceSha },
  { approved: true, endpointId: "", templateId: "tpl", gpuType: "A4000", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest, sourceSha, expectedSourceSha: sourceSha },
  { approved: true, endpointId: "ep", templateId: "", gpuType: "A4000", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest, sourceSha, expectedSourceSha: sourceSha },
  { approved: true, endpointId: "ep", templateId: "tpl", gpuType: "", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest, sourceSha, expectedSourceSha: sourceSha },
  { approved: true, endpointId: "ep", templateId: "tpl", gpuType: "A4000", budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest, sourceSha, expectedSourceSha: sourceSha },
  { approved: true, endpointId: "ep", templateId: "tpl", gpuType: "A4000", ratePerSecond: .001, maximumJobs: 0, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest, sourceSha, expectedSourceSha: sourceSha },
  { approved: true, endpointId: "ep", templateId: "tpl", gpuType: "A4000", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 1, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest, sourceSha, expectedSourceSha: sourceSha },
  { approved: true, endpointId: "ep", templateId: "tpl", gpuType: "A4000", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: true, immutableImageDigest: digest, expectedDigest: digest, sourceSha, expectedSourceSha: sourceSha },
  { approved: true, endpointId: "ep", templateId: "tpl", gpuType: "A4000", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: "sha256:bad", expectedDigest: digest, sourceSha, expectedSourceSha: sourceSha },
  { approved: true, endpointId: "ep", templateId: "tpl", gpuType: "A4000", ratePerSecond: .001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest, sourceSha: "bad", expectedSourceSha: sourceSha }
];

for (const input of invalidInputs) {
  try {
    validateCanaryBudget(input as never);
    throw new Error("unsafe input accepted");
  } catch (error) {
    if ((error as Error).message === "unsafe input accepted") throw error;
  }
}

if (!validateCanaryBudget({ approved: true, endpointId: "ep", templateId: "tpl", gpuType: "A4000", ratePerSecond: .0001, budget: .02, maximumJobs: 1, retries: 0, timeoutSeconds: 120, concurrency: 1, productionRoutingAllowed: false, immutableImageDigest: digest, expectedDigest: digest, sourceSha, expectedSourceSha: sourceSha })) throw new Error("valid budget rejected");
console.log("budget guard tests passed");
