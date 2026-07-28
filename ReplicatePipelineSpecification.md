# Replicate Pipeline Specification

**Source inputs:** [ArchitectureDecisionRecord.md](./ArchitectureDecisionRecord.md), [Phase1_Implementation.md](./Phase1_Implementation.md), [ReplicateBM.md](./ReplicateBM.md)  
**Mode:** Planning only  
**Constraint:** No code changes, no deployments, no deletions

## 1 Pipeline Architecture

The Replicate pipeline is a standalone provider layer. No direct Replicate calls may be scattered through business logic.

### End-to-end flow

```text
Upload
  -> Validation
  -> Queue
  -> Provider
  -> Polling
  -> Result
  -> Storage
  -> Download
```

### Architectural rules

- All Replicate interactions live behind one provider abstraction.
- Business services may prepare requests, but they may not call the Replicate API directly.
- Worker and orchestration code may route through the provider only.
- Future model swaps happen inside the provider layer, not in business logic.

## 2 Provider Abstraction

### Single interface

- One provider interface owns request creation, polling, cancellation, and result handling.

### Single provider

- Phase 1 exposes only one active provider implementation: Replicate.

### Future extensible

- The abstraction may support multiple Replicate models later.
- The abstraction may not support multiple AI providers in Phase 1.

## 3 Replicate Pipeline

### Request builder

- Normalizes job payload into provider input.
- Applies model-specific mapping inside the provider layer.
- Produces a typed request object for the Replicate API.

### Prediction creation

- Creates the Replicate prediction/job.
- Stores prediction identifiers.
- Stores provider version metadata.

### Polling

- Polls until terminal status.
- Persists intermediate states.
- Honors timeout and retry policy.

### Status mapping

- Maps provider states to internal states:
  - `queued`
  - `running`
  - `succeeded`
  - `failed`
  - `cancelled`
- Internal state mapping remains `Verification Required` if exact provider statuses vary by model.

### Retry policy

- Retry transient network/provider failures.
- Do not retry known non-retryable validation errors.
- Preserve idempotency across retries.

### Timeout policy

- Enforce provider and worker timeouts.
- Mark jobs failed when the timeout budget is exceeded.

### Cancellation

- Support cancellation when the job is no longer needed or must be aborted by admin/operator action.
- Cancellation remains provider-layer only.

### Result download

- Download provider output after success.
- Persist final file in storage.
- Store provenance metadata.

### Cleanup

- Clear temporary files and transient provider state.
- Preserve audit and cost records.

### Cost logging

- Record estimated and/or actual provider cost per job.
- Keep cost logging close to provider execution.

### Audit logging

- Record provider request id, model reference, outcome, and timing.
- Never expose secrets in audit entries.

## 4 Business Layer

### Which services may call the provider

- Restoration orchestration service
- Image processing worker
- Any future provider-aware service explicitly routed through the provider abstraction

### Which services may never call Replicate directly

- Controllers
- Route handlers
- Payment services
- Wallet services
- Package/catalog services
- Admin view services
- Storage services
- Auth services
- Monitoring services
- Cleanup services

## 5 Error Handling

### Retryable

- transient network failure
- provider timeout while the job is still valid
- temporary rate limiting
- temporary polling interruption

### Non-retryable

- invalid input payload
- unsupported file type or missing asset
- expired or cancelled job
- irrecoverable provider rejection

### User-visible

- validation failure
- restoration failure
- background removal failure
- timeout after retry exhaustion

### Admin-visible

- provider request id
- failure stage
- retry count
- timeout reason
- cost metadata

## 6 Storage Flow

### Original

- Store the uploaded original.
- Preserve the original key and metadata.

### Preview

- Store preview output when the workflow requires it.
- Keep preview access controlled.

### Processed

- Store final restored or background-removed output.
- Expose download-ready metadata.

### Temporary

- Temporary files may exist only inside the worker/provider flow.
- They are not a public storage artifact.

### Cleanup

- Remove temporary files after success/failure handling.
- Keep audit and job history.

## 7 Queue Lifecycle

### Create

- Build a queue job after validation and persistence.
- Attach provider request context.

### Running

- Worker starts processing.
- Provider request is created.
- Polling begins.

### Completed

- Provider succeeds.
- Result is downloaded and stored.
- Status updates are persisted.

### Failed

- Provider or worker failure occurs.
- Job is marked failed.
- Error metadata is retained.

### Cancelled

- Job is cancelled by operator or lifecycle rule.
- Provider cancellation is attempted when supported.

## 8 Security

### API token

- Replicate token remains server-side only.
- Never expose token to client code or public logs.

### Secrets

- Store secrets in the canonical server secret source.
- Keep secret access limited to provider and bootstrap layers.

### Rate limits

- Respect provider and API rate limits.
- Backoff on throttling.

### Validation

- Validate inputs before queueing.
- Validate model/request shape before provider calls.

## 9 Future Compatibility

- Allow replacing the Replicate model inside the provider layer.
- Allow multiple Replicate models inside the provider layer if future scope requires it.
- Do not allow multiple AI providers in Phase 1.

## 10 Decision Matrix

| Area | Decision |
|---|---|
| Provider abstraction | KEEP |
| Single provider implementation | KEEP |
| Direct Replicate calls in business logic | REMOVE LATER |
| Multiple AI providers in Phase 1 | REMOVE LATER |
| Multiple Replicate models later | SIMPLIFY / ALLOW |
| Request builder | KEEP |
| Prediction creation | KEEP |
| Polling | KEEP |
| Status mapping | KEEP |
| Retry policy | KEEP |
| Timeout policy | KEEP |
| Cancellation | KEEP |
| Result download | KEEP |
| Cleanup | KEEP |
| Cost logging | KEEP |
| Audit logging | KEEP |
| Model identifiers | Verification Required |

## Final Status

**Pipeline frozen?** No  
**Remaining Verification Required items:** exact Replicate model identifiers, provider status mappings, and any production-only provider behavior not visible in local source  
**Implementation readiness %:** 70%  
**Estimated implementation effort:** 1-3 weeks after verification of model identifiers and provider status mapping

