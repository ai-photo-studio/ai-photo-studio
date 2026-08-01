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
assert(workflow.env.EXECUTION_TIMEOUT_MS === "120000", "execution timeout must be fixed to 120000ms");
assert(workflow.env.IDLE_TIMEOUT_SECONDS === "5", "idle timeout must be fixed to 5 seconds");
assert(workflow.env.BUDGET_USD === "0.05", "compute budget must be fixed to $0.05");
assert(workflow.env.RATE_CEILING_USD_PER_SECOND === "0.00016", "rate ceiling must be fixed to $0.00016/second");
assert(workflow.env.WARMUP_TIMEOUT_SECONDS === "180", "warm-up timeout must be fixed to 180 seconds");
assert(workflow.env.TOTAL_LIFECYCLE_SECONDS === "295", "total lifecycle ceiling must be fixed to 295 seconds");
assert(workflow.env.CLEANUP_RESERVE_SECONDS === "10", "cleanup reserve must be fixed to 10 seconds");
assert(workflow.env.FIXTURE_EXPECTED_SHA256 === "f4368b08487cfc366f049becbcbc63c7e2345808902021639e051b9c3e08cc1f", "fixture sha256 must be fixed to the canonical value");

// Lifecycle/budget arithmetic: 295 x 0.00016 = 0.0472 <= 0.05
const lifecycleSeconds = Number(workflow.env.TOTAL_LIFECYCLE_SECONDS);
const rateCeiling = Number(workflow.env.RATE_CEILING_USD_PER_SECOND);
const budget = Number(workflow.env.BUDGET_USD);
const worstCase = Math.round(lifecycleSeconds * rateCeiling * 1e6) / 1e6;
assert(worstCase === 0.0472, `worst-case lifecycle cost must be exactly 0.0472, got ${worstCase}`);
assert(worstCase <= budget, "worst-case lifecycle cost must not exceed the authorized budget");
const oldExecutionTimeoutSeconds = 120;
assert(Number(workflow.env.EXECUTION_TIMEOUT_MS) === oldExecutionTimeoutSeconds * 1000, "execution timeout in ms must still correspond to 120 seconds");

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
assert(endpointCreateStep.run.includes('"workersMin": 1'), "endpoint workersMin must be exactly 1 (warm worker)");
assert(endpointCreateStep.run.includes('"workersMax": 1'), "endpoint workersMax must be exactly 1 -- active worker count cannot broaden");
assert(endpointCreateStep.run.includes("$IDLE_TIMEOUT_SECONDS") || endpointCreateStep.run.includes("idle"), "endpoint must set the fixed idle timeout");
assert(endpointCreateStep.run.includes("EXECUTION_TIMEOUT_MS"), "endpoint executionTimeoutMs must derive from the fixed timeout constant");
assert(endpointCreateStep.run.includes('"dataCenterIds": [$dc]'), "endpoint must target exactly one fixed datacenter (single-element array), no fallback list -- GPU/datacenter cannot broaden");
assert(endpointCreateStep.run.includes('"gpuTypeIds": [$gpu]'), "endpoint must target exactly one fixed GPU type (single-element array), no fallback list -- GPU/datacenter cannot broaden");
assert(endpointCreateStep.run.includes("lifecycle_start_epoch"), "endpoint creation must start the lifecycle timer immediately");

// Warm-up: no job submission before ready state; zero jobs on warm-up timeout
const warmWorkerStep = allSteps.find((s) => s.name && s.name.includes("Warm worker before job submission"));
assert(warmWorkerStep !== undefined, "must have an explicit warm-worker step");
assert(warmWorkerStep.id === "warm-worker", "warm-worker step must have a stable id");
assert(warmWorkerStep.run.includes("WARMUP_TIMEOUT_SECONDS"), "warm-worker step must bound its wait to the fixed warm-up timeout");
assert(warmWorkerStep.run.includes('"job_submitted=false"'), "warm-worker step must never itself mark a job as submitted");
assert(/READY.*-ge 1.*&&.*INITIALIZING.*=.*"0"/.test(warmWorkerStep.run.replace(/\s+/g, " ")), "warm-worker must require workers.ready>=1 AND workers.initializing==0 before proceeding");
assert(warmWorkerStep.run.includes("cancellation_reason=warmup_timeout_no_job"), "warm-worker must record a distinct cancellation reason on warm-up timeout");
assert(warmWorkerStep.run.includes("CLEANUP_RESERVE_SECONDS") && warmWorkerStep.run.includes("insufficient_lifecycle_before_cleanup"), "warm-worker must refuse to submit a job when insufficient lifecycle remains before the cleanup reserve");
assert(!/for\s+.*curl.*\/run\b/.test(warmWorkerStep.run), "warm-worker step must never itself call /run");

