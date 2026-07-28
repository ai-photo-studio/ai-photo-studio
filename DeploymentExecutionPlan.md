# Deployment Execution Plan

Architecture:

`Cloudflare Pages -> Railway API -> Neon PostgreSQL -> Redis -> Cloudflare R2 -> Replicate`

This is a planning-only checklist. No deployment is performed here.

## 1. Pre-Build Verification

- Purpose: Confirm the repository and production configuration are ready before any build attempt.
- Expected result: The active Phase 1 runtime targets only the Railway/Replicate architecture and required environment variables are documented.
- Verification:
  - Confirm [README.md](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/README.md) reflects the current architecture.
  - Confirm [RAILWAY_DEPLOYMENT.md](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/RAILWAY_DEPLOYMENT.md) lists all required Railway variables.
  - Confirm [AI_code_audit_report_RI.md](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/AI_code_audit_report_RI.md) reports no verified startup blocker.
- Rollback action: Stop the release process and return to documentation review only.

## 2. Local Build

- Purpose: Confirm the app can build locally before Railway deployment.
- Expected result: API and web build successfully from the monorepo root.
- Verification:
  - Run the documented build command locally.
  - Confirm both workspaces compile without errors.
- Rollback action: Fix build issues locally and do not proceed to Railway deployment.

## 3. Railway Environment Variables

