# Neon PostgreSQL — Production Migration Checklist

**Target:** Replace Cloud SQL (`ai-photo-studio-db`) with Neon PostgreSQL  
**Status:** Not started — provisioning plan only  
**Connection string pattern:** `postgresql://user:password@neon-host/ai_photo_studio?sslmode=require&pgbouncer=true`

---

## 1. Provisioning

- [ ] Create Neon project via Neon Console or API
- [ ] Note project ID and region (prefer closest to target deployment region)
- [ ] Enable connection pooling (pgBouncer mode — required for serverless/worker connections)
- [ ] Create `main` branch (production branch)
- [ ] Create `staging` branch (optional — for pre-production testing)
- [ ] Record `NEON_DATABASE_URL` connection string
- [ ] Record `NEON_API_KEY` for programmatic management

## 2. Data Migration

- [ ] Export Cloud SQL database:
  ```bash
  pg_dump --host=136.115.21.123 --port=5432 --username=app_user --dbname=ai_photo_studio --no-owner --no-acl > ai_photo_studio_dump.sql
  ```
- [ ] Import into Neon:
  ```bash
  psql "$NEON_DATABASE_URL" < ai_photo_studio_dump.sql
  ```
- [ ] Verify row counts match between Cloud SQL and Neon for every table:
  ```sql
  SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;
  ```
- [ ] Verify sequence values are correct:
  ```sql
  SELECT sequence_name, last_value FROM information_schema.sequences;
  ```

## 3. Prisma Compatibility

| Check | Expected | Status |
|-------|----------|--------|
| Prisma version | 5.20.0 | ✅ Compatible |
| Connection pooler | pgBouncer (transaction mode) | ⚠️ Requires `?pgbouncer=true` |
| SSL mode | `require` | ✅ Required for Neon |
| Schema validation | `prisma validate` | ✅ Run against Neon |
| Migration apply | `prisma migrate deploy` | ✅ Run against Neon after import |
| Shadow database | Auto-created by Neon | ⚠️ Verify for `prisma migrate dev` |

**Notes:**
- Prisma 5.x supports pgBouncer via `?pgbouncer=true` query parameter
- Set `DATABASE_URL` to the pooled Neon URL for runtime
- Set `DIRECT_URL` to the unpooled Neon URL for migrations (Prisma needs direct connection for DDL)
- Use `prisma migrate deploy` (not `prisma migrate dev`) in production

## 4. Environment Variables

| Variable | Current (Cloud SQL) | Future (Neon) |
|----------|---------------------|---------------|
| `DATABASE_URL` | `postgresql://app_user:***@136.115.21.123:5432/ai_photo_studio` | `postgresql://user:***@neon-host/ai_photo_studio?sslmode=require&pgbouncer=true` |
| `DIRECT_URL` (new) | Not set | `postgresql://user:***@neon-host/ai_photo_studio?sslmode=require` |

**GitHub Secrets to add:**
- `DATABASE_URL` → Neon pooled URL
- `NEON_DATABASE_URL` → Same (alias for future migration)
- `DIRECT_URL` → Neon direct URL (for Prisma migrations in CI)

## 5. Connection Pooling

| Setting | Neon Default | Recommended |
|---------|-------------|-------------|
| Pool mode | Transaction | Transaction (for BullMQ workers) |
| Min connections | 0 | 1 (reduce cold start) |
| Max connections | 20 (scales with plan) | 20 |
| Pool timeout | 10s | 30s (for worker bursts) |

**Connection string for pooled:**
```
postgresql://user:password@neon-host/ai_photo_studio?sslmode=require&pgbouncer=true&connection_limit=20&pool_timeout=30
```

## 6. Backup Strategy

| Backup Type | Frequency | Retention | Method |
|-------------|-----------|-----------|--------|
| Automated | Daily | 7 days | Neon built-in backups |
| Manual pre-migration | Immediate | 30 days | `pg_dump` → R2 bucket |
| Logical | Weekly | 90 days | `pg_dump` → R2 bucket via cron job |
| Point-in-time | Continuous | 7 days | Neon PITR (paid plan) |

**Backup command for logical backup:**
```bash
pg_dump "$DIRECT_URL" --no-owner --no-acl --format=custom > neon_backup_$(date +%Y%m%d).dump
```

**Restore from backup:**
```bash
pg_restore --clean --if-exists --no-owner --no-acl -d "$DIRECT_URL" neon_backup_YYYYMMDD.dump
```

## 7. Rollback Plan

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Point `DATABASE_URL` back to Cloud SQL | App health check |
| 2 | Verify Prisma schema matches Cloud SQL | `prisma validate` |
| 3 | Re-deploy API with old DATABASE_URL | `/api/health` responds 200 |
| 4 | Verify BullMQ jobs process against Cloud SQL | Queue health check |
| 5 | Monitor for 1 hour | No errors in logs |

## 8. Post-Migration Verification

- [ ] `/api/health` returns 200
- [ ] Prisma queries return correct data
- [ ] User authentication works (login/signup)
- [ ] Order creation works
- [ ] BullMQ jobs process successfully
- [ ] Admin dashboard loads
- [ ] Payment flow completes
- [ ] WhatsApp webhook processes
- [ ] Worker processes restoration items
- [ ] Worker processes background removal items

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Data loss during export/import | Low | Critical | Verify row counts; keep Cloud SQL online |
| Connection pool exhaustion | Medium | High | Configure pool limits; monitor connections |
| Prisma migration conflicts | Low | High | Test migrations on staging first |
| SSL/TLS handshake latency | Low | Low | Neon uses regional endpoints; keep warm |
| Cold start latency | Medium | Low | Configure min 1 connection pooler connection |
| pgBouncer incompatibility | Low | Medium | Prisma 5.x supports pgBouncer with `?pgbouncer=true` |
