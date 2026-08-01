import fs from "node:fs";
import yaml from "js-yaml";

const workflowPath = ".github/workflows/runpod-upload-gate3-weights.yml";
const workflow = yaml.load(fs.readFileSync(workflowPath, "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(`[SECURITY] ${message}`);
};

const expected = [
  ["https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth", "models/GFPGANv1.4.pth", "348632874", "e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad"],
  ["https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth", "models/facexlib/detection_Resnet50_Final.pth", "109497761", "6d1de9c2944f2ccddca5f5e010ea5ae64a39845a86311af6fdf30841b0a5a16d"],
  ["https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth", "models/facexlib/parsing_parsenet.pth", "85331193", "3d558d8d0e42c20224f13cf5a29c79eba2d59913419f945545d8cf7b72920de2"],
];

assert(workflow.on.workflow_dispatch, "workflow_dispatch is required");
assert(!workflow.on.push && !workflow.on.pull_request && !workflow.on.schedule, "automatic triggers are prohibited");
assert(workflow.on.workflow_dispatch.inputs.confirmation.required === true, "confirmation is required");
assert(workflow.on.workflow_dispatch.inputs.confirmation.description.includes("UPLOAD_THREE_GATE3_WEIGHTS"), "exact confirmation missing");
assert(workflow.permissions.contents === "read", "contents: read is required");
assert(Object.keys(workflow.permissions).length === 1, "no extra permissions allowed");
assert(workflow.env.AWS_DEFAULT_REGION === "eu-ro-1", "region must be fixed");
assert(workflow.env.S3_ENDPOINT === "https://s3api-eu-ro-1.runpod.io", "endpoint must be fixed");
assert(workflow.env.S3_BUCKET === "d6a4504x8m", "bucket must be fixed");

const job = workflow.jobs["upload-verified-weights"];
assert(job.env.AWS_ACCESS_KEY_ID === "${{ secrets.RUNPOD_S3_ACCESS_KEY }}", "access key must use exact secret");
assert(job.env.AWS_SECRET_ACCESS_KEY === "${{ secrets.RUNPOD_S3_SECRET_KEY }}", "secret key must use exact secret");
assert(!JSON.stringify(workflow).includes("RUNPOD_S3_ACCESS_KEY_ID"), "old access-key secret name must be absent");
assert(!JSON.stringify(workflow).includes("RUNPOD_S3_SECRET_ACCESS_KEY"), "old secret-key secret name must be absent");
const source = job.steps.map((step) => step.run || "").join("\n");
assert(source.includes("UPLOAD_THREE_GATE3_WEIGHTS"), "confirmation must be checked");
assert(source.includes("AWS_ACCESS_KEY_ID present=") && source.includes("AWS_SECRET_ACCESS_KEY present="), "presence-only credential preflight is required");
assert(source.includes("required RunPod S3 credentials are absent"), "credential preflight must fail closed");
assert(!/set\s+-[^\n]*x/.test(source), "set -x is prohibited");
assert(!/echo[^\n]*\$\{?AWS_ACCESS_KEY_ID|echo[^\n]*\$\{?AWS_SECRET_ACCESS_KEY|echo[^\n]*\$\{?RUNPOD_S3_ACCESS_KEY|echo[^\n]*\$\{?RUNPOD_S3_SECRET_KEY/.test(source), "secret values must never be echoed");
assert(!/upload-artifact|actions\/cache|cache:/.test(JSON.stringify(workflow)), "weight artifacts and caches are prohibited");
assert(!/--acl|public-read|public-read-write/.test(source), "public ACL is prohibited");
assert(!/\/v1\/(endpoints|templates|pods|workers|jobs)|runpodctl|gpu/i.test(source), "RunPod compute APIs and GPU execution are prohibited");
assert(!/aws\s+s3(ls|api list-objects)/.test(source), "unrelated object listing is prohibited");
assert(!/--retry|for\s+.*aws\s+s3\s+cp|while\s+.*aws\s+s3\s+cp|until\s+.*aws\s+s3\s+cp/.test(source), "upload retry loops are prohibited");
assert(source.includes("head-object"), "existing-object guard is required");
assert(source.includes("sha256sum") && source.includes(".verify"), "remote SHA-256 verification is required");
assert(source.includes("rm -rf") && job.steps.some((step) => step.if === "always()"), "temporary cleanup is required");

for (const [url, key, size, sha] of expected) {
  assert(source.includes(url), `official URL missing: ${url}`);
  assert(source.includes(key), `exact remote key missing: ${key}`);
  assert(source.includes(size), `expected size missing: ${size}`);
  assert(source.includes(sha), `expected SHA missing: ${sha}`);
}

console.log("runpod weight upload workflow security validator passed");
