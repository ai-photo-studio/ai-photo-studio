# Project State

Updated: 2026-08-03

## Confirmed repository facts
- Repository: AI Product Photo Studio on WhatsApp.
- Root package is a private npm workspace with `apps/api` and `apps/web`.
- API: TypeScript/CommonJS Express service using Prisma, PostgreSQL-oriented persistence, Redis/BullMQ, object-storage SDKs, JWT, and image processing.
- Web: TypeScript/React/Vite application with Playwright browser tests.
- Additional worker package: `runpod-worker-dev`; API also contains RunPod provider/worker code.
- Root scripts define build, typecheck, lint, scope checks, focused API tests, browser tests, database validation, and deployment-readiness checks.
- Repository documentation references Cloudflare Pages for the frontend, Northflank for the API, managed PostgreSQL/Redis, and Cloudflare R2. These are documented architecture facts, not live deployment verification.
- `rules.md` documents Replicate as the active production AI provider and RunPod as protected/disabled unless separately authorized.
- `AI_code_audit_report.md` exists and is preserved as the audit-report convention.
- Prisma schema and migration history exist under `apps/api/prisma`.

## Confirmed from direct verification
- `git branch --show-current` reported `setup/project-automation`.
- `npm run typecheck` passed for API and web.
- `npm run build` passed for API and web; Vite produced a build.
- `npm run scope:check` failed because the script expects `main`.
- `npm run project-info` failed because `PROJECT_LOCK.json` is missing.
- No CI workflow files were found under `.github/workflows` during inspection.

## Confirmed repository state
- Git status contains pre-existing staged, unstaged, and untracked changes outside this setup task.
- This task added project automation documentation files only.

## Known issues and uncertainty
- Production deployment state, cloud credentials, runtime environment values, payment activation, proxy topology, and live provider availability were not verified and must not be inferred from source files.
- Exact CI configuration is unknown because no workflow files were found.
- Current and historical deployment/provider documents should be reconciled during the next validation task.

## Safe verification commands
- `npm run scope:check`
- `npm run project-info`
- `npm run typecheck`
- `npm run build`
- `npm run lint`
- Focused tests listed in root and workspace `package.json` files.
- Do not run deployment, push, destructive database, or cloud-mutating commands for routine verification.

## Updated 2026-08-07 (R9.3 ThanNow UI launch)
- The public shell and homepage now follow the LOCKED `UI/DESIGN_LOCK.md` human-memory direction (Restore -> Upscale -> Print): `PublicLayout.tsx`, `HomePage.tsx`, `apps/web/src/styles.css` thannow scoped styles, `index.html`.
- Verified on branch `setup/project-automation`: `typecheck -w apps/web` passed, `build -w apps/web` passed, lint clean for changed files, `test:browser:responsive` (18) passed, `test:browser` (44) passed.
- `UI/assets/` image files are absent; `RenderAsset` placeholder slots are shown until owned images are supplied. This is a content-completeness item, not a code blocker.
- `UI/` is untracked but must be committed/preserved as canonical design source (not gitignored).

## Updated 2026-08-07 (R9.3-P1 assets & visual verification)
- Confirmed all 16 approved homepage assets are still absent -> classified **BLOCKED_OWNER_ASSETS**; clean placeholders auto-render and will auto-replace once files are added under `apps/web/public/assets/`.
- Verified no horizontal overflow, usable primary controls, floating Upload CTA on mobile, correct Upload CTA routing to `/restore/new`, and truthful PKR print pricing at 1440/1024/768/430/390/360.
- Verified: `typecheck -w apps/web`, `build -w apps/web`, lint (changed files) passed; `test:browser:responsive` (18) passed; `test:browser` (44) passed.

