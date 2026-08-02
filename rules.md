## Architecture

Current production stack (2026-07-28):

### Frontend
- Cloudflare Pages
- Custom domains: `thannow.com` (active), `www.thannow.com` (deactivated)
- Deployment: direct upload via `npx wrangler pages deploy`

### API
- Northflank (containerized Node.js/Express)
- Auto-deploy from GitHub `main` branch (via git push webhook)
- Dockerfile at `/Dockerfile`
- 1 instance, nf-compute-10 (free tier)

### Database
- Neon PostgreSQL (serverless Postgres)
- Prisma ORM with migrations

### Redis
- Northflank addon (managed Redis, BullMQ queues)
- Connection: `rediss://...addon.code.run:6379`

### Storage
- Cloudflare R2 (S3-compatible object storage)
- Bucket: `ai-photo-studio-storage`

### AI
- Replicate API only (no RunPod, no local workers, no Cloud Run)
- Active model: `sczhou/codeformer` (CodeFormer face restoration)
- Token: `r8_[hidden]` (account: `ai-photo-studio`)

### RunPod Gate 2 Record
- Build-only worker CI passed before publication. Gate 2 published exactly one immutable development image in run `30571185242`: `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-dev:9926ae6d1ff87e64c805e86c6d66e9c8ca6c2eb7` at `sha256:2ae480156b955e10d5c678aa5600e23ae22139bf8cba78b9bf2144c1f96d1278`.
- Verification run `30572333924` passed for source and OCI revision `9926ae6d1ff87e64c805e86c6d66e9c8ca6c2eb7`, image ID `sha256:7388df9962bdff78f033f22956b23b536544c31614956f9c344280be95f34ddf`, `linux/amd64`, `196318730` bytes, entrypoint `["node","worker.mjs"]`, working directory `/worker`, and user `worker`.
- Gate 2 is consumed; any future publication requires new Gate 2 approval and must pin the digest. Gate 3 remote canaries remain separately prohibited pending approval, verified rate, and fixed budget. Gate 4 production activation remains separately prohibited. Replicate remains active production. Publication and verification are not deployment or restoration-quality approval.
- Verification must capture stdout, stderr, exit code, and always-running metadata evidence before an immutable image is classified as defective. Never rebuild a published immutable image merely to repair verification assertions. Canonical restoration documents remain tracked.

### Payments
- Manual proof mode (demo/free during development)

### Pipeline Flow
```
User -> thannow.com (Cloudflare Pages)
                 |
                 v
          api.thannow.com (Northflank)
                 |
POST /api/restorations/:id/items/:itemId/process
                 |
                 v
    restoration.controller.ts -> processItem()
                 |
                 v
    restoration.service.ts -> processItem()
        - runQualityAnalysis()   (local heuristic)
        - analyzeDamage()        (local heuristic)
        - executionCoordinator.runToCompletion()   (see boundary below)
                 |
                 v
    ReplicateProvider.restore()
        - POST sczhou/codeformer to Replicate API
        - Poll until prediction.succeeded
                 |
                 v
    Download output URL from Replicate
                 |
                 v
    Upload to Cloudflare R2 (finals/)
                 |
                 v
    DB update: status = COMPLETED
                 |
                 v
    Download URL generated via signed R2 URL
```

### Restoration Execution Boundary

`PipelineOrchestrator` (`apps/api/src/restoration-providers/pipeline/PipelineOrchestrator.ts`) only ever decides which provider(s) run for a tier (Replicate today, replay/dry-run in test modes). It does not touch R2 or the database. Everything from "the provider returned bytes" through "the item is marked `COMPLETED`" is owned by `RestorationExecutionCoordinator` (`apps/api/src/restoration-providers/pipeline/RestorationExecutionCoordinator.ts`), which is constructed and invoked by `RestorationService.processItem()`.

**Fixed mutation order** (`RestorationExecutionCoordinator.runToCompletion`), no catch inside the coordinator, so a failure at any step aborts everything after it:

