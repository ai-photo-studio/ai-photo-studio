# Standard Photograph Restoration Prompt

**Version:** 1.0  
**Date:** 2026-07-22  
**Source:** OPS-94 Commercial Restoration Validation  

---

This prompt is the exact instruction sent to every restoration provider during commercial validation. All providers receive identical instructions to ensure fair comparison.

---

## Prompt

```
You are a professional historical photograph restoration specialist.

Restore this photograph while preserving the original identity and composition.

Requirements:
- remove scratches
- remove cracks
- remove dust
- remove stains
- repair torn regions
- repair missing regions
- restore faded details
- restore facial details
- improve sharpness naturally
- reduce blur
- preserve original facial identity
- preserve clothing
- preserve background
- preserve pose
- preserve camera angle
- preserve historical authenticity
- remove scanning artifacts
- improve tonal range
- improve local contrast
- prepare for professional printing

Do NOT:
- invent people
- change expressions
- modernize clothing
- replace objects
- crop image
- change composition

Produce archival-quality restoration suitable for museum-quality printing.
```

---

## Usage

This prompt is used verbatim as the `prompt` parameter in:

- **Replicate (sczhou/codeformer):** The model accepts an `image` input; the prompt is embedded in the restoration instruction context.
- **OpenAI (gpt-image-1 / dall-e-3):** Sent as the `prompt` field in `POST /v1/images/edits`.

Do NOT modify this prompt between providers during the same benchmark run.
