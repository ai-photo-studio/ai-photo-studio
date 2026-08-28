# R9.4 — Northflank Runtime Recovery (2026-08-28)

## Symptom

Public API (`https://api.thannow.com`) returned persistent HTTP 503 on
every route, including `/api/health`. Northflank deployment runs
33162080157 and 33162664898 both showed `Build & Deploy API` succeeding
(image built, pushed, Northflank API accepted the deployment update) but
`Verify Deployment` timing out after 6 minutes of HTTP 503.

## Root cause (proven, not guessed)

Two independent Northflank objects in the `ai-photo-studio` project were
in a paused / scaled-to-zero state, unrelated to application code:

1. **Service `ai-photo-studio`**: `deployment.instances` was `0`.
   `GET /v1/projects/ai-photo-studio/services/ai-photo-studio` showed
   `"instances":0` and the runtime logs endpoint returned zero log lines
   (`{"data":[],"count":0}`) — proof no container had ever started for
   the current deployment, so the LB had no backend and returned 503 for
   every request. Not a startup crash, not a bad start command, not a
   missing env var.
2. **Redis addon `studio-redis`**: `GET
   /v1/projects/ai-photo-studio/addons` showed `"status":"paused"`.
   Container runtime logs captured the exact sanitized error once the
   service was resumed and started emitting logs again:
   `Error: getaddrinfo ENOTFOUND master.studio-redis--qyv86rj8qrvh.addon.code.run`
   — the addon's hostname stops resolving while paused. This blocked
   `GET /api/monitoring/queue` (BullMQ `getJobCounts()` hangs waiting on
   an unreachable Redis) indefinitely.

Both objects were almost certainly paused together by the same
account/billing event; no source defect existed.

## Repair (smallest possible, no code change)

Two Northflank API calls, both via a tracked read-only-adjacent GitHub
Actions workflow (`.github/workflows/northflank-scale-repair.yml`),
using the existing `NORTHFLANK_API_KEY` repo secret:

```
POST /v1/projects/ai-photo-studio/addons/studio-redis/resume
POST /v1/projects/ai-photo-studio/services/ai-photo-studio/resume   { "instances": 1 }
```

No application code was changed. No APG protocol code was touched.

## Verification (all proven live, 2026-08-28 ~11:00 UTC)

| Check | Result |
| --- | --- |
| `GET /api/health` | 200, `build_sha` = deployed commit |
| `GET /api/version` | 200, `buildSha` matches `main` HEAD |
| `GET /api/packages` (DB-backed) | 200, real seeded package data from Neon |
| `GET /api/monitoring/queue` (Redis-backed) | 200, `healthy:true`, real job counts |
| `GET /api/payments/bank-alfalah/return` | 200, `PAYMENT_UNAVAILABLE` (correct — provider flags OFF) |
| `POST /api/payments/bank-alfalah/ipn` | 503 `APG_DISABLED` (correct fail-closed behavior per `bank-alfalah-apg.controller.ts`, provider disabled) |
| No test-only routes registered in `apps/api/src/index.ts` production route table | confirmed |

## Reusable diagnostic tooling (kept, tracked)

- `.github/workflows/northflank-forensic-diagnostic.yml` — read-only:
  service detail, deployments, events/builds (404s are expected —
  Northflank doesn't expose those on this plan), runtime logs, all
  services + all addons with status. Never prints a secret value.
- `.github/workflows/northflank-scale-repair.yml` — the two resume
  calls above plus a PATCH-instances fallback (currently returns `405`
  on this Northflank plan/version; the `/resume` endpoint is the
  correct one), followed by a post-repair status readback.

Dispatch either with `gh workflow run <file> --ref main` when a similar
503 recurs; read the run log for the exact service/addon status before
assuming an application defect.

## Non-finding

No evidence connects this incident to the APG bank integration. Per
protocol, APG UAT was not touched or re-run as part of this recovery —
only the runtime layer was repaired.