1. `ProviderExecutionPort.execute()` — runs the provider(s) for the tier (Replicate `flux_restore` + `gfpgan_face_restore` in production; `replay`/`dry-run` in test modes).
2. `OutputValidationPort.validate()` — decodes the returned bytes with `sharp` and rejects empty buffers, undecodable images, and zero-stage results. Throws `RestorationValidationError`.
3. `FinalVariantsBuilderPort.buildVariants()` — pure resize/re-encode of the validated master image into master/2hd/4hd buffers (no I/O).
4. `FinalPersistencePort.uploadFinal()` — uploads master, then 4hd, then 2hd to R2 under `finals/`. Any upload failure stops here.
5. `CompletionRepositoryPort.markCompleted()` — the only code path allowed to set `status = COMPLETED` and `finalStorageKey`, run inside a single `prisma.$transaction`.

**Failure behavior:** if steps 1–4 throw, `RestorationService.processItem()`'s surrounding `catch` marks the item `FAILED` and releases any wallet reservation; step 5 (DB completion) never runs, so no item can be marked `COMPLETED` without first passing validation and R2 persistence, and no partially-uploaded item can be marked `COMPLETED`. There is no retry or fallback between providers inside the coordinator — a provider failure fails closed.

**Test seams:** each of the four ports (`ProviderExecutionPort`, `OutputValidationPort`, `FinalVariantsBuilderPort` + `FinalPersistencePort`, `CompletionRepositoryPort`) is defined in `RestorationExecutionPorts.ts` and independently mockable. `RestorationService`'s constructor takes an optional `Partial<RestorationExecutionCoordinatorPorts>` override (production code never passes it) so tests can substitute fakes for any subset without touching PipelineOrchestrator, R2, or Postgres. Focused tests: `RestorationExecutionCoordinator.test.ts` (ordering/failure-boundary behavior) and `DefaultRestorationExecutionPorts.test.ts` (the real Replicate-facing default implementations).

**Replicate compatibility:** the default `PipelineOrchestratorProviderExecutor` is a pure pass-through to `PipelineOrchestrator.execute()` — same request, same tier, same result, no added logic — so Replicate's `flux_restore` → `gfpgan_face_restore` behavior, cost ceiling, and replay/dry-run modes are unchanged. `RESTORATION_PROVIDER=replicate` remains the production default (`apps/api/src/config/env.ts`); nothing in this boundary changes provider selection.

**Provider router (code exists; not enabled in production):** the seam described above is filled by `RestorationProviderRouter` (`apps/api/src/restoration-providers/pipeline/RestorationProviderRouter.ts`), which is the sole `ProviderExecutionPort` `RestorationService` constructs. It is an **exhaustive switch over exactly three values** — `"replicate"`, `"mock"`, `"runpod"` — with a `default` branch that throws `InvalidProviderSelectionError` for any other runtime value (a bad env var, a bypassed type) before either executor is touched. An earlier version of this router treated any non-`"runpod"` value, including invalid ones, as "route to Replicate"; that permissive fallback was a review finding and has been removed — invalid values are now rejected, not silently normalized.

1. `"replicate"` or `"mock"` → always calls the unchanged `PipelineOrchestratorProviderExecutor` (Replicate; `PipelineOrchestrator` itself still branches on `config.restorationDryRun`/`restorationReplayMode` for mock/replay). This is the default and rollback path — rolling back is nothing more than leaving or setting `RESTORATION_PROVIDER` to `replicate` or `mock`.
2. `"runpod"` → requires **both** `evaluateRunPodAuthorization()` (local routing config: authorization flag, secret, endpoint id, digest/repo, worker/timeout/budget bounds) **and** `verifyRunPodEndpointIdentity()` (a separate, pinned-or-authenticated snapshot of what the endpoint actually is — region/data center, GPU type/count, Network Volume identity, required runtime environment, runtime weight-download prohibition) to pass. **A non-empty endpoint id is not treated as sufficient** — that was a review finding; the identity verifier is a second, independent gate that must also pass. Either guard failing throws immediately (`RunPodConfigurationError` / `RunPodIdentityError`) with no RunPod construction and no fallback to Replicate. Only then is `RunPodProviderExecutor` constructed and dispatched; any failure from it (lifecycle, cost, or validation) propagates as-is — no retry, no fallback.
3. `default` → `InvalidProviderSelectionError`, thrown before any executor runs.

