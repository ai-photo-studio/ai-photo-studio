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
