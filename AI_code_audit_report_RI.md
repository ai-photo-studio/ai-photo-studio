# OPS-104 - Definitive OpenAI Dashboard & Billing Forensics

**Date:** 2026-07-22  
**Workspace:** D:\AI Product Photo Studio on WhatsApp

## VERIFIED

- The repository evidence shows the OpenAI image path is `POST https://api.openai.com/v1/images/edits`.
- The captured request body uses `model: gpt-image-2`.
- The implementation path in `apps/api/src/restoration-providers/providers/OpenAIProvider.ts` uses direct `fetch()` rather than the OpenAI SDK.
- No `openai` package match was found in `package.json` or `package-lock.json`.
- The preserved OpenAI response contains:
  - request id `req_24cf5ae53bd54e1bab7f9bab9b0bfe80`
  - `openai-processing-ms: 99266`
  - `openai-organization: user-5xx16vw3xfxihoc0fwlyqtna`
  - `openai-project: proj_oUuE5x3RFzH67SI8HUsf8WVH`
  - usage `805` input tokens, `1756` output tokens, `2561` total tokens
- The generated evidence bundle exists at `benchmark/results/2026-07-22_22-50-16/`.
- `sdk_audit.json` was generated from the preserved evidence set.
- `project_verification.json` was generated from the preserved evidence set.

## UNKNOWN

- Whether the live dashboard currently categorizes this request under `Images`.
- Whether the live dashboard currently categorizes this request under `Responses & Chat Completions`.
- Whether the dashboard spend, request, token, and Images counters changed after the request.
- Whether the dashboard selected project matches the request's project.
- Whether OpenAI Logs are accessible from this workspace.
- The live browser dashboard snapshots requested by OPS-104 were not captured from the dashboard UI in this turn.

## NOT VERIFIED

- A live dashboard screenshot before the request.
- A live dashboard screenshot immediately after the request.
- A live dashboard screenshot at 2 minutes.
- A live dashboard screenshot at 5 minutes.
- A live dashboard screenshot at 10 minutes.
- A live dashboard screenshot at 15 minutes.
- A live curl execution with a real API key in this workspace.
- A live native `fetch()` execution in this workspace turn.
- A live OpenAI Logs entry.

## Evidence Files

- [sdk_audit.json](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/sdk_audit.json)
- [raw_http_request.txt](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/raw_http_request.txt)
- [raw_http_response.txt](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/raw_http_response.txt)
- [raw_headers.txt](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/raw_headers.txt)
- [curl_request.txt](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/curl_request.txt)
- [curl_response.txt](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/curl_response.txt)
- [project_verification.json](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/project_verification.json)
- [billing_timeline.json](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/billing_timeline.json)
- [openai_logs.json](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/openai_logs.json)
- [raw_openai_response.json](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-43-56/raw_openai_response.json)

## Final Verdict

6. `UNKNOWN`