const warmWorkerIndex = allSteps.indexOf(warmWorkerStep);
const submitIndex = allSteps.indexOf(submitStep);
assert(warmWorkerIndex < submitIndex, "warm-worker step must run before job submission");
assert(submitStep.if === "success()", "job submission must be gated on all prior steps (including warm-worker) succeeding -- no job before ready state, zero jobs on warm-up timeout");

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
assert(successGateStep.run.includes("BUDGET_USD"), "success gate must enforce the compute budget");
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
assert(evidenceStep.if === "always()", "evidence-capture must run with if: always() so it also reports the no-job-submitted (warm-up timeout) path");
assert(evidenceStep.run.includes("cut -c1-200"), "error message/detail must be truncated to a small fixed limit");
assert(evidenceStep.run.includes("cut -c1-500"), "sanitized output object must be truncated to a small fixed limit");
assert(evidenceStep.run.includes("del(.outputBase64)"), "sanitized output must strip outputBase64 before logging");
assert(evidenceStep.run.includes("output_is_json"), "must record whether the job output was valid JSON");
assert(!/outputBase64.*GITHUB_OUTPUT|GITHUB_OUTPUT.*outputBase64/.test(evidenceStep.run), "must never write raw outputBase64 to GITHUB_OUTPUT");
assert(!/stdout|stderr/.test(evidenceStep.run) || /no stdout\/stderr endpoint/.test(evidenceStep.run), "if stdout/stderr is mentioned it must be documenting the API limitation, not inventing a log endpoint");

// Absent output must never silently become productionRoutingAllowed=true
assert(!/productionRoutingAllowed\s*\/\/\s*true/.test(evidenceStep.run), "must never default productionRoutingAllowed to true when output is absent");
assert(evidenceStep.run.includes('if .output == null then "null"'), "must explicitly report null/unavailable when no output exists, not a fabricated default");
assert(evidenceStep.run.includes('echo "production_routing_allowed=null"'), "the no-job-submitted path must report production_routing_allowed as null, never true");
assert(evidenceStep.run.includes('echo "configured_production_routing_allowed=false"'), "must separately report the fixed, governance-level configuredProductionRoutingAllowed=false");
assert((evidenceStep.run.match(/configured_production_routing_allowed=false/g) || []).length >= 2, "configuredProductionRoutingAllowed=false must be reported in both the job-submitted and no-job-submitted paths");

// No job was submitted before ready state: the evidence step must derive
// its job-submitted branch strictly from steps.submit-job's own output,
// never assume a job ran.
assert(evidenceStep.run.includes("JOB_SUBMITTED"), "evidence step must explicitly branch on whether a job was actually submitted");
assert(evidenceStep.run.includes('steps.submit-job.outputs.job_submitted'), "evidence step must read job_submitted strictly from the submit-job step's own output");

// Job/queue poll step: cancels at the earlier of execution limit or lifecycle
// deadline minus cleanup reserve; still exactly one job, still no resubmit.
assert(pollStep.run.includes("EXECUTION_LIMIT_SECONDS") && pollStep.run.includes("DEADLINE_LIMIT"), "poll step must enforce both the execution limit and the lifecycle-deadline-minus-reserve limit");
assert(pollStep.run.includes("CLEANUP_RESERVE_SECONDS"), "poll step's deadline must account for the cleanup reserve");
assert(!/for\s+.*-X POST.*\/run\b|while\s+.*-X POST.*\/run\b/.test(pollStep.run), "poll step must never loop-resubmit a job");

// This is a static file/YAML/regex test only: it reads the workflow file
// from local disk (fs.readFileSync above) and makes no network or RunPod
// API call of any kind.

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

