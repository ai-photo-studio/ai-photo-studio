# Secret Verification Report

**Date:** 2026-07-22  
**Audit:** OPS-92 — Verify Secret Injection & Execute Live Benchmark  

---

## 1. Secret Inventory

### REPLICATE_API_TOKEN

| Location | Status | Notes |
|---|---|---|
| User-provided in session | ✅ SET | Token starts with `r8_` |
| `process.env` (child process) | ✅ REACHABLE | Via `cmd /c "set VAR=val && cmd"` |
| `.env` file | ❌ NOT PRESENT | Not in any `.env*` file |
| GCP Secret Manager | ❌ NOT PRESENT | Does not exist as a secret |
| Cloud Run env vars | ❌ NOT PRESENT | Not in any Cloud Run service |
| GitHub Secrets | ❌ NOT ACCESSIBLE LOCALLY | Only available during GitHub Actions runs |

### OPENAI_API_KEY

| Location | Status | Notes |
|---|---|---|
| User-provided in session | ✅ SET | Token starts with `sk-proj-` |
| `process.env` (child process) | ✅ REACHABLE | Via `cmd /c "set VAR=val && cmd"` |
| `.env` file | ❌ NOT PRESENT | Not in any `.env*` file |
| GCP Secret Manager | ❌ NOT PRESENT | Does not exist as a secret |
| Cloud Run env vars | ❌ NOT PRESENT | Not in any Cloud Run service |
| GitHub Secrets | ❌ NOT ACCESSIBLE LOCALLY | Only available during GitHub Actions runs |

---

## 2. Key Accessibility

### OPS-91 Failure Root Cause

When OPS-91 was executed, the `bash` tool spawned a fresh PowerShell process. Environment variables set in the Kilo tool's in-memory PowerShell session do NOT propagate to child processes created by the `bash` tool. The `bash` tool creates an **independent** PowerShell process each time.

**Process tree:**
```
Kilo CLI (PowerShell session) 
  └─ bash tool → new PowerShell process → env:REPLICATE_API_TOKEN = undefined
       └─ npx tsx benchmark.ts → process.env.REPLICATE_API_TOKEN = undefined
```

### OPS-92 Solution

The correct injection mechanism on Windows is `cmd /c`:

```
cmd /c "set REPLICATE_API_TOKEN=... && set OPENAI_API_KEY=... && npx tsx benchmark.ts"
```

This ensures the environment variables are set in the `cmd.exe` process before `npx` launches, which then inherits them into `process.env`.

---

## 3. Provider Entitlement

### Replicate (`sczhou/codeformer`)

| Check | Result |
|---|---|
| API Token valid | ✅ YES |
| Model `sczhou/codeformer` accessible | ✅ YES (via version hash `cc4956dd...`) |
| Model name-only endpoint `POST /v1/models/owner/name/predictions` | ❌ 404 — requires version hash |
| Version hash endpoint `POST /v1/models/owner/name/versions/hash/predictions` | ✅ WORKS |
| Credit balance sufficient | ✅ YES (rate limited to 1 burst / 6 per min but works) |

### OpenAI (`dall-e-3` via `/v1/images/edits`)

| Check | Result |
|---|---|
| API Key valid | ✅ YES (returns HTTP 200 for `/v1/models`) |
| DALL-E models accessible | ❌ NO — key has 123 models (all GPT/embedding/tts), zero DALL-E models |
| `POST /v1/images/edits` endpoint | ❌ 400 — `The model 'dall-e-3' does not exist` |
| Required parameter `response_format: b64_json` | ❌ 400 — `Unknown parameter: 'response_format'` (removed in fix) |

**Conclusion:** The provided OpenAI API key (`sk-proj-...`) does not have access to DALL-E 3 or DALL-E 2 image generation/edit models. Only GPT, embedding, and TTS models are available. The API key needs image generation entitlements added in the OpenAI account dashboard.

---

## 4. Recommendations

1. **Store API keys in Google Secret Manager** for persistent local access:
   ```
   gcloud secrets create REPLICATE_API_TOKEN --data-file=-
   gcloud secrets create OPENAI_API_KEY --data-file=-
   ```
2. **Enable DALL-E model access** in the OpenAI API key's project settings (requires OpenAI account)
3. **For future local benchmark re-runs**, use `cmd /c "set VAR=val && command"` pattern or hardcode env vars via `.env` file
