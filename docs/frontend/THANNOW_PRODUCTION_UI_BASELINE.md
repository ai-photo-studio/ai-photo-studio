# ThanNow Production UI Baseline

Status: locked

## Source of truth

- Frontend visual source of truth: `646f27b565aa7b9fb7baa6a781f8656ccf8c2662`
- Locked production deployment: `44595069-4841-4ea6-bd72-4acd523fd353`
- Locked production URL: `https://www.thannow.com`

## Permanent distinction

- Backend source of truth: current canonical `origin/main` APIs and customer
  flow.
- Frontend visual source of truth: the locked production presentation above.
- Newer backend/main changes do not automatically replace approved frontend
  presentation.

## Protected presentation scope

These frontend presentation files are protected against silent regression:

- `apps/web/src/pages/HomePage.tsx`
- `apps/web/src/components/PublicLayout.tsx`
- `apps/web/src/components/CustomerLayout.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/App.tsx`
- `apps/web/src/data/heroes.ts`
- `apps/web/src/components/HeroCompareSlider.tsx`
- `apps/web/public/assets/hero/hero/**`

## Approved structural signature

- Brand: `ThanNow`
- Homepage CTA text: `Upload Photo and View Pricing`
- Approved hero: Premium Hero V2, one frame, Then left / Now right, horizontal
  handle, random first selection, ~7 second rotation, pause on interaction
- Approved homepage structure: hero + memories + upscale + printing + how it
  works + pricing + final upload block + upload modal
- Approved navigation signature: public header links to Home, Restoration,
  Upscaling, Printing, How It Works, Pricing, plus Login / Sign Up / Get
  Started

## Regression rule

Any future frontend presentation change must be owner-requested and must ship
with updated screenshots, validator updates, and protocol updates. The older
generic UI and any older home-page composition remain rejected.
