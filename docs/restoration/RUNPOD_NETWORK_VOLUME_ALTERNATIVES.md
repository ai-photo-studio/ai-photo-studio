# RunPod Weight-Delivery Architecture Comparison (prepared, not implemented)

This is a read-only comparison prepared while Network Volume storage capability for this account remains unproven (`UNPROVEN`, see `RUNPOD_GATE3_APPROVAL_PACKET.md`). It records trade-offs only. No option here has been implemented, approved, or authorized. The current preference remains **external Network Volume weights** unless evidence proves that option unavailable for this account.

## Option 1: RunPod Network Volume (after account enablement/confirmation)

- **Required Gate approvals:** Gate 2 (image, already consumed for the volume-mapped handler candidate) + a separate Network Volume creation authorization (two dispatches already consumed under this authorization pattern; a third would need new explicit authorization) + Gate 3 canary approval.
- **Security impact:** Weights never bundled in the image; checksum-verified at handler startup; volume is account-scoped and can be deleted independently of the image. Lowest blast radius if the image is ever pulled by an unintended party (image alone contains no weights).
- **Cold-start effect:** Network Volume mount adds RunPod-managed attach latency (documented as low but non-zero); no image pull of large weight layers needed.
- **Monthly/storage cost:** ≤$0.35/month for the current 5GB proposal (Standard tier, $0.07/GB/month, per official RunPod pricing).
- **Engineering rework:** None beyond what is already built — the symlink-mapped handler candidate (`apps/api/runpod-worker-gpu-serverless-volume-dev/`) already exists and passed Gate 2 publication.
- **Status:** Blocked pending proof that an eligible datacenter/GPU-co-located Network Volume can actually be created for this account (see support request below).

## Option 2: Weights baked into a new immutable image

- **Required Gate approvals:** A brand-new Gate 2 readiness review and explicit publication approval (the current Gate 2 approval is for a weight-free image; baking weights in is a source/dependency change that invalidates the existing approval per `nextApprovalRequired: true`).
- **Security impact:** Highest blast radius — the image itself would need to embed and redistribute the GFPGAN v1.4 weight (`e2cd4703...`) and facexlib auxiliary weights. Redistribution rights for these third-party weights are **not yet verified** (this restoration project has repeatedly treated "no bundled weights" as a hard constraint precisely because redistribution evidence is incomplete). Adopting this option would require resolving that open licensing question first, independent of the Network Volume question.
- **Cold-start effect:** Larger image pull (the GFPGAN + facexlib weights add roughly ~500MB combined); no volume-attach step, so once the image is cached on a node, no extra warm-start distinction versus a volume mount.
- **Monthly/storage cost:** No separate storage line item, but larger container-disk requirement (GHCR storage is currently free/public for this project; container disk itself is billed at $0.10/GB/month while the worker is provisioned).
- **Engineering rework:** Nontrivial — a new Dockerfile variant, a new Gate 2 readiness packet, a full SBOM/vulnerability re-scan, and resolution of the unresolved weight-redistribution question before any publication could be considered.
- **Status:** Not recommended as a first fallback; the redistribution-rights gap is a harder blocker than the current storage-capability question.

## Option 3: Checksum-verified download from private object storage during initialization

- **Required Gate approvals:** A new Gate 2 readiness review for the init-download code path (this is a source change to the worker), plus a new security review specifically for the runtime network fetch (this project has an existing hard rule: *"runtime network weight download remains prohibited"* for the GFPGAN candidate, adopted specifically because of past evaluation of similar patterns). Reversing that rule would need explicit, separate authorization.
- **Security impact:** Introduces a runtime network dependency and a private object-storage credential inside the worker (new secret-management surface not currently required by either other option). Checksum verification mitigates tampering but does not eliminate the added attack surface of a runtime fetch path.
- **Cold-start effect:** Worst of the three options — adds a network download on every cold start (worse than a volume attach, worse than an already-cached image layer) unless combined with a persistent cache, which reintroduces a volume-like dependency anyway.
- **Monthly/storage cost:** Object storage cost (comparable to or cheaper than Network Volume, e.g. Cloudflare R2 already used elsewhere in this project) plus egress considerations if the storage provider charges for it.
- **Engineering rework:** Significant — new download/verify/cache code path in the worker, new credential plumbing, and reversal of an existing "no runtime download" project rule that was adopted deliberately.
- **Status:** Not recommended; combines the security review burden of Option 2 with the cold-start burden of a fresh mechanism, while working against an existing documented project decision.

## Recommended Option

**Option 1 (RunPod Network Volume) remains the recommended and preferred architecture.** It requires no new Gate 2 review, no new security review, no reversal of any existing project rule, and has the lowest cost and blast radius of the three. The only open item is proving datacenter/GPU co-location capability for this specific account, which is the subject of the prepared (unsent) RunPod support request in `RUNPOD_SUPPORT_REQUEST_DRAFT.md`. Options 2 and 3 should only be reconsidered if Option 1 is authoritatively proven unavailable for this account.
