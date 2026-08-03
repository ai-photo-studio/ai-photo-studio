param(
    [string]$ProjectId = "project-9540c255-c960-4fa0-a91",
    [string]$Region = "us-central1",
    [string]$ServiceName = "ai-photo-studio-api",
    [string]$ImageTag = "latest"
)

# RETIRED -- historical reference only; not an active deploy or rollback target.
# Current production API deployment target is Northflank (api.thannow.com), auto-deployed
# via .github/workflows/deploy.yml on push to main. Google Cloud/Cloud Run is retired and this
# script is blocked below to prevent an accidental deploy to the retired target.
Write-Host "RETIRED: This script targets Google Cloud Run, which is no longer the production deployment target." -ForegroundColor Red
Write-Host "Current production target is Northflank (api.thannow.com) via .github/workflows/deploy.yml." -ForegroundColor Red
Write-Host "Blocking execution." -ForegroundColor Red
exit 1

$ErrorActionPreference = 'Stop'

Write-Host "Building and deploying ${ServiceName} to Cloud Run (historical, GCP-era)..." -ForegroundColor Cyan
Write-Host "Project: ${ProjectId}"
Write-Host "Region: ${Region}"
Write-Host "Image Tag: ${ImageTag}"

gcloud builds submit `
  --project="${ProjectId}" `
  --config=cloudbuild.yaml `
  --substitutions="_PROJECT_ID=${ProjectId},_SERVICE_NAME=${ServiceName},_REGION=${Region},_IMAGE_TAG=${ImageTag}" `
  .

Write-Host "Deployment complete." -ForegroundColor Green
Write-Host "Service URL: https://${ServiceName}-${ProjectId}.run.app" -ForegroundColor Green
