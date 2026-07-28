#!/bin/bash
# RunPod Endpoint Validation Script
# Executes a production-sized restoration request and measures performance.
#
# Usage: RUNPOD_API_KEY=xxx bash validate_endpoint.sh

set -euo pipefail

ENDPOINT_ID="${1:-3z633s11yn4n8q}"
RUNPOD_API_KEY="${RUNPOD_API_KEY:?RUNPOD_API_KEY is required}"

echo "================================================"
echo " RunPod Unified Restoration Endpoint Validation"
echo "================================================"
echo "Endpoint: $ENDPOINT_ID"
echo ""

# 1. Check endpoint health/status
echo "--- Step 1: Endpoint Status ---"
curl -s -H "Authorization: Bearer $RUNPOD_API_KEY" \
  "https://rest.runpod.io/v1/endpoints/$ENDPOINT_ID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  Name: {d[\"name\"]}')
print(f'  Status: {d.get(\"runtime\",{}).get(\"status\",\"unknown\")}')
print(f'  Workers: {d[\"workersMin\"]}/{d[\"workersMax\"]}')
print(f'  GPU: {d[\"gpuTypeIds\"]}')
"

# 2. Create a production test image (640x480 color JPEG ~100KB)
echo "--- Step 2: Prepare Test Image ---"
python3 -c "
from PIL import Image
import io

# Create a realistic old photo with damage simulation
img = Image.new('RGB', (640, 480), color=(180, 160, 140))
# Add some noise/damage
import numpy as np
arr = np.array(img)
noise = np.random.randint(0, 30, arr.shape, dtype=np.uint8)
arr = np.clip(arr.astype(np.int16) + noise.astype(np.int16), 0, 255).astype(np.uint8)
# Add some scratch-like lines
for _ in range(5):
    y = np.random.randint(0, 480)
    x = np.random.randint(0, 100)
    arr[y, x:x+random.randint(10, 50)] = [255, 255, 255]
img = Image.fromarray(arr)
buf = io.BytesIO()
img.save(buf, format='JPEG', quality=85)
with open('/tmp/test_photo.jpg', 'wb') as f:
    f.write(buf.getvalue())
print(f'  Test image: /tmp/test_photo.jpg ({len(buf.getvalue())} bytes, {img.size})')
"

# 3. Send cold-start request to RunPod
echo "--- Step 3: Cold Start Request ---"
START_TIME=$(date +%s.%N)
RESPONSE=$(curl -s -X POST "https://api.runpod.ai/v2/$ENDPOINT_ID/runsync" \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"input\": {
      \"action\": \"restore\",
      \"image\": \"data:image/jpeg;base64,$(base64 -w0 /tmp/test_photo.jpg)\",
      \"file_name\": \"validation-photo.jpg\"
    }
  }")
COLD_ELAPSED=$(python3 -c "print(f'{$(date +%s.%N) - $START_TIME:.2f}')")
echo "  Cold start latency: ${COLD_ELAPSED}s"
echo ""

# 4. Parse response
echo "--- Step 4: Response Analysis ---"
echo "$RESPONSE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  Status: {d.get(\"status\",\"ERROR\")}')
if d.get('status') == 'COMPLETED':
    print(f'  Stages: {d.get(\"processing_stages\",[])}')
    print(f'  Credits: {d.get(\"credits_used\")}')
    print(f'  Latency: {d.get(\"latency_seconds\",\"?\")}s')
    print(f'  Output: {len(d.get(\"image\",\"\"))} base64 chars -> ~{len(d.get(\"image\",\"\"))*3//4} bytes')
else:
    print(f'  Error: {d.get(\"error\",\"Unknown\")}')
    print(f'  Full: {json.dumps(d, indent=2)[:500]}')
"

# 5. Send warm-start request (if cold succeeded)
if echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('status')=='COMPLETED' else 1)" 2>/dev/null; then
  echo "--- Step 5: Warm Start Request ---"
  START_TIME=$(date +%s.%N)
  RESPONSE=$(curl -s -X POST "https://api.runpod.ai/v2/$ENDPOINT_ID/runsync" \
    -H "Authorization: Bearer $RUNPOD_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"input\": {
        \"action\": \"restore\",
        \"image\": \"data:image/jpeg;base64,$(base64 -w0 /tmp/test_photo.jpg)\",
        \"file_name\": \"validation-photo-2.jpg\"
      }
    }")
  WARM_ELAPSED=$(python3 -c "print(f'{$(date +%s.%N) - $START_TIME:.2f}')")
  echo "  Warm start latency: ${WARM_ELAPSED}s"
  
  echo "$RESPONSE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d.get('status') == 'COMPLETED':
    print(f'  Status: SUCCESS')
    print(f'  Stages: {d.get(\"processing_stages\",[])}')
    print(f'  Latency: {d.get(\"latency_seconds\",\"?\")}s')
else:
    print(f'  Error: {d.get(\"error\",\"Unknown\")}')
"
fi

# 6. Send health check request
echo "--- Step 6: Health Check ---"
curl -s -X POST "https://api.runpod.ai/v2/$ENDPOINT_ID/runsync" \
  -H "Authorization: Bearer $RUNPOD_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": {"action": "health"}}' | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  Status: {d.get(\"status\",\"ERROR\")}')
if d.get('output'):
    out = d['output']
    print(f'  Device: {out.get(\"device\",\"?\")}')
    print(f'  GPU: {out.get(\"gpu_name\",\"?\")}')
    print(f'  VRAM: {out.get(\"vram_total_gb\",\"?\")} GB')
    print(f'  Models: {out.get(\"models_loaded\",{})}')
"

echo ""
echo "================================================"
echo " Validation Complete"
echo "================================================"