# Northflank References — OPS-135

**Date:** 2026-07-24

## Files Removed

| File | Action | Reason |
|------|--------|--------|
| `northflank.json` | ✅ DELETED | Aspirational config, never deployed |
| `scripts/northflank-setup.md` | ✅ DELETED | Setup guide, never executed |
| `.github/workflows/deploy.yml` | ✅ REWRITTEN | All Northflank references removed, replaced with Cloud Run |

## Files Updated

| File | Change |
|------|--------|
| `.github/workflows/deploy.yml` | Complete rewrite: Northflank → Cloud Run + Artifact Registry. Removed commented-out webhook. Added GCP auth step. |

## Files Kept (Historical Evidence)

| File | Reason |
|------|--------|
| `benchmark/results/ops129/.../northflank_deployment.md` | Historical benchmark report |
| `benchmark/results/ops130/.../northflank_report.md` | Historical benchmark report |

## Verification Checklist (All Passed)

| Criteria | Status | Evidence |
|----------|--------|----------|
| 0% traffic to Northflank | ✅ PASS | `ai-photo-studio-api.northflank.app` DNS does not resolve |
| No env var references | ✅ PASS | No NORTHFLANK in any .env file |
| No provider references | ✅ PASS | No northflank in apps/api/src/services/ |
| No worker references | ✅ PASS | No northflank in apps/api/src/workers/ |
| No deployment script references | ✅ PASS | Scripts cleaned up |
| No Deployment_Policy references | ✅ PASS | No northflank in cleanup/Deployment_Policy.md |

## Classification

**Northflank: VERIFIED REMOVED** — Never served production, no runtime dependencies, all files removed.
