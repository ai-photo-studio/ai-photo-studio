# FINAL REPORT – Phase 4.40 GPU Certification

## Verified Evidence

### Cloud Build
- **Build ID**: `87ac7aba-bf32-4224-a8d6-3dd39c9c5897`
- **Status**: Build SUCCESS, Deploy FAILURE (permission denied)

### Image Digest
- **Digest**: `sha256:b43cb243fc99162b11a2639fc0c9d457b6f04731f7f773e08a1154999e34f677`
- **Tag**: `v10-gpu`

### Cloud Run Revision
- **Revision**: `ai-photo-studio-bg-remover-gpu-00021-h6q`
- **Image**: `us-central1-docker.pkg.dev/project-9540c255-c960-4fa0-a91/ai-photo-studio-api/bg-remover:v10-gpu`

### Checkpoint Audit
- **Filename**: `sam2_hiera_base_plus.pt`
- **Source**: `https://dl.fbaipublicfiles.com/segment_anything_2/072824/sam2_hiera_base_plus.pt`
- **Architecture**: Base-plus model (65M params)

### Config Audit
- **Filename**: `sam2_hiera_b+.yaml`
- **Expected target**: Base-plus model config
- **Actual in deployed image**: Symlinked to `sam2_hiera_l.yaml` (Large model config)

### Hydra Audit
- **Version**: 1.3.4
- **Search path**: `/usr/local/lib/python3.11/dist-packages/sam2/configs/sam2`

### Package Versions
- **torch**: 2.5.1+cu121
- **torchvision**: 0.20.1+cu121
- **hydra-core**: 1.3.4
- **omegaconf**: 2.3.1
- **sam2**: 1.0 (commit 2b90b9f5ceec907a1c18123530e92e794ad901a4)
- **opencv**: 4.11.0.86
- **numpy**: 1.26.2

### Runtime Error
```
Missing key(s) in state_dict: "image_encoder.trunk.blocks.8.proj.weight", 
"image_encoder.trunk.blocks.b10.proj.weight", ...
RuntimeError: Error(s) in loading state_dict for SAM2Base
```

### Cloud Run Log Evidence
```
2026-07-05T13:41:58.376729Z  Segmentation fault
```

## Root Cause Analysis

**The deployed image contains the following Dockerfile lines:**
```dockerfile
rm -f /usr/local/lib/python3.11/dist-packages/sam2/configs/sam2/sam2_hiera_b+.yaml
ln -sf /usr/local/lib/python3.11/dist-packages/sam2/configs/sam2/sam2_hiera_l.yaml \
    /usr/local/lib/python3.11/dist-packages/sam2/configs/sam2/sam2_hiera_b+.yaml
```

This creates:
- **Config file**: `sam2_hiera_b+` (symlink) → `sam2_hiera_l.yaml` (Large model)
- **Checkpoint**: `sam2_hiera_base_plus.pt` (Base-plus model)

**Architecture mismatch:**
| Component | Architecture |
|-----------|--------------|
| Config `sam2_hiera_l.yaml` | Large (Huge image encoder) |
| Checkpoint `sam2_hiera_base_plus.pt` | Base-plus |

**Result**: State dict keys don't match → PyTorch native crash (segfault)

## CONFIG/CHECKPOINT MISMATCH CERTIFIED

The root cause is a CONFIG/CHECKPOINT mismatch in the Dockerfile.gpu that incorrectly symlinks the base-plus config to the large model config, while using a base-plus checkpoint. This causes a state_dict architecture mismatch that triggers a native CUDA segmentation fault.