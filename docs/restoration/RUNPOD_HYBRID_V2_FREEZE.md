# RunPod Hybrid V2 — Freeze Record

## Version / tag

`runpod-hybrid-v2-freeze-2026-08-02`

Annotated Git tag, message: "Freeze RunPod Hybrid V2 before Replicate market launch".

## Frozen source

- Frozen branch: `fix/runpod-combined-cwd-sha256-chain`
- Frozen commit (tag target): `5ebf100d96f183c7784477fd0d786ad75036fb7a`
- `main` commit at freeze time: `fe5b2d74a275eb5416059e3d4eb20681cb12aff2`

The tag is annotated and immutable. It must not be moved or recreated. Any future work on this track resumes from the tag, never from a re-derived branch tip.

## What is registered on `main` as of the freeze

- The build-only, `workflow_dispatch`-only combined workflow `.github/workflows/build-restore-unpack-fix-combined-chain.yml` is registered and `active` on `main` (merged via PR #111, merge commit `fe5b2d74a275eb5416059e3d4eb20681cb12aff2`). It builds three local-only Docker stages and publishes nothing.
- `apps/api/runpod-worker-gpu-dev-restore-unpack-fix/worker.py` (carrying the `outputSha256` final-PNG hash contract) and its `test_worker.py` (25/25 passing) are merged to `main` (PR #110, merge commit `66b49028109351a9596b1170044ca15a1de8cd6c`).

## What is completed but remains source-only, on the frozen branch/tag only (not on `main`)

- Combined Serverless handler source (`apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-combined-dev/`), carrying `cwd=WORKER_DIR` and forwarding `outputSha256` unchanged — 40/40 tests passing.
- Combined volume-mapped handler source (`apps/api/runpod-worker-gpu-serverless-volume-restore-unpack-fix-combined-dev/`) — mount-contract tests require a built image and were not run outside Docker.
- Canonical combined-chain readiness record `docs/restoration/runpod-combined-chain-source-readiness.json` and its validator `docs/restoration/runpod-combined-chain-source-readiness.test.ts`, both passing.
- Git provenance: isolated worktree builds, exact staged-file verification, `feat(runpod): prepare combined cwd and sha256 chain` (`5ebf100d96f183c7784477fd0d786ad75036fb7a`), full typecheck/build/replay/`git diff --check` loop, all clean.

These source, test, and validator artifacts exist and are complete, but the resulting combined image chain **has not been built, has not been published, and no new digest exists**. A successful future build-only CI run on the registered workflow is not, by itself, Gate 2 publication or production eligibility.

## Digest status (unchanged by this freeze)

- `sha256:44a42808c0ebdef72ea5b2914325016170701e489a6835f8433507566969781b` — published (Gate 2), but **Gate 3 ineligible**: its Serverless/volume images derive from a handler that does not pass `cwd=WORKER_DIR` to the worker subprocess, the confirmed root cause of Gate 3 canary run `30702245089`'s "worker produced invalid non-JSON output" failure. This finding and the combined-chain remedy are recorded in `docs/restoration/runpod-gate3-readiness.json` (`gate2CandidateOutputSha256Fix.gate3EligibilityAssessment`) and `RUNPOD_GATE3_APPROVAL_PACKET.md` on the `fix/runpod-output-sha256-contract` branch; those canonical-record updates have not yet been merged to `main` (see "Outstanding work" below).
- `sha256:91052a538454d2996b6f27b561a8b9f7d07636d396f7dd8d1713baf9f9a5ea0d` — the original protected, Gate 3 owner-approved digest. Unaffected, unchanged, remains the sole production-eligible-only candidate on record. `main`'s `docs/restoration/runpod-gate3-readiness.json` still reflects this digest as `immutableImageDigest` with `approved: false` for Gate 4 activation.
- The combined chain (this freeze's frozen source) has produced **no new digest**. `newDigestExists: false`.

## Protected state (unchanged by this freeze)

- Replicate remains the active production provider (`sczhou/codeformer` via Replicate API).
- RunPod routing remains disabled. `RUNPOD_ROUTING_AUTHORIZED=false`.
- Gate 3 remains not reviewed for the combined chain.
- Gate 4 (production activation) remains prohibited.
- No RunPod endpoint exists or is created by this freeze.
- No secret was read, written, or changed by this freeze.

## Reason for freeze

The product is launching to market on the current Replicate-based restoration pipeline. Engineering focus is shifting to UI and launch-readiness work. The RunPod hybrid track (intended as a future cost/latency optimization) is fully prepared at the source level but not production-ready, and further RunPod work (build dispatch, Gate 2 publication of the combined chain, Gate 3 canary review) is deliberately paused so it does not compete for attention or risk with the launch. Freezing at a known-good, fully-tested, fully-committed source state means the track can resume later without rediscovery work.

## Outstanding RunPod work and known blockers

1. The registered combined-chain workflow has not yet been dispatched; no build-only CI run has been executed against it.
2. If dispatched and passing, the combined chain would still require a separate, explicit Gate 2 publication authorization before any digest exists.
3. Any resulting digest would still require a separate, explicit Gate 3 canary/review before any production-eligibility claim.
4. The canonical Gate 2/Gate 3 readiness-record updates for the `outputSha256` candidate (digest `sha256:44a42808...`) and the combined-chain source-readiness JSON/validator exist only on feature branches (`fix/runpod-output-sha256-contract` and `fix/runpod-combined-cwd-sha256-chain` respectively) and have not been merged to `main`. `main`'s `docs/restoration/runpod-gate3-readiness.json` and `RUNPOD_GATE3_APPROVAL_PACKET.md` do not yet reflect the `outputSha256` candidate or the combined-chain remedy. This is a documentation-continuity gap to close during any future resume, not a functional blocker to the freeze itself.
5. No RunPod cost, endpoint, or wallet review has been performed as part of this freeze; those remain separately out of scope, as previously recorded.

## Resume procedure

Future work on this track must begin only after **explicit unfreeze authorization** that names this freeze tag by exact name (`runpod-hybrid-v2-freeze-2026-08-02`). Do not resume directly from an unrelated UI or Replicate-launch branch, and do not resume from a re-derived or re-created ref.

1. Verify the tag resolves to `5ebf100d96f183c7784477fd0d786ad75036fb7a` (`git rev-list -n 1 runpod-hybrid-v2-freeze-2026-08-02` or the annotated tag's `object.sha` via the GitHub API).
2. Create a new branch from the tag: `resume/runpod-hybrid-v2`.
3. Re-enable `.github/workflows/build-restore-unpack-fix-combined-chain.yml` if it is disabled (verify its Actions API `state` is `active`; see "Workflow freeze" below for its state at freeze time).
4. Re-read this freeze document, the latest independent audit, `rules.md`, and the canonical RunPod Gate 2/Gate 3 protocol documents before taking any action.
5. Revalidate the resumed branch's tip SHA and the full protected-state list above (Replicate production, `RUNPOD_ROUTING_AUTHORIZED=false`, Gate 3 not reviewed, Gate 4 prohibited, no new digest).
6. Continue first with exactly one build-only CI run of the registered combined-chain workflow, verified to terminal status, before any publication or further action.

## Workflow freeze

`.github/workflows/build-restore-unpack-fix-combined-chain.yml` is disabled (`disabled_manually`) immediately after this document is merged to `main`, so it cannot be accidentally dispatched while the track is frozen. No other CI, deployment, Replicate, or application workflow is disabled by this freeze.
