# RunPod GPU / Region Compatibility Checklist (offline, no credentials used)

## Purpose

Manual checklist to resolve GPU/Network-Volume region coexistence for the Gate 3 canary. No RunPod credential is used and no resource is created. Fill in from read-only RunPod console/GET evidence only when separately authorized.

- **Data center ID**: `________`
- **Selected GPU pool available (A4000 / A4500 / RTX 4000 / RTX 2000)**: `________`
- **Network Volume availability in the same data center**: `________`
- **Selected GPU pool per-second rate**: `________`
- **Region coexistence confirmed (GPU and Network Volume in same DC)**: `________`

## Resolved?

- `regionCompatibilityResolved`: false (until the checklist is completed with verified evidence).

## Note

- Do not use RunPod credentials unless the user separately authorizes read-only RunPod queries (GET/list only; create/update/delete prohibited; no compute/storage charge; credentials redacted).
- Without that authorization, this checklist stays offline and `regionCompatibilityResolved` remains false.
