# R9.2 APG Runtime Deployment Plan

Status: **PLAN ONLY — OWNER AUTHORIZATION REQUIRED**

## Target

Deploy SHA `472934e` only with payment fail-closed:

- `BANK_ALFALAH_PROVIDER=none`
- `BANK_ALFALAH_APG_ENABLED=false`
- `BANK_ALFALAH_MPGS_ENABLED=false`

Do not inject APG credentials into the production/default runtime.

## Sequence

1. Confirm owner authorization for runtime deployment.
2. Deploy the API image/build for `472934e` to the existing API service.
3. Deploy the web build for `472934e` only if the API/web release must remain aligned.
4. Leave the existing worker unchanged; this packet changes no worker code or
   worker configuration.
5. No Prisma migration is required by this delta. Run migration status before
   deployment when `DATABASE_URL` is securely available; do not apply migrations
   in this packet.
6. Verify `GET /api/health` reports the deployed SHA and payment mode remains
   manual/fail-closed.
7. Verify `GET /api/payments/bank-alfalah/return` exists and returns the
   truthful unavailable response without marking PAID.
8. Verify `POST /api/payments/bank-alfalah/ipn` exists and remains fail-closed
   with the empty callback allowlist.
9. Verify `/payment/return` renders without query-string payment authority.
10. Verify no Bank, Replicate, RunPod, R2, or real-charge calls occur.

## Rollback

Redeploy the previous known runtime SHA `af18fa7` for API/web as appropriate.
Keep all payment flags disabled during rollback. Confirm health, route
availability, and zero payment/provider calls after rollback.