// FlashBoot: explicitly requested; confirmation is read only from the
// documented EndpointCreateInput/Endpoint schemas (rest.runpod.io/v1/
// openapi.json), never a guessed/floating field; response omission of the
// optional "flashboot" property must be represented as null, never coerced
// to false, and must never by itself fail the run.
assert(endpointCreateStep.run.includes('"flashboot": true'), "endpoint creation payload must explicitly request flashboot: true");
assert(endpointCreateStep.run.includes('echo "flashboot_requested=true"'), "must unconditionally record flashbootRequested=true");
assert(/if \.flashboot == null then "null" else \(\.flashboot \| tostring\) end/.test(endpointCreateStep.run), "flashboot confirmation must distinguish real null/omission from an explicit false, not use a falsy-collapsing // fallback");
assert(endpointCreateStep.run.includes("flashboot_confirmed=${FLASHBOOT_CONFIRMED}"), "must record flashbootConfirmed exactly as read from the response (true/false/null)");
// Fail-closed condition must trigger only on an explicit "false" string
// (i.e. the response really did confirm flashboot is off), never on the
// "null" string that both a missing key and a JSON null produce -- so the
// only string literal compared inside the `if` is "false".
assert(endpointCreateStep.run.includes('"$FLASHBOOT_CONFIRMED" = "false" ]; then'), "must fail closed only when the response explicitly confirms flashboot=false, not on omission");
assert(!/"\$FLASHBOOT_CONFIRMED"\s*=\s*"null"/.test(endpointCreateStep.run), "must never treat the omission/null case as a failure condition");
// No fabricated/guessed RunPod response fields for flashboot confirmation:
// the only field ever read for this purpose is the documented `.flashboot`.
assert(!/flashBootEnabled|flashbootStatus|flashboot_active|flashBootConfirmed/.test(source), "must not invent undocumented flashboot response field names");

// FlashBoot/timestamp evidence threaded through to the always() evidence
// step and Summary on both the job-submitted and no-job-submitted paths.
assert((evidenceStep.run.match(/flashboot_requested=/g) || []).length >= 2, "flashboot_requested must be reported on both the job-submitted and no-job-submitted evidence paths");
assert((evidenceStep.run.match(/flashboot_confirmed=/g) || []).length >= 2, "flashboot_confirmed must be reported on both the job-submitted and no-job-submitted evidence paths");
assert((evidenceStep.run.match(/first_initializing_timestamp=/g) || []).length >= 2, "first_initializing_timestamp must be reported on both evidence paths");
assert((evidenceStep.run.match(/first_ready_timestamp=/g) || []).length >= 2, "first_ready_timestamp must be reported on both evidence paths");
assert(warmWorkerStep.run.includes("first_initializing_timestamp") && warmWorkerStep.run.includes("first_ready_timestamp"), "warm-worker step must capture first-seen initializing/ready timestamps as bounded evidence");
const summaryStep = allSteps.find((s) => s.name === "Summary");
assert(summaryStep !== undefined, "must have a Summary step");
assert(summaryStep.run.includes("flashbootRequested") && summaryStep.run.includes("flashbootConfirmed"), "Summary must surface flashboot evidence");
assert(summaryStep.run.includes("firstInitializingTimestamp") && summaryStep.run.includes("firstReadyTimestamp"), "Summary must surface first-initializing/first-ready timestamp evidence");

// No new RUNPOD_INIT_TIMEOUT and no GPU/datacenter broadening introduced by
// this change: re-verify the fixed single-element arrays and absence of any
// init-timeout env var.
assert(workflow.env.RUNPOD_INIT_TIMEOUT === undefined, "must not add RUNPOD_INIT_TIMEOUT");
assert(!/RUNPOD_INIT_TIMEOUT/.test(source), "must not reference RUNPOD_INIT_TIMEOUT anywhere in the workflow");
assert(endpointCreateStep.run.includes('"dataCenterIds": [$dc]') && endpointCreateStep.run.includes('"gpuTypeIds": [$gpu]'), "GPU/datacenter must remain single-element, unbroadened by the flashboot change");

// Image digest/weights/Gate 2 untouched by this change (re-verified)
assert(workflow.env.IMAGE_DIGEST === "sha256:cd57e507aad2e2230b10784f13a51cb1fd860720037a3c280a5ff7ebfe6db286", "image digest must remain unchanged by the flashboot alignment change");

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
