# OpenAI Image API Audit

**Date:** 2026-07-22
**Model:** Poolside Laguna X 2.1
**Scope:** OPS-96 — Production Pipeline Modernization

---

## 1. Current Implementation

### File: `apps/api/src/restoration-providers/providers/OpenAIProvider.ts`

| Aspect | Current State |
|--------|--------------|
| **API Endpoint** | `POST /v1/images/edits` (Image API — Edits) |
| **Model Selection** | Auto-detected: `gpt-image-beta` > `dall-e-3` > `dall-e-2` |
| **Image Upload** | Base64 → FormData Blob |
| **Mask Support** | ❌ Not used |
| **Output Format** | PNG (hardcoded) |
| **Quality Parameter** | ❌ Not set |
| **Size Parameter** | `1024x1024` (hardcoded) |
| **Pricing** | Wrong: uses `$0.000015/input token + $0.00006/output token` (gpt-4o text rates) |

### Issues Found

1. **Model auto-detection uses stale names**: `gpt-image-beta` is the old codename. Current models are `gpt-image-2` (flagship), `gpt-image-1.5` (previous), `gpt-image-1-mini` (budget). DALL-E 2 and DALL-E 3 **removed from API May 12, 2026**.

2. **Wrong pricing formula**: The code at `calculateActualCost()` uses gpt-4o text token pricing ($0.015/1K input + $0.06/1K output). The correct pricing for gpt-image models is per-token at image rates ($8/1M input tokens, $30-32/1M output tokens). Flat per-image pricing no longer exists for GPT Image models.

3. **No quality parameter**: Current implementation doesn't send `quality` parameter. Supported values: `low`, `medium`, `high`, `auto`. Default without parameter is `medium`.

4. **No output format control**: Hardcoded to PNG. Should accept configurable output format.

5. **No mask generation**: The `/v1/images/edits` endpoint supports RGBA mask for targeted editing. Without a mask, the API performs full image regeneration, which loses authenticity for restoration use cases.

6. **Model priority is incorrect**: Falls back to `dall-e-3`/`dall-e-2` which are now removed. Should prioritize `gpt-image-2` > `gpt-image-1.5` > `gpt-image-1-mini`.

---

## 2. Recommended API for Restoration

### Decision: Use Image API (`POST /v1/images/edits`)

The Image API edit endpoint is the correct choice for single-call image restoration:
- Dedicated image editing endpoint
- Supports mask for targeted restoration
- Returns image directly
- Lower latency than chat completions approach

The Responses API (`POST /v1/responses` with `tools: [{type: "image_generation"}]`) is for multi-turn conversational editing and adds unnecessary complexity for our use case.

### Option: Chat Completions with gpt-4o

`POST /v1/chat/completions` with `gpt-4o` can also do image analysis but is **not suitable for image generation/editing** — it's for image understanding only.

### Final Recommendation: **Stay on Image API**, but update model selection, pricing, and add quality/size/format parameters.

---

## 3. Correct Model Selection

| Priority | Model | Status | Notes |
|----------|-------|--------|-------|
| 1 | `gpt-image-2` | ✅ Current flagship | Released 2026-04-21 |
| 2 | `gpt-image-1.5` | ✅ Previous flagship | Still active |
| 3 | `gpt-image-1-mini` | ✅ Budget option | Lowest cost |
| 4 | `gpt-image-1` | ⚠️ Deprecating Oct 23, 2026 | Do not start new projects |
| ❌ | `dall-e-3` | Removed May 12, 2026 | No longer available |
| ❌ | `dall-e-2` | Removed May 12, 2026 | No longer available |

**Fix:** Update model priority to `gpt-image-2` > `gpt-image-1.5` > `gpt-image-1-mini` > `gpt-image-1`.

---

## 4. Correct Pricing (Per 1M Tokens, Standard)

