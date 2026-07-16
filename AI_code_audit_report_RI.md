# M5 Container Pipeline Report

**Project:** AI Photo Studio WhatsApp  
**Generated:** 2026-07-16T22:30 UTC+5  
**Phase:** M5 — Container Build Pipeline  

---

## 1. Image Inventory

| Service | Dockerfile Path | GHCR URL | Base Image | Port | CMD |
|---------|----------------|---------|------------|------|-----|
| Background Removal | `services/background-remover/Dockerfile` | `ghcr.io/ai-photo-studio/ai-bg-remover:latest` | `python:3.11-slim` | 8000 | `uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1` |
| LaMa Inpainting | `services/lama/Dockerfile` | `ghcr.io/ai-photo-studio/ai-lama:latest` | `python:3.11-slim` | 8000 | `uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}` |
| GFPGAN Face Restoration | `services/gfpgan/Dockerfile` | `ghcr.io/ai-photo-studio/ai-gfpgan:latest` | `python:3.11-slim` | 8000 | `uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}` |
| CodeFormer Enhancement | `services/codeformer/Dockerfile` | `ghcr.io/ai-photo-studio/ai-codeformer:latest` | `python:3.11-slim` | 8000 | `uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}` |
| DDColor Colorization | `services/ddcolor/Dockerfile` | `ghcr.io/ai-photo-studio/ai-ddcolor:latest` | `python:3.11-slim` | 8000 | `uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}` |
| Real-ESRGAN Upscaling | `services/real-esrgan/Dockerfile` | `ghcr.io/ai-photo-studio/ai-real-esrgan:latest` | `python:3.11-slim` | 8000 | `uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}` |

**All 6 Dockerfiles verified:** Valid. Each has `EXPOSE 8000`, Python 3.11-slim base, uvicorn startup.

---

## 2. RunPod Template Updates

### 2.1 Before (M4.5 — Broken)

| Service | Template ID | Image Name | Status |
|---------|------------|------------|--------|
| bg-remover | `vqdtnpy7tz` | `runpod/rembg:latest` | ❌ **NOT FOUND on Docker Hub** |
| lama | `frtl10x55s` | `runpod/lama:latest` | ❌ **NOT FOUND on Docker Hub** |
| gfpgan | `rl85g36pc4` | `runpod/gfpgan:latest` | ❌ **NOT FOUND on Docker Hub** |
| codeformer | `i9zrd1x9tx` | `runpod/codeformer:latest` | ❌ **NOT FOUND on Docker Hub** |
| ddcolor | `l1qm5ldu2b` | `runpod/ddcolor:latest` | ❌ **NOT FOUND on Docker Hub** |
| real-esrgan | `7sf3b8kyq9` | `runpod/real-esrgan:latest` | ❌ **NOT FOUND on Docker Hub** |

### 2.2 After (M5 — Fixed)

| Service | Template ID | Image Name | Status |
|---------|------------|------------|--------|
| bg-remover | `vqdtnpy7tz` | `ghcr.io/ai-photo-studio/ai-bg-remover:latest` | ✅ HTTP 200 |
| lama | `frtl10x55s` | `ghcr.io/ai-photo-studio/ai-lama:latest` | ✅ HTTP 200 |
| gfpgan | `rl85g36pc4` | `ghcr.io/ai-photo-studio/ai-gfpgan:latest` | ✅ HTTP 200 |
| codeformer | `i9zrd1x9tx` | `ghcr.io/ai-photo-studio/ai-codeformer:latest` | ✅ HTTP 200 |
| ddcolor | `l1qm5ldu2b` | `ghcr.io/ai-photo-studio/ai-ddcolor:latest` | ✅ HTTP 200 |
| real-esrgan | `7sf3b8kyq9` | `ghcr.io/ai-photo-studio/ai-real-esrgan:latest` | ✅ HTTP 200 |

**All templates patched successfully via `PATCH /v1/templates/{id}` with response code 200.**

---

## 3. CI/CD Workflow

### 3.1 Workflow File

`.github/workflows/docker-build.yml` created with 4 jobs:

| Job | Purpose | Trigger |
|-----|---------|---------|
| **detect-changes** | Determines which services changed | git diff HEAD~1 |
| **build-and-push** | Builds Docker image → pushes to GHCR | Per-service matrix |
| **update-runpod-templates** | Patches RunPod template imageName | After successful build |
| **verify** | Confirms endpoint versions updated | After template update |

