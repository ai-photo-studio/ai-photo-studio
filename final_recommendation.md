# Final Recommendation — OPS-153

## Fix Required

Deploy the OPS-150 watchdog fix to the active Cloud Run revision.

The fix is already in the source code (`apps/api/src/services/worker-watchdog.service.ts:28-31`) — it just needs to be deployed.

## How to Deploy

### Option 1: Add GCP_SERVICE_ACCOUNT_KEY (Recommended)

```bash
# Create service account
gcloud iam service-accounts create github-actions-deployer \
  --display-name="GitHub Actions Deployer" \
  --project=project-9540c255-c960-4fa0-a91

# Download key
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions-deployer@project-9540c255-c960-4fa0-a91.iam.gserviceaccount.com \
  --project=project-9540c255-c960-4fa0-a91

# Get key contents as base64
$key = Get-Content key.json -Raw

# Add to GitHub
gh secret set GCP_SERVICE_ACCOUNT_KEY --body "$key"

# Grant roles
gcloud projects add-iam-policy-binding project-9540c255-c960-4fa0-a91 \
  --member="serviceAccount:github-actions-deployer@project-9540c255-c960-4fa0-a91.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding project-9540c255-c960-4fa0-a91 \
  --member="serviceAccount:github-actions-deployer@project-9540c255-c960-4fa0-a91.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

Then any push to `main` will automatically build and deploy both the frontend and API.

### Option 2: Manual Gcloud Deploy (Faster)

```bash
# Build and push Docker image
docker build -t us-central1-docker.pkg.dev/project-9540c255-c960-4fa0-a91/ai-photo-studio-api/latest .
docker push us-central1-docker.pkg.dev/project-9540c255-c960-4fa0-a91/ai-photo-studio-api/latest

# Deploy to Cloud Run
gcloud run deploy ai-photo-studio-api \
  --image=us-central1-docker.pkg.dev/project-9540c255-c960-4fa0-a91/ai-photo-studio-api/latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --cpu=1 \
  --memory=1Gi \
  --min-instances=1 \
  --max-instances=10 \
  --project=project-9540c255-c960-4fa0-a91
```

## Additional Recommendations

1. **Add liveness probe** to the Cloud Run service — currently no liveness probe is configured
2. **Set RUNPOD_API_KEY to actually undefined** in env vars (remove the empty string) — this ensures the guard triggers even with the old code
3. **Verify watchdog stops firing** after deploy — monitor Cloud Run logs for WORKER_RESTART events

## Expected Outcome

After deploying the OPS-150 fix:
- WORKER_RESTART events: **0** (disabled when RunPod not configured)
- MEMORY_WATCHDOG events: **0** (no restarts to trigger them)
- HTTP 500 on restoration endpoints: **0** (worker stays healthy)
- ERR_CONNECTION_CLOSED: **0** (no mid-request terminations)
