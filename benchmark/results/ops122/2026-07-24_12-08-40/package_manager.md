# OPS-122: Package Selector

## Status: IMPLEMENTED

### Package Selection Flow (RestoreNewPage.tsx)

After upload, the customer is presented with available credit bundles from the API:

1. Upload photos (step: "upload")
2. Package selection (step: "package")
   - Shows all active packages from `/api/packages`
   - Displays package name, code, price, description
   - Customer selects one
3. Payment confirmation (step: "payment")
   - Shows selected package with price
   - Customer confirms payment
   - Redirects to order detail page

### Tier States per Download Tier

In `RestoreOrderPage.tsx`, each download tier shows one of three states:

| State | Visual | Action |
|-------|--------|--------|
| **Locked** | Grayed out, 50% opacity | "Unlock {tier}" disabled button |
| **Purchased** | Accent border, Owned pill | Download button enabled |
| **Upgrade Available** | Standard card | "Buy {tier}" button shown |

### State Resolution Logic

```
original → always purchased
2x       → purchased if owned, else upgrade (if original owned)
4x       → purchased if owned, else upgrade (if 2x owned)
6x       → purchased if owned, else upgrade (if 4x owned)
8x       → purchased if owned, else upgrade (if 6x owned)
12x      → purchased if owned, else upgrade (if 8x owned)
All else → locked
```