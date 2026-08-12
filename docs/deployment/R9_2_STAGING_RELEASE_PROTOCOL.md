# R9.2 Staging Release Protocol

Status: **preflight/readiness only. No deployment was performed by this
packet.** Companion documents: `docs/deployment/R9_2_STAGING_ENVIRONMENT_MATRIX.md`
(env var matrix), `docs/deployment/P4B_WORKER_NORTHFLANK_RUNBOOK.md` and
`docs/deployment/P4B_WORKER_SERVICE_READINESS_PROTOCOL.md` (worker detail),
`northflank/p4b-worker.service.yaml` (worker reference definition).

## 1. Architecture audit (repository configuration only, no secret values read/printed)

| Component | Repository evidence | Status |
|---|---|---|
| Cloudflare Pages (web) | `apps/web/wrangler.toml` — `pages_build_output_dir = "dist"`, `name = "ai-photo-studio-frontend"`. Build: `npm run build -w apps/web` (Vite → `dist/`) | Config present |
| Northflank (API) | `Dockerfile` (repo root) — `CMD ["node", "--expose-gc", "dist/index.js"]`, `EXPOSE 8080`, `HEALTHCHECK` hits `GET /api/health` | Config present |
| Northflank (dedicated P4B worker) | `northflank/p4b-worker.service.yaml` — `startCommand: "node dist/scripts/p4b-worker-runner-main.js"`, same image as API, `publicPorts: []`, `instances: 1` | Config present, **not yet created as an actual Northflank service** |
| Neon (PostgreSQL) | `DATABASE_URL` consumed identically by API and worker via `loadConfig()`; `apps/api/prisma/schema.prisma` — 21 tracked migrations | Config present |
| Cloudflare R2 (private storage) | `apps/api/src/services/storage.service.ts` — `R2StorageProvider` uses `@aws-sdk/client-s3` + `getSignedUrl()` exclusively; no unsigned/public URL path found in source | Config present, verified private-by-construction |
| Replicate (restoration provider) | `RESTORATION_PROVIDER` enum `["replicate","mock"]`, defaults `"replicate"`; worker's own guard throws otherwise | Config present |
| Bank Alfalah (disabled pending UAT) | `BANK_ALFALAH_MPGS_ENABLED` defaults `"false"`; every dependent field only validated/required when explicitly `true` | Confirmed disabled by default |
| RunPod (blocked) | `RESTORATION_PROVIDER` enum contains no RunPod value; no code path in the restoration/worker chain can select it | Confirmed blocked at the type level |

## 2. Health/readiness

- **API**: `GET /api/health` (liveness/basic), `GET /api/monitoring/health`,
  `GET /api/monitoring/queue`, `GET /api/monitoring/worker` (deeper
  monitoring surface). `Dockerfile HEALTHCHECK` polls `/api/health` on
  `$PORT` every 30s.
- **Worker**: no HTTP surface, no port bound (confirmed live in the prior
  packet — see `P4B_WORKER_SERVICE_READINESS_PROTOCOL.md`). Health is
  process-liveness only: Northflank restarts on unexpected exit; the
  expected boot log line is `"P4B worker runner: starting"` with
  `restorationProvider:"replicate"`, `concurrency:1`.

## 3. Migration ownership

- `Dockerfile` bakes `ENV SKIP_MIGRATIONS=true` into the one shared image
  used by both the API and worker services — **neither container ever
  runs `prisma migrate deploy` on boot.**
- The owner runs `npx prisma migrate deploy` (or `migrate status` first,
  to preview) manually, exactly once, against the Neon staging database,
  before either service starts for the first time or whenever a PR adds a
  new migration.

## 4. Rollback controls

- **API / worker (both)**: stateless containers, no local persistent
  state. Rollback = redeploy the previous known-good image/build in
  Northflank. No migration rollback is defined or needed unless a
  migration itself must be reverted (out of scope for a normal code
  rollback).
- **Worker specifically**: the safest immediate action on a suspected bad
  deploy is scaling the worker service to zero instances — `QUEUED`/
  `PROCESSING` rows remain untouched and are picked up again once a
  healthy instance resumes polling; no customer-facing request path
  depends on the worker being up.
- **Feature-disable without a rollback**: flip `BANK_ALFALAH_MPGS_ENABLED`,
  `STORAGE_PROVIDER`, or `AI_PROVIDER` and restart the affected service —
  no image change required.

## 5. GO/NO-GO table

| Item | Status |
|---|---|
| API image builds, health endpoint responds | GO |
| Worker start command correct, no public port | GO |
| Worker deployed as its own Northflank service | **NO-GO — not yet created (owner action, step 6 below)** |
| Migrations run exactly once, by neither container automatically | GO |
| R2 access signed-URL-only | GO |
| Replicate selected, RunPod structurally blocked | GO |
| Bank Alfalah live payments | **NO-GO — sandbox `401`, support email sent, frozen pending bank reply** |
| Rollback / feature-disable documented | GO |
| `verify:staging-preflight` passes locally | GO (see §7) |

