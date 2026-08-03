# Backup & Recovery Guide

> Railway is RETIRED — historical reference only; not an active deploy or rollback target. Current production database is Neon PostgreSQL, reachable from the Northflank API service via `DATABASE_URL`. The commands below no longer apply as written; run `pg_dump`/`psql` directly against the Neon connection string (from Northflank secret configuration) instead of through `railway run`.

## Database Backups

### Manual Backup (historical Railway invocation; use a direct Neon `DATABASE_URL` instead)
```bash
pg_dump --no-owner --no-acl "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Database Restore (historical Railway invocation; use a direct Neon `DATABASE_URL` instead)
```bash
psql "$DATABASE_URL" < backup_file.sql
```

### Prisma Recovery
If migration state is out of sync:
```bash
npm run prisma:validate -w apps/api   # Check schema validity
npm run prisma:generate -w apps/api    # Regenerate Prisma client
```

## R2 Retention Policy

| Category | Retention | Enforcement |
|----------|-----------|-------------|
| Original images | 72 hours | Deleted by `cleanup.worker.ts` (runs every 60 min) |
| Processed images (finals) | 30 days | Deleted by `cleanup.worker.ts` (runs every 60 min) |
| Preview images | 7 days | Deleted by `cleanup.worker.ts` (runs every 60 min) |

### R2 Data Cannot Be Restored
Once deleted by the cleanup worker, R2 objects are permanently removed. No snapshot/versioning is enabled.

## Snapshot & Rollback

### Create Snapshot
```bash
npm run snapshot:create
```
Creates a git tag and deployment snapshot for rollback reference.

### Rollback
```bash
npm run rollback              # Show rollback options
npm run rollback:exec         # Execute rollback
```
Rollback performs a `git checkout` to the snapshot tag.

## Audit Trail

The `AuditLog` model in Prisma tracks:
- `actorType` / `actorId` — who performed the action
- `action` — what was done
- `entityType` / `entityId` — which record was affected
- `meta` (JSON) — additional context
- `createdAt` — timestamp

Audit logs are never automatically deleted.