## Updated 2026-08-07 (R9.3-P1 asset drop — blocker cleared)
- All 16 approved human-memory assets are now in `apps/web/public/assets/` (served at `/assets/`). Homepage renders all 16 (0 placeholders, 0 broken images) at desktop and mobile, and the build packages them into `dist/assets/`.
- Shared `apps/web/public/assets/README_ASSETS.txt` documents the approved asset pack install locations. Exact-file ownership of the published URLs under `/assets/` is now finalized UI scope.
- `typecheck`, `build`, lint, `test:browser:responsive` (18), and `test:browser` (44) all pass; the asset blocker is cleared.

## Updated 2026-08-07 (R9.3-P2 launch prep — DEPLOY_READY)
- Deploy target verified: Cloudflare Pages via `apps/web/wrangler.toml` (`pages_build_output_dir="dist"`, project `ai-photo-studio-frontend`); SPA fallback `apps/web/public/_redirects` (`/* /index.html 200`); production API `https://api.thannow.com`.
- Removed legacy `apps/web/src/main.tsx` product-studio runtime branding + placeholder analytics (now gated behind `VITE_GTM_MEASUREMENT_ID`/`VITE_FACEBOOK_PIXEL_ID`).
- Production-build probe (serving `dist/`): `/` 200 with ThanNow title, deep SPA routes 200, critical Home->Upload->/restore/new path works, `/assets/*` resolve, no old branding/example/placeholder IDs, mobile no-overflow + floating CTA.
- Final verification: `typecheck`, `build`, lint, `test:browser:responsive` (18), `test:browser` (44) all pass.
- Deployment intentionally not executed (push/wrangler pages deploy) — requires explicit owner authorization per rules.md; exact commands recorded in `reports/LATEST.md`.

## Updated 2026-08-07 (R9.3-P3 release candidate — pushed)
- Released on branch `setup/project-automation` as commit `ca7d797` ("R9.3: ThanNow Restore -> Upscale -> Print release candidate"), pushed to `origin/setup/project-automation` (`f47b6cf..ca7d797`).
- Commit contains ONLY the 39 approved R9.3 launch files (web source, 16 assets + README, browser tests, canonical docs). Four pre-existing unrelated staged API/canary files were excluded from the commit and remain staged/untouched.
- RC status: RELEASE_CANDIDATE_READY. Plan: release candidate from `origin/setup/project-automation`; production deployment still requires explicit owner authorization (merge to `main` for auto-deploy or direct `npx wrangler pages deploy apps/web/dist --project-name ai-photo-studio-frontend`).

## Updated 2026-08-07 (R9.3-P4 prod-deploy smoke — WAITING_OWNER_AUTH)
- RC commit `ca7d797` is pushed and in sync with `origin/setup/project-automation`. Pre-deploy verification evidence for this exact RC is clean (typecheck, build, browser:responsive 18, browser 44).
- **Production deployment was NOT executed:** rules.md requires explicit owner authorization for production deployment, and no explicit authorization exists in this session. Status: WAITING_OWNER_AUTH. Respective live smoke checks (`https://www.thannow.com`) cannot run until deploy is authorized.
- Exact deploy/next action (on owner authorization):
  1. `npx wrangler pages deploy apps/web/dist --project-name ai-photo-studio-frontend` (from `setup/project-automation`), or merge the RC to `main` for the Pages auto-deploy path documented in CI config.
  2. Activate `www.thannow.com` custom domain in Cloudflare Pages if needed (rules.md lists it as deactivated).
  3. Then run live smoke checks against `https://www.thannow.com` (branding, 16 assets, Upload CTA -> /restore/new, Restore->Upscale->Print journey, login/pricing/nav, mobile CTA, SPA deep-route refresh, `https://api.thannow.com` target, no placeholder analytics/secrets).

