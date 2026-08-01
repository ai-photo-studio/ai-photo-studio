// Workflow security test: validate that runpod-gate3-one-canary.yml enforces
// strict Gate 3 single-canary constraints: exactly one template POST, one
// endpoint POST, one job submission, no retry/resubmit loop, fixed image/
// volume/GPU/timeout/budget, no secret output, mandatory cleanup in an
// always()/finally step, endpoint+template deletion only (never the volume
// or weights).

import fs from "node:fs";
import yaml from "js-yaml";

const workflowPath = ".github/workflows/runpod-gate3-one-canary.yml";
const raw = fs.readFileSync(workflowPath, "utf8");
const workflow = yaml.load(raw);

const assert = (cond, msg) => {
  if (!cond) throw new Error(`[SECURITY] ${msg}`);
};

const job = workflow.jobs["gate3-canary"];
assert(job !== undefined, "must have gate3-canary job");
const allSteps = job.steps;
const source = allSteps.map((s) => s.run || "").join("\n");

// Trigger / confirmation
assert(workflow.on.workflow_dispatch !== undefined, "must use workflow_dispatch trigger");
assert(!workflow.on.push && !workflow.on.pull_request && !workflow.on.schedule, "must not have automatic triggers");
const confirmationInput = workflow.on.workflow_dispatch.inputs?.confirmation;
assert(confirmationInput?.required === true, "confirmation must be required");
assert(confirmationInput.description.includes("EXECUTE_ONE_GATE3_CANARY"), "description must state the exact confirmation value");
const confirmStep = allSteps.find((s) => s.name && s.name.includes("confirmation"));
assert(confirmStep && confirmStep.run.includes("EXECUTE_ONE_GATE3_CANARY"), "must check confirmation value");

// Permissions
assert(workflow.permissions.contents === "read", "permissions must be contents:read only");
assert(Object.keys(workflow.permissions).length === 1, "no extra permissions allowed");

// Only runs from main
assert(job.if === "github.ref == 'refs/heads/main'", "must only run from the default branch");

// Fixed configuration, no guessing
assert(workflow.env.IMAGE_DIGEST === "sha256:cd57e507aad2e2230b10784f13a51cb1fd860720037a3c280a5ff7ebfe6db286", "image digest must be fixed to the corrected, approved digest");
assert(workflow.env.IMAGE_REPOSITORY === "ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-volume-restore-unpack-fix-dev", "image repository must be fixed to the corrected chain's repository");
assert(workflow.env.NETWORK_VOLUME_ID === "d6a4504x8m", "network volume id must be fixed");
assert(workflow.env.TARGET_DATACENTER_ID === "EU-RO-1", "datacenter must be fixed");
assert(workflow.env.TARGET_GPU_TYPE_ID === "NVIDIA RTX 4000 Ada Generation", "GPU type must be fixed");
assert(workflow.env.TEMPLATE_NAME === "photo-restoration-gate3-canary-template", "template name must be fixed");
assert(workflow.env.ENDPOINT_NAME === "photo-restoration-gate3-canary", "endpoint name must be fixed");
assert(workflow.env.EXECUTION_TIMEOUT_SECONDS === "120", "execution timeout must be fixed to 120 seconds");
assert(workflow.env.IDLE_TIMEOUT_SECONDS === "5", "idle timeout must be fixed to 5 seconds");
assert(workflow.env.COMPUTE_BUDGET_USD === "0.05", "compute budget must be fixed to $0.05");
assert(workflow.env.FIXTURE_EXPECTED_SHA256 === "f4368b08487cfc366f049becbcbc63c7e2345808902021639e051b9c3e08cc1f", "fixture sha256 must be fixed to the canonical value");

