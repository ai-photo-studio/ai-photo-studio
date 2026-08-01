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

## Selection Fields — RESOLVED (manual console evidence + live re-verification + created volume)

- **Data center ID**: `EU-RO-1`, selected from manual RunPod console evidence (Create Network Volume UI, GPU filter "NVIDIA RTX 4000 Ada Generation", 2026-08-01), which showed EU-RO-1 as selectable (Low availability, Global Networking, S3). EUR-IS-1 (Low availability, S3) and US-CA-2 (N/A) were also shown but not selected; EU-RO-1 was chosen per the explicit third-dispatch authorization.
- **Selected GPU pool available (16GB-class: A4000 / A4500 / RTX 4000 / RTX 2000)**: confirmed available account-wide — RTX A4000 (16GB, stock Low, $0.17/hr), RTX A4500 (20GB, stock Low, $0.19/hr), RTX 4000 Ada (20GB, stock Low, $0.18–0.20/hr), RTX 2000 Ada (16GB, stock Low, $0.50/hr). RTX 4000 Ada was selected (console-proven pairing with EU-RO-1).
- **Live re-verification**: workflow run `30677597137` queried `runpodctl gpu list --include-unavailable` and cross-referenced the documented `dataCenterAvailability` field for RTX 4000 Ada against EU-RO-1: **1 matching entry found**, confirming the manual console evidence against live data before any mutation.
- **Network Volume availability in the same data center**: **YES — created.** Run `30677597137` created exactly one Network Volume, name `photo-restoration-gate3-models`, size 10 GB, datacenter `EU-RO-1` (redacted ID `d6a4504x...`). Post-creation `GET /v1/networkvolumes` confirmed exactly 1 matching volume, size 10 GB, datacenter prefix `EU-R***` matching expected.
- **Selected GPU pool per-second rate**: the official proposed Serverless Flex 16GB-class rate is `$0.58/hr = $0.000161111/s`; worst-case one-job cost at the 120s ceiling `0.000161111 × 120 = $0.019333`, under the $0.05 max proposed budget. Still "proposed", not "verified" for Gate 3 approval purposes — Gate 3 executable fields remain fail-closed (`approved: false`, `verifiedRateUsdPerSecond: null`, `budgetUsd: null`).
- **Region coexistence confirmed (GPU and Network Volume in same DC)**: **YES** — RTX 4000 Ada confirmed available in EU-RO-1 (live data), and the Network Volume was created in EU-RO-1.

## Resolved?

- `regionCompatibilityResolved`: **true** — datacenter/GPU co-location proven via live `dataCenterAvailability` data, and a real Network Volume now exists in that same datacenter (`EU-RO-1`).
- This resolution required exactly one additional dispatch (the third), under separate, explicit authorization scoped to this exact configuration (10 GB, `photo-restoration-gate3-models`, `EU-RO-1`, ≤$0.70/month). No fourth dispatch is authorized.
- **Gate 3 remains BLOCKED** despite this resolution — region compatibility was only one of several Gate 3 preconditions. Weights are not uploaded, and no separate Gate 3 approval statement has been given.

## Note

- Two earlier dispatches (`30674708510`, `30675847067`) created nothing and cost $0.00 — see `RUNPOD_GATE3_APPROVAL_PACKET.md` for full diagnosis (obsolete GraphQL contract, then a parser defect assuming a nonexistent storage-capability field).
- Missing/absent JSON fields must never be treated as `false`/negative evidence — this was the exact root cause of the second failed dispatch and must not recur in any future automation touching this data.
- Any future GPU/rate/volume/datacenter change invalidates this evidence and requires revalidation before Gate 3 can be reconsidered. Volume resize or deletion requires new, separate authorization. Weight upload requires new, separate authorization. Gate 3 requires a new, separate, explicit written approval statement. Gate 4 remains prohibited. Replicate remains production.
