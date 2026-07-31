# GFPGAN Offline External-Mount Weight Evidence

Proves fully offline GFPGAN construction and safe weight loading using three externally mounted, checksum-verified weights, inside a `--network none` container. No candidate modification; nothing published.

## Outcome

- `offlineConstructionVerified`: **true**
- Network isolation: `docker run --network none` (no HTTP/DNS) with read-only `/models` mounts and symlinks.
- Runtime download observed: none.
- Evidence workflow run: `30632558271` (SUCCESS, `offline construct exit: 0`).

## Dependency Versions

- Python `3.10`
- torch `2.6.0+cu126` (cuda_available False on CPU runner)
- torchvision `0.21.0+cu126`
- gfpgan `1.3.8`, facexlib `0.3.0`
- basicsr: patched v1.4.2 (one-line `functional_tensor` -> `functional`), baked in and verified.

## The Three Official Weights

| Weight | Size | SHA-256 | Load path |
|---|---|---|---|
| GFPGANv1.4.pth | 348632874 | e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad | `/models/GFPGANv1.4.pth` (direct model_path) |
| detection_Resnet50_Final.pth | 109497761 | 6d1de9c2944f2ccddca5f5e010ea5ae64a39845a86311af6fdf30841b0a5a16d | `gfpgan/weights/...` symlink -> `/models/facexlib/...` |
| parsing_parsenet.pth | 85331193 | 3d558d8d0e42c20224f13cf5a29c79eba2d59913419f945545d8cf7b72920de2 | `gfpgan/weights/...` symlink -> `/models/facexlib/...` |

## Discovered Local Paths / Download Prevention

- **Main weight** (`GFPGANer`): `gfpgan/utils.py` `GFPGANer.__init__` calls `torch.load(model_path)` and only downloads when `model_path.startswith('https://')`. Passing a local path (`/models/GFPGANv1.4.pth`) never downloads.
- **Aux weights** (`init_detection_model` / `init_parsing_model`): `facexlib.utils.misc.load_file_from_url` computes `cached_file = <save_dir>/<filename>` and returns it WITHOUT downloading if `os.path.exists(cached_file)` returns true. Symlinking `gfpgan/weights/<filename>` -> `/models/facexlib/<filename>` makes `os.path.exists` true, preventing the download.
- With `--network none`, any accidental download attempt would fail, proving no runtime download occurred.

## Safe Load Result (per weight)

- All three weights loaded successfully with `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1`.
- `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD`: rejected (must not be set).
- No `weights_only=False` fallback.
- `gpu_inference_executed`: false.

## Offline Construction Result

- `GFPGANer constructed; main GFPGAN weight loaded` — confirms the main GFPGAN weight loaded offline.
- GFPGANer construction also builds `FaceRestoreHelper`, which loads the detection and parsing weights offline (no download under `--network none`).
- Tiny CPU contract inference passed (aligned 512x512 image): `cpu contract inference completed; faces: 1`.
- `offline construct exit: 0`.

## Integrity vs Redistribution Distinction

- The independently calculated SHA-256 hashes are **technical integrity pins**, not publisher-signed checksums, and do **not** prove redistribution permission.
- No weight may be bundled or distributed.
- External / BYO mounting is the only candidate packaging mode.
- This task provides **technical evidence only, not legal approval**.

## Decision

- `offlineConstructionVerified`: true
- `candidateModified`: false
- `adoptionApproved`: false
- `publicationAllowed`: false
- `weightBundlingAllowed`: false
- `runtimeDownloadAllowed`: false
- `productionRoutingAllowed`: false
