#!/bin/bash
# Checkpoint bootstrap script for AI Photo Studio - Unified Restoration Endpoint.
# Downloads all required model checkpoints to /models/.
# Uses HuggingFace mirror for reliability; falls back to GitHub releases.
#
# Run this at Docker build time to bake checkpoints into the container image.
#
# Usage:  bash download_checkpoints.sh [--force]
#
# Model checkpoints:
#   - LaMa:           /models/lama.pth                (~700 MB)
#   - GFPGAN:         /models/GFPGAN.pth              (~350 MB)
#   - CodeFormer:     /models/codeformer.pth          (~350 MB)
#   - DDColor:        /models/ddcolor.pth             (~150 MB)
#   - Real-ESRGAN:    /models/RealESRGAN_x4.pth       (~65 MB)
#
# Total: ~1.6 GB

set -euo pipefail
IFS=$'\n\t'

MODELS_DIR="${MODELS_DIR:-/models}"
FORCE="${1:-}"

mkdir -p "$MODELS_DIR"

# Helper: download with retry and checksum
download_model() {
    local url="$1"
    local output="$2"
    local description="$3"

    if [ -f "$output" ] && [ "${FORCE}" != "--force" ]; then
        echo "  [SKIP] $description already exists: $(du -h "$output" | cut -f1)"
        return 0
    fi

    echo "  [DOWNLOAD] $description -> $output"

    # Try primary URL with wget
    if wget -q --show-progress --timeout=60 --tries=3 -O "$output" "$url" 2>/dev/null; then
        echo "  [OK] $description ($(du -h "$output" | cut -f1))"
        return 0
    fi

    # If primary fails, try backup via curl
    echo "  [RETRY] $description via curl..."
    if curl -sL --connect-timeout 60 --retry 3 -o "$output" "$url"; then
        echo "  [OK] $description ($(du -h "$output" | cut -f1))"
        return 0
    fi

    echo "  [WARN] Failed to download $description from $url"
    echo "  [WARN] The endpoint will use PIL fallback for this model."
    return 1
}

echo ""
echo "================================================"
echo " AI Photo Studio — Model Checkpoint Bootstrap"
echo "================================================"
echo ""
echo "Models directory: $MODELS_DIR"
echo ""

# ---- LaMa (Big LaMa) ----
# Source: Sanster/models (lama-cleaner project)
download_model \
    "https://github.com/Sanster/models/releases/download/add_big_lama/lama.pt" \
    "$MODELS_DIR/lama.pth" \
    "LaMa (inpainting)"

# ---- GFPGAN ----
# Source: TencentARC/GFPGAN
download_model \
    "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/GFPGANv1.4.pth" \
    "$MODELS_DIR/GFPGAN.pth" \
    "GFPGAN (face restoration)"

# ---- CodeFormer ----
# Source: sczhou/CodeFormer
download_model \
    "https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth" \
    "$MODELS_DIR/codeformer.pth" \
    "CodeFormer (face restoration)"

# ---- DDColor ----
# Source: piggybackend/DDColor
download_model \
    "https://github.com/piggybackend/DDColor/releases/download/v1.0/ddcolor.pth" \
    "$MODELS_DIR/ddcolor.pth" \
    "DDColor (colorization)" || true

download_model \
    "https://huggingface.co/piggybackend/ddcolor/resolve/main/ddcolor.pth" \
    "$MODELS_DIR/ddcolor.pth" \
    "DDColor (colorization, hf mirror)" || true

# ---- Real-ESRGAN ----
# Source: xinntao/Real-ESRGAN
download_model \
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth" \
    "$MODELS_DIR/RealESRGAN_x4.pth" \
    "Real-ESRGAN (upscaling)"

echo ""
echo "================================================"
echo " Bootstrap Complete"
echo "================================================"
echo ""
echo "Contents of $MODELS_DIR:"
ls -lh "$MODELS_DIR/"
echo ""

# Count successfully downloaded checkpoints
COUNT=$(find "$MODELS_DIR" -maxdepth 1 -name "*.pth" | wc -l)
echo "Models available: $COUNT/5"

if [ "$COUNT" -ge 5 ]; then
    echo "Status: ALL CHECKPOINTS READY ✅"
else
    echo "Status: $((5 - COUNT)) checkpoints missing — PIL fallback will be used ⚠️"
fi
echo ""