### 3.2 Tags Published Per Image

| Tag | Format | Example |
|-----|--------|---------|
| `latest` | `latest` | `ghcr.io/ai-photo-studio/ai-bg-remover:latest` |
| `sha-<short>` | `sha-{7}` | `ghcr.io/ai-photo-studio/ai-bg-remover:sha-a1b2c3d` |
| semver `<version>` | `{major}.{minor}.{patch}` | `ghcr.io/ai-photo-studio/ai-bg-remover:1.2.3` |
| semver `<major>.<minor>` | `{major}.{minor}` | `ghcr.io/ai-photo-studio/ai-bg-remover:1.2` |

### 3.3 Trigger Paths

The workflow triggers on pushes to `main` that touch:
- `services/background-remover/**`
- `services/lama/**`
- `services/gfpgan/**`
- `services/codeformer/**`
- `services/ddcolor/**`
- `services/real-esrgan/**`
- `.github/workflows/docker-build.yml`

Manual trigger (`workflow_dispatch`) with `force_build_all` also supported.

---

## 4. GHCR Authentication

| Setting | Value |
|---------|-------|
| Registry | `ghcr.io` |
| Username | `${{ github.actor }}` |
| Password | `${{ secrets.GITHUB_TOKEN }}` |
| Permissions | `contents: read`, `packages: write` |

**No additional secrets required.** GitHub Actions provides `GITHUB_TOKEN` automatically with write access to packages when `permissions.packages: write` is set on the job.

---

## 5. End-to-End Pipeline

```
Developer pushes to main
    ↓
detect-changes: git diff identifies changed services
    ↓
build-and-push (matrix per service):
    ├── docker buildx services/<svc>/Dockerfile
    ├── docker tag: ghcr.io/ai-photo-studio/ai-<svc>:latest
    ├── docker tag: ghcr.io/ai-photo-studio/ai-<svc>:sha-<commit>
    ├── docker tag: ghcr.io/ai-photo-studio/ai-<svc>:<semver>
    └── docker push (all tags)
    ↓
update-runpod-templates:
    ├── PATCH /v1/templates/<id> → imageName = ghcr.io/.../ai-<svc>:latest
    └── HTTP 200 confirmed
    ↓
verify: List endpoints, confirm version incremented
```

---

## 6. Deployment Readiness

| Check | Status | Notes |
|-------|--------|-------|
| Dockerfiles valid | ✅ | All 6 verified |
| GHCR workflow created | ✅ | `.github/workflows/docker-build.yml` |
| RunPod templates updated | ✅ | All 6 pointing to GHCR |
| GHCR auth configured | ✅ | Uses built-in `GITHUB_TOKEN` |
| Container CMD matches template | ✅ | Both use `uvicorn app:app --host 0.0.0.0 --port 8000` |
| Workers will start | ⏳ | Requires first GHCR push from CI pipeline |
| Endpoints retain IDs | ✅ | Not recreated — templates patched in place |

**To complete:** Push to `main` to trigger the workflow. GHCR will receive the images. RunPod workers will pull from GHCR and start serving.

---

## 7. Files Modified During M5

| File | Change | Reason |
|------|--------|--------|
| `.github/workflows/docker-build.yml` | CREATE | Automated GHCR build & RunPod template update pipeline |
| `PROJECT_LOCK.json` | UPDATE | Template image source now GHCR |
| `AI_code_audit_report_RI.md` | REPLACE | This report — M5 Container Pipeline Report |

No application source files were modified.

---

## 8. Mandatory Rules Compliance

| Rule | Status |
|------|--------|
| Protected Scope Protocol active | ✅ Zero application files modified |
| No application feature changes | ✅ |
| No schema changes | ✅ |
| No manual image publishing | ✅ Automated via GitHub Actions |
| GitHub Actions as build source | ✅ `docker-build.yml` created |
| Git CLI for verification | ✅ `gh secret list` |
| Wrangler CLI not needed | ✅ |
| GCloud CLI for rollback | ✅ Cloud Run services active |
| AI_code_audit_report_RI.md updated | ✅ This report |

---

**End of Report**
