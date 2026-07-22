# Cleanup Policy

## Overview

The Cleanup Service automatically removes temporary and expired files from storage to manage costs and comply with data retention requirements.

## Retention Policy

| File Type | Storage Prefix | Retention Period | Default |
|---|---|---|---|
| Temporary uploads | `temp/` | 1 hour | `tempRetentionHours` |
| Benchmark files | `artifacts/` | 24 hours | `benchmarkRetentionHours` |
| Temporary previews | `previews/` | 7 days | `previewRetentionDays` |
| Expired download artifacts | `finals/` | 30 days | `finalRetentionDays` |
| Expired originals | `originals/` | 72 hours | `originalRetentionHours` |

## Configuration

The retention policy is configurable via `CleanupConfig`:

```typescript
interface CleanupConfig {
  tempRetentionHours: 1;        // Temp uploads deleted after 1 hour
  benchmarkRetentionHours: 24;  // Benchmark files deleted after 24 hours
  previewRetentionDays: 7;      // Previews deleted after 7 days
  finalRetentionDays: 30;       // Finals deleted after 30 days
  originalRetentionHours: 72;   // Originals deleted after 72 hours
  maxFilesPerRun: 200;          // Max files processed per cleanup run
}
```

## Cleanup Process

The cleanup runs in two phases:

### Phase 1: Order Image Retention (existing)

Handles `orderImage` and `order` records with expiration dates:
- Deletes expired original images (`kind: "ORIGINAL"`)
- Deletes expired processed images (`kind: "FINAL"`)
- Nulls out expired storage keys in order records

### Phase 2: Extended Cleanup (new)

Handles additional file types via `CleanupService`:

1. **Temp uploads** — Finds `restorationItem` records with `status: "PENDING"` older than the retention period and deletes their `originalStorageKey` if it starts with `temp/`
2. **Benchmark files** — Finds `providerCostLog` records with benchmark metadata older than the retention period and deletes associated artifacts
3. **Previews** — Finds `restorationItem` records with `previewStorageKey` older than the retention period and deletes the preview files
4. **Expired finals** — Finds completed `restorationItem` records with `finalStorageKey` older than the retention period and deletes the final images
5. **Expired originals** — Finds `restorationItem` records with `originalStorageKey` older than the retention period and deletes the original files

## Cleanup Result

```typescript
interface CleanupResult {
  deletedTempUploads: number;
  deletedBenchmarkFiles: number;
  deletedPreviews: number;
  deletedFinals: number;
  deletedOriginals: number;
  totalDeleted: number;
  errors: string[];
}
```

## Scheduling

The cleanup worker (`runCleanupOnce`) should be scheduled to run periodically (e.g., every hour) via a cron job or scheduled task.

## Usage

```typescript
import { CleanupService } from "./services/cleanup.service";

const cleanup = new CleanupService(config, {
  tempRetentionHours: 2,
  previewRetentionDays: 14,
});

const result = await cleanup.runCleanup();
console.log(`Deleted ${result.totalDeleted} files`);
```

## Error Handling

- Each cleanup phase runs independently
- Errors in one phase do not prevent other phases from running
- All errors are logged and collected in the `errors` array
- File deletion errors are caught and logged (non-fatal)
