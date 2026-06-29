param(
    [string]$ProjectId = "aistudio-ai-photo-studio",
    [string]$Region = "us-central1",
    [string]$ServiceName = "ai-photo-studio-api",
    [string]$ImageTag = "latest"
)

$ErrorActionPreference = 'Stop'

Write-Host "Building and deploying ${ServiceName} to Cloud Run..." -ForegroundColor Cyan
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
