# OPS-104 - OpenAI Billing Forensics Plan

## VERIFIED

- The request path used by the repository evidence is `POST /v1/images/edits`.
- The model is `gpt-image-2`.
- The request is generated through direct `fetch()` in `apps/api/src/restoration-providers/providers/OpenAIProvider.ts`.
- No `openai` dependency was found in the package manifest or lockfile searches.
- The preserved response includes a concrete request id, processing time, project id, organization id, and usage object.
- The evidence bundle exists at `benchmark/results/2026-07-22_22-50-16/`.

## UNKNOWN

- Live dashboard classification of the request.
- Whether the request counted under `Images` or `Responses & Chat Completions`.
- Before and after dashboard deltas for spend, requests, tokens, and Images.
- Whether the dashboard-selected project matches the API project.
- Whether OpenAI Logs can be accessed from this workspace.

## NOT VERIFIED

- The live dashboard snapshots requested by OPS-104.
- A live native `fetch()` execution during this workspace turn.
- A live `curl` execution during this workspace turn.
- A live browser screenshot sequence at 0, 2, 5, 10, and 15 minutes.

## Supporting Artifacts

- [sdk_audit.json](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/sdk_audit.json)
- [raw_http_request.txt](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/raw_http_request.txt)
- [raw_http_response.txt](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/raw_http_response.txt)
- [curl_request.txt](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/curl_request.txt)
- [curl_response.txt](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/curl_response.txt)
- [project_verification.json](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/project_verification.json)
- [billing_timeline.json](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/billing_timeline.json)
- [openai_logs.json](/D:/AI%20Product%20Photo%20Studio%20on%20WhatsApp/benchmark/results/2026-07-22_22-50-16/openai_logs.json)

## Final Verdict

6. `UNKNOWN`
