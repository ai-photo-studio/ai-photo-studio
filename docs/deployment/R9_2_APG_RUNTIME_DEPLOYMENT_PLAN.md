# R9.2 APG Runtime Deployment Plan

Status: **PLAN ONLY — OWNER AUTHORIZATION REQUIRED**

## Target

Deploy post-merge SHA `45ede20` only with payment fail-closed:

- `BANK_ALFALAH_PROVIDER=none`
- `BANK_ALFALAH_APG_ENABLED=false`
- `BANK_ALFALAH_MPGS_ENABLED=false`

Do not inject APG credentials into the production/default runtime.

## Sequence

1. Confirm owner authorization for runtime deployment.
2. Confirm migration status with `npm run db:migrate:status:production`; do not
   apply migrations in this packet.
3. Dispatch the API workflow manually only after authorization:
   `gh workflow run deploy.yml --repo ai-photo-studio/ai-photo-studio --ref main`.
4. Deploy the web build only if alignment is required, using the manual-only
   workflow: `gh workflow run deploy-frontend.yml --repo
   ai-photo-studio/ai-photo-studio --ref main`.
5. Leave the existing worker unchanged; this packet changes no worker code or
   worker configuration.
6. Verify `GET /api/health` reports `45ede20` and payment mode remains
   manual/fail-closed.
7. Verify `GET /api/payments/bank-alfalah/return` exists and returns the
   truthful unavailable response without marking PAID.
8. Verify `POST /api/payments/bank-alfalah/ipn` exists and remains fail-closed
   with the empty callback allowlist.
9. Verify `/payment/return` renders without query-string payment authority.
10. Verify no Bank, Replicate, RunPod, R2, or real-charge calls occur.

## Rollback

Redeploy the previous known API/web runtime SHA `af18fa7` as appropriate.
Keep all payment flags disabled during rollback. Confirm health, route
availability, and zero payment/provider calls after rollback.
