# Cloud Run Health — OPS-133

**Date:** 2026-07-24

## Current Revision

| Property | Value |
|----------|-------|
| Service name | `ai-photo-studio-api` |
| Latest ready revision | `ai-photo-studio-api-00097-29z` |
| Image digest | `sha256:dc9fc4336a0cded7b96ad8d1da8547bb36303a7867565189e4072565d74c9922` |
| Created | 2026-07-24T11:26:53Z |
| Region | `us-central1` |
| Project | `project-9540c255-c960-4fa0-a91` |

## Configuration (from cloudbuild.yaml and prod config)

| Setting | Value | Notes |
|---------|-------|-------|
| CPU | 1 vCPU | ✅ Adequate for Express + Prisma |
| Memory | 512Mi | ⚠️ Tight for Express + Prisma + image base64 processing — **upgraded to 1Gi in this commit** |
| Min instances | 1 | ✅ Always warm, no cold start penalty |
| Max instances | 10 | ✅ Auto-scaling headroom |
| Concurrency | 80 (default) | ✅ |
| Timeout | 300s | ✅ Newly added |
| Ingress | All | ⚠️ Should be `internal-and-cloud-load-balancing` for production? Currently `all` |
| Port | 8080 | ✅ |
| Startup CPU boost | true | ✅ |
| CPU throttling | false | ✅ Always-allocated CPU |

## Health Probe (from Dockerfile)

```
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => { ... })"
```

## Traffic

| Revision | Traffic % |
|----------|-----------|
| `ai-photo-studio-api-00097-29z` | 100% |

## Known Issues

1. **Memory pressure**: 512Mi causes OOM risk when Express processes large base64 images (~10MB uploads). The `express.json({ limit: "12mb" })` middleware allocates heap for JSON body parsing, which compounds with Prisma queries and image data.
2. **No startup/liveness/readiness probes** configured in the gcloud deploy command — only Docker HEALTHCHECK. Cloud Run default probes apply.
3. **No concurrency tuning**: At 80 concurrent requests with 512Mi, each request gets ~6.4Mi — too low for JSON parsing + Prisma.

## Classification

**Cloud Run: VERIFIED** — Running, serving 100% traffic. Memory upgraded to 1Gi to address OOM risk.
