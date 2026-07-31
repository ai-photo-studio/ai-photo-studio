# RunPod GPU / Region Compatibility Checklist

## Purpose

Resolve GPU/Network-Volume region coexistence for the Gate 3 canary using read-only RunPod evidence only.

## Read-Only Authorization / Query Status

- Read-only RunPod authorization was provided for this task.
- Attempted credential availability check: `RUNPOD_API_KEY` is **NOT set** in the environment.
- No legitimately usable key was available from the environment; no key was extracted from git history or committed files (secret-safe).
- **Result: BLOCKED — read-only RunPod credential unavailable.**
- No GET/list queries were performed because authentication could not be established without a key.

## Selection Fields (left empty; not resolvable without credential)

- **Data center ID**: `________`
- **Selected GPU pool available (A4000 / A4500 / RTX 4000 / RTX 2000)**: `________`
- **Network Volume availability in the same data center**: `________`
- **Selected GPU pool per-second rate**: `________`
- **Region coexistence confirmed (GPU and Network Volume in same DC)**: `________`

## Resolved?

- `regionCompatibilityResolved`: **false** (could not be resolved; credential unavailable).

## Note

- A valid `RUNPOD_API_KEY` in the environment is required to run read-only `GET /v1/networkvolumes` and datacenter/GPU list queries. The key must be sent only as an Authorization bearer header, never printed or committed, and shell tracing must be disabled for authenticated commands.
