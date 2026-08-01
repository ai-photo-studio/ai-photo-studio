# Volume-Mapped RunPod Serverless Handler Candidate — restore-unpack-fix (UNPUBLISHED)

The final link in the corrected three-image chain. It is NOT published, NOT
routed to production, and does NOT execute GPU inference in this task.

## Why this candidate exists

The two real Gate 3 canaries (runs `30691401701`, `30692613631`) both used
the currently published volume-mapped handler image, which derives from the
OLD, buggy CLI worker digest (`sha256:049a304b...`). That CLI worker contains
the confirmed `GFPGANer.enhance()` 3-value-unpack defect. **Publishing only
the corrected CLI candidate would not fix the canary** — the Serverless
handler and volume-mapped handler images are separate, already-published
artifacts that do not automatically inherit a change to an unrelated,
unpublished image. All three images in the chain must be rebuilt from the
corrected source and published together (each independently Gate-2-reviewed)
before a new Gate 3 canary could plausibly succeed.

## Base image (immutable, LOCAL build reference)

- Base: the corrected Serverless handler candidate
  (`apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-dev/`), built
  locally in the same CI job/chain and tagged
  `gfpgan-serverless-restore-fix:local` — **not** a registry pull, since
  the corrected chain is unpublished. See
  `.github/workflows/build-restore-unpack-fix-chain.yml`.

## The correction (added by this candidate, on top of the CLI fix)

Exactly one filesystem change, made at build time only:

```
/models -> /runpod-volume/models   (symlink)
```

Root is used only during the image build to swap the directory for a
symlink; runtime returns to `workeruser`. No init script; no runtime symlink
creation; no environment-variable-driven path resolution; no user-controlled
path; no `CMD`/`ENTRYPOINT` override (both inherited unchanged). No weights
in source, build context, image layers, or CI artifacts.

## Status

- **Build-only, unpublished.** This candidate has not been built and pushed
  to any registry, and no RunPod resource has been created.
- Building and testing this candidate does **not** constitute publication,
  GPU approval, or a Gate 2 pass — it requires a fresh, separate, explicit
  Gate 2 readiness review and approval before any publication is considered,
  covering all three images in the chain together.
- Any change to any candidate's source, base digest, or dependencies
  anywhere in the chain invalidates all evidence recorded for it.
- Gate 3 and Gate 4 remain prohibited regardless of this candidate's test
  results. Replicate remains the active production provider.
