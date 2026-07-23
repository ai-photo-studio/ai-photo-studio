# OPS-114 Pipeline Chaining Verification

**Date:** 2026-07-23T12:11:13.245Z
**Image:** old images/2.jpeg
**Run Directory:** D:\AI Product Photo Studio on WhatsApp\benchmark\results\ops114\2026-07-23T12-10-49

## Execution Chain

**01_original** (01_original.png)
- SHA256: `3f6b0d3fd482e1f537c4120723c10999c9e1d3fbac7476c432d1085fd0900454`
- Dimensions: 525x380
- Size: 37.4KB
- Status: EXECUTED
- Provider: N/A
- Time: 0ms

**02_flux_restore** (02_flux_restore.png)
- SHA256: `da50e0e1e5047252e4f3d4270e8027cbd273844b0552acf2bfd9028fa9d8d778`
- Dimensions: 1184x880
- Size: 1653.8KB
- Status: EXECUTED
- Provider: FluxRestoreProvider (Replicate)
- Time: 22024ms

**03_gfpgan** (03_gfpgan.png)
- SHA256: `da50e0e1e5047252e4f3d4270e8027cbd273844b0552acf2bfd9028fa9d8d778`
- Dimensions: 1184x880
- Size: 1653.8KB
- Status: FAILED → ERROR: RunPod API key not configured
- Provider: RestorationGfpganService
- Time: 2ms

**04_realesrgan** (04_realesrgan.png)
- SHA256: `da50e0e1e5047252e4f3d4270e8027cbd273844b0552acf2bfd9028fa9d8d778`
- Dimensions: 1184x880
- Size: 1653.8KB
- Status: EXECUTED
- Provider: RealEsrganService
- Time: 2ms

**05_ddcolor** (05_ddcolor.png)
- SHA256: `da50e0e1e5047252e4f3d4270e8027cbd273844b0552acf2bfd9028fa9d8d778`
- Dimensions: 1184x880
- Size: 1653.8KB
- Status: FAILED → ERROR: RunPod API key not configured
- Provider: RestorationDdcolorService
- Time: 21ms

**06_lama** (06_lama.png)
- SHA256: `da50e0e1e5047252e4f3d4270e8027cbd273844b0552acf2bfd9028fa9d8d778`
- Dimensions: 1184x880
- Size: 1653.8KB
- Status: FAILED → ERROR: RunPod API key not configured
- Provider: RestorationInpaintService
- Time: 2ms

**07_final** (07_final.png)
- SHA256: `da50e0e1e5047252e4f3d4270e8027cbd273844b0552acf2bfd9028fa9d8d778`
- Dimensions: 1184x880
- Size: 1653.8KB
- Status: EXECUTED
- Provider: N/A (pipeline final)
- Time: 0ms

### Hash Flow Chain

```
[01_original] 3f6b0d3fd482e1f537c4...
    ↓
[02_flux_restore] da50e0e1e5047252e4f3...
    └─ HASH DIFFERS | Δ=90.68 | pxDiff=98.02%
    ⚠ CHAIN BROKEN at 01_original → 02_flux_restore

[02_flux_restore] da50e0e1e5047252e4f3...
    ↓
[03_gfpgan] da50e0e1e5047252e4f3...
    └─ HASH MATCH | Δ=0 | pxDiff=0%
    ⚠ Negligible visual change (<0.5% pixel difference)

[03_gfpgan] da50e0e1e5047252e4f3...
    ↓
[04_realesrgan] da50e0e1e5047252e4f3...
    └─ HASH MATCH | Δ=0 | pxDiff=0%
    ⚠ Negligible visual change (<0.5% pixel difference)

[04_realesrgan] da50e0e1e5047252e4f3...
    ↓
[05_ddcolor] da50e0e1e5047252e4f3...
    └─ HASH MATCH | Δ=0 | pxDiff=0%
    ⚠ Negligible visual change (<0.5% pixel difference)

[05_ddcolor] da50e0e1e5047252e4f3...
    ↓
[06_lama] da50e0e1e5047252e4f3...
    └─ HASH MATCH | Δ=0 | pxDiff=0%
    ⚠ Negligible visual change (<0.5% pixel difference)

[06_lama] da50e0e1e5047252e4f3...
    ↓
[07_final] da50e0e1e5047252e4f3...
    └─ HASH MATCH | Δ=0 | pxDiff=0%
    ⚠ Negligible visual change (<0.5% pixel difference)

[07_final] da50e0e1e5047252e4f3...
```

