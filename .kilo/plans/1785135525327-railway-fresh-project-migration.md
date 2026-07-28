# Railway Fresh Project Migration Plan

## Summary

Migrate the stuck Railway deployment pipeline by creating a new project.  
20 consecutive deployments fail in the current project (`5d88046e-73b5-4108-bce7-21c9c9f92a49`) because Railway's internal deployment orchestrator is in a stuck failure state. A new project resets the pipeline.

## Prerequisites

- Railway Dashboard access for Steps 2–5 (no CLI command exists for these)
- Railway CLI authenticated in the working directory
- Current project unchanged (rollback safety)
- All 22 environment variable values verified and accessible

## Step-by-Step Execution

### Step 1: Create New Railway Project (CLI)

```bash
railway init --name "AI Studio v2" --json
```

**Expected output:** New project ID (e.g., `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)  
**Verification:** `railway list --json` shows both old and new projects  
**Post-step status:** Current directory is now linked to the new project

---

### Step 2: Create @studio/api Service (CLI)

```bash
railway add
```

When prompted:
- Service name: `@studio/api`
- Source: Leave default (GitHub — will be configured in Dashboard)

**Verification:** `railway service list --json` shows `@studio/api` with no deployment

---

### Step 3: Connect GitHub Repository (DASHBOARD)

Open Railway Dashboard for the new project → `@studio/api` service → Settings.

1. **Source**: Select `GitHub`
2. **Repository**: `ai-photo-studio/ai-photo-studio`
3. **Branch**: `main`
4. **Root Directory**: leave empty
5. Railway will auto-detect `Dockerfile` at repo root

**Verification:** Settings page shows "Connected to ai-photo-studio/ai-photo-studio" with Dockerfile detected

---

### Step 4: Configure Build (DASHBOARD — Critical)

In the same Settings page:

| Field | Value | Why |
|-------|-------|-----|
| **Build Command** | **Empty** | Must NOT match Start Command (previous blocker) |
| **Start Command** | `cd /app/apps/api && node dist/index.js` | Dockerfile WORKDIR is `/app/apps/api` |
| **Healthcheck Path** | `/api/health` | Matches Express route in `index.ts:87` |
| **Healthcheck Timeout** | `30` | Allows 30s for container startup |

**Verification:** The Settings page shows these values and no red error banner

---

### Step 5: Import Environment Variables (CLI)

For each variable, retrieve the source value and pipe it to Railway:

```bash
# For each SECRET variable (obfuscated - actual values come from Secret Manager / GitHub)
cat <value> | railway variable set KEY --stdin --skip-deploys
```

#### Variables from Secret Manager (8):
| Key | Verified Value |
|-----|---------------|
| `DATABASE_URL` | Neon PostgreSQL URL with sslmode=require&pgbouncer=true |
| `REDIS_URL` | Upstash Redis URL with auth token |
| `JWT_SECRET` | `A3O6bMYQ3NWabZw1BLOyQXrinkTqxwVkE8OX5hwOI-s` |
| `ADMIN_JWT_SECRET` | `admin_jwt_secret_key_896758` |
| `R2_ACCESS_KEY_ID` | `deb66ae1e3f11bf1c241291b533b1b73` |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 credential (from .env.local) |
| `R2_BUCKET_NAME` | `ai-photo-studio-storage` |
| `R2_PUBLIC_BASE_URL` | Cloudflare R2 endpoint URL |

#### Variables from Google Secret Manager (1):
| Key | Value |
|-----|-------|
| `WHATSAPP_VERIFY_TOKEN` | `whatsapp_verify_12345678` |

#### Variables from GitHub Secrets (5):
| Key | Source |
|-----|--------|
| `WHATSAPP_ACCESS_TOKEN` | Retrieve from GitHub Secrets |
| `WHATSAPP_PHONE_NUMBER_ID` | Retrieve from GitHub Secrets |
| `PAYMENT_GATEWAY_NAME` | `manual` |
| `PAYMENT_GATEWAY_BASE_URL` | Retrieve from GitHub Secrets |
| `PAYMENT_GATEWAY_SECRET` | Retrieve from GitHub Secrets |

#### Variables from repository/config (5):
| Key | Value |
|-----|-------|
| `REPLICATE_API_TOKEN` | `r8_dy3B0Ay6IEtsYdX2LEPu1RQa5oGgwjm3k3ppd` |
| `REPLICATE_RESTORATION_MODEL_SLUG` | `flux-kontext-apps/restore-image` |
| `REPLICATE_BACKGROUND_REMOVAL_MODEL_SLUG` | `lucataco/remove-bg` |
| `ENABLE_REPLICATE_RESTORATION_PROVIDER` | `true` |
| `PHASE1_REPLICATE_ONLY` | `true` |
| `STORAGE_PROVIDER` | `r2` |
| `NODE_ENV` | `production` |

**Total: 22 variables**

---

### Step 6: Deploy Latest Commit (DASHBOARD or CLI)

**Option A (Dashboard):** Click "Deploy" in the service page. Railway fetches from GitHub and builds.

**Option B (CLI):**
```bash
railway redeploy --from-source --yes
```

**Expected outcome:**
1. Status: BUILDING → DEPLOYING → SUCCESS
2. `imageDigest` present in deployment metadata
3. Container starts within 30s healthcheck window
4. No env.ts validation errors

---

### Step 7: Verify New Deployment (CLI)

Run these checks in order. Stop at the first failure.

```bash
# V.1 - Check deployment status
railway deployment list

# V.2 - Check imageDigest exists
railway deployment list --json | python3 check_imagedigest.py

# V.3 - Check build logs for errors
railway logs --build --lines 200

# V.4 - Check container startup
railway logs --lines 500

# V.5 - Check health via Railway URL (NOT custom domain yet)
curl -s https://<new-railway-url>.railway.app/api/health
```

**Expected health response:**
```json
{"success":true,"message":"AI Photo Studio API is running","provider":"replicate","model_slug":"flux-kontext-apps/restore-image","payment_mode":"manual"}
```

---

### Step 8: Configure Custom Domain (CLI)

Only proceed if Step 7 passes all checks.

```bash
# Add custom domain
railway domain api.thannow.com

# Railway provides a CNAME target
# Update DNS: set CNAME for api.thannow.com to the Railway-generated URL

# Wait for SSL cert (Railway auto-provisions via LetsEncrypt)

# Verify
curl -s https://api.thannow.com/api/health
```

---

### Step 9: Migration Complete

| Check | How | Expected |
|-------|-----|----------|
| Old project unchanged | `railway list --json` | Old project exists with `4090c174` still active |
| New project active | `railway service list` | New service with SUCCESS status |
| Health via Railway URL | curl | HTTP 200 with correct JSON |
| Health via custom domain | curl api.thannow.com | HTTP 200 with correct JSON |
| SSL working | curl -v | Valid certificate |

---

## Rollback Plan

| Failure Scenario | Action |
|-----------------|--------|
| **Step 1 fails** (project creation) | Check Railway account limits (trial may limit to 1 project). Upgrade or contact support |
| **Step 2 fails** (service creation) | `railway delete` the project, restart from Step 1 |
| **Step 3 fails** (GitHub connection) | This is Dashboard-only. No CLI alternative. If Dashboard not accessible, migration cannot proceed |
| **Step 4 fails** (dashboard settings) | No CLI alternative. Settings must be applied via Dashboard |
| **Step 5 fails** (env vars) | Verify each source. `gh secret view` for GitHub Secrets. `gcloud secrets versions access latest` for Secret Manager |
| **Step 6 fails** (deployment) | If same `imageDigest` missing issue: this confirms the problem is at the Railway platform level, not the project level. Escalate to Railway Support |
| **Step 7 fails** (healthcheck) | Container started but health fails → check env vars. Container never started → Railway pipeline still stuck → escalate |
| **Step 8 fails** (custom domain) | DNS propagation can take 1–60 min. SSL cert can take 1–5 min. Retry after waiting |
| **DNS CNAME switch fails** | api.thannow.com continues pointing to old project. Old project `4090c174` still serves. No downtime |

**When to escalate to Railway Support:**
- New project deployment also shows `imageDigest: MISSING`
- No error message emitted
- Build succeeds but container never starts
- Template response: "Deployment pipeline stuck — service ID: xxx"

---

## Safe to Delete Old Project: NO — 72-hour cooldown

| Time | Action |
|------|--------|
| T+0 | Migration complete. New project serving at api.thannow.com |
| T+72h | Verify new project stable. Pause old project service (don't delete) |
| T+7d | Verify old project service still paused with no incidents. Delete old project |
