import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const fixturePath = path.join(__dirname, "runpod-gate3-canary-template-env-payload.fixture.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Record<string, unknown>;

const workflowPath = path.join(__dirname, "..", "..", ".github", "workflows", "runpod-gate3-one-canary.yml");
const workflowRaw = fs.readFileSync(workflowPath, "utf8");
const workflow = yaml.load(workflowRaw) as Record<string, any>;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const job = workflow.jobs["gate3-canary"];
const createTemplateStep = job.steps.find(
  (s: Record<string, unknown>) => s.name === "Create template (POST /v1/templates, exactly once)"
);
assert(createTemplateStep !== undefined, "create-template step must exist");

const match = /"env":\s*(\{[^}]*\})/.exec(createTemplateStep.run as string);
assert(match !== null, "template payload must contain a literal env object");
const actualEnv = JSON.parse(match![1]);

assert(
  JSON.stringify(actualEnv) === JSON.stringify(fixture.env),
  `template env payload must exactly match the deterministic fixture; got ${JSON.stringify(actualEnv)}`
);

const keys = Object.keys(actualEnv);
assert(keys.length === 1 && keys[0] === "TORCH_FORCE_WEIGHTS_ONLY_LOAD", "template env must contain exactly one key");
assert(actualEnv.TORCH_FORCE_WEIGHTS_ONLY_LOAD === "1", "TORCH_FORCE_WEIGHTS_ONLY_LOAD must be the string \"1\"");

const forbiddenPatterns = [/KEY/i, /SECRET/i, /TOKEN/i, /PASSWORD/i, /CREDENTIAL/i, /RUNPOD_API/i, /AWS_/i];
for (const key of keys) {
  for (const pattern of forbiddenPatterns) {
    assert(!pattern.test(key), `template env key "${key}" looks credential-shaped and must never be present`);
  }
}

console.log("runpod gate3 canary template-env payload validator passed");
