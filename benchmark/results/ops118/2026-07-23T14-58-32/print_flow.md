# Print Flow

**Date:** 2026-07-23T14:59:23.413Z

## Print Sizes (defined in print-preparation.service.ts)

| Size | Dimensions (mm) | Dimensions (inches) | Print Resolution (px) | DPI |
|---|---|---|---|---|
| 4x6 | 102×152 | 4"×6" | 1200×1800 | 300 |
| 5x7 | 127×178 | 5"×7" | 1500×2100 | 300 |
| 8x10 | 203×254 | 8"×10" | 2400×3000 | 300 |
| A4 | 210×297 | 8.27"×11.69" | 2480×3508 | 300 |
| A3 | 297×420 | 11.69"×16.54" | 3508×4960 | 300 |

## Print Flow Steps

| Step | Status | Notes |
|---|---|---|
| 1. Photo Size Selection | SCAFFOLDED | Sizes defined, UI pending |
| 2. Paper Type | SCAFFOLDED | Classes: Matte, Glossy, Lustre |
| 3. Finish | SCAFFOLDED | Options: Standard, Premium |
| 4. Frame | SCAFFOLDED | Options: None, Basic, Deluxe |
| 5. Quantity | SCAFFOLDED | 1-100 copies |
| 6. Shipping Address | PENDING | Address form not implemented |
| 7. Courier Selection | PENDING | Integration not implemented |
| 8. Payment | EXISTING | Uses existing payment flow |
| 9. Order Confirmation | PENDING | Confirmation page not implemented |

## Print Readiness Assessment (existing)

`print-readiness.service.ts` evaluates if an image meets print quality thresholds:
- DPI check (target: 300 DPI)
- Resolution score
- Quality score (SSIM, sharpness, contrast)
- Warnings for low resolution, blur, noise