# P4B Internal Worker — Northflank Deployment Runbook

Status: **preparation/documentation only. Not deployed. No Northflank
service has been created for this runner by this packet.**

This runbook describes how a future, separately authorized task (or the
repository owner, directly in the Northflank console) deploys the existing,
already-built, already-tested P4B internal worker runner
(`apps/api/src/scripts/p4b-worker-runner-main.ts`,
`apps/api/src/services/p4b-internal-worker-runner.service.ts`) as its own
Northflank service. No code in this runner was changed to produce this
document; it only records the deployment contract of what already exists.

## 1. What this service is

- A **standalone Node.js process**, separate from the `api` HTTP service.
  It is not imported by `apps/api/src/index.ts` and exposes no Express
  router — there is no HTTP surface, no port to bind, and no code path
  from any customer or admin request into this process.
- Its only job: poll for `QUEUED` `ReplicateExecution` rows created by the
  P4A verified-payment transaction, and drive the existing, unmodified P3A
  worker (`ReplicateExecutionWorker`) against them.
- Provider is **Replicate only**. The runner refuses to start
  (`RESTORATION_PROVIDER must be "replicate"`) if `RESTORATION_PROVIDER` is
  anything else — this is a belt-and-suspenders check in addition to the
  worker's own provider-selection guard. **No RunPod or Local provider code
  path exists in this runner and none may be added to it without a
  separately authorized packet** (see Protected Scope Protocol, section 5
  below and in `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md`).
- **Concurrency is fixed at one** in-process claim loop
  (`InternalWorkerRunner` polls, then hands one candidate at a time to the
  P3A worker). The P3A worker's own atomic
  `UPDATE ... WHERE status = 'QUEUED'` claim remains the single source of
  claim authority — this runner never claims a row itself, it only "peeks"
  read-only for the oldest eligible candidate and lets the worker's atomic
  SQL do the real claim. Running additional replicas is therefore safe from
  a correctness standpoint (the DB-level claim still dedupes), but is not
  the tested/expected shape — deploy exactly **one instance**.

## 2. Sole start command

```
npm run worker:p4b --workspace apps/api
```

(`apps/api/package.json` → `"worker:p4b": "tsx src/scripts/p4b-worker-runner-main.ts"`.)
In a Northflank container built from the existing Dockerfile, the
equivalent post-`npm run build` production command is:

```
node dist/scripts/p4b-worker-runner-main.js
```

No other start command, flag, or wrapper is required or supported. This is
the **only** command this service ever runs.

## 3. Required environment variables (names only — no values, no secrets)

The runner calls the same `loadConfig()` the HTTP API process uses
(`apps/api/src/config/env.ts`), so it fails closed on any missing or
invalid required variable **before** it constructs any adapter or attempts
any network/database call. At minimum, a working deployment needs:

Core (always required by `loadConfig()`):
- `DATABASE_URL`
- `REDIS_URL` (present in schema; not on this runner's own hot path, but
  required by shared config validation)
- `JWT_SECRET`
- `ADMIN_JWT_SECRET`
- `WHATSAPP_VERIFY_TOKEN`
- `PAYMENT_GATEWAY_NAME` (and, unless it is `manual`/`demo`,
  `PAYMENT_GATEWAY_BASE_URL` + `PAYMENT_GATEWAY_SECRET`)

Provider selection (must resolve to Replicate — fail-closed otherwise):
- `RESTORATION_PROVIDER` — **must be exactly `replicate`**
- `REPLICATE_API_TOKEN`
- `REPLICATE_RESTORATION_MODEL_SLUG`
- `REPLICATE_RESTORATION_MODEL_VERSION`

