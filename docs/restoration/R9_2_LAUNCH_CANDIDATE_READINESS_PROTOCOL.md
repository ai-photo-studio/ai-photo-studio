# R9.2 Launch-Candidate Readiness Protocol

Concise, permanent record of what "launch candidate" verification means for
this repository, and the owner-operated staging sequence. Companion to
`docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` §29.

## 1. `npm run verify:launch-candidate`

Smallest deterministic local/stub gate (`scripts/verify-launch-candidate.mjs`):

1. `npm run lint` — must exit 0.
2. `npx tsx --test` over every `apps/api/src/**/*.test.ts` file **except**
   `*.pg-race.test.ts` (require a real disposable Postgres, run separately —
   see §2) and `p4c2-mpgs-provisioning-config-diagnostic.test.ts` (imports
   `vitest`, must run under `npx vitest run`, not `node:test`).
3. `npx vitest run` over the one vitest-only file above.

Exits non-zero on any failure. Makes zero external network calls. Run it
before every PR that touches `apps/api/src` or `apps/web/src`.

## 2. Full local proof (beyond `verify:launch-candidate`)

Requires a disposable local PostgreSQL 17 instance (loopback-only, random
port, throwaway `trust` rule, deleted after use — never the persistent
system Postgres service):

- Each `*.pg-race.test.ts` file run **individually** (not globbed) against
  the disposable instance — this repo's established supported invocation
  shape (see manifest §13).
- `npx playwright test tests/browser` — full mocked-API browser suite.
- `npx prisma migrate deploy` / `npx prisma migrate status` against the
  disposable instance.
- `npm run typecheck`, `npm run build`, `npx prisma validate`, `git diff
  --check`, `git diff --cached --check`.

## 3. Northflank staging GO/NO-GO (audited from repo config; no live access)

| Item | Evidence | Status |
|---|---|---|
| API service start command | `Dockerfile` → `CMD ["node", "--expose-gc", "dist/index.js"]`, built via `npx tsc`, `PORT=8080` | GO |
| API health/readiness endpoint | `apps/api/src/index.ts` `GET /api/health`, `GET /api/monitoring/health`; `Dockerfile` `HEALTHCHECK` hits `/api/health` | GO |
| Worker service start command | `npm run worker:p4b` → `tsx src/scripts/p4b-worker-runner-main.ts` (standalone process, no HTTP surface, not imported by `index.ts`) | GO — **not yet wired as its own Northflank service** (owner action required) |
| Worker concurrency/claim behavior | `InternalWorkerRunner` at concurrency 1, bounded poll + exponential capped backoff, cooperative `SIGTERM`/`SIGINT` (finishes in-flight, claims nothing new); proven exactly-once claim under real concurrency in `p4b-internal-worker-runner.service.pg-race.test.ts` (10/10) | GO |
| Database migration command | `npx prisma migrate deploy` (owner-run manually; `Dockerfile` bakes `SKIP_MIGRATIONS=true` — migrations are **not** applied automatically on container start) | GO, **manual step required before each deploy with new migrations** |
| Required env var names (no values) | `apps/api/src/config/env.ts`: `DATABASE_URL`, `REDIS_URL`, `WHATSAPP_VERIFY_TOKEN`, `PAYMENT_GATEWAY_NAME`, `ADMIN_JWT_SECRET`, `JWT_SECRET`, plus conditionally-required `R2_*` (5 fields, required unless `STORAGE_PROVIDER=mock`) and `BANK_ALFALAH_MPGS_*` (required unless `BANK_ALFALAH_MPGS_ENABLED=false`) | GO |
| Replicate secret reference | `REPLICATE_API_TOKEN` (optional-default, required at runtime for real restorations; `RESTORATION_PROVIDER` must be exactly `replicate` for the P4B worker to start) | GO |
| R2 secret references | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`, `R2_ENDPOINT` — all required together unless `STORAGE_PROVIDER=mock` | GO |
| Bank Alfalah MPGS credentials | `BANK_ALFALAH_MPGS_MERCHANT_ID` / `_API_PASSWORD` — sandbox REST access currently returns `HTTP 401` (see manifest §29); staging must not enable live checkout until resolved | **NO-GO for live payments**; safe for everything else with `BANK_ALFALAH_MPGS_ENABLED=false` |
| Rollback / feature-disable | `BANK_ALFALAH_MPGS_ENABLED=false` fails closed to no-checkout; `STORAGE_PROVIDER=mock` / `AI_PROVIDER=mock` disable real R2/Replicate calls independently; standard Northflank "redeploy previous image" for full rollback | GO |
| No deployment performed | Confirmed — this packet made zero Northflank API calls and changed zero production infrastructure | N/A |

**Owner-operated staging sequence** (not executed by this agent):

1. Confirm all required env vars/secrets are set in the Northflank service
   (names above; values never printed here).
2. Run `npx prisma migrate deploy` against the staging database manually
   (or via a one-off Northflank job) — the container does **not** do this
   automatically (`SKIP_MIGRATIONS=true`).
3. Deploy the `api` service from the reviewed PR's merge commit.
4. Deploy the P4B worker as its own Northflank service/deployment (currently
   only runnable via `npm run worker:p4b`; no dedicated Northflank service
   definition exists in-repo yet — this is the one staging-readiness gap).
5. Verify `/api/health` returns 200 before routing traffic.
6. Leave `BANK_ALFALAH_MPGS_ENABLED=false` (or equivalent) until the bank
   resolves the sandbox `401` — restoration/upload/preview/pricing flows do
   not require it.
7. To roll back: redeploy the prior image; to disable a feature without a
   rollback, flip the relevant env var (`BANK_ALFALAH_MPGS_ENABLED`,
   `STORAGE_PROVIDER`, `AI_PROVIDER`) and restart.
