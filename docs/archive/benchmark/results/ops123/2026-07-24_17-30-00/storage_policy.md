# OPS-123 — Storage Policy

**Date:** 2026-07-24

## Retention by Prefix

| Prefix | Retention | Purpose | Verified |
|--------|-----------|---------|----------|
| originals/ | 72 hours | Uploaded customer images | ✅ |
| finals/ | 30 days | Processed master images | ✅ |
| previews/ | 7 days | Generated preview links | ✅ |
| artifacts/ | 24 hours | Temporary processing artifacts | ✅ |

## Lifecycle Implementation

- Retention dates computed via `buildRetentionDate()` using a per-prefix hours map (storage.service.ts:57)
- `runCleanupOnce()` cleanup worker executed on service startup (index.ts)
- Cleanup deletes expired OrderImage records AND Order-level storage keys (cleanup.worker.ts)
- CleanupService handles deletion of temp uploads, benchmark files, previews, finals, originals (cleanup.service.ts)

## Storage Providers

| Provider | Production | Mock |
|----------|-----------|------|
| Backend | Cloudflare R2 (S3-compatible) | In-memory Map |
| Signed URLs | AWS SDK v3 presigner (15-min expiry) | ?signed=mock |
| Endpoint | R2_ENDPOINT or auto-derived | http://localhost |

## Storage Flow

```
Upload (/restore/new)
  → originals/<timestamp>-<uuid>-<filename> (retention: 72h)
    
Processing (PipelineOrchestrator)
  → finals/<timestamp>-<uuid>-<filename> (retention: 30d)
    
Preview (generatePreview)
  → previews/<timestamp>-<uuid>-<filename> (retention: 7d)
    
Download (getDownloadUrl)
  → Signed URL from finalStorageKey (expiry: 15min)
```

## Temp/Cleanup Policy

| Type | Trigger | Action |
|------|---------|--------|
| Expired originals | Cleanup worker | Delete from storage + null DB refs |
| Expired finals | Cleanup worker | Delete from storage + null DB refs |
| Unpaid uploads | CleanupService | Delete orphaned originals without associated payment |
| Temp artifacts | CleanupService | Delete artifacts/ prefix files beyond retention |
