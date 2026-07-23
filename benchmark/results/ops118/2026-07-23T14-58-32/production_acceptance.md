# OPS-118 Production End-to-End Acceptance Test

**Date:** 2026-07-23T14:59:23.413Z
**Image:** old images/2.jpeg (3f6b0d3fd482e1f5...)
**Pipeline:** RESTORATION_PIPELINE=replicate

## Test Results Summary

| Test | Status | Details |
|---|---|---|
| 1. Region Detection | PASS | 7 test cases |
| 2a. Image Upload | VERIFIED | 37.4KB uploaded |
| 2b. Replicate Restore | PASS | 49830ms, $0.0464 |
| 2c. Watermarked Preview | PASS | 20213.9KB |
| 2d. Signed URL | PASS | 900s expiry |
| 3. Download Packages | VERIFIED | PKR + USD pricing configured |
| 4. Print Flow | SCAFFOLDED | 9 steps defined, fulfillment pending |
| 5. API Responses | VERIFIED | 10 endpoints audited |

## Customer Journey Timeline

```
Customer Upload (2.jpeg, 37.4KB, SHA: 3f6b0d3fd482e1f5..)
  ↓
Region Detection (PASS — see regional_routing.md)
  ↓
Replicate Restore: flux_restore → gfpgan_face → gfpgan_upscale (49830ms, $0.0464)
  ↓
Generate Watermarked Preview (20213.9KB)
  ↓
Preview Page (signed URL, 900s expiry)
  ↓
Customer Chooses: Download ($1.50-$3.50 USD / ₨250-₨500 PKR) OR Print
  ↓
Payment (JazzCash / EasyPaisa / Manual via Bank Alfalah)
  ↓
Signed Download URL (15 min) / Print Order Confirmation
```

## File Manifest

| File | Description |
|---|---|
| production_acceptance.md | This report |
| regional_routing.md | Region detection test results + pricing |
| payment_flow.md | Payment journey documentation |
| download_security.md | Signed URL security audit |
| print_flow.md | Print flow scaffolding |
| journey_screenshots/ | Intermediate images at each stage |