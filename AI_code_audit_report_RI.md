# AI Code Audit Report RI

## Status

The GHCR-based deployment path now succeeds through build, image push, and Northflank deployment POST, but the workflow still fails in the verification step that asserts the deployed SHA.

## Workflow Evidence

- Workflow: `Deploy to Northflank`
- Workflow run ID: `30411023033`
- Workflow conclusion: `failure`
- Build/deploy job: `success`
- Verify job: `failure`
- Commit SHA: `8c9d7e7ed527337431408fdef19b7fabf273cd55`
- Commit message: `fix: post northflank deployment update`

## Passed Checks

- `npm ci`: PASS
- `prisma generate`: PASS
- build: PASS
- GHCR push: PASS
- Northflank deployment POST: PASS
- API `/api/health`: `200`

## Failed Check

- Final workflow verification step: `Verify SHA changed`
- Final workflow status: `completed` with `conclusion = failure`
- Exact failure cause available from GitHub API:
  - `Verify SHA changed` completed with `failure`
- I was not able to fetch private job logs from GitHub in this environment, so I could not extract a more detailed stdout line from that step

## Deployment Snapshot

- Image path/tag used by workflow: `ghcr.io/ai-photo-studio/ai-photo-studio:latest`
- Northflank deployment update method: `POST /v1/projects/ai-photo-studio/services/ai-photo-studio/deployment`
- Deployed SHA verification: not confirmed
- Running image tag verification: not confirmed

## Security Gate

- Exposed Northflank token revocation in UI: not confirmed
- Old token API check: earlier API calls returned HTTP `200`, so the token was not proven revoked by the available evidence
- Token values: not printed

## OPS-116 Evidence

- `PipelineOrchestrator` routes to `ReplicatePipelineProvider`
- Expected pipeline stages in code:
  - `FluxRestoreProvider`
  - `GFPGAN` face restoration
  - `GFPGAN` upscale
- No live runtime log proof yet for `MEMORY_WATCHDOG`

## M1.jpg Live Verification

- Live execution of `M1.jpg`: not completed in this environment
- Flux prediction ID: not obtained
- GFPGAN face prediction ID: not obtained
- GFPGAN upscale prediction ID: not obtained
- Exactly 3 Replicate predictions: not verified live
- All prediction statuses succeeded: not verified live
- `R2 finalStorageKey`: not obtained
- DB status: not verified live
- Download URL: not verified live

## Notes

- `.gitignore` already contains `AI_code_audit_report_RI.md`
- The report was overwritten with the latest evidence snapshot
