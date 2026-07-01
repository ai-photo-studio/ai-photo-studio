# Local Runtime Setup Guide

## Windows Setup

### Python
1. Install Python 3.10+ from python.org
2. Add Python to PATH during installation
3. Verify: `python --version`

### Git Bash
1. Install Git for Windows
2. Run: `git config --global core.autocrlf false`
3. Verify: `bash --version`

### Node.js
1. Install from nodejs.org (LTS version)
2. Verify: `node --version` and `npm --version`

### Wrangler CLI
```bash
npm install -g wrangler
wrangler --version
```

## Git Bash Setup

```bash
# Clone repository
git clone https://github.com/gardenshop/ai-photo-studio-whatsapp.git
cd ai-photo-studio-whatsapp

# Install API dependencies
cd apps/api
pip install -r requirements.txt

# Install Web dependencies
cd ../web
npm install
```

## WSL Setup (Ubuntu)

```bash
# Install Python and pip
sudo apt update
sudo apt install python3 python3-pip python3-venv -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python packages
pip install -r services/*/requirements.txt
```

## Colab Setup

### Runtime Configuration
1. Open `notebooks/model-validation.ipynb` in Colab
2. Runtime → Change runtime type → GPU
3. Run all cells

### Required Packages
```python
!pip install rembg ultralytics open_clip_torch realesrgan pynvml
```

### Validation Script
```python
# Run validation
!python scripts/validate-ai.py
```

## Validation Workflow

1. Run diagnostics: `.\scripts\runtime-diagnostics.ps1` (Windows)
2. Activate environment: `source venv/bin/activate` (Linux/WSL)
3. Install requirements: `pip install -r requirements-validation.txt`
4. Run validation: `python scripts/validate-ai.py`
5. Check results: `validation-output.json`

## Troubleshooting

### Windows Store Python Stubs
- Uninstall Python from Microsoft Store
- Install Python from python.org
- Run: `pip uninstall python-dateutil` if conflicts occur

### WSL Path Issues
- Use: `/mnt/c/Users/.../AppData/Local/Programs/Python/`
- Avoid: Windows paths in virtual environments

### CUDA Errors
- Install CUDA toolkit from NVIDIA
- Or use CPU-only installation:
  ```bash
  pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
  ```

## Environment Variables

Create `.env` file:
```
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
BACKGROUND_API_URL=http://localhost:8000
YOLO_DETECTOR_URL=http://localhost:8002
PRODUCT_CLASSIFIER_URL=http://localhost:8001
REAL_ESRGAN_URL=http://localhost:8003
IC_LIGHT_LAB_URL=http://localhost:8004
ADMIN_JWT_SECRET=your-secret
JWT_SECRET=your-secret
```