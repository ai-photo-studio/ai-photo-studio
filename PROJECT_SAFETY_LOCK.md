# Project Safety Lock - Final Production Grade

## Protected Scope Protocol v3.0.0

This repository has a mandatory protection system to prevent accidental operations against wrong targets.

### Protection Rules

1. Verify repository ID matches `gardenshop/ai-photo-studio-whatsapp`.
2. Verify Railway project ID matches `ad62f340-fcfd-4989-b5bb-18753b28d8c8`.
3. Verify Railway environment is `production`.
4. Verify Railway service is `api`.
5. Verify Cloudflare account ID and name match the locked identity.
6. Verify required secrets exist without printing them.
7. Ensure protected files exist.
8. Block migrations and schema changes unless the database lock is explicitly unlocked.
9. Run build and typecheck before push or deploy.
10. Require a fresh `AI_code_audit_report.md` after changes.

### Verification Files

`PROJECT_LOCK.json` contains the protection configuration.

## Cloudflare Pages Deployment

- Frontend project: `ai-photo-studio-frontend`
- Production URL: `https://29105fb4.ai-photo-studio-frontend.pages.dev`
- Account: `2eb5eadd4af6da3d3a5f6c61d92437e4` (`Wpaistudio@gmail.com`)
- Separate from `hojaseeds`: do not modify, redeploy, relink, rename, or disturb
- Frontend API binding: production builds use the Cloud Run API

## CORS Restriction

The Cloud Run API returns `Access-Control-Allow-Origin: https://ai-photo-studio.pages.dev` for the dedicated frontend origin.
Keep `ALLOWED_ORIGINS` restricted to the dedicated Pages project and do not widen it without a deliberate launch decision.

## Phase P Note

WhatsApp environment variables are set in Railway production, webhook verification passes, delivery payload generation passes, and Meta connectivity still requires resolution before switching away from `LOG_ONLY`.

## Phase Q Note

WhatsApp is deferred to Phase 2 for launch planning. Keep `DELIVERY_MODE=LOG_ONLY` and do not let Meta connectivity block the web-first customer launch.

## AI Agent Instructions

See `AI_PROJECT_RULES.md` for the mandatory agent rules.
