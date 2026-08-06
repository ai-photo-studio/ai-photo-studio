# P4B Worker Service Readiness Protocol

Concise, permanent record of the P4B internal worker runner's proven
deployment properties. Companion to `docs/deployment/P4B_WORKER_NORTHFLANK_RUNBOOK.md`
(narrative runbook) and `northflank/p4b-worker.service.yaml` (reference
service definition — not applied/deployed by any automation in this repo).

**Status: readiness proof only. No Northflank service was created. No
deployment occurred.**

## Properties proven, and how

| Property | Proof |
|---|---|
| Correct start command | `node dist/scripts/p4b-worker-runner-main.js` (prod) / `npm run worker:p4b` (dev) — the only entry point; `require.main === module` guard in the source itself |
| No public HTTP dependency | Live process-level proof this session: started the worker standalone against a disposable database with no API process running — it started, logged `"P4B worker runner: starting"`, and `Get-NetTCPConnection -State Listen` confirmed it bound **zero ports** (the only listening port among all node processes belonged to the separately-started API on 4011) |
| One-at-a-time claim/concurrency | `p4b-internal-worker-runner.service.pg-race.test.ts` `(pg3)`: two independent `InternalWorkerRunner` instances racing on one real `QUEUED` row against a real disposable Postgres — exactly one claim, one provider call. `(pg2)`: an ineligible row is never claimed |
| Graceful shutdown | `(pg5)`: `requestStop()` lets an in-flight execution finish, then stops, real DB end-to-end. (OS-level `SIGTERM` delivery from an external process is not exercisable on native Windows without WSL — a platform limitation of this dev proof, not a code gap; the process registers `SIGTERM`/`SIGINT` handlers per source, and Northflank's Linux containers deliver `SIGTERM` normally) |
| Health/readiness behavior | No HTTP probe exists or should be configured (no port bound). Health is process-liveness: expected boot log line `"P4B worker runner: starting"` with `restorationProvider:"replicate"`, `concurrency:1`; clean exit only after a shutdown signal; non-zero exit only on fail-closed startup error or fatal loop error |
| Required env-variable names only, no secret values | Enumerated in `northflank/p4b-worker.service.yaml` and the runbook — every value used in this session's live proof was a disposable/fake placeholder, never printed as a real secret |
| No Bank Alfalah/Replicate/R2/RunPod external call | `(pg7)`: no external network call attempted at any point, real disposable DB, real assertions. This session's live proof also used `STORAGE_PROVIDER=mock`/`AI_PROVIDER=mock`/a fake `REPLICATE_API_TOKEN` — no real provider was ever reachable |
| API and worker run separately | Live proof: API started and answered `GET /api/health` (200) with **no worker process running at all**; the worker was then started **independently** (no API-process dependency in its own startup path — it never calls the API) |
| Failure/restart cannot create a second execution | `(pg4)`: restart/replay safety — a fresh runner instance polling again after a prior claim performs zero further provider or storage work. Combined with `(pg3)`'s atomic-claim proof, a crash-and-restart can at most resume polling; it cannot double-process a row |

## Local proof session record (this packet)

Disposable local PostgreSQL 17 (`D:\Temp\r92-disposable-pg3`, loopback-only,
port 45666, throwaway `trust` rule): 21 migrations applied. API server
started standalone (`PORT=4011`, `STORAGE_PROVIDER=mock`, `AI_PROVIDER=mock`)
— `GET /api/health` returned 200 with no worker running. Worker started
standalone (`P4B_WORKER_POLL_INTERVAL_MS=2000`, same disposable DB, same mock
providers, fake `REPLICATE_API_TOKEN`) — logged
`"P4B worker runner: starting"` with `concurrency:1`; confirmed zero listening
ports for the worker's own process. Both processes stopped; disposable
Postgres stopped (`pg_ctl -m fast stop` → "server stopped"), temp data
directory deleted, confirmed absent via `Test-Path`. Full `p4b-internal-
worker-runner.service.pg-race.test.ts` suite (10/10) re-run separately
against a second disposable instance as part of this packet's full
regression sweep (see release manifest for the complete count).

## What this packet explicitly did not do

- Did not create a Northflank project, service, or secret group.
- Did not deploy anything.
- Did not change the worker's source code (`p4b-worker-runner-main.ts`,
  `p4b-internal-worker-runner.service.ts` are unmodified).
- Did not make any Bank Alfalah, Replicate, R2, or RunPod network call.