## Chain Verification Result

**PASS** — Image chaining is correct. Every stage receives the output of the previous stage.

### Notes

1. **01_original → 02_flux_restore:** Chain break is EXPECTED. FLUX Restore is an image transformation stage (resolution change: 525x380→1184x880, pixel diff 98.02%). This is not a chaining bug — the stage correctly consumes the original and produces a new image.

2. **02_flux_restore → 03_gfpgan → 04_realesrgan → 05_ddcolor → 06_lama → 07_final:** All stages correctly chain. However, GFPGAN, DDColor, and LaMa all FAILED due to missing RUNPOD_API_KEY and fell back to passthrough (returning the input unchanged). Real-ESRGAN is a passthrough because REAL_ESRGAN_URL is not set.

3. **Warnings:** 5 negligible-change warnings indicate local processing stages are not executing (identical SHA256 across 03-07). This is the root cause identified in OPS-113.

### Chaining Integrity Status

| Requirement | Result | Evidence |
|---|---|---|
| GFPGAN input == Flux output | VERIFIED | SHA256 match: da50e0e... == da50e0e... (passthrough on error preserves chain) |
| RealESRGAN input == GFPGAN output | VERIFIED | SHA256 match: da50e0e... == da50e0e... |
| DDColor input == RealESRGAN output | VERIFIED | SHA256 match: da50e0e... == da50e0e... |
| LaMa input == DDColor output | VERIFIED | SHA256 match: da50e0e... == da50e0e... |
| Final == LaMa output | VERIFIED | SHA256 match: da50e0e... == da50e0e... |

## Per-Transition Details

| From | To | Input SHA | Output SHA | Input WxH | Output WxH | Input KB | Output KB | AvgRGBΔ | pxDiff% | SSIM | PSNR | Chain OK | Negligible |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01_original | 02_flux_restore | 3f6b0d3fd482e1f5... | da50e0e1e5047252... | 525x380 | 1184x880 | 37.4 | 1653.8 | 90.68 | 98.02 | 0.05 | 7.24 | BROKEN | NO |
| 02_flux_restore | 03_gfpgan | da50e0e1e5047252... | da50e0e1e5047252... | 1184x880 | 1184x880 | 1653.8 | 1653.8 | 0 | 0 | 1 | 50 | VERIFIED | YES |
| 03_gfpgan | 04_realesrgan | da50e0e1e5047252... | da50e0e1e5047252... | 1184x880 | 1184x880 | 1653.8 | 1653.8 | 0 | 0 | 1 | 50 | VERIFIED | YES |
| 04_realesrgan | 05_ddcolor | da50e0e1e5047252... | da50e0e1e5047252... | 1184x880 | 1184x880 | 1653.8 | 1653.8 | 0 | 0 | 1 | 50 | VERIFIED | YES |
| 05_ddcolor | 06_lama | da50e0e1e5047252... | da50e0e1e5047252... | 1184x880 | 1184x880 | 1653.8 | 1653.8 | 0 | 0 | 1 | 50 | VERIFIED | YES |
| 06_lama | 07_final | da50e0e1e5047252... | da50e0e1e5047252... | 1184x880 | 1184x880 | 1653.8 | 1653.8 | 0 | 0 | 1 | 50 | VERIFIED | YES |