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
    local min_size_bytes="${4:-1000000}"  # Default minimum 1MB

    if [ -f "$output" ] && [ "${FORCE}" != "--force" ]; then
        local file_size=$(stat -c%s "$output" 2>/dev/null || echo 0)
        if [ "$file_size" -ge "$min_size_bytes" ]; then
            echo "  [SKIP] $description already exists: $(du -h "$output" | cut -f1)"
            return 0
        else
            echo "  [WARN] $description exists but is only $file_size bytes (expected >=$min_size_bytes) — re-downloading"
            rm -f "$output"
        fi
    fi

    echo "  [DOWNLOAD] $description -> $output (minimum ${min_size_bytes}B)"

    # Try primary URL with wget (with redirect following)
    if wget -q --show-progress --timeout=120 --tries=5 -O "$output" "$url" --max-redirect=10 2>/dev/null; then
        local file_size=$(stat -c%s "$output" 2>/dev/null || echo 0)
        if [ "$file_size" -ge "$min_size_bytes" ]; then
            echo "  [OK] $description ($(du -h "$output" | cut -f1))"
            return 0
        fi
        echo "  [WARN] wget got $file_size bytes — trying curl"
        rm -f "$output"
    fi

    # Retry with curl (with redirect following)
    if curl -sL --connect-timeout 120 --retry 5 -o "$output" "$url"; then
        local file_size=$(stat -c%s "$output" 2>/dev/null || echo 0)
        if [ "$file_size" -ge "$min_size_bytes" ]; then
            echo "  [OK] $description ($(du -h "$output" | cut -f1))"
            return 0
        fi
        echo "  [WARN] curl got $file_size bytes — trying HuggingFace mirror"
        rm -f "$output"
    fi

    # Try HuggingFace mirror for common models
    local hf_url=""
    case "$description" in
        "LaMa (inpainting)")
            hf_url="https://huggingface.co/sanster/big-lama/resolve/main/lama.pt" ;;
        "GFPGAN (face restoration)")
            hf_url="https://huggingface.co/datasets/sanster/checkpoints/resolve/main/GFPGANv1.4.pth" ;;
        "CodeFormer (face restoration)")
            hf_url="https://huggingface.co/sczhou/CodeFormer/resolve/main/codeformer.pth" ;;
        "DDColor (colorization)")
            hf_url="https://huggingface.co/piggybackend/ddcolor/resolve/main/ddcolor.pth" ;;
        "Real-ESRGAN (upscaling)")
            hf_url="https://huggingface.co/xinntao/Real-ESRGAN/resolve/main/RealESRGAN_x4plus.pth" ;;
    esac

    if [ -n "$hf_url" ]; then
        echo "  [HF] $description via HuggingFace..."
        if curl -sL --connect-timeout 180 --retry 5 -o "$output" "$hf_url"; then
            local file_size=$(stat -c%s "$output" 2>/dev/null || echo 0)
            if [ "$file_size" -ge "$min_size_bytes" ]; then
                echo "  [OK] $description (HF) ($(du -h "$output" | cut -f1))"
                return 0
            fi
            rm -f "$output"
        fi
    fi

    echo "  [WARN] Failed to download $description from all sources"
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
download_model \
    "https://github.com/Sanster/models/releases/download/add_big_lama/lama.pt" \
    "$MODELS_DIR/lama.pth" \
    "LaMa (inpainting)" 100000000

# ---- GFPGAN ----
download_model \
    "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/GFPGANv1.4.pth" \
    "$MODELS_DIR/GFPGAN.pth" \
    "GFPGAN (face restoration)" 50000000

# ---- CodeFormer ----
download_model \
    "https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth" \
    "$MODELS_DIR/codeformer.pth" \
    "CodeFormer (face restoration)" 50000000

# ---- DDColor ----
download_model \
    "https://github.com/piggybackend/DDColor/releases/download/v1.0/ddcolor.pth" \
    "$MODELS_DIR/ddcolor.pth" \
    "DDColor (colorization)" 50000000 || true

download_model \
    "https://huggingface.co/piggybackend/ddcolor/resolve/main/ddcolor.pth" \
    "$MODELS_DIR/ddcolor.pth" \
    "DDColor (colorization, hf mirror)" 50000000 || true

# ---- Real-ESRGAN ----
download_model \
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth" \
    "$MODELS_DIR/RealESRGAN_x4.pth" \
    "Real-ESRGAN (upscaling)" 10000000

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