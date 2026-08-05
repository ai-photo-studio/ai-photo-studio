# R9.2-P6C — Customer MVP Flow Protocol

Branch: `feat/r9.2-p6c-customer-mvp-flow`. Permanent, append-only protocol
document, matching the Protected Scope Protocol in
`docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md`.

## Historical-code finding (read before touching this flow again)

`restoration-draft.controller.ts`/`.service.ts`/`.routes.ts` and
`FixedOrderReviewPage.tsx` exist in this repository's Git history, but only
on the local, never-merged branch `setup/project-automation` (one commit,
`f47b6cf`, based on a pre-P4B point in `main`'s history). That
implementation's own `fixed-order.service.ts` conflicts with the tested one
already on `main` (from P6B). **It is superseded, not a piece of `main`
that went missing** — do not cherry-pick it. `OriginalPreviewPage.tsx` and
`DigitalTierSelectPage.tsx` never existed under those names anywhere.

## The live flow (what actually runs today)

1. `POST /api/restoration-drafts` (`RestorationUploadPage.tsx`, explicit
   button) — country + confirmation → server-derived market/currency
   (`market.ts`) → real decode/byte validation (`imageValidation.ts`) →
   upload → `RestorationDraft` row. Guest actors receive a raw guest
   ownership token (stored via the existing `lib/guest.ts`).
2. `GET /api/restoration-drafts/:id` (`OriginalPreviewPage.tsx`, GET-only
   on mount/refresh) — signed preview URL; storage key never returned.
3. `GET /api/restoration-drafts/:id/offers` (`DigitalTierSelectPage.tsx`,
   GET-only) — `ApprovedOfferProvider` pricing for the draft's market.
4. `POST /api/fixed-orders/restoration-digital` (P6B, explicit "Create
   order" button) — immutable `FixedOrder` + `FixedOrderItem`, exact
   PriceBook snapshot, idempotent via `sourceDraftId`.
5. `GET /api/fixed-orders/:orderNo` (`FixedOrderReviewPage.tsx`, GET-only)
   — server market/currency/tier/amount/PriceBook version; truthful
   "payment not yet available" message; no query parameter is ever read.

## Non-negotiable rules

- Every write in this flow (upload, order creation) happens only on an
  explicit button click — never on mount, poll, or refresh.
- The client can never supply price, currency, PriceBook version, pricing
  source, or approval state at any step — no request type has these
  fields.
- Ownership is enumeration-safe (identical 404 for wrong-owner vs.
  nonexistent) at every read, reusing `assertOwnership`/`actorFromRequest`
  unchanged.
- No MPGS checkout route may be added here while
  `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED` remains open.
- This flow must never create a `PaymentAttempt`, `PaymentEvent`,
  `RestorationEntitlement`, `RestorationMaster`, `ReplicateExecution`, or
  Sharp variant row. Those remain owned exclusively by the P4A verified-
  payment boundary, the P4B worker, and the P5B variant service,
  respectively.
- RunPod is not touched by this protocol and remains unauthorized for any
  change here.

Full evidence: `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` section 19.