RunPod configuration, safety, and validation live in `apps/api/src/restoration-providers/runpod/`:

- `RunPodApprovedCandidate.ts` — frozen, protocol-pinned constants for the Gate 3 owner-approved candidate: image `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-volume-restore-unpack-fix-cwd-dev@sha256:91052a538454d2996b6f27b561a8b9f7d07636d396f7dd8d1713baf9f9a5ea0d`; data center `EU-RO-1`; GPU `NVIDIA RTX 4000 Ada Generation`; Network Volume `photo-restoration-gate3-models`; `workersMin=workersMax=gpuCount=concurrency=maxJobs=1`, `maxRetries=0`; `timeoutSeconds=120`, `warmupTimeoutSeconds=180`, `totalLifecycleSeconds=295`, `cleanupReserveSeconds=10`; `rateCeilingUsdPerSecond=0.00016`, `maxBudgetUsd=0.05`; required env `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1`; `runtimeWeightDownloadProhibited=true` (see `docs/restoration/RUNPOD_GATE3_APPROVAL_PACKET.md` and `runpod-gate3-readiness.json`). None of these are environment-overridable.
- `RunPodRoutingConfig.ts` — `evaluateRunPodAuthorization()` plus `loadRunPodRoutingConfigFromEnv()`, reading only `RUNPOD_ROUTING_AUTHORIZED` (default `false`), `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`, `RUNPOD_IMAGE_REPOSITORY`, `RUNPOD_IMAGE_DIGEST` from the environment.
- `RunPodEndpointIdentity.ts` — `verifyRunPodEndpointIdentity()` plus `loadRunPodEndpointIdentitySnapshotFromEnv()`, reading a single `RUNPOD_ENDPOINT_IDENTITY_SNAPSHOT_JSON` env var. Unparsable or absent JSON yields `null`, which fails verification exactly like a mismatched snapshot — never "assume approved". No live RunPod call populates this; it is a pinned/authenticated declaration only.
- `RunPodHttpClient.ts` — `FetchRunPodHttpClient`, the only code that calls RunPod, using the async job API (`POST /run`, `GET /status/{id}`, `POST /cancel/{id}`, `GET /health`), not the old blocking `/runsync` call. Every response is parsed through `parseJsonResponseSafely()`, which rejects a response over `maxHttpResponseBytes` (via `Content-Length` and actual decoded length) and rejects a non-`application/json` content-type before ever calling `JSON.parse` — a malformed or oversized HTTP response can no longer become an unhandled parse exception.
- `RunPodJobLifecycle.ts` — orchestrates one job within the 295s lifecycle ceiling: bounded readiness polling requiring `workers.ready>=1` and `workers.initializing==0` (bounded by `warmupTimeoutSeconds`), a single job submission (never resubmitted), bounded status polling (bounded by `timeoutSeconds`), and cancellation + cleanup-outcome verification (`POST /cancel/{id}`, checked for a 2xx status) whenever a job id exists and the run is aborting. Every HTTP call goes through an `AbortController` with an injectable per-call timeout. Clock and sleeper are injectable (`RunPodClock`, `RunPodSleeper`) so tests are deterministic and fast with no real waiting.
- `RunPodCostEnforcement.ts` — `enforceRunPodCostBounds()`, run after a terminal response and before any variant build, R2 upload, or DB completion. Rejects non-finite/negative queue, execution, or lifecycle timing; rejects execution time over `timeoutSeconds`, lifecycle over `totalLifecycleSeconds`, a configured rate/budget above the approved ceilings, or a projected cost (`rate × executionSeconds`) above budget.
- `RunPodResultValidation.ts` — `validateRunPodResult()`. Every evidence field is **required, not optionally accepted**: terminal `status="COMPLETED"`; `output.ok===true`; `output.providerPostCount===0` and `output.productionRoutingAllowed===false` exactly (absent/null fails); `output.weightVerified===true`; `output.gpu` must exactly equal the approved GPU identity (not merely non-empty); the dispatch's own digest is re-asserted against the approved candidate; `output.outputFormat==="png"`; valid base64; `output.outputBytes`/`outputWidth`/`outputHeight` must be present, finite, non-negative integers matching the decoded image exactly; `output.outputSha256` must be present and match the decoded bytes' SHA-256; PNG magic-byte check; independent `sharp` decode; bounded payload size.

