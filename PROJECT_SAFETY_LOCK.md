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

- Frontend project: `ai-photo-studio-whatsapp-web`
- Production URL: `https://ai-photo-studio-whatsapp-web.pages.dev`
- Account: `85f6a6181b4653c2a45e69cb7ce8a474` (`gisupp@gmail.com`)
- Separate from `hojaseeds`: do not modify, redeploy, relink, rename, or disturb
- Frontend API binding: production builds use the Railway API and the API CORS allow-list is set to the Pages origin

## CORS Restriction

The Railway production API now returns `Access-Control-Allow-Origin: https://ai-photo-studio-whatsapp-web.pages.dev` for the dedicated frontend origin.
Keep `ALLOWED_ORIGINS` restricted to the dedicated Pages project and do not widen it without a deliberate launch decision.

## Phase P Note

WhatsApp environment variables are set in Railway production, webhook verification passes, delivery payload generation passes, and Meta connectivity still requires resolution before switching away from `LOG_ONLY`.

## AI Agent Instructions

See `AI_PROJECT_RULES.md` for the mandatory agent rules.
