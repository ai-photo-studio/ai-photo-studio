#!/bin/bash
# Checkpoint bootstrap script for AI Photo Studio - Unified Restoration Endpoint.
# Downloads all required model checkpoints to /models/.
# Uses HuggingFace as primary source; falls back to GitHub releases.
#
# Run this at Docker build time to bake checkpoints into the container image.
# Model downloads are best-effort — PIL fallbacks exist for missing models.
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

IFS=$'\n\t'

MODELS_DIR="${MODELS_DIR:-/models}"
FORCE="${1:-}"

mkdir -p "$MODELS_DIR"

# Helper: download with fallback chain and size validation
# All failures are non-fatal — the endpoint has PIL fallbacks for every model.
download_model() {
    local min_bytes="$1"
    local output="$2"
    local description="$3"
    shift 3

    if [ -f "$output" ] && [ "${FORCE}" != "--force" ]; then
        local file_size=$(stat -c%s "$output" 2>/dev/null || echo 0)
        if [ "$file_size" -ge "$min_bytes" ]; then
            echo "  [SKIP] $description exists: $(du -h "$output" | cut -f1)"
            return 0
        fi
        echo "  [WARN] $description exists but too small ($file_size bytes) — re-downloading"
        rm -f "$output"
    fi

    echo "  [DOWNLOAD] $description (min ${min_bytes}B) -> $output"

    for url in "$@"; do
        echo "    Trying: $url"
        if curl -sL --connect-timeout 120 --max-time 600 --retry 3 -o "$output" "$url"; then
            local file_size=$(stat -c%s "$output" 2>/dev/null || echo 0)
            if [ "$file_size" -ge "$min_bytes" ]; then
                echo "  [OK] $description ($(du -h "$output" | cut -f1))"
                return 0
            fi
            echo "    Got only $file_size bytes (needed $min_bytes) — trying next mirror"
            rm -f "$output"
        else
            echo "    Failed — trying next mirror"
        fi
    done

    echo "  [WARN] All sources failed for $description"
    echo "  [WARN] Endpoint will use PIL fallback"
    return 0  # Non-fatal
}

echo ""
echo "================================================"
echo " AI Photo Studio — Model Checkpoint Bootstrap"
echo "================================================"
echo ""
echo "Models directory: $MODELS_DIR"
echo ""

# ---- LaMa (Big LaMa) ----
download_model 100000000 \
    "$MODELS_DIR/lama.pth" \
    "LaMa (inpainting)" \
    "https://huggingface.co/sanster/big-lama/resolve/main/big-lama.pt" \
    "https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt"

# ---- GFPGAN ----
download_model 100000000 \
    "$MODELS_DIR/GFPGAN.pth" \
    "GFPGAN (face restoration)" \
    "https://huggingface.co/TencentARC/GFPGAN/resolve/main/GFPGANv1.4.pth" \
    "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/GFPGANv1.4.pth"

# ---- CodeFormer ----
download_model 100000000 \
    "$MODELS_DIR/codeformer.pth" \
    "CodeFormer (face restoration)" \
    "https://huggingface.co/sczhou/CodeFormer/resolve/main/codeformer.pth" \
    "https://github.com/sczhou/CodeFormer/releases/download/v0.1.0/codeformer.pth"

# ---- DDColor ----
download_model 50000000 \
    "$MODELS_DIR/ddcolor.pth" \
    "DDColor (colorization)" \
    "https://huggingface.co/piddnad/DDColor/resolve/main/ddcolor_checkpoints/iter_19000.pth" \
    "https://huggingface.co/cditzel/ddcolor/resolve/main/ddcolor.pth" \
    "https://github.com/piggybackend/DDColor/releases/download/v1.0/ddcolor.pth"

# ---- Real-ESRGAN ----
download_model 10000000 \
    "$MODELS_DIR/RealESRGAN_x4.pth" \
    "Real-ESRGAN (upscaling)" \
    "https://huggingface.co/xinntao/Real-ESRGAN/resolve/main/RealESRGAN_x4plus.pth" \
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth"

echo ""
echo "================================================"
echo " Bootstrap Complete"
echo "================================================"
echo ""
echo "Contents of $MODELS_DIR:"
ls -lh "$MODELS_DIR/" 2>/dev/null || echo "(empty)"
echo ""

# Count successfully downloaded checkpoints
COUNT=0
for f in "$MODELS_DIR"/lama.pth "$MODELS_DIR"/GFPGAN.pth "$MODELS_DIR"/codeformer.pth "$MODELS_DIR"/ddcolor.pth "$MODELS_DIR"/RealESRGAN_x4.pth; do
    if [ -f "$f" ]; then
        size=$(stat -c%s "$f" 2>/dev/null || echo 0)
        if [ "$size" -ge 1000000 ]; then
            COUNT=$((COUNT + 1))
        fi
    fi
done

echo "Valid models available: $COUNT/5"
if [ "$COUNT" -ge 5 ]; then
    echo "Status: ALL CHECKPOINTS READY ✅"
elif [ "$COUNT" -ge 3 ]; then
    echo "Status: $COUNT/5 checkpoints ready — partial ML acceleration ⚠️"
else
    echo "Status: $COUNT/5 checkpoints ready — PIL fallbacks dominant ⚠️"
fi
echo ""
