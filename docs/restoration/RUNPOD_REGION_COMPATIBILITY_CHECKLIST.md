# RunPod GPU / Region Compatibility Checklist

## Purpose

Resolve GPU/Network-Volume region coexistence for the Gate 3 canary using read-only RunPod evidence only.

## Read-Only Authorization / Query Status

- Shared-state GitHub authorization was explicitly given to: open/merge a narrow CI-only PR adding a `workflow_dispatch` workflow, dispatch it exactly once, and read its redacted output.
- Local process/User/Machine environment scopes did not expose `RUNPOD_API_KEY` to this tool's subprocess, so the read-only queries were executed inside GitHub Actions instead, where `secrets.RUNPOD_API_KEY` is legitimately injected by GitHub at job start.
- Workflow: `.github/workflows/runpod-region-readonly.yml` (added via PR #63, merged to `main`).
- Dispatched exactly once: run `30658355014`, dispatched from `main`, completed `success`.
- `keyPresent=true` confirmed in the run log; the key value was never printed, echoed, or persisted (`set +x` before every authenticated call; `env: RUNPOD_API_KEY: ***` masked automatically by GitHub).
- Queries performed (GET/query only, no mutation):
  - `GET https://rest.runpod.io/v1/networkvolumes` → HTTP 200, empty array `[]`.
  - `POST https://api.runpod.io/graphql` with a GraphQL `query { gpuTypes { ... } }` (no `mutation`) → HTTP 200.
- **Result: BLOCKED — no existing Network Volume on the account.** Authentication succeeded and both queries returned cleanly; there is nothing to co-locate with a GPU in any datacenter.

## Selection Fields

- **Data center ID**: `________` (no Network Volume exists to anchor a datacenter selection)
- **Selected GPU pool available (16GB-class: A4000 / A4500 / RTX 4000 / RTX 2000)**: confirmed available account-wide — RTX A4000 (16GB, stock Low, $0.17/hr), RTX A4500 (20GB, stock Low, $0.19/hr), RTX 4000 Ada (20GB, stock Low, $0.18–0.20/hr), RTX 2000 Ada (16GB, stock Low, $0.50/hr). Per-datacenter breakdown was not available from this query — moot until a volume exists.
- **Network Volume availability in the same data center**: **none — zero Network Volumes exist on the account.**
- **Selected GPU pool per-second rate**: cheapest candidate (RTX A4000, $0.17/hr) = `$0.00004722/s`; worst-case one-job cost `0.00004722 × 120 = $0.0057`, under the proposed $0.05 budget. Not yet "verified" for approval purposes (Gate 3 fields remain fail-closed).
- **Region coexistence confirmed (GPU and Network Volume in same DC)**: **No — cannot be confirmed; no volume exists.**

## Resolved?

- `regionCompatibilityResolved`: **false** — precisely because no Network Volume exists on the account, not because of credential or query failure. Authentication and both read-only queries succeeded.
- Per authorization: since no existing compatible volume exists, **nothing was created**; Gate 3 remains BLOCKED on this point.

## Note

- If a Network Volume is later created (out of scope for this task — would require separate, non-read-only authorization) in a datacenter that also stocks a 16GB-class GPU, this checklist must be revalidated with a fresh dispatch of `runpod-region-readonly.yml`.
- Any future GPU/rate/volume change invalidates this evidence and requires revalidation before Gate 3 can be reconsidered.
