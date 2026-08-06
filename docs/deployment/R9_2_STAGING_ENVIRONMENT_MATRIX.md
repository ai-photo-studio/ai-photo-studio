# R9.2 Staging Environment Matrix

Names only — no secret values appear anywhere in this document. Source of
truth: `apps/api/src/config/env.ts` (`envSchema`), `northflank/p4b-worker.service.yaml`,
`Dockerfile`.

Columns: **Var** · **Scope** (API / Worker / Web / Both) · **Req** (required /
optional) · **Class** (secret / non-secret) · **Safe example format** ·
**Fail-closed behavior** · **Source/owner** · **Deploy order**.

| Var | Scope | Req | Class | Safe example format | Fail-closed behavior | Source/owner | Order |
|---|---|---|---|---|---|---|---|
| `DATABASE_URL` | API+Worker | Required | Secret | `postgresql://user:***@host:5432/db` | `loadConfig()` throws synchronously before any adapter is constructed | Neon (owner) | 2 |
| `REDIS_URL` | API+Worker | Required | Secret | `rediss://:***@host:6379` | Same — required by shared schema even though the worker's own hot path doesn't block on it | Northflank Redis addon (owner) | 5 |
| `JWT_SECRET` | API | Required | Secret | 32+ random bytes, base64/hex | Throws at load | Owner-generated | 5 |
| `ADMIN_JWT_SECRET` | API | Required | Secret | 32+ random bytes, base64/hex | Throws at load | Owner-generated | 5 |
| `WHATSAPP_VERIFY_TOKEN` | API | Required | Secret | opaque string | Throws at load | Owner (Meta app config) | 5 |
| `WHATSAPP_ACCESS_TOKEN` | API | Optional | Secret | opaque token | Absent → `whatsappDryRun: true` (safe no-op) | Owner (Meta app config) | 5 |
| `PAYMENT_GATEWAY_NAME` | API | Required | Non-secret | `manual` (staging default) | Anything other than `manual`/`demo` requires `PAYMENT_GATEWAY_BASE_URL`+`PAYMENT_GATEWAY_SECRET`; **must be `manual` for staging** | Owner | 5 |
| `STORAGE_PROVIDER` | API+Worker | Required (defaults `r2`) | Non-secret | `r2` | `mock` disables real storage; staging must use `r2` | Owner | 5 |
| `R2_ACCOUNT_ID` | API+Worker | Required unless `STORAGE_PROVIDER=mock` | Secret | Cloudflare account id | Missing → `loadConfig()` throws when `STORAGE_PROVIDER=r2` | Cloudflare R2 (owner) | 3 |
| `R2_ACCESS_KEY_ID` | API+Worker | Required unless mock | Secret | R2 access key id | Same | Cloudflare R2 (owner) | 3 |
| `R2_SECRET_ACCESS_KEY` | API+Worker | Required unless mock | Secret | R2 secret key | Same | Cloudflare R2 (owner) | 3 |
| `R2_BUCKET_NAME` | API+Worker | Required unless mock | Non-secret | `ai-photo-studio-storage-staging` | Same | Cloudflare R2 (owner) | 3 |
| `R2_PUBLIC_BASE_URL` | API+Worker | Required unless mock | Non-secret | valid URL, validated by `new URL()` | Invalid URL → schema validation error at load | Cloudflare R2 (owner) — **must stay a signed-URL-only origin, never a public bucket listing** | 3 |
| `R2_ENDPOINT` | API+Worker | Optional | Non-secret | `https://<account>.r2.cloudflarestorage.com` | Empty string tolerated (S3 client default) | Cloudflare R2 (owner) | 3 |
| `RESTORATION_PROVIDER` | API+Worker | Required (defaults `replicate`) | Non-secret | `replicate` | **Worker refuses to start (throws) if not exactly `replicate`** — the only enum values are `replicate`/`mock`, RunPod is not a valid value at all | Owner — never change without a separately authorized packet | 4 |
| `REPLICATE_API_TOKEN` | API+Worker | Required for real restorations | Secret | `r8_***` | Empty → Replicate calls fail at call time, not at load (no fail-closed schema gate today — see preflight validator) | Replicate (owner) | 4 |
| `REPLICATE_RESTORATION_MODEL_SLUG` | API+Worker | Required for real restorations | Non-secret | `sczhou/codeformer` | Empty → provider construction fails | Replicate (owner) | 4 |
| `REPLICATE_RESTORATION_MODEL_VERSION` | API+Worker | Required for real restorations | Non-secret | model version hash | Same | Replicate (owner) | 4 |
| `BANK_ALFALAH_MPGS_ENABLED` | API | Required (defaults `false`) | Non-secret | `false` | **Defaults `false` — fail-closed by construction.** Must stay `false` in staging until sandbox UAT passes | Owner | 6 |
| `BANK_ALFALAH_MPGS_MERCHANT_ID` / `_API_PASSWORD` / `_OPERATOR_ID` / `_RETURN_URL` / `_MERCHANT_NAME` | API | Required only if `BANK_ALFALAH_MPGS_ENABLED=true` | Secret (ID/password) / Non-secret (name/URL) | see runbook | Every one of these is validated and throws if `_ENABLED=true` and any is missing/invalid | Bank Alfalah (owner) — **not configured in staging while frozen** | n/a while disabled |
| `P4B_WORKER_POLL_INTERVAL_MS` | Worker only | Optional (default `5000`) | Non-secret | `5000` | Falls back to default; non-positive value throws | Owner tuning | 6 |
| `P4B_WORKER_MAX_BACKOFF_MS` | Worker only | Optional (default `60000`) | Non-secret | `60000` | Must be `>=` poll interval or the process refuses to start | Owner tuning | 6 |
| `PORT` | API only | Optional (default `4000`, Dockerfile sets `8080`) | Non-secret | `8080` | Not applicable to the worker (binds no port at all) | Northflank | 5 |
| `ALLOWED_ORIGINS` | API only | Optional | Non-secret | `https://staging.thannow.com` | Empty → CORS defaults apply | Owner | 5 |
| `NODE_ENV` | API+Worker | Optional (default `development`) | Non-secret | `production` | n/a | Owner/CI | 5 |
| `SKIP_MIGRATIONS` | API+Worker (image env) | Baked `true` in `Dockerfile` | Non-secret | `true` | Container never runs migrations itself — a deliberate fail-safe against two services racing a schema change | Dockerfile | 2 (owner runs migration separately, once) |

