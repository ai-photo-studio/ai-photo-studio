# OPS-106 - Runtime Verification Plan & Results

## PLAN

### Part 1-2: Instrument OpenAI Request
- Wrap `OpenAIProvider.editImage()` with `RuntimeCaptureSession` hooks
- Capture before: method, URL, headers, multipart, filename, size, SHA256, model, prompt
- Capture after: status, headers, request ID, processing time, usage, response size, returned image

### Part 3: Save Artifacts
- Format: `benchmark/runtime/YYYY-MM-DD_HH-MM-SS/`
- Files: request.json, response.json, headers.json, usage.json, timing.json, image_sha256.txt, returned_image.png

### Part 4: Dashboard Comparison
- Manual capture from https://platform.openai.com/usage
- Compare API usage vs dashboard deltas
- Record spend, token, request, images deltas

### Part 5: Local Restoration Pipeline
- Retain: `flux-kontext-apps/restore-image` (Replicate)
- Run locally: LaMa, GFPGAN, Real-ESRGAN, DDColor, NAFNet
- Generate final restored image

## RESULTS — 2026-07-23_07-27-11

| Check | Status | Detail |
|-------|--------|--------|
| Complete outbound HTTP captured | ✓ | POST /v1/images/edits, model=gpt-image-2, 38247 bytes |
| Complete inbound HTTP captured | ✓ | 200 OK, req_6986761c82474b5fabfb3e4af6aa5d03 |
| Returned usage preserved | ✓ | 805 in, 1756 out, 2561 total tokens |
| Dashboard deltas measured | ✗ | PENDING MANUAL CAPTURE |
| Final restored image generated | ✓ | 374308 bytes JPEG via LaMa→GFPGAN→Real-ESRGAN |
| Numeric reconciliation completed | ✗ | Dashboard delta not available |

### Token Usage (API)
- input_tokens: 805
- output_tokens: 1756
- total_tokens: 2561
- Cost (calculated at $8/1M in, $30/1M out): $0.00006

### OpenAI Response Headers
- x-request-id: req_6986761c82474b5fabfb3e4af6aa5d03
- openai-processing-ms: 55651
- openai-organization: user-5xx16vw3xfxihoc0fwlyqtna
- openai-project: proj_oUuE5x3RFzH67SI8HUsf8WVH

### Local Restoration Pipeline
- Stages: damage_detection → lama_inpaint → face_restoration_gfpgan → real_esrgan_upscale
- Credits: 1.6
- Output: local_restored.jpg (374308 bytes)

### Outstanding
- Replicate `flux-kontext-apps/restore-image`: NOT VERIFIED (no REPLICATE_API_TOKEN)
- DDColor: NOT VERIFIED (no model checkpoint available locally)
- NAFNet: NOT VERIFIED (no model checkpoint available locally)
- Dashboard deltas: PENDING MANUAL CAPTURE

## Evidence

`benchmark/runtime/2026-07-23_07-27-11/`:
- request.json, response.json, headers.json, usage.json
- image_sha256.txt, returned_image.png, local_restored.jpg
- manifest.json, verification_report.json
