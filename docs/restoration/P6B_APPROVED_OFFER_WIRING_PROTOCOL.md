# R9.2-P6B — Approved-Offer Wiring Protocol

Branch: `feat/r9.2-p6b-approved-offer-wiring`. Permanent, append-only
protocol document, matching the Protected Scope Protocol in
`docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md`.

## What this wires

`POST /api/fixed-orders/restoration-digital` (body: `{ draftId, tier }`,
existing `restoration.routes.ts` router, no new router/mount):

1. Validates `tier` is one of `ORIGINAL`/`HD_2X`/`HD_4X`.
2. Loads the caller's own `RestorationDraft` via the existing
   `assertOwnership`/`actorFromRequest` helpers (uniform 404,
   enumeration-safe -- unchanged).
3. If a `FixedOrder` already sources this draft (`sourceDraftId` unique
   index), returns it unchanged -- idempotent, page-refresh-safe, real
   concurrency safe.
4. Otherwise resolves market/currency from the draft (never the request),
   prices the tier via `ApprovedOfferProvider` (`PB-2026-08-03-v1`), and
   creates exactly one `FixedOrder` + `FixedOrderItem` with the exact
   PriceBook snapshot and `pricingApproved: true` /
   `pricingSource: "approved_pricebook"`.

## Non-negotiable rules

- `ApprovedOfferProvider` is the only provider a production request can
  ever reach. `FixtureOfferProvider` exists only for tests that must prove
  a fixture-priced item is `pricingApproved: false` -- no controller ever
  constructs `FixedOrderService` with an override.
- The client supplies only `draftId` and `tier`. Amount, currency, PriceBook
  version, pricing source, and approval state have no corresponding request
  field -- they cannot be read, not merely "validated away."
- No automatic FX. USD entries in `PB-2026-08-03-v1` are independently
  owner-set, never derived from the PKR entries.
- Order creation stops before checkout/payment. This service must never
  create a `PaymentAttempt`, `PaymentEvent`, `RestorationEntitlement`,
  `RestorationMaster`, or `ReplicateExecution` row. Those remain owned
  exclusively by the existing P4A verified-payment transaction boundary.
- No MPGS checkout route may be added while
  `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` remains open.
- RunPod is not touched by this protocol and remains unauthorized for any
  change here.

## Known scope boundary

No customer-facing "review" UI exists in this repository to display this
endpoint's pricing -- the upload/draft-creation flow itself is also not yet
wired to any route. This is a pre-existing gap, not introduced or closed by
this packet. The endpoint's response already carries exact server
minor-unit pricing (`totalAmountMinor` as a string) for whenever such a UI
is built.

Full evidence: `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 18.