**Worker contract: `outputSha256` (Gate 2 published and verified as a separate candidate; Gate 3 not reviewed; not approved).** The worker source at `apps/api/runpod-worker-gpu-dev-restore-unpack-fix/worker.py` — the CLI worker backing the pinned digest `sha256:91052a538454d2996b6f27b561a8b9f7d07636d396f7dd8d1713baf9f9a5ea0d`'s image chain — is the exact path that produces the final PNG: `_run_restore()` calls `out_img.save(buf, "PNG")`, and `out_bytes = buf.getvalue()` is the final PNG. `output_sha256 = hashlib.sha256(out_bytes).hexdigest()` is computed immediately from those same `out_bytes`, before `base64.b64encode(out_bytes)`, and returned as `outputSha256` (lowercase 64-character hex) in the same response dict alongside `outputBytes=len(out_bytes)`, `outputWidth=out_img.width`, `outputHeight=out_img.height`, `outputFormat="png"`, and `outputBase64` — all five fields describe the identical `out_bytes` value, computed once. `inputChecksum` (hash of the *input* image, pre-existing) is unchanged and remains a distinct field. Proven by `apps/api/runpod-worker-gpu-dev-restore-unpack-fix/test_worker.py`: `test_output_sha256_is_correct_and_well_formed`, `test_output_sha256_matches_decoded_base64_bytes`, `test_output_byte_count_and_dimensions_match_the_same_final_png`, `test_output_contract_is_deterministic_for_the_same_input`, `test_missing_or_malformed_hash_would_fail_the_output_contract`, and `test_existing_response_fields_remain_present_alongside_outputSha256` (25/25 tests pass, both locally and inside the published CI container builds). On the API side, `RunPodResultValidation.test.ts` proves acceptance of the corrected contract and rejection of a mismatched hash.

