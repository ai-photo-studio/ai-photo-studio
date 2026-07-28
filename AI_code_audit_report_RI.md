# AI Code Audit Report RI

## Status

Direct GitHub Actions deployment workflow was repaired locally, but deployment was not executed from this session.

## Evidence

- Exposed old Northflank token revocation check: FAILED
- Evidence: `GET https://api.northflank.com/v1/projects` with the exposed token returned HTTP `200`
- GitHub CLI auth check: FAILED
- Evidence: `gh auth status` reported the local GitHub token is invalid
- API health before deploy: `https://api.thannow.com/api/health` returned HTTP `200`
- Local Prisma generate: PASS
- Local API build: PASS via `npm run build -w apps/api`

## Workflow Repair

- Workflow: `.github/workflows/deploy.yml`
- Registry: `registry.northflank.com`
- Image tag: `${{ github.sha }}`
- GHCR usage: none in deploy workflow
- `NORTHFLANK_CREDENTIALS_ID`: not used
- Northflank source builds: not used
- Deployment update: direct Northflank API `PATCH /v1/projects/{projectId}/services/deployment/{serviceId}`
- Deployment payload: `deployment.external.imagePath`

## Build Repairs

- Prisma schema was missing `guestOwnershipTokenHash` fields used by API services/controllers.
- Added nullable `guestOwnershipTokenHash` to `Order`.
- Added nullable `guestOwnershipTokenHash` to `RestorationOrder`.
- Regenerated Prisma client successfully.
- API TypeScript build now passes.

## OPS-116 Verification

- `PipelineOrchestrator` no longer imports or instantiates `UnifiedLocalRestorationProvider`.
- All pipeline tiers now route to `ReplicatePipelineProvider`.
- `ReplicatePipelineProvider` runs:
  - `FluxRestoreProvider`
  - `GFPGANProvider` face restoration
  - `GFPGANProvider` upscale
- Expected Replicate predictions per processed image: exactly 3.
- `MEMORY_WATCHDOG`: no active match found in API runtime files checked.

## Not Completed

- Latest GitHub Actions run could not be checked because local GitHub CLI auth is invalid.
- Commit push could not be completed from this session for the same reason.
- Workflow run ID: not available.
- New Northflank image push: not available.
- Deployed SHA: not available.
- M1.jpg live run: not executed.
- R2 final output, DB `COMPLETED`, and download URL: not verified live.

## Required Next Gate

Revoke the exposed Northflank token. The current evidence shows it is still active, so remote deployment should not proceed until that token returns `401` or `403`.

After revocation, push the local commit and run the GitHub Actions workflow. The workflow should build with `npm ci`, run Prisma generate, build the API, push the SHA-tagged image to `registry.northflank.com`, patch the Northflank service to that image, and wait for health.
