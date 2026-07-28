# Backup & Recovery Guide

## Database Backups

Railway provides automated PostgreSQL backups for the production database.

### Manual Backup
```bash
railway run -- pg_dump --no-owner --no-acl DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Database Restore
```bash
railway run -- psql DATABASE_URL < backup_file.sql
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
