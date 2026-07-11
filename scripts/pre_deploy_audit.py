#!/usr/bin/env python3
"""
Phase 1: Pre-Deploy Audit
Verify current state before deployment.
"""
import os
import json
import subprocess
from pathlib import Path
from datetime import datetime

OUTPUT_DIR = Path(__file__).parent.parent / "validation_output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def run_cmd(cmd, cwd=None):
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60, cwd=cwd or "..")
        return result.stdout.strip(), result.returncode
    except Exception as e:
        return str(e), 1

def get_git_head():
    out, code = run_cmd("git rev-parse HEAD")
    return out if code == 0 else "unknown"

def get_git_log():
    out, code = run_cmd("git log --oneline -3")
    return out.split('\n') if code == 0 else []

def get_cloudrun_revision():
    out, code = run_cmd("gcloud run revisions list --service=ai-photo-studio-bg-remover-gpu --region=us-central1 --project=project-9540c255-c960-4fa0-a91 --limit=1 --format='value(name)'")
    return out if code == 0 else "unknown"

def get_cloudrun_image():
    out, code = run_cmd("gcloud run revisions describe ai-photo-studio-bg-remover-gpu-00063-q8j --region=us-central1 --project=project-9540c255-c960-4fa0-a91 --format='value(spec.template.spec.containers[0].image)'")
    return out if code == 0 else "unknown"

def get_cloudrun_env():
    out, code = run_cmd("gcloud run services describe ai-photo-studio-bg-remover-gpu --region=us-central1 --project=project-9540c255-c960-4fa0-a91 --format='value(spec.template.spec.containers[0].env)'")
    return out if code == 0 else "unknown"

def main():
    print("=== PRE-DEPLOY AUDIT ===\n")
    
    git_head = get_git_head()
    git_log = get_git_log()
    
    print(f"Git HEAD: {git_head}")
    print(f"Recent commits:")
    for c in git_log:
        print(f"  {c}")
    
    revision = get_cloudrun_revision()
    print(f"\nCloud Run Revision: {revision}")
    
    image = get_cloudrun_image()
    print(f"Cloud Run Image: {image}")
    
    env = get_cloudrun_env()
    print(f"Environment Variables: {env}")
    
    result = {
        "timestamp": datetime.now().isoformat(),
        "repository": {
            "git_head": git_head,
            "git_log": git_log
        },
        "deployment": {
            "cloudrun_revision": revision,
            "cloudrun_image": image
        },
        "environment": {
            "raw_output": env
        },
        "comparison": {
            "repository_head": git_head,
            "deployed_image": image.split(':')[-1] if ':' in image else "unknown"
        }
    }
    
    with open(OUTPUT_DIR / "deployment_before.json", 'w') as f:
        json.dump(result, f, indent=2)
    
    print(f"\nResults saved to {OUTPUT_DIR / 'deployment_before.json'}")

if __name__ == "__main__":
    main()