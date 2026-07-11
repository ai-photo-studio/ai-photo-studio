#!/usr/bin/env python3
"""
Add diagnostics endpoints to background remover API
"""
from pathlib import Path

app_path = Path(__file__).parent / "services" / "background-remover" / "app.py"

if app_path.exists():
    with open(app_path, 'r') as f:
        content = f.read()

    # Add new endpoints after existing endpoints
    new_endpoints = '''
# Runtime Diagnostics Endpoints
@app.get("/api/version")
async def get_version():
    """Return version and runtime information."""
    from datetime import datetime
    import os
    import sys
    import subprocess

    git_info = None
    try:
        for alt_path in ['/app', '/workspace', '/source']:
            alt_dir = Path(alt_path)
            if alt_dir.exists():
                try:
                    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=alt_dir, stderr=subprocess.PIPE).decode().strip()
                    short_sha = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=alt_dir, stderr=subprocess.PIPE).decode().strip()
                    git_info = {'full_sha': sha, 'short_sha': short_sha}
                    break
                except:
                    pass
    except:
        pass

    return {
        "git_sha": git_info,
        "image": os.environ.get('IMAGE', os.environ.get('GCP_INVOCATION_ID', 'unknown')),
        "build_time": os.environ.get('BUILD_TIME', datetime.utcnow().isoformat()),
        "commit_time": os.environ.get('COMMIT_TIME', datetime.utcnow().isoformat()),
        "provider": os.environ.get('SEGMENTATION_ROUTING', 'unknown'),
        "sam2_model": os.environ.get('GPU_SEGMENTATION_MODEL', 'unknown'),
        "prompt_strategy": os.environ.get('PROMPT_STRATEGY', 'unknown'),
        "model_loaded": os.environ.get('MODEL_LOADED', 'unknown'),
        "checkpoint_loaded": os.environ.get('CHECKPOINT_LOADED', 'unknown'),
        "cuda": "enabled" if sys.modules.get('torch') and torch.cuda.is_available() else "disabled"
    }

@app.get("/api/runtime")
async def get_runtime():
    """Return full runtime diagnostics."""
    return _RUNTIME_DIAGNOSTICS

@app.get("/api/build")
async def get_build():
    """Return build information."""
    return {
        "service_name": "ai-photo-studio-bg-remover-gpu",
        "docker_image": os.environ.get('IMAGE', 'unknown'),
        "build_time": _RUNTIME_DIAGNOSTICS.get('build_time', datetime.utcnow().isoformat()),
        "commit_time": _RUNTIME_DIAGNOSTICS.get('commit_time', datetime.utcnow().isoformat()),
        "provider": _RUNTIME_DIAGNOSTICS.get('provider', 'unknown'),
        "sam2_version": _RUNTIME_DIAGNOSTICS.get('sam2_model', 'unknown'),
        "prompt_strategy": _RUNTIME_DIAGNOSTICS.get('prompt_strategy', 'unknown'),
        "environment_variables": {
            "REMBG_MODEL": os.environ.get('REMBG_MODEL', 'unknown'),
            "SEGMENTATION_ROUTING": os.environ.get('SEGMENTATION_ROUTING', 'unknown'),
            "GPU_SEGMENTATION_MODEL": os.environ.get('GPU_SEGMENTATION_MODEL', 'unknown'),
            "SAM2_CHECKPOINT": os.environ.get('SAM2_CHECKPOINT', 'unknown'),
            "OBJECT_AWARE_PROMPTS": os.environ.get('OBJECT_AWARE_PROMPTS', 'false'),
            "DEBUG_MASK_DIAGNOSTICS": os.environ.get('DEBUG_MASK_DIAGNOSTICS', 'false'),
        }
    }
'''

    if "/api/version" not in content:
        content = content.replace('(len(masks_list) > 1):', new_endpoints + '\\n(\\n            (len(masks_list) > 1):')
        with open(app_path, 'w') as f:
            f.write(content)
        print("Added runtime diagnostics endpoints to app.py")
    else:
        print("Endpoints already added")
else:
    print(f"App file not found: {app_path}")
