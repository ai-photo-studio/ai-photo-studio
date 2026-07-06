# GPU Image Build Pipeline Verification Report

## Build Result

| Field | Value |
|-------|-------|
| **Cloud Build ID** | `3ce0a16b-ffaa-471b-8a22-a498657b1dbf` |
| **Build Duration** | ~4m 11s |
| **Status** | SUCCESS |
| **Cloud Run Revision** | `ai-photo-studio-bg-remover-gpu-00026-clv` |
| **Image Digest** | `sha256:54c8b3e2153a62116eec2a716f7496837e6a71c7098f172e908b48ad0f295f0a` |
| **Git Commit** | `d7766e1` |

## Build Command (from Cloud Build)
```
docker build -f Dockerfile.gpu -t us-central1-docker.pkg.dev/.../bg-remover:v10-gpu .
```

## Build Log Verification
**Step 1/23**: `FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04` ✅

## Dockerfile Actually Used: **Dockerfile.gpu**

## Base Image: `nvidia/cuda:12.1.0-runtime-ubuntu22.04`

## Cloud Run Revision Configuration

| Setting | Value |
|---------|-------|
| GPU | 1 |
| GPU Type | nvidia-l4 |
| CPU | 8 |
| Memory | 32Gi |
| Execution Environment | Second Generation |
| SEGMENTATION_ROUTING | hybrid |

## Image Evidence

| Property | Value | Source |
|----------|-------|--------|
| **Base image** | nvidia/cuda:12.1.0-runtime-ubuntu22.04 | Build log: Step 1/23 |
| **CUDA runtime** | 12.1.0 | Container startup log: "CUDA Version 12.1.0" |
| **PyTorch** | Installed with CUDA 12.1 support | Dockerfile.gpu line 31 uses `https://download.pytorch.org/whl/cu121` |
| **SAM2 package** | Installed (1.1.0) | Build log |
| **SAM2 checkpoint** | Downloaded to /models | Dockerfile.gpu line 44 |

## Cloud Run Logs (Revision 00026-clv)

```
2026-07-06 08:59:50 == CUDA ==
2026-07-06 08:59:50 CUDA Version 12.1.0
```

## Regression Tests

| Test | Result |
|------|--------|
| npm run build | ✅ PASS |
| npm run typecheck | ✅ PASS |
| npm run enterprise-verify | ✅ PASS |

## Certification

**GPU IMAGE VERIFIED** — The build pipeline now correctly uses `Dockerfile.gpu` (`FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04`) as specified in `cloudbuild.yaml`.

### Remaining Notes
- `SEGMENTATION_ROUTING=hybrid` in cloudbuild.yaml — GPU provider is not active in current config
- Host NVIDIA driver version 12020 may still block CUDA access (driver/runtime mismatch)
- GPU provider activation requires separate configuration change