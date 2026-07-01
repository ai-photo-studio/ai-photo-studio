# Modal Deployment Guide

## Setup

1. Install Modal CLI:
```bash
pip install modal
modal setup
```

2. Create Modal account at https://modal.com

3. Configure environment:
```bash
export MODAL_ENABLED=1
export MODAL_API_KEY=<your-key>
export MODAL_ENDPOINT=https://api.modal.com
```

## Deploy

```bash
cd services/modal-background-remover
modal deploy
```

## Usage

### Local
```bash
modal run app.py --image input.png --max_dimension 2000
```

### Web Endpoint
```
GET https://<endpoint>.modal.run/background-remover/web-remove-background?image=<base64>&max_dimension=2000
```

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| MODAL_ENABLED | 0 | Enable Modal provider |
| MODAL_ENDPOINT | api.modal.com | Modal API endpoint |
| MODAL_API_KEY | - | API key |
| MODAL_TIMEOUT | 300 | Timeout in seconds |

## Models Supported
- BiRefNet (primary)
- u2net (fallback)