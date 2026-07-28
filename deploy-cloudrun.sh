#!/bin/bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-project-9540c255-c960-4fa0-a91}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-ai-photo-studio-api}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "Building and deploying ${SERVICE_NAME} to Cloud Run..."
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Image Tag: ${IMAGE_TAG}"

gcloud builds submit \
  --project="${PROJECT_ID}" \
  --config=cloudbuild.yaml \
  --substitutions="_PROJECT_ID=${PROJECT_ID},_SERVICE_NAME=${SERVICE_NAME},_REGION=${REGION},_IMAGE_TAG=${IMAGE_TAG}" \
  .

echo "Deployment complete."
echo "Service URL: https://${SERVICE_NAME}-${PROJECT_ID}.run.app"