## Updated 2026-08-07 (R9.3-P5 prod deploy — PRODUCTION_LIVE)
- Deployed RC commit `ca7d797` to production for `www.thannow.com` (owner-authorized, R9.3 frontend scope only).
- Deployment target: Cloudflare Pages project `ai-photo-studio-frontend` (Production). Domains attached: `ai-photo-studio-frontend.pages.dev`, `thannow.com`, `www.thannow.com`. Direct Pages deploy of `apps/web/dist` (RC build); both `thannow.com` and `www.thannow.com` return the RC (title `ThanNow | Restore, Upscale and Print Memories`).
- Live smoke (Playwright against `https://www.thannow.com`): HTTP 200; correct ThanNow branding; no old AI Product Studio/example branding; all 16 assets return 200 (no broken images); hero + Upload Photo visible; upload modal opens and Continue routes to `/restore/new`; deep SPA routes (`/restore/new`, `/login`, `/pricing`, `/restore`) 200 with app mounted; nav (7) + footer (8) links; mobile no horizontal overflow + floating upload CTA; no placeholder analytics/secrets; zero launch-critical console errors; production API target `https://api.thannow.com` confirmed in the production JS bundle.
- Final verification before deploy: `typecheck`, `build`, `test:browser:responsive` (18), `test:browser` (44) all passed.
- Status: PRODUCTION_LIVE for the R9.3 frontend. Post-launch polish (verified testimonials, real analytics IDs via `VITE_GTM_MEASUREMENT_ID`/`VITE_FACEBOOK_PIXEL_ID`, SEO/caching) deferred.

## Updated 2026-08-07 (R9.4-P1 prod customer-flow verification)
Frontend is PRODUCTION_LIVE at `www.thannow.com` (RC `ca7d797`, API `https://api.thannow.com` reachable, `/api/health` 200). Audited the LIVE customer journey (Upload -> Preview -> Upscale/Select -> Review -> Order -> Payment Readiness -> Processing -> Download -> Print) without making any charge or modifying protected code.

Verified working (frontend commerce spine: draft -> targeted offers -> immutable FixedOrder -> payment-readiness -> idempotent PaymentAttempt):
- Upload creates a valid draft (guest token, R2, magic-byte validation). PASS.
- Preview is server-backed (signed R2 URL, survives refresh, original bytes only). PASS.
- Guest vs auth ownership isolation enforced (uniform 404). PASS.
- Tier/upscale select uses authoritative server PriceBook (PB-2026-08-03-v1), never client hardcoded. PASS.
- Review/order state persists server-side (immutable FixedOrder, idempotent sourceDraftId). PASS.
- Retry/error/session-expiry handled (RETRYABLE_STATUSES, 401->expired, P2002 idempotency). PASS.
- Payment fails closed: order type/status, attempt PAID/REFUNDED/blocked, market/currency, total>0, line items, unapproved pricing, missing PriceBook snapshot, provider-not-ready all gate payment. PASS.
- No path in the fixed-order stack fabricates payment success. PASS.
Tests: `typecheck`, `build`, `test:browser:responsive` (18), full `test:browser` (44), focused customer-flow specs (22) all pass. Live API probe: payment-readiness for nonexistent order returns 404 (fail-closed, not fabricated); invalid fixed-order create returns 422.

Architectural gaps (NOT repaired here; require authorized commercial-build/payment packet):
- The commerce FixedOrder spine and the legacy RestorationOrder processing/download/print spine are not connected: a verified FixedOrder never creates a legacy restoration order/item, so processing/download/print are not reachable as a connected flow from the payment journey (audit check 6/7 PARTIAL, check 9 FAIL).
- `RestorePrintPage.tsx` (`/restore/:orderId/print`) is static: hardcodes PKR prices 500-8000 client-side (violates the no-fake-price rule), receives only `orderId`, makes no API calls, no restored image, Continue button has no handler.
- PAYMENT_EXTERNAL_BLOCKER: no live Bank Alfalah integration. Provider config is manual/demo only (env enum jazzcash/easypaisa/manual/demo); no merchant id, no gateway return/cancel/webhook/IPN; `bankAlfalahAdapter` is a fail-closed shell (always not-ready). Legacy demo mode can auto-approve PAID without provider verification (not reachable via the new fixed-order flow). Real money cannot be charged.

