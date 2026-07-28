# OPS-130 — Northflank Report

**Date:** 2026-07-24

## Northflank Configuration

| Property | Value |
|----------|-------|
| Platform | Northflank (configured in `northflank.json`) |
| Service name | `ai-photo-studio-api` |
| GitHub integration | ✅ Configured (`autoDeploy: true`) |
| Health check | `GET /api/health` on port 8080 |
| Custom domain | `api.thannow.com` (configured in Northflank dashboard) |
| Container image | `ghcr.io/ai-photo-studio/ai-photo-studio/ai-api` |

## DNS Verification

| URL | Resolves | Evidence |
|-----|----------|----------|
| `ai-photo-studio-api.northflank.app` | **❌ DOES NOT RESOLVE** | `The remote name could not be resolved` |
| `api.thannow.com` | ✅ Resolves | Points to `ghs.googlehosted.com` (Google Cloud) |

## Deployment History

| Event | Status | Evidence |
|-------|--------|----------|
| GitHub Actions Docker build (OPS-129 fix) | ✅ PASS | Image pushed to GHCR (`sha-204a926`) |
| GitHub Actions "Trigger Northflank Deploy" | ✅ PASS | Step completed (just prints a message) |
| Northflank GitHub integration webhook | **UNKNOWN** | No way to verify from current env |
| Northflank service running | **❌ FAILED** | DNS doesn't resolve to Northflank |

## Conclusion

**FAILED: Northflank is NOT serving production traffic.**

The Northflank configuration is aspirational. The GitHub Actions pipeline includes a placeholder step that only prints "Northflank auto-deploy" without actually triggering a real deployment webhook. The `ai-photo-studio-api.northflank.app` subdomain does not resolve.

The production API is served by Google Cloud Run (see `production_request_trace.md`).
