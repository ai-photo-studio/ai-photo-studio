# OPS-108 — OpenAI Support Evidence Package

## Goal

Prepare a complete evidence package for OpenAI Support regarding the billing reconciliation discrepancy discovered in OPS-107. No production code changes. No pipeline changes. Collect only verified evidence.

## Constraints

- Do NOT modify finalized providers (`OpenAIProvider.ts`, `BaseReplicateProvider.ts`, etc.)
- Do NOT change billing logic
- Do NOT alter production routing
- Only create documentation and evidence artifacts
- Both `AI_code_audit_report_RI.md` and `apipln.md` must remain in `.gitignore`

## Available Evidence

Three live API calls have already been captured:

### Call 1 — OPS-106 (2026-07-23_07-27-11)
- Timestamp: 2026-07-23T07:27:11Z
- Request ID: req_6986761c82474b5fabfb3e4af6aa5d03
- Quality: auto (resolved to medium)
- Usage: input=805, output=1756, total=2561
- Processing: 55651ms (server), 58338ms (total)
- Response headers captured: x-request-id, openai-processing-ms, openai-organization, openai-project, openai-version, cf-ray
- Artifacts: benchmark/runtime/2026-07-23_07-27-11/

### Call 2 — OPS-107 raw capture (2026-07-23_07-48-32)
- Timestamp: 2026-07-23T07:48:32Z
- Request ID: req_c0ee1833550442e9a87c88a53c206eef
- Quality: auto (resolved to high)
- Usage: input=805 (768 image + 37 text), output=7024 (7024 image + 0 text), total=7829
- Processing: 167866ms
- Full raw response captured including input_tokens_details and output_tokens_details
- Artifacts: benchmark/runtime/2026-07-23_07-48-32/

### Call 3 — OPS-107 raw capture (2026-07-23_07-49-46)
- Timestamp: 2026-07-23T07:49:46Z
- Request ID: req_c7527a1b4b394815bb7103c644b4163c
- Quality: auto (resolved to medium)
- Usage: input=805 (768 image + 37 text), output=1756 (1756 image + 0 text), total=2561
- Processing: 47248ms
- Full raw response captured including input_tokens_details and output_tokens_details
- Artifacts: benchmark/runtime/2026-07-23_07-49-46/

### Dashboard observations (from OPS-106 session)
- Spend delta: +$0.06
- Token delta: +805
- Images count: 0
- Request count: +1

## Plan

### Step 1: Collect Evidence (read-only)

Gather from existing captured artifacts:

- **All request IDs:**
  - req_6986761c82474b5fabfb3e4af6aa5d03
  - req_c0ee1833550442e9a87c88a53c206eef
  - req_c7527a1b4b394815bb7103c644b4163c

- **Project ID:** proj_oUuE5x3RFzH67SI8HUsf8WVH

- **Organization ID:** user-5xx16vw3xfxihoc0fwlyqtna

- **API endpoint:** POST https://api.openai.com/v1/images/edits

- **Model:** gpt-image-2

- **Prompt:** "Restore this damaged photograph. Remove scratches, reduce noise, enhance contrast and sharpness, and improve overall quality while preserving the original character of the image."

- **Quality:** auto (resolves to medium or high dynamically)

- **Size:** 1024x1024

- **Returned usage (all three calls):**
  | Call | input_tokens | input image_tokens | input text_tokens | output_tokens | output image_tokens | output text_tokens | total_tokens |
  |------|-------------|-------------------|-------------------|--------------|---------------------|-------------------|-------------|
  | 1 | 805 | (not captured) | (not captured) | 1756 | (not captured) | (not captured) | 2561 |
  | 2 | 805 | 768 | 37 | 7024 | 7024 | 0 | 7829 |
  | 3 | 805 | 768 | 37 | 1756 | 1756 | 0 | 2561 |

- **Response headers (all three calls):**
  - x-request-id, openai-processing-ms, openai-organization, openai-project, openai-version, cf-ray, content-type, server, date

### Step 2: Create Comparison Table

| Metric | API Response (Call 2) | Dashboard | Difference | Notes |
|--------|----------------------|-----------|------------|-------|
| Request count | 1 | +1 | 0 | Match |
| Token count | 7829 (total) | +805 | 7024 | Dashboard shows input_tokens only |
| Spend | $0.000217 (calculated) | +$0.06 | $0.059783 | 276x discrepancy |
| Images count | 1 (returned) | 0 | 1 | Dashboard shows 0 images |

**Measured differences (no speculation):**
1. Dashboard token delta (805) matches API `input_tokens` (805), not `total_tokens` (7829)
2. Dashboard spend delta ($0.06) is 276x the calculated API cost ($0.000217)
3. Dashboard images count (0) does not match API returned image count (1)

### Step 3: Create Timeline

| Timestamp | Request ID | Input Tokens | Output Tokens | Total Tokens | Quality | Dashboard Spend Delta | Dashboard Token Delta |
|-----------|-----------|-------------|---------------|-------------|---------|----------------------|----------------------|
| 2026-07-23T07:27:11Z | req_6986761c82474b5fabfb3e4af6aa5d03 | 805 | 1756 | 2561 | medium | +$0.06 | +805 |
| 2026-07-23T07:48:32Z | req_c0ee1833550442e9a87c88a53c206eef | 805 | 7024 | 7829 | high | (not measured) | (not measured) |
| 2026-07-23T07:49:46Z | req_c7527a1b4b394815bb7103c644b4163c | 805 | 1756 | 2561 | medium | (not measured) | (not measured) |

**Note:** Dashboard deltas were only measured for Call 1. Calls 2 and 3 were raw captures without dashboard measurement.

### Step 4: Draft OpenAI Support Email

Subject: Billing Reconciliation Inquiry — gpt-image-2 Images API (Project: proj_oUuE5x3RFzH67SI8HUsf8WVH)

Body:
- Professional, non-accusatory tone
- Include all 3 request IDs
- Include project and org IDs
- Include the comparison table
- Request clarification on:
  1. Images counter remaining zero despite returning 1 image
  2. Dashboard showing only input-token delta (805) vs total tokens (7829)
  3. Spend ($0.06) differing from published calculator ($0.000217)
  4. Whether image edits are categorized separately from image generations

### Step 5: Update Documentation

- Overwrite `AI_code_audit_report_RI.md` with OPS-108 evidence package
- Overwrite `apipln.md` with OPS-108 plan and results
- Both remain in `.gitignore` (verified: they do not appear in `git status`)

### Step 6: Build & Commit

- Run `npm run typecheck` (no code changes, should pass)
- Run `npm run build` (no code changes, should pass)
- Check for test script (none exists in package.json)
- `git status`, `git add .`, `git commit -m "OPS-108 support evidence package"`, `git push origin main`

## Risks

- No test script exists in `apps/api/package.json` — skip test step
- `AI_code_audit_report_RI.md` and `apipln.md` are gitignored — they will NOT be committed, only the evidence package artifacts in `benchmark/runtime/` will be committed
- The dashboard deltas were only measured for one call — this is an evidence gap, will be marked UNKNOWN

## Validation

- [ ] All 3 request IDs collected
- [ ] Project ID and Organization ID collected
- [ ] Comparison table created with measured differences only
- [ ] Timeline created with all 3 calls
- [ ] Support email drafted (professional, no accusations)
- [ ] Documentation files updated
- [ ] Typecheck passes
- [ ] Build passes
- [ ] Git commit and push successful
