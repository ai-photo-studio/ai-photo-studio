# Latest Task Report

Date: 2026-08-07
Task: R9.3-P7/P8 HD Rotating Hero Slider — Release Candidate

## Classification
**HERO_RC_READY** (verified + committed + pushed). Upgrade of the live homepage hero comparison from the single `hero-compare.png` to 10 rotating HD before/after hero pairs. RC commit `f98d060830203ef96dfdf3690bfa111110779bfc`, pushed to `origin/setup/project-automation` (`ca7d797..f98d060`). Production deploy NOT executed (requires explicit owner authorization).

## Release candidate
- Isolated-index commit (`git commit --only`) contains ONLY the approved hero packet files. The 4 pre-existing unrelated staged API/canary files remain staged, untouched, and excluded from the commit.
- Pre-deploy verification of this exact RC (SHA `f98d060`): `typecheck` PASS, `build` PASS, `lint` 0 errors, `test:browser:responsive` 18/18 PASS, `test:browser` 54/54 PASS.
- Note: one cold-start flaky run of the responsive suite (4 failures on the very first invocation after build) resolved to 3 consecutive clean 18/18 passes; not a code regression.

## Hero asset status
All 10 concepts present with matched `*-then.jpg` + `*-now.jpg` HD originals (1600x1600) under `apps/web/public/assets/hero/hero/`, plus previews under `hero/preview/`, plus `hero-manifest.json` (captions/alt/damage_style/paths). Manifest then/now URLs corrected to the real `hero/` subpath. Concepts: old parents, grandparents, wedding, childhood siblings, large family, army officer, village family, old city/bazaar, migration/railway, loved-one memorial (10/10).

## Slider behavior
One locked square comparison frame, two aligned layers: base = Then/original, clipped overlay = Now/restored. Customer-draggable divider (mouse + touch + pointer, `setPointerCapture`, `touch-action:none` so no page-scroll conflict on mobile). Start 50%; left reveals old/Then, right reveals restored/Now. No duplicate Then/Now labels (only a manifest caption overlay). Same crop/position for both layers via identical square `object-fit: cover`.

## Random-load + rotation
Random first hero on every fresh mount. Auto-rotation ~7s resets divider to 50%, pauses during pointer interaction and resumes afterward; timer cleaned up on unmount. Preloads only current + next pair.

## Responsive / image quality
HD originals used directly (no browser re-upscale, no blurry stretching). Verified no horizontal overflow at 1440/1024/768/430/390/360; `object-fit: cover` preserves faces and centering across the square frame.

## Tests
`typecheck` PASS, `build` PASS, `lint` 0 errors (106 pre-existing warnings in unrelated files; none in new files), `test:browser:responsive` 18 PASS, full `test:browser` 54 PASS (44 prior + 10 new hero-slider tests). New tests cover: valid random pair selected on load; then/now belong to same hero; mouse/pointer drag; left reveals old / right reveals restored; auto-rotation; pause-while-interacting; no broken hero assets; CTA to `/restore/new`; no overflow; no console errors.

## Files changed
- New: `apps/web/src/components/HeroCompareSlider.tsx`, `apps/web/src/data/heroes.ts`, `apps/web/tests/browser/hero-slider.spec.ts`
- Modified: `apps/web/src/pages/HomePage.tsx`, `apps/web/src/styles.css`, `apps/web/package.json` (`test:browser` includes hero-slider), `apps/web/public/assets/hero/hero-manifest.json` (URLs), `docs/DECISIONS.md`, `docs/PROJECT_STATE.md`, `docs/PROTECTED_SCOPE.md`, this `reports/LATEST.md`

## Protected scope
No RunPod/Replicate/BankAlfalah/auth/R2/Prisma/DB/API/payment changes; R9.4 commerce bridge untouched. Upload Photo CTA/modal and `/restore/new` routing unchanged. `.gitignore` untouched. All prior unrelated staged/dirty/untracked files preserved (incl. the pre-existing deletion of `apps/web/public/assets/README_ASSETS.txt`). No `git add .`, no broad reset/stash. No commit/deploy/push this task (deploy needs explicit owner authorization).

