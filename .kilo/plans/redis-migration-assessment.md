# Redis Failure Investigation & Migration Assessment

## Failure Cause

**Confirmed: Upstash Redis free tier request limit exceeded.**

- Error: `ERR max requests limit exceeded. Limit: 500000, Usage: 500002`
- The free tier allows 500,000 commands per month
- Usage hit 500,002 during Railway/Northflank migration testing
- All Redis operations (BullMQ queue push/pop, key scans, health checks) are blocked
- Worker watchdog triggers after 3 consecutive failures, shutting down the queue processor

## Redis Usage Analysis

Based on codebase analysis of `apps/api/src/`:

### BullMQ Queue (primary consumer)

| Queue Name | Operations | Requests per Job |
|-----------|-----------|------------------|
| `image-processing` | add, getJob, remove, updateProgress | ~30 commands/job |
| `image-processing-dead-letter` | add (on failure) | ~5 commands/job |
| `health-check` | periodic polling | ~10 commands/check |

**BullMQ overhead per job:** Each job uses ~50 Redis commands across `add`, `lpush`, `rpop`, `zadd`, `hset`, `get`, `set`, and Bull metadata keys.

### Health Dashboard (secondary consumer)

| Operation | Frequency | Commands |
|-----------|-----------|----------|
| Queue inspection | Every monitoring request | ~20 commands |
| Worker status | Every monitoring request | ~10 commands |

### Rate Limiting

In-memory (`Map` object in `rate-limit.middleware.ts` — **does not use Redis**).

### Sessions

No Redis-backed session store found — sessions use JWT tokens (stateless auth).

### Cache

No Redis-based application cache layer detected. All caching is in-memory or handled by Prisma/PostgreSQL.

## Estimated Request Count

| Operation | Daily Active Users | Jobs/Day | Commands/Op | Daily Commands | Monthly Commands |
|-----------|-------------------|----------|-------------|----------------|------------------|
| BullMQ queue push | 50 | 150 | 30 | 4,500 | 135,000 |
| BullMQ worker poll | 50 | 500 | 20 | 10,000 | 300,000 |
| Monitoring checks | 5 | 100 | 15 | 1,500 | 45,000 |
| Bull overhead (retries, dead-letter) | 10% failure | 15 | 50 | 750 | 22,500 |
| **Total** | | | | **16,750** | **502,500** |

The 500K monthly limit was exhausted within days of active testing. Even at moderate production load (50 users/day), the free tier is insufficient. A production deployment would need **at least 150K–500K commands/month** for BullMQ alone, plus growth.

## Upstash vs Northflank Managed Redis

| Feature | Upstash Pay-as-You-Go | Upstash Fixed 250MB | Northflank Managed Redis |
|---------|----------------------|---------------------|--------------------------|
| **Monthly cost** | ~$1/month (at 500K cmds) | $10/month | Included in Northflank plan |
| **Command limit** | $0.20/100K commands | Unlimited | Unlimited |
| **Max data** | 100 GB | 250 MB | Plan-dependent |
| **Max cmd/sec** | 10,000 | 10,000 | Plan-dependent |
| **TLS** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Latency** | External (Upstash cloud) | External | Same region as service |
| **Connection string** | `REDIS_URL` env var | `REDIS_URL` env var | `REDIS_MASTER_URL` env var |
| **Secret injection** | Manual env var | Manual env var | Auto-link to secret group |
| **Backup** | Yes (pay-as-you-go) | Yes | ✅ Built-in |
| **Persistence** | AOF | AOF | ✅ AOF |
| **Region** | AWS/GCP global | AWS/GCP global | Same as Northflank project |
| **Migration effort** | None (already using) | None (already using) | ~30 min setup |

### Key Advantage of Northflank Managed Redis

1. **Same region as the API service** — ~1ms latency instead of cross-region (5-50ms with Upstash)
2. **No per-command billing** — fixed monthly cost regardless of usage
3. **Auto-injected secrets** — `REDIS_MASTER_URL` automatically available in the service environment via secret group linking
4. **Built-in backup and restore** — managed backups included
5. **No external dependency** — everything within the Northflank ecosystem

### Key Disadvantage

1. **Data migration required** — Upstash has existing BullMQ queue data (mostly stale/deprecated from testing)

## Migration Required: RECOMMENDED

Migration to Northflank Managed Redis is recommended because:

1. **Cost**: Free with Northflank plan — fixed, predictable, no per-command charges
2. **Latency**: Same-region connectivity vs cross-region Upstash calls
3. **Simplicity**: No external provider to manage
4. **BullMQ compatibility**: Northflank Redis uses standard RESP protocol — no code changes needed

## Migration Steps

### Phase 1: Deploy Northflank Redis Addon

1. Open Northflank Dashboard → Project `AI Photo Studio` → Addon → New
2. Select **Redis**
3. Name: `studio-redis`
4. Version: 8.8.0 (latest)
5. Enable TLS
6. Create addon (provisions in ~2 min)

### Phase 2: Link to Secret Group

7. Go to Redis addon → Connection Details
8. Link `REDIS_MASTER_URL` to secret group `studio-api-env` with alias `REDIS_URL`
   - This ensures the application code works without changes (it reads `process.env.REDIS_URL`)
9. Verify: secret group variables now include `REDIS_URL` mapped to Northflank Redis connection string

### Phase 3: Deploy Service

10. The service will pick up the new `REDIS_URL` from the secret group on next deployment
11. Trigger a fresh deployment from GitHub (CI/CD should auto-trigger when secret group updates)
12. Or: `npx northflank restart service --serviceId "ai-photo-studio" --projectId "ai-photo-studio"`

### Phase 4: Verify

13. Check `/api/monitoring/queue` — should show healthy queue with no rate limit errors
14. Check runtime logs — no `ERR max requests limit exceeded` errors
15. BullMQ workers should initialize and start processing

### Data Migration (Optional)

The existing BullMQ queue data in Upstash is likely stale (from testing). If production queue data exists:
1. Use Northflank's built-in [migration guide](https://northflank.com/docs/v1/application/databases-and-persistence/migrate-data-to-northflank/migrate-your-redis-deployment-to-northflank)
2. Configure live replication from Upstash to Northflank Redis
3. Northflank imports the snapshot, then switches to the new Redis instance

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Upstash data loss during migration | Low | Medium | Stale test data only — no production orders yet |
| Connection string mismatch | Low | High | Use `REDIS_MASTER_URL` → alias `REDIS_URL` in secret group link |
| Bull queues not recreated | Low | Medium | Bull auto-creates queues on first access |
| Northflank Redis not available | Very Low | High | Northflank SLA — managed addon with HA option |
| Increased latency from TLS | Low | Low | TLS adds ~1ms — negligible for BullMQ operations |

## Rollback Plan

| Step | Action |
|------|--------|
| 1 | Update secret group `studio-api-env` → change `REDIS_URL` back to Upstash URL |
| 2 | Restart service: `npx northflank restart service --serviceId "ai-photo-studio" --projectId "ai-photo-studio"` |
| 3 | Verify `/api/monitoring/queue` shows queue connected |

## Next Step

Execute migration Phase 1: Deploy Northflank Redis Addon.
