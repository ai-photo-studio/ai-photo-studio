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