Status: frontend-sales-funnel verified; FULL COMMERCIAL readiness blocked on PAYMENT_EXTERNAL_BLOCKER + the processing/download/print bridge. No source or deploy changes made in this verification task.

## Updated 2026-08-07 (R9.3-P7 HD rotating hero — app-layer complete, deploy not executed)
- Upgraded the LIVE homepage hero comparison from the single `hero-compare.png` to 10 rotating HD before/after hero pairs (all `assets/hero/hero/*` 1600x1600 original quality, no re-upscale).
- New `HeroCompareSlider.tsx` renders one locked square comparison frame: base layer = Then/original, clipped overlay = Now/restored; customer-draggable divider (mouse/touch/pointer, `touch-action:none`), starts at 50%, random first hero on mount, auto-rotation ~7s resetting to 50%, pause while dragging + resume, and preloads only current+next pair. Typed registry in `src/data/heroes.ts` mirrors `hero-manifest.json` (which had its then/now URLs corrected to the real `hero/` subpath). All 10 concepts in use with manifest captions/alt.
- Homepage Upload Photo CTA/modal and `/restore/new` routing unchanged. No protected payment/RunPod/R2/Prisma/API changes.
- Verification: `typecheck` PASS, `build` PASS, `lint` 0 errors (106 pre-existing warnings in unrelated files), `test:browser:responsive` 18 PASS, full `test:browser` 54 PASS (added 10 new hero-slider tests). Deployment (wrangler/deploy) NOT executed — requires explicit owner authorization per rules.md.

## Updated 2026-08-07 (R9.3-P7/P8 hero RELEASE_CANDIDATE — committed + pushed, HERO_RC_READY)
- Hero RC commit `f98d060830203ef96dfdf3690bfa111110779bfc` created via isolated index (`git commit --only`) containing ONLY the approved hero packet files (component, data, HomePage, styles, main, package.json, hero-slider spec, all `assets/hero/**`, and the 4 canonical docs). Pushed to `origin/setup/project-automation` (`ca7d797..f98d060`).
- Pre-deploy verification for this exact RC: `typecheck`, `build`, `lint` (0 errors), `test:browser:responsive` 18/18, `test:browser` 54/54 all PASS.
- The 4 pre-existing unrelated staged API/canary files remain staged and untouched (excluded from the commit, still in the working tree).
- Status: **HERO_RC_READY**. Production deploy NOT executed — requires explicit owner authorization. Deploy target remains Cloudflare Pages `ai-photo-studio-frontend` (via `npx wrangler pages deploy apps/web/dist` or the Pages auto-deploy path), same as R9.3-P5.

## Updated 2026-08-07 (R9.3-P9 hero PRODUCTION deploy — PRODUCTION_LIVE)
- Owner-authorized production deploy of hero RC commit `cceb5d0` to `www.thannow.com`. Cloudflare Pages project `ai-photo-studio-frontend`.
- Initial default `wrangler pages deploy` landed on **Preview** (project production branch is `main`; branch was `setup/project-automation`). Redeployed the exact same verified `apps/web/dist` with `--branch main` → reached **Production**: deployment `abadf7d7-9d85-49f7-9cb7-3fa135a53b8d`, branch `main`, commit `cceb5d0`. `www.thannow.com` serves the hero RC.
- Live smoke at `https://www.thannow.com` (Playwright): one compare frame; random valid hero on fresh load (4 distinct heroes across 5 fresh loads); then/now belong to same hero; drag left reveals old / right reveals restored; auto-rotation ~7s resets to 50%; pointer/mouse interaction works; all 10 hero pairs load without broken assets; no horizontal overflow at 1440/1024/768/430/390/360; Upload Photo CTA routes to `/restore/new`; no `hero-compare.png` dependency; no launch-critical console/page/network errors. All PASS.
- Pre-deploy verification: `typecheck`, `build`, `test:browser:responsive` (18), `test:browser` (54) all PASS.
