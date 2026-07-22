# OPS-102 - Billing Reconciliation Plan

## VERIFIED

- One OpenAI Images API request was captured for `old images/2.jpeg`.
- Endpoint: `POST /v1/images/edits`
- Model: `gpt-image-2`
- Request ID: `req_24cf5ae53bd54e1bab7f9bab9b0bfe80`
- API usage object present with `805` input tokens, `1756` output tokens, `2561` total tokens.
- Calculated cost from usage: `0.00005912`
- Responses API repo scan returned no matches.

## UNKNOWN

- Dashboard before snapshot.
- Dashboard after 2 minutes snapshot.
- Dashboard after 10 minutes snapshot.
- Dashboard Images-vs-Completions classification.

## NOT VERIFIED

- A live dashboard reconciliation cannot be proven from the current workspace because the dashboard snapshots were not captured from the browser/dashboard itself.
- `raw_flux_response.json` is a placeholder `UNKNOWN` artifact, not a live Flux HTTP capture.

## Artifact Set

- `benchmark/results/2026-07-22_22-35-45/01_original.png`
- `benchmark/results/2026-07-22_22-35-45/02_openai.png`
- `benchmark/results/2026-07-22_22-35-45/03_flux.png`
- `benchmark/results/2026-07-22_22-35-45/04_lama.png`
- `benchmark/results/2026-07-22_22-35-45/05_gfpgan.png`
- `benchmark/results/2026-07-22_22-35-45/06_realesrgan.png`
- `benchmark/results/2026-07-22_22-35-45/07_ddcolor.png`
- `benchmark/results/2026-07-22_22-35-45/08_final.png`
- `benchmark/results/2026-07-22_22-35-45/09_side_by_side.png`
- `benchmark/results/2026-07-22_22-35-45/10_metrics.json`
- `benchmark/results/2026-07-22_22-35-45/11_cost.json`
- `benchmark/results/2026-07-22_22-35-45/12_manifest.json`
- `benchmark/results/2026-07-22_22-35-45/13_pipeline_manifest.json`
- `benchmark/results/2026-07-22_22-35-45/14_billing_reconciliation.json`
- `benchmark/results/2026-07-22_22-35-45/15_request.log`
- `benchmark/results/2026-07-22_22-35-45/raw_openai_response.json`
- `benchmark/results/2026-07-22_22-35-45/raw_flux_response.json`
- `benchmark/results/2026-07-22_22-35-45/responses_api_scan.json`

## Final Answers

1. YES
2. `POST https://api.openai.com/v1/images/edits`
3. `gpt-image-2`
4. `req_24cf5ae53bd54e1bab7f9bab9b0bfe80`
5. UNKNOWN
6. VERIFIED
7. NO
