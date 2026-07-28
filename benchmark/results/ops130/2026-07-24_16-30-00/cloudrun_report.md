# OPS-130 — Cloud Run Report

**Date:** 2026-07-24

## Cloud Run Service Status

| Property | Value | Evidence |
|----------|-------|----------|
| Service name | `ai-photo-studio-api` | ✅ gcloud run services list |
| Region | `us-central1` | ✅ Verified |
| Project | `project-9540c255-c960-4fa0-a91` (ID: `108335160641`) | ✅ Verified |
| URL | `https://ai-photo-studio-api-mp3arpoi2a-uc.a.run.app` | ✅ Verified |
| Production domain | `api.thannow.com` | ✅ CNAME → `ghs.googlehosted.com` → Cloud Run |

## Active Revision

| Property | Value |
|----------|-------|
| Latest revision | `ai-photo-studio-api-00096-gkh` |
| Deployed | **2026-07-21 07:24:18 UTC** (3 days ago) |
| Status | `Ready: True`, `Active: True` |
| Traffic | **100%** (latestRevision: true) |
| Container health | Healthy (3.52s startup) |

## Environment Variables

| Category | Variables | Status |
|----------|-----------|--------|
| Database | `DATABASE_URL`, `REDIS_URL` | ✅ Set (secret refs) |
| Storage | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` | ✅ Set (secret refs) |
| Auth | `JWT_SECRET`, `ADMIN_JWT_SECRET` | ✅ Set (secret refs) |
| Payment | `PAYMENT_GATEWAY_NAME=manual` | ✅ Set |
| AI/Replicate | `AI_PROVIDER=local-rembg`, `RESTORATION_ENDPOINT_URL`, `BACKGROUND_API_URL` | ✅ Set |
| Admin bootstrap | `ADMIN_BOOTSTRAP_EMAIL` | **❌ NOT SET** |
| Admin bootstrap | `ADMIN_BOOTSTRAP_PASSWORD` | **❌ NOT SET** |
| WhatsApp | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | ✅ Set (secret refs) |
| CORS | `ALLOWED_ORIGINS=https://www.thannow.com` | ✅ Set |

## Admin Login Blockers

1. **Admin auth code bug** — Login compared password against `ADMIN_BOOTSTRAP_PASSWORD` env var instead of stored PBKDF2 hash (OPS-127 fix committed but NOT deployed)
2. **Bootstrap env vars not set** — `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` are missing from Cloud Run environment
3. **Cloud Run image stale** — Revision `00096-gkh` uses old Dockerfile without fix

## What is Running on Cloud Run

The currently running image uses the **old Dockerfile with inline package.json** (without `sharp`). This image was built and deployed on July 21. The OPS-127/129 fixes (proper Dockerfile + admin auth fix) have NOT been deployed yet.

## Projects

| Project ID | Project Number | Cloud Run Service | Status |
|-----------|----------------|-------------------|--------|
| `project-9540c255-c960-4fa0-a91` | `108335160641` | `ai-photo-studio-api` | ✅ ACTIVE |
| — | — | `ai-photo-studio-bg-remover-gpu-us-east4` | ✅ ACTIVE (GPU) |
| — | — | `gpu-research-service` | ✅ ACTIVE |

## Conclusion

**VERIFIED: Google Cloud Run is the production backend.**

Cloud Run revision `00096-gkh` (Jul 21) serves 100% of production API traffic through `api.thannow.com`. The environment is correctly configured for production EXCEPT:
- Missing `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` env vars
- Stale Docker image (OPS-127/129 fixes not deployed)
