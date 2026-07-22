# Quality Comparison

**Date:** 2026-07-22  
**Benchmark:** OPS-95  
**Image:** 2.jpeg (525×380, 38,247 bytes)

---

## 1. Measured Metrics

| Metric | Original | Replicate | OpenAI |
|---|---|---|---|
| SSIM (vs original) | 1.00 | 0.80 | 0.78 |
| PSNR (vs original) | ∞ | 7.66 | 6.98 |
| Sharpness | 2 | 100 | 100 |
| Noise | 3 | 100 | 100 |
| Contrast | 2 | 100 | 100 |
| Brightness | 117 | 100 | 100 |
| Print Quality | 5 | 81 | 81 |

**Note:** All quality metrics are calculated by `QualityMetricsCalculator`. Values above ~0.8 SSIM, >30 PSNR indicate near-identical images. The low PSNR values (~7-8) indicate significant visual differences — both providers substantially change the image.

---

## 2. Quality Scores (0-100)

| Quality Dimension | Replicate | OpenAI | Winner |
|---|---|---|---|
| Scratch Removal | 53 | 49 | Replicate |
| Crack Repair | 53 | 49 | Replicate |
| Dust Removal | 100 | 100 | Tie |
| Face Restoration | 73 | 69 | Replicate |
| Identity Preservation | 85 | 83 | Replicate |
| Background Preservation | 57 | 60 | OpenAI |
| Natural Appearance | 83 | 76 | Replicate |
| Print Readiness | 5 | 5 | Tie |
| **Overall Quality** | **85/100** | **85/100** | **Tie** |

---

## 3. Visual Assessment

### Visible Issues in Output

| Issue | Original | Replicate | OpenAI |
|---|---|---|---|
| Scratches visible | ✅ (many) | ❌ (still visible) | ❌ (still visible) |
| Cracks visible | ✅ (yes) | ❌ (still present) | ❌ (still present) |
| Dust visible | ✅ (yes) | ❌ (still present) | ❌ (still present) |
| Faces restored | N/A | ✅ (4 faces detected) | ❌ (not specialized) |
| Image resharpened | N/A | ✅ (sharpness 100) | ✅ (sharpness 100) |
| Over-processed | N/A | ❌ (some over-sharpening) | ❌ (full regeneration) |
| Identity preserved | N/A | ✅ (face identity kept) | ❌ (regenerated) |
| Background unchanged | N/A | ✅ (mostly) | ❌ (regenerated) |

### Visual Quality Rating

| Category | Replicate | OpenAI |
|---|---|---|
| Scratch removal | 2/10 | 2/10 |
| Crack repair | 2/10 | 2/10 |
| Face quality | 7/10 | 5/10 |
| Natural look | 5/10 | 3/10 |
| Print readiness | 1/10 | 1/10 |
| **Overall visual** | **3/10** | **2/10** |

---

## 4. Commercial Readiness

| Criterion | Met? | Detail |
|---|---|---|
| Scratches removed | ❌ | Still visible in both outputs |
| Cracks repaired | ❌ | Still present |
| Print-quality output | ❌ | Print quality score: 5/100 |
| Identity preserved | ⚠️ | Replicate: faces kept. OpenAI: regenerated |
| Professional grade | ❌ | Neither provider achieves commercial quality |

**Neither provider is commercially ready for photo restoration.** Both require additional stages (damage detection, inpainting, proper face restoration) to achieve true restoration quality.

---

## 5. Conclusion

| Finding | Value |
|---|---|
| Best provider (quality) | Replicate (wins 5/8 dimensions) |
| Both overall quality | 85/100 (misleading — scoring amplifies minor differences) |
| Visual quality | 2-3/10 — NOT commercially acceptable |
| Print readiness | 1/10 — not suitable for printing |
| True commercial quality | Requires multi-stage pipeline (see CommercialRestorationPipeline.md) |
