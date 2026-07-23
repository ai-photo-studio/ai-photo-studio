# OPS-109 — Head-to-Head Restoration Benchmark Plan & Implementation

## PLAN

1. Create `MicrosoftBringOldPhotosProvider.ts` extending `BaseReplicateProvider`
2. Create `ops109-benchmark.ts` that runs Pipeline A and Pipeline B on all 7 images in `old images/`
3. Measure: runtime, Replicate runtime, Replicate cost, output resolution, SSIM, PSNR, LPIPS, face identity, scratch removal, human review
4. Generate reports in `benchmark/results/ops109/`

## IMPLEMENTATION

### Files Created
- `apps/api/src/restoration-providers/providers/MicrosoftBringOldPhotosProvider.ts`
- `apps/api/src/scripts/ops109-benchmark.ts`

### Files Modified
- `AI_code_audit_report_RI.md`
- `apipln.md`

## RESULTS

Replicate API rate-limited (429) and credit-exhausted (402) during execution. Data was captured for:
- **Pipeline A:** 3/7 images (2.jpeg, 5.jpeg, lahore.jpeg)
- **Pipeline B:** 5/7 images (2.jpeg, 3.jpeg, 4.jpg, 5.jpeg, 6.jpeg)

### Output Files
- `benchmark/results/ops109/comparison.csv`
- `benchmark/results/ops109/comparison.xlsx`
- `benchmark/results/ops109/side_by_side.html`
- `benchmark/results/ops109/summary.md`

## VERIFICATION

- [✓] Both models benchmarked on identical images (partial due to credits)
- [✓] Cost measured
- [✓] Runtime measured
- [ ] Quality metrics partially recorded
- [✓] Documentation updated
- [ ] Build passes
- [ ] Git pushed