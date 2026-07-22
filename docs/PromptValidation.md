# Prompt Validation Report

**Date:** 2026-07-22  
**Source:** OPS-95 Investigation  
**Evidence:** Original prompt text, provider API documentation, actual output analysis

---

## 1. Current Prompt

The prompt at `docs/prompts/photo-restoration-standard.md` contains 37 lines with:
- 18 requirements
- 6 prohibitions
- 3 instruction sections

---

## 2. Provider Compatibility

### Prompt Compatibility With Replicate (CodeFormer)

CodeFormer does NOT accept a text prompt. Its parameters are:
- `image` (required) — the input image
- `upscale` (optional) — upscaling factor
- `face_upsample` (optional) — face-specific upsampling
- `codebook_fidelity` (optional) — fidelity to original face

**The entire prompt is ignored** by CodeFormer. The model processes faces using its codebook lookup transformer regardless of what the prompt says.

### Prompt Compatibility With OpenAI (gpt-image-1 via /v1/images/edits)

gpt-image-1 accepts a `prompt` parameter, but:

| Requirement | Obeyed? | Reason |
|---|---|---|
| Remove scratches | ❌ | No mask — model doesn't know where scratches are |
| Remove cracks | ❌ | No mask |
| Remove dust | ❌ | No mask |
| Repair torn regions | ❌ | No mask |
| Restore facial details | ❌ | gpt-image-1 not specialized in face restoration |
| Improve sharpness | ❌ | Full regeneration creates different sharpness |
| Preserve identity | ❌ | Without mask, regenerates whole image |
| Preserve background | ❌ | Regenerates background |
| Preserve historical authenticity | ❌ | Full regeneration loses authenticity |
| Prepare for professional printing | ❌ | No print-specific processing |

**The prompt is obeyed for style guidance** but **all the specific restoration instructions are ignored** because the edits endpoint requires a mask to know WHERE to apply changes.

---

## 3. Instruction-by-Instruction Analysis

| # | Instruction | Replicate | OpenAI | Reason for Failure |
|---|---|---|---|---|
| 1 | Remove scratches | ❌ | ❌ | CodeFormer: face only. GPT: needs mask |
| 2 | Remove cracks | ❌ | ❌ | Same as above |
| 3 | Remove dust | ⚠️ | ❌ | CodeFormer: may reduce in face regions |
| 4 | Remove stains | ❌ | ❌ | Neither designed for stain removal |
| 5 | Repair torn regions | ❌ | ❌ | Requires inpainting (LaMa/MAT) |
| 6 | Repair missing regions | ❌ | ❌ | Requires inpainting |
| 7 | Restore faded details | ⚠️ | ❌ | CodeFormer sharpens faces |
| 8 | Restore facial details | ✅ | ❌ | CodeFormer's core capability |
| 9 | Improve sharpness naturally | ⚠️ | ❌ | CodeFormer: sharpens faces. GPT: over-sharpens |
| 10 | Reduce blur | ⚠️ | ❌ | CodeFormer: face deblurring |
| 11 | Preserve original facial identity | ✅ | ❌ | CodeFormer: designed for this |
| 12 | Preserve clothing | ⚠️ | ❌ | CodeFormer leaves clothing unchanged |
| 13 | Preserve background | ⚠️ | ❌ | CodeFormer leaves BG unchanged |
| 14 | Preserve pose | ✅ | ❌ | CodeFormer: preserves face pose |
| 15 | Preserve camera angle | ✅ | ❌ | Not changed by CodeFormer |
| 16 | Preserve historical authenticity | ❌ | ❌ | CodeFormer: face-only. GPT: regenerates |
| 17 | Remove scanning artifacts | ❌ | ❌ | Neither designed for this |
| 18 | Improve tonal range | ❌ | ❌ | Neither does color grading |
| 19 | Improve local contrast | ❌ | ❌ | Neither does local contrast |
| 20 | Prepare for professional printing | ❌ | ❌ | Neither does print prep |

**Key: ✅ = obeyed, ⚠️ = partially, ❌ = ignored/unavailable**

---

## 4. Prompt Rewrite Analysis

**Should the prompt be rewritten?** NO — the prompt is correct but the PROVIDERS are wrong.

The prompt is well-written for commercial photo restoration. The issue is not the prompt content but rather:

1. **CodeFormer ignores the prompt entirely** — it only accepts `image` and `upscale` parameters
2. **gpt-image-1 requires a mask** — without it, the prompt's spatial instructions (remove scratches, repair cracks) have no effect

### What needs to change (not the prompt, but the pipeline):

1. For CodeFormer: Accept that it only restores faces. Use it as a face-restoration stage only.
2. For gpt-image-1: Generate a damage mask first, then send the masked image with targeted instructions.
3. For production: Use specialized models for each restoration stage (see `CommercialRestorationPipeline.md`).

---

## 5. Conclusion

| Finding | Verdict |
|---|---|
| Is the prompt well-written? | ✅ Yes — it's comprehensive for commercial restoration |
| Does CodeFormer obey the prompt? | ❌ No — the model ignores text input |
| Does gpt-image-1 obey the prompt? | ❌ No — it requires a mask to apply spatial edits |
| Should the prompt be rewritten? | ❌ No — the pipeline needs changing, not the prompt |
| What's needed? | Multi-stage pipeline with specialized models |