| Model | Input (Image) | Cached Input | Output (Image) |
|-------|-------------|-------------|----------------|
| `gpt-image-2` | $8.00 | $2.00 | $30.00 |
| `gpt-image-1.5` | $8.00 | $2.00 | $32.00 |
| `gpt-image-1-mini` | $2.50 | $0.25 | $8.00 |

### Per-Image Cost Estimates (gpt-image-2, 1024×1024)

| Quality | Output Tokens | Cost |
|---------|--------------|------|
| Low | ~272 | ~$0.008 |
| Medium | ~1056 | ~$0.032 |
| High | ~7024 | ~$0.211 |
| Auto | varies | varies |

---

## 5. Image Upload Handling

Current method (Base64 → FormData Blob) is correct for the Image API edits endpoint. No change required.

**Alternative methods considered:**
- **Public URL**: Requires publicly accessible URL. Not suitable for customer uploads.
- **File ID (Responses API)**: Requires upload to `/v1/files` first. Adds complexity, unnecessary for single-call restoration.

---

## 6. Mask Support

The `/v1/images/edits` endpoint accepts an optional RGBA PNG mask where:
- **Transparent areas** (alpha=0): Parts to edit/restore
- **Opaque areas** (alpha=255): Parts to preserve

**Current implementation does NOT use masks.** For restoration, masks should be added to target specific damaged regions (scratches, cracks, stains) while preserving undamaged areas.

**Implementation plan:** Generate a damage mask (e.g., via LaMa or simple pixel analysis) and pass it as the `mask` parameter in the FormData.

---

## 7. Recommended Parameters for Restoration

| Parameter | Recommended Value | Notes |
|-----------|------------------|-------|
| `model` | `gpt-image-2` | Auto-detect, prefer newest |
| `quality` | `auto` | Let API decide |
| `size` | `auto` | Preserve original dimensions |
| `output_format` | `png` | Lossless, supports transparency |
| `background` | `auto` | Preserve background |
| `mask` | RGBA PNG | Optional, for targeted restoration |

---

## 8. Pricing Formula Fix Required

### Current (WRONG)
```typescript
const GPT_IMAGE_TOKEN_COST = {
  input: 0.000015,   // $0.015/1K — gpt-4o text rate
  output: 0.00006,   // $0.06/1K — gpt-4o text rate
};
```

### Corrected
```typescript
const GPT_IMAGE_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-image-2":     { input: 0.000008, output: 0.000030 },  // $8/1M, $30/1M
  "gpt-image-1.5":   { input: 0.000008, output: 0.000032 },  // $8/1M, $32/1M
  "gpt-image-1-mini":{ input: 0.0000025, output: 0.000008 }, // $2.50/1M, $8/1M
  "gpt-image-1":     { input: 0.000008, output: 0.000032 },  // $8/1M, $32/1M
};
```

---

## 9. Summary of Required Changes

| # | Change | Priority | Impact |
|---|--------|----------|--------|
| 1 | Update model priority to `gpt-image-2` > `gpt-image-1.5` > `gpt-image-1-mini` > `gpt-image-1` | HIGH | Correct model selection |
| 2 | Fix pricing formula to use per-model token rates | HIGH | Correct cost calculation |
| 3 | Add `quality` parameter support | MEDIUM | Better output control |
| 4 | Add `output_format` parameter | MEDIUM | Configurable output |
| 5 | Add mask support for targeted restoration | HIGH | Better restoration quality |
| 6 | Remove DALL-E references (deprecated) | MEDIUM | Clean code |
| 7 | Update `estimateCost()` with correct per-model pricing | HIGH | Accurate estimates |

---

## 10. OPS-96 Changes Applied

| Change | Status |
|--------|--------|
| Model priority updated to `gpt-image-2` | ✅ Applied |
| Pricing fixed to $0.000008/$0.000030 per token | ✅ Applied |
| `quality` parameter added | ✅ Applied |
| `output_format` parameter added | ✅ Applied |
| DALL-E references removed | ✅ Applied |
| `estimateCost()` updated | ✅ Applied |
| Cost source corrected to "calculated" | ✅ Applied |
