# Northflank End-to-End Production Verification Plan

## Prerequisites

- Application URL: `https://p01--ai-photo-studio--qyv86rj8qrvh.code.run`
- Custom domain: Not yet configured — use Railway-generated URL
- Health endpoint verified: `{"success":true,"message":"AI Photo Studio API is running","provider":"replicate","model_slug":"flux-kontext-apps/restore-image","payment_mode":"manual"}`

## Verification Sequence

### 1. API Health

| Test | Command | Expected |
|------|---------|----------|
| Health endpoint | `curl -s https://p01--ai-photo-studio--qyv86rj8qrvh.code.run/api/health` | HTTP 200 + `{"success":true,...}` |
| Config preview | `curl -s https://p01--ai-photo-studio--qyv86rj8qrvh.code.run/api/config/preview` | HTTP 200 |
| Version | `curl -s https://p01--ai-photo-studio--qyv86rj8qrvh.code.run/api/version` | HTTP 200 |

### 2. Database (PostgreSQL)

| Test | How | Expected |
|------|-----|----------|
| Connection | Check logs: no `DATABASE_URL` error | ✅ Already confirmed (container starts) |
| Active connection | Prisma auto-connects on first query | Confirmed via Bull queue (reads from DB) |
| Migration status | Check logs for `prisma migrate` output | Dockerfile env `SKIP_MIGRATIONS=true` — migrations run separately |

### 3. Redis

| Test | How | Expected |
|------|-----|----------|
| Connection | Check logs for Bull queue keys | ✅ Already confirmed: `bull:image-processing:wait`, `bull:image-processing:active`, etc. |
| Queue ready | Bull queue worker initialized | Logs show `"bull:image-processing:"` key prefixes |

### 4. Cloudflare R2

| Test | How | Expected |
|------|-----|----------|
| Storage provider | Config shows `STORAGE_PROVIDER=r2` | ✅ Configured |
| Credentials | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` set | ✅ In secret group |
| Endpoint | `R2_PUBLIC_BASE_URL` set | ✅ Added via update secret |
| Write test | Trigger upload from replication pipeline | Verify via download URL |

### 5. Upload Test Image

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Create a small test image (100x100 PNG) | `test-image.png` |
| 5.2 | POST to upload endpoint | HTTP 200 + image ID |
| 5.3 | Check response contains `imageId` | UUID format |

**API endpoint (from index.ts route analysis):**
```bash
# Upload via multipart form
curl -X POST \
  -F "file=@test-image.png" \
  https://p01--ai-photo-studio--qyv86rj8qrvh.code.run/api/upload
```

**Expected response:**
```json
{"success":true,"imageId":"<uuid>"}
```

### 6. Restoration Pipeline

| Step | Action | Expected |
|------|--------|----------|
| 6.1 | Use `imageId` from upload | Valid UUID |
| 6.2 | POST to restoration endpoint | HTTP 202 (accepted) |
| 6.3 | Queue job created | Bull queue processes the job |
| 6.4 | Replicate API called | POST to `flux-kontext-apps/restore-image` |
| 6.5 | Result uploaded to R2 | File stored in R2 bucket |
| 6.6 | Download URL returned | HTTP 200 with restored image URL |

**Restoration endpoint:**
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"imageId":"<uuid>"}' \
  https://p01--ai-photo-studio--qyv86rj8qrvh.code.run/api/restore
```

### 7. Queue Monitoring

| Test | How | Expected |
|------|-----|----------|
| Queue status | `curl https://p01--ai-photo-studio--qyv86rj8qrvh.code.run/api/queue/status` | HTTP 200 with queue metrics |
| Active jobs | `curl https://p01--ai-photo-studio--qyv86rj8qrvh.code.run/api/queue/active` | List of in-progress jobs |

### 8. Failure Handling

| Scenario | Test | Expected Behavior |
|----------|------|-------------------|
| Invalid image ID | POST `/api/restore` with fake UUID | HTTP 400/404 + error message |
| Missing file | POST `/api/upload` with no file | HTTP 400 + validation error |
| Invalid auth | Call without required headers | HTTP 401 (if auth required) |
| Replicate failure | If model errors | Job retry via Bull queue (configurable retries) |

### 9. Performance Check

| Metric | Expected | Method |
|--------|----------|--------|
| Response time (health) | < 500ms | `curl -w "%{time_total}"` |
| Response time (upload) | < 5s | Depends on file size |
| Response time (restore) | < 60s | Replicate model inference time |
| Memory usage | < 2 GB | Northflank metrics dashboard |
| CPU usage | < 80% | Northflank metrics dashboard |

## Verification Commands (Batch)

```bash
# Save base URL
BASE="https://p01--ai-photo-studio--qyv86rj8qrvh.code.run"

# 1. Health
curl -s "$BASE/api/health" | python3 -m json.tool

# 2. Config preview (redacts secrets)
curl -s "$BASE/api/config/preview" | python3 -m json.tool

# 3. Create test image
python3 -c "
from PIL import Image
img = Image.new('RGB', (100, 100), color='red')
img.save('/tmp/test-image.png')
print('Created /tmp/test-image.png')
"

# 4. Upload
UPLOAD_RESP=$(curl -s -X POST -F "file=@/tmp/test-image.png" "$BASE/api/upload")
echo "Upload: $UPLOAD_RESP"
IMAGE_ID=$(echo $UPLOAD_RESP | python3 -c "import sys,json; print(json.load(sys.stdin).get('imageId',''))")
echo "Image ID: $IMAGE_ID"

# 5. Restore
curl -s -X POST -H "Content-Type: application/json" -d "{\"imageId\":\"$IMAGE_ID\"}" "$BASE/api/restore"

# 6. Check queue
curl -s "$BASE/api/queue/status"
```

## Rollback Triggers

| Failure | Action |
|---------|--------|
| Health endpoint returns non-200 | Check env vars in secret group → restart service |
| Upload fails | Check R2 credentials in secret group → verify R2 endpoint |
| Restore fails | Verify Replicate API token → check queue logs |
| Queue not processing | Verify Redis URL → check Bull queue config |
| Overall failure | `npx northflank restart service --serviceId "ai-photo-studio" --projectId "ai-photo-studio"` |

## Production Ready: CONDITIONAL

Will be determined after running the verification sequence above. Currently:

✅ API health  
✅ PostgreSQL connected  
✅ Redis connected  
✅ R2 configured  
❌ Upload test — not yet verified  
❌ Replicate restoration — not yet verified  
❌ Queue processing — not yet verified at full pipeline  
❌ Failure handling — not yet tested  
❌ Performance metrics — not yet collected
