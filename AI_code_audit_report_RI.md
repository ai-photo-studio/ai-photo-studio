# OPS-106 - End-to-End Runtime Verification

**Date:** 2026-07-23  
**Session:** 2026-07-23_07-27-11  
**Model:** gpt-image-2  

## EXECUTIVE SUMMARY

Live `POST /v1/images/edits` captured. Request and response fully instrumented. Usage returned by API: **805 input tokens, 1756 output tokens, 2561 total tokens**. Local restoration pipeline (LaMa → GFPGAN → Real-ESRGAN) executed successfully. Dashboard delta requires manual capture.

## VERIFIED

- Complete outbound HTTP captured: `POST https://api.openai.com/v1/images/edits`
  - Method: POST
  - Headers: Authorization redacted, Content-Type multipart/form-data
  - Model: gpt-image-2
  - Prompt: "Restore this damaged photograph. Remove scratches, reduce noise, enhance contrast and sharpness, and improve overall quality while preserving the original character of the image."
  - Size: 1024x1024, Quality: auto, Output: png, n: 1
  - Uploaded image: 2026-07-22_19-35-52_original.png (38247 bytes)
  - Uploaded image SHA256: 3f6b0d3fd482e1f537c4120723c10999c9e1d3fbac7476c432d1085fd0900454
- Complete inbound HTTP captured:
  - Status: 200 OK
  - Request ID: req_6986761c82474b5fabfb3e4af6aa5d03
  - OpenAI Processing: 55651ms
  - Organization: user-5xx16vw3xfxihoc0fwlyqtna
  - Project: proj_oUuE5x3RFzH67SI8HUsf8WVH
  - OpenAI Version: 2020-10-01
  - CF-Ray: a1f8f633cef5c611-MRS
- Returned usage preserved:
  - input_tokens: 805
  - output_tokens: 1756
  - total_tokens: 2561
- Cost calculated from actual usage: **$0.00006** ($0.000006 input + $0.000053 output at gpt-image-2 rates)
- Returned image: 1694380 bytes, SHA256 d393f8d57e0688a9b97049db787e68299daf5279390ae2f80a71623f4fa6e29f
- Local restoration pipeline executed successfully (LaMa → GFPGAN → Real-ESRGAN)
  - Stages: damage_detection, lama_inpaint, face_restoration_gfpgan, real_esrgan_upscale
  - Credits used: 1.6
  - Output: 374308 bytes JPEG
- All code instrumentation committed and typechecks pass
- Runtime capture module created at `apps/api/src/utils/runtime-capture.ts`
- Verification script created at `benchmark/runtime/ops106-verify.ts`

## UNKNOWN

- OpenAI Dashboard spend delta before/after the request (requires manual capture at https://platform.openai.com/usage)
- OpenAI Dashboard token delta before/after the request
- OpenAI Dashboard request count delta before/after the request
- OpenAI Dashboard Images count delta before/after the request
- Whether the request is classified under Images or Responses & Chat Completions in the dashboard
- Whether dashboard spend matches the API-returned token usage

## NOT VERIFIED

- Live dashboard screenshot before the request (timestamp: 2026-07-23T07:27:10Z)
- Live dashboard screenshot after the request (timestamp: 2026-07-23T07:28:15Z)
- Replicate `flux-kontext-apps/restore-image` live call (REPLICATE_API_TOKEN not available)
- NAFNet live call (not available locally; requires model checkpoint)
- DDColor live call (not available locally; requires model checkpoint)
- Numerical reconciliation of API usage vs dashboard spend

## Evidence Files

All artifacts in `benchmark/runtime/2026-07-23_07-27-11/`:

- [request.json](benchmark/runtime/2026-07-23_07-27-11/request.json) - Full outbound request metadata
- [response.json](benchmark/runtime/2026-07-23_07-27-11/response.json) - Full inbound response metadata
- [headers.json](benchmark/runtime/2026-07-23_07-27-11/headers.json) - Response headers
- [usage.json](benchmark/runtime/2026-07-23_07-27-11/usage.json) - Token usage object
- [image_sha256.txt](benchmark/runtime/2026-07-23_07-27-11/image_sha256.txt) - Input image hash
- [returned_image.png](benchmark/runtime/2026-07-23_07-27-11/returned_image.png) - OpenAI restored image (1694380 bytes)
- [local_restored.jpg](benchmark/runtime/2026-07-23_07-27-11/local_restored.jpg) - Local pipeline restored image (374308 bytes)
- [manifest.json](benchmark/runtime/2026-07-23_07-27-11/manifest.json) - Session manifest
- [verification_report.json](benchmark/runtime/2026-07-23_07-27-11/verification_report.json) - Full verification result

## Numeric Reconciliation (API vs Dashboard)

| Metric | API Returned | Dashboard Delta | Status |
|--------|-------------|-----------------|--------|
| input_tokens | 805 | ? | PENDING MANUAL |
| output_tokens | 1756 | ? | PENDING MANUAL |
| total_tokens | 2561 | ? | PENDING MANUAL |
| Cost | $0.00006 | ? | PENDING MANUAL |
| Request count | 1 | ? | PENDING MANUAL |
| Images count | 1 | ? | PENDING MANUAL |

**Manual capture instructions:**
1. Before making another request, go to https://platform.openai.com/usage
2. Select project `proj_oUuE5x3RFzH67SI8HUsf8WVH` 
3. Note: Spend, Requests, Tokens, Images counts
4. Run another verification request
5. Note the deltas
6. Compare against API-returned usage above

## Final Verdict

7. `VERIFIED` (API-level) — Complete outbound HTTP captured, complete inbound HTTP captured, returned usage preserved
8. `PENDING` (Dashboard-level) — Dashboard deltas require manual capture from OpenAI platform
9. `VERIFIED` (Local pipeline) — LaMa, GFPGAN, Real-ESRGAN ran successfully
