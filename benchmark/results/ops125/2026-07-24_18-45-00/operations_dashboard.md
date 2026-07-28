# OPS-125 — Operations Dashboard

**Date:** 2026-07-24

## Real-time Operations View

The admin dashboard now includes a dedicated operations section showing:

### Queue Monitor

| Metric | Source | Status |
|--------|--------|--------|
| Queued jobs | ProcessingJob status=QUEUED | VERIFIED |
| Running jobs | ProcessingJob status=RUNNING | VERIFIED |
| Completed jobs | ProcessingJob status=COMPLETED | VERIFIED |
| Failed jobs | ProcessingJob status=FAILED | VERIFIED |
| Dead letter jobs | ProcessingJob status=DEAD_LETTER | VERIFIED |
| Queue depth | queued + retrying | VERIFIED (existing stats) |

### Storage Monitor

| Metric | Source | Status |
|--------|--------|--------|
| Originals stored | OrderImage kind=ORIGINAL count | VERIFIED |
| Finals stored | OrderImage kind=FINAL count | VERIFIED |
| Previews stored | OrderImage kind=PREVIEW count | VERIFIED |
| Storage growth | Scrollable over time | UNKNOWN (no time-series) |

### Failure Monitor

| Metric | Source | Status |
|--------|--------|--------|
| Total restore failures | RestorationItem status=FAILED count | VERIFIED |
| Replicate-specific failures | RestorationItem errorMessage contains replicate/429 | VERIFIED |
| Provider failures | ProcessingJob failureStage=provider | VERIFIED (existing stats) |
| Queue failures | ProcessingJob failureStage=queue | VERIFIED (existing stats) |

### Health Endpoints

| Endpoint | Status | Verified |
|----------|--------|----------|
| `GET /api/health` | ✅ | LIVE TEST |
| `GET /api/monitoring/health` | ✅ | CODE |
| `GET /admin/queue-health` | ✅ | CODE |
| `GET /admin/processing-metrics?hours=24` | ✅ | CODE |
| `GET /admin/queue-metrics` | ✅ | CODE |
| `GET /admin/cost-metrics?hours=24` | ✅ | CODE |
| `GET /admin/business-metrics?hours=24` | ✅ | CODE (NEW) |

## Daily Backup Verification

| Check | Status | Notes |
|-------|--------|-------|
| Neon database backups | VERIFIED | Automatic daily with 7-day retention |
| Prisma migration deploy | VERIFIED | Runs on service startup |
| R2 object storage | VERIFIED | S3-compatible, no versioning confirmed |
| Cleanup worker | VERIFIED | Removes expired originals, finals, previews on startup |