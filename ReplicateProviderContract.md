# Replicate Provider Contract

**Source inputs:** [ArchitectureDecisionRecord.md](./ArchitectureDecisionRecord.md), [ReplicatePipelineSpecification.md](./ReplicatePipelineSpecification.md), [Phase1_Implementation.md](./Phase1_Implementation.md)  
**Mode:** Planning only  
**Constraint:** No code changes, no deployments, no deletions

## 1 Provider Interface

### Inputs

- normalized job payload
- feature type
- original storage reference
- optional preview reference
- job metadata
- retry context
- timeout context

### Outputs

- provider request id
- provider status
- result metadata
- output URL or URLs
- cost metadata
- timing metadata
- error metadata

### Validation

- validate payload shape before provider invocation
- validate storage references before request creation
- validate model mapping inside the provider layer
- validate that only Replicate is used in Phase 1

## 2 Prediction Lifecycle

### Create

- build Replicate request from validated input
- create prediction
- store provider identifiers

### Poll

- poll until terminal state
- persist progress states
- honor timeout budget

### Complete

- download result
- persist final storage key
- record timing and cost data

### Failed

- store error details
- mark job failed
- preserve audit trail

### Cancelled

- attempt cancellation when supported
- mark job cancelled internally
- preserve history and status metadata

## 3 Internal Status Mapping

| Provider state | Internal state |
|---|---|
| Queued | `queued` |
| Running | `running` |
| Succeeded | `succeeded` |
| Failed | `failed` |
| Cancelled | `cancelled` |
| Unknown | `Verification Required` |

## 4 Result Contract

### URLs

- output URL or URLs returned by the provider
- download-ready storage URL after persistence

### Metadata

- provider request id
- model reference
- output format
- job timing

### Errors

- provider error code if present
- provider error message if present
- internal failure stage

### Cost

- estimated cost
- actual cost if available
- cost type or operation label

### Timing

- request start time
- provider completion time
- total processing duration

## 5 Retry Policy

### Retryable

- transient network failure
- temporary provider throttling
- transient timeout before terminal state

### Non-retryable

- invalid payload
- missing or expired asset
- terminal provider rejection
- unsupported request shape

### Timeout

- enforce worker and provider timeout bounds
- fail after budget exhaustion

### Cancellation

- allow cancellation when the job is no longer valid or admin requests it
- treat cancellation as terminal

## 6 Logging

### Audit

- log provider request id
- log model reference
- log final outcome
- preserve support traceability

### Provider logs

- log request creation
- log polling transitions
- log terminal state

### Cost logs

- log estimated or actual cost
- associate cost with the job and operation

## 7 Security

### Token handling

- keep Replicate token server-side only
- never pass token to the client

### Secret location

- store token in the canonical server secret source
- inject into provider layer at runtime only

### Never expose secrets

- no secrets in logs
- no secrets in audit output
- no secrets in frontend bundles

## 8 Future Compatibility

- allow model replacement inside the provider layer
- allow multiple Replicate models inside the provider layer
- do not allow multiple AI providers in Phase 1

## 9 Decision Table

| Item | Decision |
|---|---|
| Provider interface | KEEP |
| Prediction lifecycle | KEEP |
| Status mapping | KEEP |
| Result contract | KEEP |
| Retry policy | KEEP |
| Timeout policy | KEEP |
| Cancellation | KEEP |
| Audit logging | KEEP |
| Provider logging | KEEP |
| Cost logging | KEEP |
| Token handling | KEEP |
| Secret location | KEEP |
| Model replacement later | KEEP |
| Multiple Replicate models later | KEEP |
| Multiple AI providers in Phase 1 | POSTPONE |
| Unknown provider statuses | VERIFY |
| Exact Replicate model identifiers | VERIFY |

## Final Status

**Provider contract frozen?** No  
**Remaining Verification Required items:** exact Replicate model identifiers, unknown provider status behavior, and any production-only provider behavior not visible in local source  
**Implementation readiness %:** 75%  
**Estimated implementation duration:** 1-2 weeks after provider identifiers and status behavior are verified

