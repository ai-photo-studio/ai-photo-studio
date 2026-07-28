# Northflank Managed Redis Migration Plan

## Phase 1: Create Redis Addon

**Approach: Use Northflank Dashboard** (CLI requires `deploymentPlan` ID which differs by account/plan)

1. Open Northflank Dashboard → Project `AI Photo Studio` → **Addons** → **New Addon**
2. Select **Redis**
3. Name: `studio-redis`
4. Version: `8.8.0` (latest)
5. TLS: **Enabled**
6. Resources: Select the minimum plan available (free tier — 250 MB is sufficient for BullMQ queue metadata)
7. Maxmemory policy: `allkeys-lru` (evicts least recently used keys — appropriate for BullMQ queue data)
8. Create addon — provisions in ~2 minutes

**CLI alternative (if `deploymentPlan` ID is known):**
```bash
npx northflank create addon \
  --projectId "ai-photo-studio" \
  --input '{
    "name": "studio-redis",
    "type": "redis",
    "version": "latest",
    "tlsEnabled": true,
    "externalAccessEnabled": false,
    "billing": {
      "deploymentPlan": "nf-compute-20",
      "storage": 2048,
      "replicas": 1
    },
    "typeSpecificSettings": {
      "redisMaxMemoryPolicy": "allkeys-lru"
    }
  }'
```

## Phase 2: Link REDIS_MASTER_URL to Secret Group

1. Go to Redis addon → **Connection Details**
2. Click **Link to Secret Group**
3. Select secret group: `studio-api-env`
4. Select `REDIS_MASTER_URL` → set alias to `REDIS_URL`
5. Apply

This ensures the application reads the new Redis URL from `process.env.REDIS_URL` without any code changes.

**CLI alternative:**
```bash
npx northflank update secret-link \
  --projectId "ai-photo-studio" \
  --addonId "studio-redis" \
  --secretId "studio-api-env" \
  --input '{"keys":[{"keyName":"REDIS_MASTER_URL","aliases":["REDIS_URL"]}]}'
```

## Phase 3: Restart Service

**CLI:**
```bash
npx northflank restart service \
  --serviceId "ai-photo-studio" \
  --projectId "ai-photo-studio"
```

Or trigger a new deployment (CI/CD will auto-build if secret group update triggers it).

## Phase 4: Verify

**CLI commands:**
```bash
# 1. Check health endpoint
curl -s https://p01--ai-photo-studio--qyv86rj8qrvh.code.run/api/health

# 2. Check queue monitoring
curl -s https://p01--ai-photo-studio--qyv86rj8qrvh.code.run/api/monitoring/queue

# 3. Check worker monitoring
curl -s https://p01--ai-photo-studio--qyv86rj8qrvh.code.run/api/monitoring/worker

# 4. Check runtime logs for Redis connection
npx northflank get service logs \
  --projectId "ai-photo-studio" \
  --serviceId "ai-photo-studio" \
  -l 20 --types runtime

# 5. Check for any rate limit errors
npx northflank get service logs \
  --projectId "ai-photo-studio" \
  --serviceId "ai-photo-studio" \
  -l 50 --types runtime | Select-String "max requests|Upstash"
```

## Phase 5: Cleanup (Optional)

After confirming Northflank Redis is working:
1. Remove `REDIS_URL` from the secret group `studio-api-env` (it will be auto-injected by the addon link instead)
2. Delete the Upstash Redis database

## Rollback

If migration fails:
1. Go to secret group `studio-api-env` → add `REDIS_URL` back with the Upstash connection URL
2. Restart service: `npx northflank restart service --serviceId "ai-photo-studio" --projectId "ai-photo-studio"`
3. Verify `/api/monitoring/queue` shows queue reconnected

## Verification Criteria

| Check | Expected |
|-------|----------|
| /api/health | HTTP 200 |
| /api/monitoring/queue | `"healthy":true`, no rate limit errors |
| /api/monitoring/worker | `"running":true`, `"healthy":true` |
| Runtime logs | No `ReplyError: ERR max requests limit exceeded` |
| Latency | <5ms Redis round-trip (same-region) |