## Properties proven / audited (no live call made)

- **API and worker use the same `DATABASE_URL` safely**: both call the
  identical `loadConfig()` gate; all claim/write logic uses Postgres's own
  atomic `UPDATE ... WHERE status = 'QUEUED'` (proven exactly-once under
  real concurrency by `p4b-internal-worker-runner.service.pg-race.test.ts`
  `(pg3)`, re-run 10/10 this session) — no application-level locking
  assumption, so sharing one database between the two services is safe by
  construction.
- **Worker does not expose a public port unless technically required**:
  confirmed live this session (§ prior packet) — the worker process binds
  zero listening ports; only the separately-run API process listens.
  `northflank/p4b-worker.service.yaml` declares `publicPorts: []`.
- **Payment remains disabled by default**: `BANK_ALFALAH_MPGS_ENABLED`
  has no schema default other than `"false"` — there is no code path that
  flips it true implicitly.
- **Replicate remains selected**: `RESTORATION_PROVIDER` defaults to
  `"replicate"`; the worker's own additional guard
  (`p4b-worker-runner-main.ts`) throws before constructing any adapter if
  it is anything else.
- **RunPod cannot become active**: `RESTORATION_PROVIDER`'s zod enum is
  exactly `["replicate", "mock"]` — RunPod is not a member of the type at
  all, so no environment-variable value can select it through this path.
  (`BACKGROUND_API_URL`'s RunPod-endpoint-ID-shaped acceptance is unrelated
  local-pipeline plumbing, gated behind `AI_PROVIDER=local-yolo`/`local-
  rembg`, itself excluded from the restoration/worker path.)
- **R2 buckets/keys remain private**: `storage.service.ts` only ever
  returns time-limited `getSignedUrl()` results (`@aws-sdk/s3-request-
  presigner`) — there is no code path that returns a public/unsigned R2
  URL for a source, master, or variant object.
- **Migration ownership is explicit and runs once**: `Dockerfile` bakes
  `ENV SKIP_MIGRATIONS=true` into both the API and worker image (same
  image, different start command) — neither container ever runs
  `prisma migrate deploy` on boot. The owner runs it manually, once, as
  step 2 of the deployment runbook, before either service starts.
