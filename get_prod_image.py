#!/usr/bin/env python3
import subprocess
import json

# Get production image digest
service_cmd = [
    "gcloud", "run", "services", "describe", "ai-photo-studio-bg-remover-gpu",
    "--region=us-central1", "--format=json", "--project=project-9540c255-c960-4fa0-a91"
]

try:
    service_result = subprocess.run(service_cmd, capture_output=True, text=True, timeout=30)
    service_data = json.loads(service_result.stdout)
    image = service_data["spec"]["template"]["containers"][0]["image"]
    print(f"PRODUCTION_IMAGE: {image}")

except Exception as e:
    print(f"ERROR: {e}")
    exit(1)
