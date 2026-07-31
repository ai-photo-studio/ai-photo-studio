# GFPGAN Auxiliary Weight Provenance

Inventory of the auxiliary model weights that `GFPGANer` / `FaceRestoreHelper` require at runtime, and their official provenance. No weight is bundled or committed; weights are verified in CI temporary storage only and deleted.

## Required Auxiliary Weights

`GFPGANer` (with `det_model='retinaface_resnet50'`, `use_parse=True`) initializes two facexlib models, each of which runtime-downloads one weight:

### 1. detection_Resnet50_Final.pth

- Purpose: RetinaFace ResNet50 face detection.
- Repository: `https://github.com/xinntao/facexlib`
- Release asset: `v0.1.0`, asset id `38201344`
- URL: `https://github.com/xinntao/facexlib/releases/download/v0.1.0/detection_Resnet50_Final.pth`
- Expected size: `109497761` bytes
- SHA-256 (independently calculated, run 30627778687): `6d1de9c2944f2ccddca5f5e010ea5ae64a39845a86311af6fdf30841b0a5a16d`
- Publisher digest: null (not publisher-signed)
- Load call: `facexlib/detection/__init__.py` `init_detection_model` -> `torch.load(model_path, map_location=...)` **without weights_only** (requires `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1` on torch 2.6).

### 2. parsing_parsenet.pth

- Purpose: ParseNet face parsing.
- Repository: `https://github.com/xinntao/facexlib`
- Release asset: `v0.2.2`, asset id `56701054`
- URL: `https://github.com/xinntao/facexlib/releases/download/v0.2.2/parsing_parsenet.pth`
- Expected size: `85331193` bytes
- SHA-256 (independently calculated, run 30627778687): `3d558d8d0e42c20224f13cf5a29c79eba2d59913419f945545d8cf7b72920de2`
- Publisher digest: null (not publisher-signed)
- Load call: `facexlib/parsing/__init__.py` `init_parsing_model` -> `torch.load(model_path, map_location=...)` **without weights_only** (requires `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1` on torch 2.6).

## Findings / Fails-Closed

- Both weight APIs provide NO publisher digest -> checksum source is `independently-calculated` (not signed).
- Redistribution permission is NOT explicitly verified -> `redistributionApproved: false`.
- Both load calls omit `weights_only` -> safe loading on torch 2.6 requires `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1`.
- `runtimeDownloadAllowed: false`, `weightBundlingAllowed: false`, `productionRoutingAllowed: false`.
- No weight is bundled or committed; temporary files are deleted after verification.

## Offline Construction Test

- Outcome: BLOCKED / not performed.
- Reason (exact blocker): offline GFPGANer construction requires the GFPGANv1.4 main weight plus both auxiliary weights mounted and considered verified. The auxiliary weights have only independently-calculated SHA-256 (no publisher digest) and redistribution is unverified (`redistributionApproved: false`); the main GFPGAN weight redistribution is likewise already `redistributionApproved: false`. Per the fail-closed rule, unresolved provenance/checksum prevents treating them as verified offline and no runtime-download-free construction can be claimed.
- GFPGANer arch construction (without weight load) DID succeed under the patched v1.4.2 + torch 2.6 (evidence run 30627778687), proving no `functional_tensor` block; it also demonstrated runtime network downloads of the two auxiliary weights when not pre-mounted.

