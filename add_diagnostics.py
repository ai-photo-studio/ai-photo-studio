#!/usr/bin/env python3
"""
Add runtime diagnostics to background remover for Git SHA verification
"""
import os
import sys
import json
from datetime import datetime
from pathlib import Path

# Add runtime diagnostics to the API
diagnostics_code = '''
# Runtime Diagnostics Middleware
import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path

def get_git_info():
    """Get Git information from the running container."""
    try:
        git_dir = Path('/app').parent.parent.parent
        if git_dir.exists():
            try:
                sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=git_dir, stderr=subprocess.PIPE).decode().strip()
                short_sha = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=git_dir, stderr=subprocess.PIPE).decode().strip()
                return {'full_sha': sha, 'short_sha': short_sha}
            except:
                pass

        # Try alternative paths
        for alt_path in ['/app', '/workspace', '/source']:
            alt_dir = Path(alt_path)
            if alt_dir.exists():
                try:
                    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=alt_dir, stderr=subprocess.PIPE).decode().strip()
                    short_sha = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=alt_dir, stderr=subprocess.PIPE).decode().strip()
                    return {'full_sha': sha, 'short_sha': short_sha}
                except:
                    pass
    except Exception as e:
        pass

    return None

# Global diagnostics state
_DIAGNOSTICS = {
    'git_info': get_git_info(),
    'build_time': os.environ.get('BUILD_TIME', datetime.utcnow().isoformat()),
    'commit_time': os.environ.get('COMMIT_TIME', datetime.utcnow().isoformat()),
    'provider': os.environ.get('SEGMENTATION_ROUTING', 'unknown'),
    'sam2_model': os.environ.get('GPU_SEGMENTATION_MODEL', 'unknown'),
    'prompt_strategy': os.environ.get('PROMPT_STRATEGY', 'unknown'),
    'image': os.environ.get('IMAGE', os.environ.get('GCP_INVOCATION_ID', 'unknown')),
    'checkpoint': os.environ.get('SAM2_CHECKPOINT', 'unknown'),
    'cuda_available': str(torch.cuda.is_available() if 'torch' in sys.modules else 'False'),
}

def get_diagnostics():
    """Return current runtime diagnostics."""
    return _DIAGNOSTICS

def log_diagnostics(context):
    """Log diagnostics for debugging."""
    from app import app
    with app.app_context():
        app.logger.info(f"Runtime Diagnostics: {json.dumps(_DIAGNOSTICS, indent=2)}")
'''

# Read the existing app.py file and add diagnostics
try:
    app_path = Path(__file__).parent / "services" / "background-remover" / "app.py"
    if app_path.exists():
        with open(app_path, 'r') as f:
            content = f.read()

        # Add diagnostics import and setup
        if "get_git_info" not in content:
            # Add after imports, before FastAPI app
            import_lines = '''
import sys
from pathlib import Path
import subprocess

def get_git_info():
    """Get Git information from the running container."""
    try:
        for alt_path in ['/app', '/workspace', '/source']:
            alt_dir = Path(alt_path)
            if alt_dir.exists():
                try:
                    sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=alt_dir, stderr=subprocess.PIPE).decode().strip()
                    short_sha = subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=alt_dir, stderr=subprocess.PIPE).decode().strip()
                    return {'full_sha': sha, 'short_sha': short_sha}
                except:
                    pass
    except:
        pass
    return None

_RUNTIME_DIAGNOSTICS = {
    'git_info': get_git_info(),
    'build_time': datetime.utcnow().isoformat(),
    'provider': os.environ.get('SEGMENTATION_ROUTING', 'unknown'),
    'sam2_model': os.environ.get('GPU_SEGMENTATION_MODEL', 'unknown'),
    'prompt_strategy': os.environ.get('PROMPT_STRATEGY', 'unknown'),
}

def get_diagnostics():
    return _RUNTIME_DIAGNOSTICS
'''
            content = content.replace('from fastapi import FastAPI', f'{import_lines}\\nfrom fastapi import FastAPI')
        else:
            print("Diagnostics already added")

        # Save the modified file
        with open(app_path, 'w') as f:
            f.write(content)
        print(f"Added runtime diagnostics to {app_path}")
    else:
        print(f"App file not found: {app_path}")
except Exception as e:
    print(f"Error adding diagnostics: {e}")
    print(f"Error type: {type(e)}")
