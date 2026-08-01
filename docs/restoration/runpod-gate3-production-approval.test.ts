import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..", "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const manifest = JSON.parse(read("docs/restoration/runpod-gate3-readiness.json")) as Record<string, unknown>;
const evidence = JSON.parse(read("docs/restoration/runpod-gate3-canary-run-30713365669-evidence.json")) as Record<string, any>;
const gate2 = JSON.parse(read("docs/restoration/build-invalid-json-cwd-fix-chain-gate2-readiness.json")) as Record<string, any>;
const packet = read("docs/restoration/RUNPOD_GATE3_APPROVAL_PACKET.md");
const protocols = [
  read("docs/restoration/RESTORATION_SYSTEM.md"),
  read("docs/restoration/AGENT_RUNBOOK.md"),
  read("docs/restoration/DECISIONS_AND_HISTORY.md")
];
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const digest = "sha256:91052a538454d2996b6f27b561a8b9f7d07636d396f7dd8d1713baf9f9a5ea0d";
const handlerDigest = "sha256:af09003de27bbdfd1c7ef5bf83139dbbb7de2cee33dd015e900dee8a2b5d87d5";
const cliDigest = "sha256:f97245866394310c3aed065e48ebac63555e8f451480b79eebea98f437cb4052";

assert(["READY_FOR_OWNER_APPROVAL", "BLOCKED"].includes(String((manifest.currentDecision as any)?.classification)), "classification enum invalid");
assert((manifest.currentDecision as any)?.classification === "READY_FOR_OWNER_APPROVAL", "settled evidence must be ready for owner approval");
assert(manifest.approved === false, "Gate 3 must remain unapproved");
assert(manifest.productionRoutingAllowed === false, "manifest routing must be false");
assert(gate2.approved === true && gate2.publicationAllowed === false && gate2.publicationConsumed === true, "Gate 2 must be consumed and closed");
assert(gate2.expectedDigest === digest, "Gate 2 digest mismatch");
assert(manifest.immutableImageDigest === digest, "final digest mismatch");
assert((manifest.immutableParentChain as any).serverlessHandlerDigest === handlerDigest, "handler parent mismatch");
assert((manifest.immutableParentChain as any).cliWorkerDigest === cliDigest, "CLI parent mismatch");

const success = evidence.successCriteria as Record<string, boolean>;
for (const [key, value] of Object.entries(success)) assert(value === true, `success criterion failed: ${key}`);
assert(evidence.runId === "30713365669", "canary run mismatch");
assert(evidence.imageDigest === digest, "canary image mismatch");
assert(evidence.approvalConsumed === true && evidence.secondDispatchAuthorized === false, "canary authorization state mismatch");
assert(evidence.jobEvidence.providerPostCount === 0, "providerPostCount must be zero");
assert(evidence.jobEvidence.productionRoutingAllowed === false, "canary routing must be false");
assert(evidence.jobEvidence.actualCostUsd === 0.001378 && evidence.jobEvidence.budgetUsd === 0.05, "canary cost mismatch");
assert(evidence.cleanupProof.endpointDeleted && evidence.cleanupProof.templateDeleted, "temporary endpoint/template cleanup missing");
assert(evidence.cleanupProof.activeWorkersRemaining === 0, "active workers must be zero");
assert(evidence.cleanupProof.networkVolumePreserved === true, "Network Volume must be preserved");
assert(evidence.resourcesRemaining.endpoints === 0 && evidence.resourcesRemaining.templates === 0 && evidence.resourcesRemaining.activeWorkers === 0, "temporary resources remain");
assert(evidence.resourcesRemaining.weightsUnchanged === true, "weights must remain unchanged");
assert(manifest.weightsPresent === true && manifest.weightsVerified === true, "verified weights missing");
assert((manifest.createdNetworkVolume as any).sizeGb === 10 && (manifest.createdNetworkVolume as any).dataCenterId === "EU-RO-1", "volume identity mismatch");
assert((manifest.createdNetworkVolume as any).weightsUploaded === true, "volume weight state stale");

const decision = manifest.currentDecision as any;
assert(decision.ownerApprovalGranted === true && decision.ownerDecisionRequired === false, "owner approval state missing");
assert(decision.ownerDecision === "APPROVE_GATE_3" && decision.ownerDecisionDigest === digest, "owner approval decision or digest mismatch");
assert(decision.routingActivationAuthorized === false, "routing authorization boundary missing");
assert(decision.gate4Status === "prohibited" && decision.replicateStatus === "production", "provider/gate boundary missing");
assert(Array.isArray(decision.rollbackConditions) && decision.rollbackConditions.length > 0, "rollback conditions missing");
for (const required of ["does not approve Gate 3", "does not authorize dispatch", "does not authorize deployment", "does not authorize routing", "does not authorize Gate 4", "Replicate remains production", "READY_FOR_OWNER_APPROVAL"]) {
  assert(packet.includes(required), `packet boundary missing: ${required}`);
}
assert(protocols.every((text) => text.includes("Gate 3 production-approval audit")), "protected protocol appendices missing");
assert(protocols.every((text) => text.includes("pending-weight statements are historical and superseded")), "pending-weight historical boundary missing");
assert(protocols.every((text) => text.includes(digest)), "exact digest missing from protected protocol appendices");

const currentSections = [packet, ...protocols].map((text) => text.slice(text.lastIndexOf("Gate 3 production-approval audit")));
for (const section of currentSections) {
  assert(!/current.{0,80}(pending|not uploaded|regionCompatibilityResolved: false)/i.test(section), "stale claim presented as current");
}

console.log("Gate 3 production-approval validator passed: READY_FOR_OWNER_APPROVAL");
