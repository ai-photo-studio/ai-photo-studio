# API Plan — OPS-153

## Objective
Identify actual reason for ERR_CONNECTION_CLOSED in production.

## VERIFIED Root Cause
Worker watchdog fires 501 times per 24h (~every 2.9 minutes). The OPS-150 fix was never deployed because the API CI/CD job fails (missing GCP_SERVICE_ACCOUNT_KEY). The active revision is 48+ hours stale.

## Eliminated Hypotheses
- Memory: 165MB RSS / 1Gi (84% free) — NOT memory
- Cloudflare: API is DNS-only (grey cloud) — NOT Cloudflare
- Container OOM: No events — NOT OOM
- Container restart: All revision conditions True — NOT restart

## To Fix
Add GCP_SERVICE_ACCOUNT_KEY GitHub secret, or manually gcloud deploy the latest image.