**Overall: NO-GO for full production traffic** (payment blocked by design,
worker not yet deployed) — **GO for a payment-free staging smoke deploy**
of API + worker + web against Neon/R2/Replicate, per the owner sequence
below.

## 6. Owner-operated staging deployment sequence

Exact order. Each step's acceptance criterion must pass before the next.

1. **Merge approved code** into `main` (the branch Northflank/Pages track).
2. **Configure Neon**: create/confirm the staging database; run
   `npx prisma migrate status` first to preview, then
   `npx prisma migrate deploy` **once**, manually, from a trusted machine
   or a one-off CI job — never from either running service container.
   *Acceptance: `migrate status` reports "Database schema is up to date!"
   afterward.*
3. **Configure private R2 access**: create/confirm the staging bucket,
   issue scoped R2 access keys, set `R2_PUBLIC_BASE_URL` to a
   signed-URL-serving origin (never a public bucket listing).
   *Acceptance: a manually generated signed URL for a test object resolves
   and expires; an unsigned URL for the same key returns access-denied.*
4. **Configure Replicate secrets and limits**: set `REPLICATE_API_TOKEN`,
   `REPLICATE_RESTORATION_MODEL_SLUG`, `REPLICATE_RESTORATION_MODEL_VERSION`
   in the shared secret group; confirm any account-level spend limit is
   set to a bounded staging budget.
   *Acceptance: token authenticates against Replicate's own account
   endpoint (owner-performed, outside this repository's automation).*
5. **Create/update the Northflank API service**: point at this
   repository's `Dockerfile`, attach the secret group from steps 2-4 plus
   the remaining required vars in the environment matrix, leave
   `BANK_ALFALAH_MPGS_ENABLED=false`.
   *Acceptance: `GET /api/health` returns 200 within the configured
   `HEALTHCHECK` window.*
6. **Create the dedicated Northflank P4B worker service**: same image,
   override start command to `node dist/scripts/p4b-worker-runner-main.js`
   per `northflank/p4b-worker.service.yaml`, attach the identical secret
   group, **exactly one instance, no public port/domain**.
   *Acceptance: logs show `"P4B worker runner: starting"` with
   `restorationProvider:"replicate"`, `concurrency:1`; no crash loop.*
7. **Configure Cloudflare Pages**: point at `apps/web`, build command
   `npm run build -w apps/web`, output `dist/`, set the web app's API base
   URL to the staging API service's URL.
   *Acceptance: the deployed page loads and successfully calls
   `/api/health` through the browser.*
8. **Run health/readiness checks** on both services (API `/api/health`;
   worker log-based liveness per §2).
9. **Run one non-payment staging restoration** using an approved test
   image, through the real customer flow up to (not including) checkout —
   i.e. upload → preview → tier select → `FixedOrder` creation — with
   payment left untriggered (no MPGS call, `BANK_ALFALAH_MPGS_ENABLED`
   stays `false`). Manually seed or otherwise trigger exactly one real
   `ReplicateExecution` for acceptance testing (owner-decided mechanism,
   not automated by this repository — the normal path only creates one
   after a verified payment, which is intentionally not exercised here).
10. **Verify**: exactly one real Replicate call was made for that
    execution; the resulting master was written to the **private** R2
    bucket (signed URL only); Sharp `original`/`2hd`/`4hd` variants were
    generated; a signed download URL was produced and successfully
    fetched once.
11. **Keep Bank Alfalah disabled** (`BANK_ALFALAH_MPGS_ENABLED=false`)
    until the bank confirms the sandbox `401` is resolved and a full
    sandbox UAT (session creation + Retrieve Order + test card) passes.
12. **Roll back immediately** on any failed acceptance check in steps
    5-10, using the rollback controls in §4 — do not proceed to the next
    step with a failing prior one.

## 7. What this protocol explicitly does not do

- Does not create, modify, or delete any Northflank service, Cloudflare
  Pages project, Neon database, R2 bucket, or Replicate account setting.
- Does not read or print any secret value.
- Does not enable Bank Alfalah, activate RunPod, or implement a local
  payment gateway.
- Does not deploy anything. Every step above is an instruction for the
  human owner to execute directly, separately, and later.

## 8. Supported ThanNow Launch Release Candidate (2026-08-12)

Release commit: `10f1aa9` on `main`, verified equal to `origin/main`.
Production deployment was not performed.

### Intended production target

- Frontend: Cloudflare Pages project `ai-photo-studio-frontend`, configured by
  `apps/web/wrangler.toml`, build command `npm run build -w apps/web`, output
  directory `apps/web/dist`.
- API: Northflank service built from the repository `Dockerfile`, production
  command `node --expose-gc dist/index.js`, port `8080`, health route
  `/api/health`.
- Worker: separate Northflank process using the same image and
  `node dist/scripts/p4b-worker-runner-main.js`, one instance, no public port.
- Public relationship: the web build defaults to `https://api.thannow.com`;
  production frontend is `https://www.thannow.com`.
- Dependencies: Neon/PostgreSQL through `DATABASE_URL`, shared Redis through
  `REDIS_URL`, private Cloudflare R2 through the R2 variables, and Replicate
  through the restoration provider variables.

### Environment names

Required names and fail-closed behavior are maintained in
`R9_2_STAGING_ENVIRONMENT_MATRIX.md`. The release packet does not contain or
inspect secret values. The owner must verify live values for `DATABASE_URL`,
`REDIS_URL`, `JWT_SECRET`, `ADMIN_JWT_SECRET`, `WHATSAPP_VERIFY_TOKEN`,
`STORAGE_PROVIDER`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`,
`RESTORATION_PROVIDER`, `REPLICATE_API_TOKEN`,
`REPLICATE_RESTORATION_MODEL_SLUG`, and
`REPLICATE_RESTORATION_MODEL_VERSION` before deployment. Web deployment must
provide `VITE_API_URL` or `VITE_API_BASE_URL` as appropriate.

Bank Alfalah variables remain external/pending. Keep
`BANK_ALFALAH_MPGS_ENABLED=false`; merchant credentials, hash/IPN details, and
live activation require separately verified bank approval. The payment-freeze
preflight passed without enabling them.

### Launch scope and rollback

The frozen launch scope is supported Restore & Download plus supported PKR
Print + Digital sizes with the existing ratio-safe crop guard. Triple Canvas,
albums, unsafe-crop selections, incomplete packages, and the paid-restoration
print add-on remain non-orderable and do not block this supported launch.
Rollback is a redeploy of the previous known-good API/worker image and Pages
build through the owner-controlled platform workflow; stop/scale the worker
first if needed. Do not run `safe-deploy.bat`: it targets legacy Railway and is
not the current deployment contract.

### Final verification and protected scope

- `npm run scope:check`, `npm run verify:staging-preflight`, and
  `npm run verify:payment-freeze` passed without deployment or network calls.
- Type checks, lint, focused browser checks, the full 101-test responsive
  suite, pricing/print tests, production build, and a 33-check built-preview
  smoke passed. Lint has existing warnings only.
- Protected canonical controls are `apps/web/wrangler.toml`, `Dockerfile`,
  `apps/web/src/lib/api.ts`, `apps/web/src/main.tsx`,
  `apps/web/src/lib/printUseCases.ts`, `apps/web/src/pages/PricingPage.tsx`,
  `apps/api/src/config/env.ts`, and the tracked deployment matrix/runbooks.
  Do not rewrite supported customer flows, PKR pricing, APG fail-closed
  behavior, compliance routes, or the Contact-only address invariant without a
  verified regression or separately authorized release packet.

## 9. Live Production Verification (2026-08-12)

- Read-only checks confirmed `https://api.thannow.com/api/health` and
  `/api/monitoring/health` return 200. The API reports `provider: replicate`,
  `payment_mode: manual`, and `build_sha: 10f1aa9`; no secret values were read.
  Queue and worker monitoring also returned healthy responses.
- Read-only CORS verification allows `https://www.thannow.com` and does not
  allow an unrelated origin. The live Pakistan catalog returned the approved
  PKR digital tiers and PKR print catalog.
- Live frontend verification found a deployment mismatch: `www.thannow.com`
  still serves the older ecommerce artifact (old title, old metadata, invalid
  Meta Pixel `null` warning, no `logo2.png` marker), and direct compliance
  routes redirect to `/` except supported routes such as `/pricing` and
  `/login`. The intended release `462c9ca` has not been deployed to Pages.
- Cloudflare, Northflank, and Neon CLIs were unavailable in the verification
  environment. Therefore live resource identity and live environment-variable
  presence cannot be certified from this machine. The legacy Railway CLI was
  deliberately not used because it is not the current deployment contract.
- Result: **NO-GO for deployment completion/acceptance** until the owner
  verifies the Cloudflare Pages project and Northflank resources, confirms the
  production variable names/values privately, deploys the frozen release only
  through the authorized platform workflow, and reruns live route/logo/API
  smoke. No production deployment, DNS change, restart, APG activation,
  secret rotation, or database mutation was performed by this verification.
- Authorized deployment path added as `.github/workflows/deploy-frontend.yml`:
  Cloudflare Pages uses the existing `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID` GitHub secrets, builds `apps/web`, and deploys only
  project `ai-photo-studio-frontend`. The existing `deploy.yml` remains the
  Northflank API path for the same `main` push; no separate worker resource was
  present in the read-only Northflank audit.
