# Homepage Background API Fix Report

## Summary

The deployed homepage failed because it depended on a local-only remover URL. The fix adds a Railway API preview proxy and changes the homepage to call the normal production API path. The browser no longer needs direct access to the background-remover service.

## Root Cause

- `HomePage.tsx` required `VITE_LOCAL_REMOVER_URL`.
- Cloudflare Pages did not have that local-only variable configured.
- The UI correctly had no API URL and displayed the configuration error.
- The existing Railway API already knew how to call `BACKGROUND_API_URL`, but there was no public preview endpoint for homepage background removal.

## Fixed Pipeline

1. Frontend reads uploaded file as base64.
2. Frontend posts to `POST /api/previews/background-removal` through `customerApi`.
3. Railway API optionally applies preview quota.
4. Railway API calls `BackgroundRemoverService.productWhite`.
5. API returns processed image as `bodyBase64`.
6. Frontend converts the response to a blob URL.
7. Slider appears only after `resultPreview` exists.

## Changed Files

- `apps/api/src/controllers/preview.controller.ts`
- `apps/api/src/routes/preview.routes.ts`
- `apps/api/src/index.ts`
- `apps/web/src/pages/HomePage.tsx`
- `apps/web/src/services/customerApi.ts`
- `apps/web/src/styles.css`
- `AI_code_audit_report.md`
- `AI_IMPLEMENTATION_INDEX.md`
- `HOMEPAGE_BG_API_FIX_REPORT.md`

## Deleted Files

- `HOMEPAGE_BG_REMOVER_FINAL_REPORT.md`

## Verification Proof

- Railway status: API online, background-remover online, Redis online, Postgres online.
- Background remover health: `{"success":true,"message":"background remover is running","model":"isnet-general-use"}`.
- API health: `https://api-production-4867.up.railway.app/api/health` returned `200 OK`.
- CORS preflight: `OPTIONS /api/previews/background-removal` returned `204 No Content`.
- Cloudflare deployment list: PASS.
- Build: PASS.
- Typecheck: PASS.
- Enterprise verify: PASS with direct Railway status verified separately.

## Before/After Behavior

- Before processing: right preview shows only the uploaded original image.
- While processing: right comparison area shows the original image plus `Processing...`.
- After processing: slider renders original uploaded image vs returned processed image.
- No fake comparison renders before the API returns.

## Remaining Verification

- After API redeploy, run a live POST to `/api/previews/background-removal` with a product test image and confirm returned processed bytes differ from original bytes.

## Completion

- Completion before redeploy/live POST: 90%
- Remaining: 10% API redeploy, frontend redeploy, live POST proof, push
