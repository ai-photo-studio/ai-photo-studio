# BasicSR Master Compatibility Evidence

Evidence-only evaluation of the official XPixelGroup/BasicSR unreleased fix for torchvision `functional_tensor` compatibility. No candidate dependency was modified; nothing was published.

## Exact Official Commit

- Commit: `8d56e3a045f9fb3e1d8872f92ee4a4f07f886b0a`
- Author: Veljko Tornjanski
- Date: `2024-05-17T07:34:46Z`
- Message: "change functional_tensor to functional (#650)"
- Parent: `033cd6896d898fdd3dcda32e3102a792efa1b8f4`
- Changed file (1): `basicsr/data/degradations.py`
- Change:
  - `- from torchvision.transforms.functional_tensor import rgb_to_grayscale`
  - `+ from torchvision.transforms.functional import rgb_to_grayscale`

## Licence / Provenance

- Repository licence (Apache-2.0) confirmed for the official `XPixelGroup/BasicSR` repo. The fix commit is an official upstream commit (PR #650).

## Diff Review (v1.4.2 ... fix commit)

- `commitsAhead`: 18
- `filesChanged`: 41
- Substantive unrelated changes present across the range (VGG parameter updates, optimizer support, metrics `l2->mse`, archs e.g. stylegan2_bilinear, config-experiment paths, docs, workflow changes).
- Conclusion: a wheel built from the exact commit carries these unrelated changes, so it is NOT a minimal security upgrade.

## Reproducibility Hashes

- Official source archive (commit tarball) SHA-256:
  `88a422325c7a08a9f3b6109e747bef5fbdf85d884d6033eacaf11f6c374aade9`
- No discrete wheel artifact was retained (built source in CI; nothing uploaded).

## Compatibility Result (workflow run 30625934026, PASS)

- Python `3.10`
- torch `2.6.0+cu126`, `cuda_available False` (CPU runner)
- torchvision `0.21.0+cu126`
- `has_functional_tensor False` (module truly removed)
- BasicSR (fix commit), GFPGAN `1.3.8`, facexlib `0.3.0` all import.
- GFPGANer architecture construction succeeded → the `functional_tensor` error is resolved by the official fix.

## Safe-Load Result

- `TORCH_FORCE_WEIGHTS_ONLY_LOAD=1` enforced; no `weights_only=false` fallback; `TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD` rejected.
- Real-weight safe-load test was NOT run in this task because the candidate is not being modified here.
- Safety finding: GFPGANer construction triggered runtime network downloads of facexlib weights (`detection_Resnet50_Final.pth`, `parsing_parsenet.pth`), which conflicts with the candidate's no-runtime-download requirement and must be addressed in any future adoption.

## Decision

- `adoptionRecommended`: false
- `reason`: The official fix is not a minimal change (18 commits / 41 files of unrelated surface; a wheel from that commit embeds them); GFPGANer construction performs runtime network downloads; and the candidate must not be modified in this task.
- `candidateModified`: false
- `publicationAllowed`: false
- `productionRoutingAllowed`: false