This fix was merged to `main` at `66b49028109351a9596b1170044ca15a1de8cd6c` (PR #110) and published as a **new, separate Gate 2 candidate** via `.github/workflows/publish-restore-unpack-fix-chain.yml` (run `30739176823`, identical source-SHA tag across all three images, no floating tag, no `latest`): CLI `sha256:0c9b6233276c46159c8f907e04ad8b164846b2c3607ff43d9ae5850699f08714`, Serverless `sha256:d315893119b859a724d0b83e2d53e08f1448070e2ecc830f24cf10c689e01968`, and the final volume-mapped candidate `ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-volume-restore-unpack-fix-dev@sha256:44a42808c0ebdef72ea5b2914325016170701e489a6835f8433507566969781b` — all pulled fresh by digest and re-verified post-publication, zero CRITICAL vulnerabilities, CVE-2025-32434 absent, `linux/amd64`, no bundled weights, no runtime weight download, no secrets in logs. Full evidence: `docs/restoration/RUNPOD_GATE3_APPROVAL_PACKET.md` ("Gate 2 Candidate — outputSha256 Contract Fix — 2026-08-02") and `docs/restoration/runpod-gate3-readiness.json` (`gate2CandidateOutputSha256Fix`).

**This new digest is a different repository/chain from, and does not replace, the protected Gate 3-approved digest above** (`sha256:91052a53...`, the `-cwd-dev` chain; this candidate is the plain `-dev` chain). `RunPodApprovedCandidate.ts`'s pinned `imageRepository`/`imageDigest` constants — the actual production guard the code enforces — are unchanged and still reference the `-cwd-dev` digest, not this one. Gate 2 (build + publish) is done and verified for this new candidate; **Gate 3 has not been reviewed for it**, no canary has been dispatched against it, and none of the existing Gate 3 owner-approval or canary evidence above may be read as applying to it. It remains `approved=false`, not production eligible, not deployed, not routed, and not an endpoint authorization.

**Gate 3 ineligibility finding for `sha256:44a42808...` and prepared combined-chain remedy (source only; unbuilt; unpublished).** This digest's Serverless/volume-mapped images derive from `apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-dev/handler.py`, which lacks the `cwd=WORKER_DIR` fix confirmed necessary by Gate 3 canary run `30702245089` (`"worker produced invalid non-JSON output"`; see `docs/restoration/runpod-invalid-json-stdout-fix.json`). A canary against it would very likely reproduce that failure, so it is classified **Gate 3 ineligible as-is** — this does not retract its Gate 2 publication. A combined candidate chain merging both fixes has been prepared: `apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-combined-dev/` (new; carries `cwd=WORKER_DIR`; Dockerfile builds `FROM gfpgan-cli-restore-fix:local`, picking up the `outputSha256`-corrected CLI worker unchanged from `apps/api/runpod-worker-gpu-dev-restore-unpack-fix/`) and `apps/api/runpod-worker-gpu-serverless-volume-restore-unpack-fix-combined-dev/` (new; unchanged symlink contract). 40/40 new handler tests and 25/25 unchanged worker tests pass. No CI workflow references either new directory; no build, publish, digest, deployment, or Gate 2/3 review of this combined chain exists. Full evidence: `docs/restoration/runpod-combined-chain-source-readiness.json`, `RUNPOD_GATE3_APPROVAL_PACKET.md` ("Gate 3 Ineligibility Finding — `sha256:44a42808...`").
- `RunPodObservability.ts` — sanitized `logger` wrappers for provider selection, rollback state, guard/identity rejection, dispatch start/end, readiness polls, warm-up/execution timeout, lifecycle breach, cancellation, cleanup outcome, cost stop, and validation failure. Endpoint id and image digest are truncated before logging; API keys, `imageBase64`/`outputBase64`, raw image bytes, raw HTTP response bodies, and signed URLs are never passed to any of these.
- `RunPodProviderExecutor.ts` — the only `ProviderExecutionPort` implementation that calls RunPod. Its constructor re-runs both `assertRunPodAuthorized()` and `assertRunPodEndpointIdentity()`, so it can never dispatch on invalid config or an unverified endpoint even if constructed directly. `execute()` composes, in order: input-size check → `RunPodJobLifecycle.run()` → `enforceRunPodCostBounds()` → `validateRunPodResult()` → build the `PipelineResult`. A failure at any step throws before the next runs.

**Remaining authorization boundary (unchanged):** `RUNPOD_ROUTING_AUTHORIZED` defaults to `false`, no `RUNPOD_ENDPOINT_ID`/`RUNPOD_API_KEY`/`RUNPOD_IMAGE_DIGEST`/`RUNPOD_ENDPOINT_IDENTITY_SNAPSHOT_JSON` is configured in any environment, and no RunPod endpoint has been created — RunPod is implemented but not deployed, not enabled, and not reachable. `RESTORATION_PROVIDER=replicate` remains the production default. Gate 3 records production eligibility only for the pinned `-cwd-dev` candidate (`approved=false`, `routingActivationAuthorized=false` in `docs/restoration/runpod-gate3-readiness.json`); Gate 4 remains prohibited. Setting `RUNPOD_ROUTING_AUTHORIZED=true` in any real environment, creating a RunPod endpoint, populating an endpoint identity snapshot, or setting `RESTORATION_PROVIDER=runpod` in production all require separate, explicit authorization beyond this change — and, separately, the `outputSha256` Gate 2 candidate above requires its own separate, explicit Gate 3 canary/review before it — or any dispatch at all — could take effect.

**Out of scope / unaffected:** preview generation and wallet reservation/settlement semantics in `RestorationService.processItem()` were not touched by this router/RunPod work and sit downstream of the execution boundary described above; the existing coordinator tests (which exercise that same boundary) continue to pass unchanged, so no regression is expected there, but they were not independently re-audited as part of this change.