---
## Historical: R9.4-P1 (2026-08-07) Prod Customer-Flow Verification

## Classification
Frontend commerce-as sales funnel: **VERIFIED / REPAIRED_NONE** (no regression repaired this run).
Full commercial readiness: **BLOCKED on PAYMENT_EXTERNAL_BLOCKER + processing/download/print bridge.**
No real charge made; no protected code modified; live site and code untouched (no new deploy).

## Live state verified
- `https://www.thannow.com` PRODUCTION_LIVE (RC `ca7d797`). API `https://api.thannow.com/api/health` 200; `api.thannow.com` reachable.
- Safe live probes: payment-readiness for a nonexistent order -> 404 (fail-closed, not fabricated); invalid fixed-order create -> 422.

## Customer journey findings (live audit, source + safe tests)
PASS (frontend commerce spine, working + fail-closed):
- Upload draft (guest token, R2, magic-byte validation) ✓
- Preview server-backed, survives refresh, original bytes only ✓
- Guest vs auth ownership isolation (uniform 404) ✓
- Tier/upscale select uses authoritative server PriceBook, not client hardcoded ✓
- Review/order persists server-side (immutable FixedOrder, idempotent) ✓
- Retry/error/session-expiry behavior ✓
- Payment fails closed (type/status/attempt-status/market/currency/amount/items/PriceBook-snapshot/provider gates all enforced) ✓
- No path in the fixed-order stack fabricates payment success ✓

PARTIAL/FAIL (documented, not repaired here):
- Payment guard before processing: legacy path accepts PENDING; entitlement gate only on the P3A worker path (PARTIAL).
- Processing/download/print states: only the legacy restoration path is DB-backed and it is disconnected from the commerce FixedOrder journey (PARTIAL).
- CORS/route: risk that an env `ALLOWED_ORIGINS` override drops thannow.com origins (PARTIAL).
- Print page `RestorePrintPage.tsx` (/restore/:orderId/print): static, hardcodes PKR 500-8000 (violates no-fake-price rule), receives only orderId, no API/restored image, Continue has no handler (FAIL).

## Payment readiness
PAYMENT_EXTERNAL_BLOCKER = TRUE. No live Bank Alfalah integration: no merchant id/credentials/return/cancel/webhook/IPN; provider config is manual/demo (env enum excludes bankalfalah); `bankAlfalahAdapter` is a permanent fail-closed shell; legacy demo mode can auto-approve PAID without provider verification (not reachable via the new fixed-order flow). Real charges cannot be placed.

## Defects found / fixed
No regressions introduced; no repairs required this verification run. Findings above are documented architectural/payment gaps for an authorized follow-up, not defects from this task.

## Tests
- `typecheck`, `build`, `test:browser:responsive` (18), full `test:browser` (44), focused customer-flow specs (22: fixed-order-flow + payment-attempt-flow + fixed-order-review-ui) all PASS.

## Files changed
- None (source). Docs updated: `docs/PROJECT_STATE.md`, this `reports/LATEST.md`. No commit/deploy/push this task.

## Protected scope
No RunPod/Replicate/BankAlfalah/auth/R2/Prisma/DB/API changes. `.gitignore` untouched. 4 pre-existing unrelated staged API/canary files preserved.

## Remaining blockers (commercial)
1. PAYMENT_EXTERNAL_BLOCKER (Bank Alfalah live integration + owner approval + credentials).
2. Commercial-build bridge: connect verified FixedOrder -> processing -> download -> print (backend, protected area).
3. Fix RestorePrintPage truthfulness (no fake prices) + wire real data, frontend if authorized.

## Next packet
R9.4-P2 (authorized): fix RestorePrintPage (no fake PKR; show sizes + "View Current Pricing"; wire restored image/order data) then package with the payment/architecture bridge; separately integrate Bank Alfalah with verified sandbox/docs (external/owner).