- Purpose: Ensure the API service has every required runtime variable.
- Expected result: Railway contains production values for database, Redis, R2, Replicate, authentication, WhatsApp, and payments.
- Verification:
  - Confirm `DATABASE_URL`
  - Confirm `REDIS_URL`
  - Confirm `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`
  - Confirm `REPLICATE_API_TOKEN`
  - Confirm `REPLICATE_RESTORATION_MODEL_SLUG` and version if available
  - Confirm `REPLICATE_BACKGROUND_REMOVAL_MODEL_SLUG` and version if available
  - Confirm `JWT_SECRET` and `ADMIN_JWT_SECRET`
  - Confirm `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
  - Confirm `PAYMENT_GATEWAY_NAME`, `PAYMENT_GATEWAY_BASE_URL`, `PAYMENT_GATEWAY_SECRET`
  - Confirm `ALLOWED_ORIGINS`, `NODE_ENV=production`, `PORT=8080`
- Rollback action: Remove the release from the deploy queue until the variables are corrected.

## 4. Railway Deployment

- Purpose: Deploy the API service to Railway with the frozen production stack.
- Expected result: Railway starts the API service successfully and exposes the production route surface.
- Verification:
  - Confirm the Railway service uses the intended build and start commands.
  - Confirm startup logs show config validation passed.
  - Confirm the service binds on the expected port.
- Rollback action: Redeploy the previous stable Railway release.

## 5. Prisma Migration

- Purpose: Bring the production database schema to the expected revision.
- Expected result: Prisma migrations apply cleanly against Neon PostgreSQL.
- Verification:
  - Confirm migration status is current before deploy.
  - Confirm the deployment applies pending migrations only once.
  - Confirm no schema drift is introduced.
- Rollback action: Revert to the prior database revision only if a verified migration failure occurs and rollback is supported.

## 6. Health Verification

- Purpose: Confirm the deployment is healthy at the service level.
- Expected result: `/api/health` returns success and startup validation passes.
- Verification:
  - Check `GET /api/health`
  - Check `/api/version`
  - Check startup logs for config validation
- Rollback action: Revert the Railway service if health checks fail.

## 7. API Verification

- Purpose: Verify the production API routes behave as expected.
- Expected result: Auth, orders, packages, admin, monitoring, restoration, preview, and payment routes respond correctly.
- Verification:
  - Confirm required Phase 1 routes are reachable.
  - Confirm legacy or postponed routes are not active in the Phase 1 launch surface.
- Rollback action: Disable the release and revert to the previous stable API revision.

## 8. Storage Verification

- Purpose: Confirm Cloudflare R2 works for uploads, previews, processed outputs, and downloads.
- Expected result: Upload, download, and signed URL flows succeed.
- Verification:
  - Confirm original image upload to R2
  - Confirm processed image upload to R2
  - Confirm signed download URL generation
- Rollback action: Revert the release if storage reads or writes fail.

## 9. Redis Verification

- Purpose: Confirm BullMQ and queue support work on the chosen Redis provider.
- Expected result: Queue operations and worker connectivity succeed.
- Verification:
  - Confirm `REDIS_URL` resolves in Railway
  - Confirm queue health endpoint reports connected
  - Confirm background worker can read and process jobs
- Rollback action: Disable worker processing and revert to the previous stable release.

## 10. Replicate Verification

- Purpose: Confirm Phase 1 AI processing uses Replicate only.
- Expected result: Restoration and background removal resolve through the centralized Replicate pipeline.
- Verification:
  - Confirm `REPLICATE_API_TOKEN` is accepted at startup
  - Confirm restoration model slug is configured
  - Confirm background-removal model slug is configured
  - Confirm runtime logs show Replicate predictions and polling
- Rollback action: Disable the Replicate feature flags or revert to the last stable release.

## 11. WhatsApp Verification

- Purpose: Ensure customer intake and notifications still work after deployment.
- Expected result: WhatsApp webhook, media intake, and outbound message flow remain functional.
- Verification:
  - Confirm webhook validation succeeds
  - Confirm media intake reaches the queue
  - Confirm status notifications can be sent
- Rollback action: Disable the webhook route if customer intake fails and revert the service.

## 12. Payment Verification

- Purpose: Confirm the commerce flow still works end-to-end.
- Expected result: Orders can be paid and the paid state is recognized by the API.
- Verification:
  - Confirm payment credentials are present
  - Confirm order checkout flow completes
  - Confirm payment webhook handling updates order state
- Rollback action: Pause payment intake and revert to the previous working release.

## 13. End-to-End Testing

- Purpose: Validate the entire Phase 1 customer path.
- Expected result: Upload -> queue -> Replicate -> result -> storage -> download succeeds.
- Verification:
  - Confirm the full customer journey for restoration
  - Confirm the full customer journey for background removal
  - Confirm admin monitoring still reflects job state
- Rollback action: Roll back the Railway release if any customer journey breaks.

## 14. Rollback Procedure

- Purpose: Restore service safely if production verification fails.
- Expected result: The prior known-good release is restored without changing the data model.
- Verification:
  - Confirm the failing issue is reproducible and isolated
  - Confirm the previous release is healthy
  - Confirm no destructive migration is required
- Rollback action:
  - Revert the Railway service to the previous stable revision
  - Disable newly introduced feature flags if needed
  - Preserve database schema and existing orders/payments

## 15. Production Sign-Off

- Purpose: Authorize the launch only after all required checks pass.
- Expected result: Phase 1 production is ready for customer traffic.
- Verification:
  - Confirm all checklist items above are complete
  - Confirm no verified blocker remains
  - Confirm the active architecture matches the frozen Railway/Replicate stack
- Rollback action: Do not sign off until blockers are cleared.

## Deployment Checklist

- Confirm pre-build checks are complete
- Confirm local build succeeds
- Confirm Railway variables are present
- Confirm migration readiness
- Confirm deployment command and service target are correct
- Confirm health, API, storage, Redis, Replicate, WhatsApp, and payment checks pass

## Verification Checklist

- `GET /api/health` returns success
- `/api/version` reports production environment
- Database connects to Neon
- Redis queue is connected
- R2 upload/download succeeds
- Replicate predictions and polling succeed
- WhatsApp intake and notifications work
- Payment flow remains intact

## Rollback Checklist

- Preserve database schema and existing customer data
- Revert to the previous stable Railway revision
- Disable new Phase 1 feature flags if needed
- Verify health before re-enabling traffic

## Go-Live Checklist

- Confirm all verification items are green
- Confirm no verified blockers remain
- Confirm the launch path is the frozen Railway/Replicate architecture
- Confirm production monitoring is enabled

## Remaining Risks

- Railway environment misconfiguration
- Incorrect Replicate model identifiers
- Redis connectivity issues
- R2 signed URL or permission failures
- WhatsApp webhook or payment webhook regressions
- Residual legacy documentation or rollback-only code causing operator confusion