Storage (unless `STORAGE_PROVIDER=mock`, which must not be used in a real
deployment of this runner):
- `STORAGE_PROVIDER` — `r2`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_BASE_URL`

Runner-specific tuning (optional; bounded defaults, never required for
correctness):
- `P4B_WORKER_POLL_INTERVAL_MS` — default `5000`
- `P4B_WORKER_MAX_BACKOFF_MS` — default `60000` (must be
  `>= P4B_WORKER_POLL_INTERVAL_MS` or the process refuses to start)

Any other variable already required by `loadConfig()`'s zod schema for the
selected `AI_PROVIDER`/`PAYMENT_GATEWAY_NAME` combination in the target
environment applies identically to this process, since it shares the exact
same config loader as the HTTP API. Copy the same secret group the `api`
service uses; do not create a divergent partial set.

**Fail-closed guarantee:** any single missing/invalid required variable, or
`RESTORATION_PROVIDER` not equal to `replicate`, throws synchronously before
the poll loop starts and the process exits non-zero. This was proven by
`p4b-internal-worker-runner.service.pg-race.test.ts` tests `(pg6a)` and
`(pg6b)` against a real disposable database.

## 4. Single-instance limits

- Deploy **exactly one** Northflank service instance/replica for this
  runner. Concurrency within the process is hard-coded to 1 (one execution
  claimed and processed at a time).
- Do not attach a public port or domain — this service has no HTTP surface
  to expose.
- Do not point this service's Redis/queue configuration at anything other
  than the same `REDIS_URL` the `api` service already uses; the runner does
  not create or manage its own queue infrastructure.
- No autoscaling policy should be configured (nothing to scale — one poll
  loop, one claim at a time, by design).

## 5. Health expectations

- There is no HTTP `/health` endpoint on this process (no Express router
  exists here). Do **not** configure an HTTP liveness/readiness probe
  against a port — none is bound.
- Health is process-liveness only: Northflank should restart the container
  if the process exits. A clean exit (`process.exitCode = 0`) happens only
  after `runner.run()` resolves, which normally only happens after a
  graceful-shutdown signal — an unexpected clean exit without a prior
  `SIGTERM`/`SIGINT` is itself worth investigating.
- A non-zero exit (`process.exitCode = 1`) happens on: (a) startup
  configuration failure (missing/invalid env, wrong provider), or (b) an
  unhandled fatal error from `runner.run()`. Both are logged via the
  shared `logger` before exit (`"P4B worker runner: fatal error, exiting"`
  / the `console.error` startup-failure line) — treat any restart loop as a
  configuration or upstream-dependency problem, not a code defect to patch
  blindly.
- Expected steady-state log line: `"P4B worker runner: starting"` once at
  boot, and `"P4B worker runner: execution processed"` once per handled
  `ReplicateExecution` row (`outcome` field shows `SUCCEEDED`/`FAILED`/
  `CLAIM_LOST`/etc.). Long idle periods with only backoff (no crash) are
  normal when the `QUEUED` queue is empty — not a health problem.

## 6. Graceful shutdown

- `SIGTERM` and `SIGINT` are both wired to a cooperative shutdown
  (`requestStop()`): the current in-flight execution, if any, is always
  allowed to finish; no new execution is claimed after the signal.
  Northflank's normal deploy/restart signal (`SIGTERM`) is therefore safe
  to send at any time — proven end-to-end against a real disposable
  database by pg-race test `(pg5)`.
- Do not `SIGKILL` this process as a matter of routine; that skips the
  cooperative drain and can leave an execution mid-flight (the P3A worker's
  own atomic claim/commit semantics bound the blast radius, but a clean
  `SIGTERM` is always preferable and always sufficient).

## 7. Rollback

- This is a stateless poll/claim process with no local persistent state of
  its own (all state lives in Postgres via the P3A/P4A tables it reads and
  writes through the existing, unmodified worker). Rollback is therefore
  just a normal Northflank service rollback: redeploy the previous known-good
  image/build for this service. There is no migration, schema change, or
  data backfill tied to this runner's deployment — none was added by this
  packet or any prior P4B packet.
- If a bad deploy is suspected, the safest immediate action is to scale the
  service to zero instances (stop polling) — in-flight rows simply remain
  `QUEUED`/`PROCESSING` and are picked up again once a healthy instance
  (this one, rolled back, or a corrected one) resumes polling. No customer
  request path depends on this process being up (see section 1), so
  stopping it briefly does not take down the API or checkout paths.

## 8. Post-deployment checks (owner performs these after actually deploying)

1. Confirm exactly one Northflank replica is running for this service, no
   public port/domain attached.
2. Tail logs for the single `"P4B worker runner: starting"` boot line with
   `restorationProvider: "replicate"` and `concurrency: 1` in the log
   metadata — confirms fail-closed provider selection took effect.
3. Seed or wait for one real `QUEUED` `ReplicateExecution` row (created only
   via the existing P4A verified-payment path — never manually) and confirm
   exactly one `"P4B worker runner: execution processed"` log line appears
   for it, with no duplicate processing of the same `executionId`.
4. Confirm the `api` HTTP service's own behavior and log volume are
   unchanged — this service must not alter customer-facing latency or
   error rates, since it shares no process, port, or request path with it.
5. Send `SIGTERM` (via a normal Northflank restart/redeploy) once and
   confirm the in-flight execution (if any) completes before the process
   exits, and no partial/duplicate row results from the restart.
6. Re-confirm `RESTORATION_PROVIDER=replicate` in the deployed secret group
   — this is the single most important post-deploy check, since any drift
   here is a fail-closed startup crash, not a silent misroute.

## 9. What this runbook explicitly does not do

- It does not create a Northflank project, service, or secret group.
- It does not change, add, or read any production secret value.
- It does not touch a production database.
- It does not make any live Replicate, R2, RunPod, or Bank Alfalah network
  call.
- It does not wire any HTTP route to this runner or to
  `applyVerifiedPaymentEvidence`.

Deploying this service is a separate, explicitly authorized future task.
This document exists so that task can be executed correctly and quickly
when authorized, without re-deriving the environment contract from source.