// Exactly one template POST, one endpoint POST, one job submission
const templatePosts = (source.match(/-X POST https:\/\/rest\.runpod\.io\/v1\/templates(?!\/)/g) || []).length;
assert(templatePosts === 1, "must have exactly one template POST");
const endpointPosts = (source.match(/-X POST https:\/\/rest\.runpod\.io\/v1\/endpoints(?!\/)/g) || []).length;
assert(endpointPosts === 1, "must have exactly one endpoint POST");
const runPosts = (source.match(/\/run"/g) || []).length;
assert(runPosts === 1, "must submit exactly one job (/run)");

// No retry/resubmit loop around job submission
const submitStep = allSteps.find((s) => s.name && s.name.includes("Submit exactly one restore job"));
assert(submitStep !== undefined, "must have an explicit single-job-submission step");
assert(!/for\s+.*\/run|while\s+.*\/run|until\s+.*\/run/.test(source), "must not loop over job submission");
const pollStep = allSteps.find((s) => s.name && s.name.includes("Poll job status"));
assert(pollStep !== undefined, "must have a polling step");
assert(!pollStep.run.includes('"/run"') && !pollStep.run.includes("/run\""), "poll step must never resubmit a job");
assert(pollStep.run.includes("cancel"), "poll step must cancel at the timeout ceiling instead of resubmitting");

// Fixed image, volume, GPU, timeout, budget flow into the actual API calls
const templateCreateStep = allSteps.find((s) => s.name && s.name.includes("Create template"));
assert(templateCreateStep.run.includes("${IMAGE_REPOSITORY}@${IMAGE_DIGEST}"), "template must pin the exact immutable digest");
assert(templateCreateStep.run.includes('"isServerless": true'), "template must be Serverless");
assert(templateCreateStep.run.includes('"isPublic": false'), "template must be private");
assert(templateCreateStep.run.includes('"ports": []'), "template must expose no ports");
assert(!/dockerEntrypoint|dockerStartCmd/.test(templateCreateStep.run), "template must inherit image ENTRYPOINT/CMD (no override fields)");

const endpointCreateStep = allSteps.find((s) => s.name && s.name.includes("Create endpoint"));
assert(endpointCreateStep.run.includes("$NETWORK_VOLUME_ID"), "endpoint must attach the fixed network volume");
assert(endpointCreateStep.run.includes('"gpuCount": 1'), "endpoint must request exactly one GPU");
assert(endpointCreateStep.run.includes('"workersMin": 0'), "endpoint workersMin must be 0");
assert(endpointCreateStep.run.includes('"workersMax": 1'), "endpoint workersMax must be 1");
assert(endpointCreateStep.run.includes("$IDLE_TIMEOUT_SECONDS") || endpointCreateStep.run.includes("idle"), "endpoint must set the fixed idle timeout");
assert(endpointCreateStep.run.includes("EXECUTION_TIMEOUT_SECONDS"), "endpoint executionTimeoutMs must derive from the fixed timeout");
assert(endpointCreateStep.run.includes('"dataCenterIds": [$dc]'), "endpoint must target exactly one fixed datacenter (single-element array), no fallback list");

assert(submitStep.run.includes('"mode": "restore"'), "job must use restore mode");
assert(submitStep.run.includes("imageBase64"), "job must send inline base64 image");
assert(!/https?:\/\/[^"\s]*\.(png|jpg|jpeg)/i.test(submitStep.run), "job input must never reference a URL image");
assert(submitStep.run.includes("base64 -w0"), "image must be base64-encoded inline, not passed as a URL");

// No PUT/PATCH used for mutation (only POST create, DELETE cleanup)
assert(!/-X PUT|-X PATCH/.test(source), "must not use PUT/PATCH");

// No secret output: RUNPOD_API_KEY / AWS creds never echoed or curl-verbose-dumped
const directEchoPattern = /echo\b[^\n]*\$\{?(RUNPOD_API_KEY|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)\}?/;
const verboseCurlPattern = /curl\s+[^\n]*(-v\b|--verbose|--trace)/;
assert(!directEchoPattern.test(source), "must never echo RUNPOD_API_KEY or AWS credentials");
assert(!verboseCurlPattern.test(source), "must not use verbose/trace curl output");
assert(!/set\s+-[^\n]*x/.test(source), "set -x is prohibited (would dump secrets to logs)");
assert(job.env.RUNPOD_API_KEY === "${{ secrets.RUNPOD_API_KEY }}", "RUNPOD_API_KEY must come from GitHub Secrets only");
assert(job.env.AWS_ACCESS_KEY_ID === "${{ secrets.RUNPOD_S3_ACCESS_KEY }}", "AWS_ACCESS_KEY_ID must use the exact repository secret name");
assert(job.env.AWS_SECRET_ACCESS_KEY === "${{ secrets.RUNPOD_S3_SECRET_KEY }}", "AWS_SECRET_ACCESS_KEY must use the exact repository secret name");
assert(!/upload-artifact/.test(raw), "must not upload raw response artifacts");

// Mandatory cleanup in an always()/finally step
const cleanupStep = allSteps.find((s) => s.name && s.name.includes("Mandatory cleanup"));
assert(cleanupStep !== undefined, "must have an explicit mandatory cleanup step");
assert(cleanupStep.if === "always()", "cleanup step must run with if: always()");
assert(/-X DELETE.*\/v1\/endpoints\//.test(cleanupStep.run), "cleanup must delete the endpoint");
assert(/-X DELETE.*\/v1\/templates\//.test(cleanupStep.run), "cleanup must delete the template");
assert(!/-X DELETE.*networkvolumes/.test(cleanupStep.run), "cleanup must never delete the Network Volume");
assert(!/-X DELETE.*networkvolumes/.test(source), "must never call DELETE on networkvolumes anywhere in the workflow");
assert(cleanupStep.run.includes("network_volume_preserved"), "cleanup must verify and report volume preservation");
assert(cleanupStep.run.includes("CRITICAL"), "cleanup must report CRITICAL and fail if it cannot prove teardown");
assert(cleanupStep.run.includes("/health"), "cleanup must verify no active workers via /health before/around teardown");

// Success gate exists and is evaluated before cleanup, not bypassed
const successGateStep = allSteps.find((s) => s.name === "Success gate");
assert(successGateStep !== undefined, "must have an explicit success gate step");
assert(successGateStep.run.includes("gpu_inference_executed"), "success gate must require gpu_inference_executed=true");
assert(successGateStep.run.includes("provider_post_count"), "success gate must require providerPostCount=0");
assert(successGateStep.run.includes("COMPUTE_BUDGET_USD"), "success gate must enforce the compute budget");
const successGateIndex = allSteps.indexOf(successGateStep);
const cleanupIndex = allSteps.indexOf(cleanupStep);
assert(successGateIndex < cleanupIndex, "success gate must run before cleanup so cleanup can react to failures");

// No unsupported/guessed RunPod fields (per rest.runpod.io/v1/openapi.json, verified live)
assert(!/concurrency"\s*:|maxJobs"\s*:|maxRetries"\s*:|activeWorkers"\s*:/.test(source), "must not send unsupported literal concurrency/maxJobs/maxRetries/activeWorkers fields to the REST API (none exist in TemplateCreateInput/EndpointCreateInput)");
assert(!/"tier"\s*:/.test(source), "must not send unsupported template/endpoint fields");

// Defensive template env correction: exactly one non-secret key, plus a
// pre-submit assertion that the template creation response reflects it.
const templateEnvMatch = /"env":\s*(\{[^}]*\})/.exec(templateCreateStep.run);
assert(templateEnvMatch !== null, "template payload must contain a literal env object");
assert(templateEnvMatch[1] === '{ "TORCH_FORCE_WEIGHTS_ONLY_LOAD": "1" }', "template must explicitly set exactly TORCH_FORCE_WEIGHTS_ONLY_LOAD=1 as defense-in-depth, nothing else");
assert(!/RUNPOD_API_KEY|AWS_ACCESS_KEY|AWS_SECRET_ACCESS_KEY|RUNPOD_S3/.test(templateEnvMatch[1]), "template env object must never contain credentials or provider keys");
const preSubmitAssertStep = allSteps.find((s) => s.name && s.name.includes("Pre-submit assertion"));
assert(preSubmitAssertStep !== undefined, "must have an explicit pre-submit assertion step for the template env");
assert(preSubmitAssertStep.run.includes("TORCH_FORCE_WEIGHTS_ONLY_LOAD"), "pre-submit assertion must check TORCH_FORCE_WEIGHTS_ONLY_LOAD");
assert(preSubmitAssertStep.run.includes("exit 1"), "pre-submit assertion must fail closed if the template response does not confirm the intended env");
const preSubmitIndex = allSteps.indexOf(preSubmitAssertStep);
const endpointCreateIndex = allSteps.indexOf(endpointCreateStep);
assert(preSubmitIndex < endpointCreateIndex, "pre-submit assertion must run before endpoint creation");

// Improved sanitized diagnostics, bounded and secret-free
const evidenceStep = allSteps.find((s) => s.name === "Capture and verify evidence");
assert(evidenceStep !== undefined, "must have an explicit evidence-capture step");
assert(evidenceStep.run.includes("cut -c1-200"), "error message/detail must be truncated to a small fixed limit");
assert(evidenceStep.run.includes("cut -c1-500"), "sanitized output object must be truncated to a small fixed limit");
assert(evidenceStep.run.includes("del(.outputBase64)"), "sanitized output must strip outputBase64 before logging");
assert(evidenceStep.run.includes("output_is_json"), "must record whether the job output was valid JSON");
assert(!/outputBase64.*GITHUB_OUTPUT|GITHUB_OUTPUT.*outputBase64/.test(evidenceStep.run), "must never write raw outputBase64 to GITHUB_OUTPUT");
assert(!/stdout|stderr/.test(evidenceStep.run) || /no stdout\/stderr endpoint/.test(evidenceStep.run), "if stdout/stderr is mentioned it must be documenting the API limitation, not inventing a log endpoint");

// Pre-cleanup worker/queue health snapshot, bounded (single call, always())
const healthSnapshotStep = allSteps.find((s) => s.name && s.name.includes("Capture worker/queue health snapshot"));
assert(healthSnapshotStep !== undefined, "must have an explicit pre-cleanup health snapshot step");
assert(healthSnapshotStep.if === "always()", "health snapshot step must run with if: always() so it survives earlier failures");
const healthSnapshotIndex = allSteps.indexOf(healthSnapshotStep);
assert(healthSnapshotIndex < cleanupIndex, "health snapshot must be captured before cleanup begins");
assert(!/for\s+|while\s+|until\s+/.test(healthSnapshotStep.run), "health snapshot must be a single bounded call, not a polling loop");

// Cleanup-path coverage: the same unconditional cleanup logic must apply
// regardless of whether the job succeeded, failed, or was cancelled at the
// timeout ceiling -- it is not gated on final_status, so all three paths
// converge on identical teardown behavior.
assert(!/final_status.*==.*(COMPLETED|FAILED|CANCELLED)/.test(cleanupStep.run), "cleanup must not branch on final job status -- it must behave identically for success, failure, and timeout/cancellation");
assert(cleanupStep.run.includes('"IN_QUEUE"') && cleanupStep.run.includes('"IN_PROGRESS"'), "cleanup must still cancel a job that is unexpectedly still active regardless of the poll loop's own outcome");
assert(cleanupStep.run.includes("workers_active_before_delete"), "cleanup must record worker activity for all three outcome paths");

// Dispatch semantics protection is documented, not just implied
assert(raw.includes("DISPATCH SEMANTICS"), "workflow header must document dispatch semantics protection");
assert(raw.includes("consumes that dispatch's authorization"), "must state that any preflight/workflow defect consumes the dispatch authorization");
assert(raw.includes("NEW, separate, explicit"), "must require a new, separate, explicit approval for any further dispatch");
assert(raw.includes("must NOT be read as license for multiple dispatches"), "must explicitly reject the multiple-dispatches-because-one-job-ran interpretation");
assert(raw.toLowerCase().includes("full stop"), "dispatch semantics documentation must be unambiguous");

console.log("runpod gate3 one-canary workflow security validator PASSED");
console.log("  - workflow_dispatch only, EXECUTE_ONE_GATE3_CANARY confirmation required");
console.log("  - exactly one template POST, one endpoint POST, one job submission");
console.log("  - no retry/resubmit loop; poll-then-cancel at the 120s ceiling");
console.log("  - fixed image digest, volume, GPU, datacenter, timeout, budget, fixture");
console.log("  - secrets from GitHub Secrets only, never echoed or trace-dumped");
console.log("  - mandatory always() cleanup: endpoint+template delete only, volume preserved");
console.log("  - success gate runs before cleanup and requires gpu_inference_executed/providerPostCount=0/budget");
