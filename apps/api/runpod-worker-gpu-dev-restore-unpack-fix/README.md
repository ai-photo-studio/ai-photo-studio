# GFPGAN GPU Worker Candidate — restore-unpack-fix (UNPUBLISHED)

A separate, **unpublished** GPU restoration worker candidate. Its only source
difference from `apps/api/runpod-worker-gpu-dev/` (the source of the
currently APPROVED/PUBLISHED/CONSUMED immutable CLI base digest
`sha256:049a304b44bec75562a74eac3f5be312feacd6133da80a0dc86d0a136a86a63a`) is
one line in `worker.py`'s `_run_restore()`.

## Confirmed root cause

Two real Gate 3 canary jobs (runs `30691401701` and `30692613631`) failed
with `status: FAILED`, worker exit code `1` (`EXIT_INTERNAL`), and no
decodable output. Offline analysis (2026-08-01, no RunPod call, no GPU
required) confirmed the cause:

`GFPGANer.enhance()` — verified against the exact pinned `gfpgan==1.3.8` tag
source (`gfpgan/utils.py`) — always returns a 3-tuple:
`(cropped_faces, restored_faces, restored_img)`. The prior worker.py
unpacked only 2 values:

```python
out, _ = model.enhance(arr, has_aligned=False, only_center_face=False, paste_back=True)
```

This raises `ValueError: too many values to unpack (expected 2, got 3)` on
**every** successful `restore` call, independent of GPU availability, weight
validity, or environment configuration — an uncaught `ValueError` that
propagates to `worker.py`'s generic `except Exception: sys.exit(EXIT_INTERNAL)`
handler. This was empirically reproduced locally (mocking
`validate_weight`/`cuda_info`/`load_model` and calling the real
`_run_restore()` with a stub `model.enhance()` returning a verified-shape
3-tuple) — no GPU, torch, or RunPod call was needed to prove it.

**Fix (one line):**

```python
_, _, out = model.enhance(arr, has_aligned=False, only_center_face=False, paste_back=True)
```

`restored_img` (the third element) is guaranteed non-`None` here because
`paste_back=True` and `has_aligned=False`. `GFPGANer.__init__`'s accepted
constructor arguments (`model_path`, `upscale`, `arch='clean'`,
`channel_multiplier`, `bg_upsampler`, `device`) were also verified against
the same pinned source and match the existing call exactly — no other
signature mismatch was found. `facexlib==0.3.0`'s
`FaceRestoreHelper.paste_faces_to_input_image()` was verified to handle a
zero-detected-face image gracefully (returns the background image; no
exception), which was a secondary concern given the canary's synthetic
gradient fixture has no real face — ruled out as a contributing issue.

## Status

- **Not published. Not built. Not deployed.** No image was built or pushed
  in this task.
- **Not routed to production.** `productionRoutingAllowed` remains `False`.
- Publishing this candidate — or any future change to it — requires a fresh,
  separate, explicit Gate 2 review and approval, exactly like every prior
  candidate in this project.
- Both prior Gate 3 approvals (2026-08-01) remain consumed. A new Gate 2
  review/publication of this candidate would be required before any further
  Gate 3 canary could use it.

## Weight Contract (external weights, never bundled) — unchanged

| Weight | Load path | Size | SHA-256 |
|---|---|---|---|
| GFPGANv1.4.pth | `/models/GFPGANv1.4.pth` | 348632874 | e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad |
| detection_Resnet50_Final.pth (symlink -> /models/facexlib/...) | 109497761 | 6d1de9c2944f2ccddca5f5e010ea5ae64a39845a86311af6fdf30841b0a5a16d |
| parsing_parsenet.pth (symlink -> /models/facexlib/...) | 85331193 | 3d558d8d0e42c20224f13cf5a29c79eba2d59913419f945545d8cf7b72920de2 |

## Modes — unchanged

- `health` – reports Python/torch versions, all three weight paths present, and safe-load env (no CUDA required).
- `gpu_probe` – reports CUDA availability and device (no model load).
- `restore` – real GFPGAN v1.4 inference; fails closed unless CUDA is available AND all three weights match size and SHA-256 AND safe loading is enforced. **Corrected**: the `model.enhance()` return value is now unpacked correctly.

## Pinned dependency versions — unchanged, verified against installed/upstream source (not memory)

- Python `3.10`
- PyTorch `2.6.0+cu126`, torchvision `0.21.0+cu126`
- numpy `1.26.4`, opencv-python-headless `4.9.0.80`, Pillow `10.2.0`, scipy `1.11.4`
- gfpgan `1.3.8` (`GFPGANer.__init__` and `.enhance()` signatures verified against the `v1.3.8` tag source), facexlib `0.3.0` (`paste_faces_to_input_image()` zero-face behavior verified against the `v0.3.0` tag source)
- basicSR: official v1.4.2 source (`f23fe355...`) with the tracked one-line `functional_tensor->functional` patch (`834cf12b...`) applied at build

## Running tests on a Python host

With dependencies installed (`pip install -r requirements.txt` plus patched
basicsr), run: `python3.10 test_worker.py`. The mocked
`test_enhance_return_unpacking_matches_gfpgan_contract` and
`test_enhance_two_value_unpack_would_have_failed` tests run correctly even
without torch/gfpgan/CUDA installed, since they exercise `_run_restore()`
with `validate_weight`/`cuda_info`/`load_model` monkeypatched.
