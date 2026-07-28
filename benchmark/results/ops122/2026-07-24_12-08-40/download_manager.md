# OPS-122: Download Manager

## Status: IMPLEMENTED

### Tier System

| Tier | Scale | State | Detail |
|------|-------|-------|--------|
| Original | Source | Purchased (default) | Always unlocked |
| 2X | 2× upscale | Upgrade Available | After Original |
| 4X | 4× upscale | Upgrade Available | After 2X |
| 6X | 6× upscale | Upgrade Available | After 4X |
| 8X | 8× upscale | Upgrade Available | After 6X |
| 12X | 12× upscale | Upgrade Available | After 8X |

### State Machine per Item

- **Locked** — Grayed out, disabled
- **Purchased** — Download button active, owned indicator
- **Upgrade Available** — "Buy" button shown for next available tier

### Master Image Constraint

All download tiers MUST be generated from the restored master image only. Never rerun Replicate. This is enforced by policy — the download endpoints consume the `finalStorageKey` which is the output of the initial pipeline execution.

### Frontend Implementation

Located in `RestoreOrderPage.tsx`:

- `DOWNLOAD_TIERS` constant defines the 6 tiers
- `purchasedTiers` state tracks which tiers the customer owns
- `getTierState()` resolves Locked/Purchased/Upgrade for each tier
- "Download" button shown for purchased tiers only
- "Buy" button shown for upgrade-available tiers
- Downloaded tiers can be re-downloaded unlimited times