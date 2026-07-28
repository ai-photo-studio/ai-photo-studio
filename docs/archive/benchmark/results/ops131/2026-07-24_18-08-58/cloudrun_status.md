# Cloud Run Status — OPS-135

**Date:** 2026-07-24

## Service `ai-photo-studio-api`

| Property | Value |
|----------|-------|
| Service name | `ai-photo-studio-api` |
| Region | `us-central1` |
| Project | `project-9540c255-c960-4fa0-a91` |
| URL | `https://ai-photo-studio-api-mp3arpoi2a-uc.a.run.app` |
| Custom domain | `https://api.thannow.com` (DNS: ghs.googlehosted.com) |

## Traffic

| Revision | Traffic % | Status |
|----------|-----------|--------|
| `ai-photo-studio-api-00098-dpf` | **100%** | ✅ Ready |
| `ai-photo-studio-api-cors-fix` | 0% | ❌ Failed (stuck, cannot delete — latest created) |
| `ai-photo-studio-api-00101-kdg` | 0% | ✅ Deleted |
| `ai-photo-studio-api-00100-trv` | 0% | ✅ Deleted |

## Current Image

| Property | Value |
|----------|-------|
| Image | `us-central1-docker.pkg.dev/project-9540c255-c960-4fa0-a91/ai-photo-studio-api/latest` |
| Digest | `sha256:1f3118617f6fceb5f563217331ecd16a07274fd0af3361e6384e10edc749ae94` |
| Created | 2026-07-24T15:02:36Z |

## Configuration

| Setting | Value |
|---------|-------|
| CPU | 1 |
| Memory | **1Gi** (upgraded from 512Mi in OPS-133) |
| Min instances | 1 |
| Max instances | 10 |
| Concurrency | 80 |
| Port | 8080 |
| Ingress | All |
| Timeout | 300s |

## Domain Mappings

| Domain | Target | Notes |
|--------|--------|-------|
| `api.thannow.com` | Cloud Run (via GFE) | DNS-only, CNAME to `ghs.googlehosted.com` |
| `www.thannow.com` | Cloudflare Pages | Proxied (orange cloud) |
| `thannow.com` | Cloudflare Pages (redirect) | Redirects to www |

## Classification

**Cloud Run: VERIFIED** — Revision 00098-dpf serving 100% production traffic. All new revisions (00100, 00101) cleaned up. `cors-fix` stuck (cannot delete as latest created).
