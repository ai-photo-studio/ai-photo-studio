# Phase R9.2 Restoration-First Payment Gate and Two Purchase Flows Plan

## Scope, Correction, and Non-Negotiable Boundaries

- This plan supersedes the R9.1 cart/general-commerce design where it conflicts with the restoration-first model. No general cart is required: an upload draft is temporary; customer selection becomes one fixed immutable order before payment.
- Product journey: **Upload/Original Preview (free) -> Fixed Purchase -> Pay -> Restore Once -> Derive -> Deliver/Download**.
- No Replicate or other paid AI provider call occurs before a Bank Alfalah payment event is verified by the server. Replicate is called exactly once for a first paid restoration. Its validated R2-persisted result is the permanent restored master.
- Every Original/2HD/4HD output and print derivative is generated from that restored master with Sharp. Ordinary upgrades, new download sizes, print sizes, re-downloads, and print preparation never invoke Replicate.
- The paid original order is immutable: no reopening/cart edit/repricing/product addition/currency change/second payment. Any later tier or print purchase is a separate add-on order linked to the completed restoration/master and paid separately.
- Order types are explicit: `RESTORATION_DIGITAL`, `RESTORATION_WITH_PRINT`, `DIGITAL_UPGRADE`, `PRINT_ADD_ON`. Each owns market, currency, fixed minor-unit price snapshot, lines, one payment attempt lifecycle, payment events, receipt, entitlement, and status history.
- Market is country-derived and customer-confirmed: `PAKISTAN` for country `PK`, charge/display `PKR`; `INTERNATIONAL` for every supported non-PK country, charge/display `USD`. IP may suggest only; it never determines the persisted market without confirmation.
- Market and currency are immutable after an order is placed. Changing country/market before checkout invalidates/rebuilds the cart and creates a new server quote. No browser FX conversion, no free currency switch, no client-calculated totals.
- Every money value is a server-generated integer in minor units. PKR and USD have separate server-owned price books. Discounts, tax, shipping, refunds, and reconciliations use the order’s locked market/currency.
- Bank Alfalah is the sole intended gateway. Its protocol has **no repository evidence**, so no Bank Alfalah URL, request field, signature format, callback mechanism, USD capability, settlement, refund, or 3DS behavior may be invented. Those are release blockers until bank documentation and sandbox credentials are supplied through approved secret management.
- Replicate remains the production restoration provider. Do not edit, stage, clean, or revert any RunPod provider, route, worker, image, digest, endpoint, config, workflow, Gate, packet, protocol, validator, or protected file.
- This is plan-only. `commerce.md` is absent; no attempt was made to create or edit it.

## 1. Exact Correction Matrix Against R9.1

| R9.1 proposal | R9.2 correction | Reason |
| --- | --- | --- |
| General `Cart`, `CartItem`, `Quote`, and re-quotable checkout | `RestorationDraft` is the only mutable pre-order object. It becomes an immutable `FixedOrder` before payment; no cart exists after order creation. | The required customer flow fixes the selected tier/print/delivery/amount before payment. |
| “Restore -> Upscale -> Print -> Pay” generic journey | Free upload/source preview, then one fixed paid order; restoration occurs only after payment; Sharp derives paid variants afterward. | Paid-provider spend cannot precede verified payment. |
| Commercial order may optionally reference restoration order | A first paid fixed order creates/owns one restoration entitlement and one restoration master. Add-ons require that completed master. | Enforces one paid provider call and avoids ambiguous cross-order state. |
| `Entitled -> RESTORATION_QUEUED` as generic state | Payment callback transaction grants entitlement and atomically creates an idempotent queue claim for the first restoration only. | Prevents duplicate provider dispatch on repeated callbacks/returns. |
| Print configuration as an initial generic cart choice | Flow B includes prepaid print in the first fixed order; later print is `PRINT_ADD_ON` with its own fixed order/payment. | Prohibits post-payment additions and supports prepaid fulfilment. |
| Price changes can affect new/repriced carts | Only drafts can be repriced. A `FixedOrder` is never repriced or edited. | Paid-order immutability. |
| Generic commerce aggregate proposed alongside legacy orders | A narrowly scoped `FixedOrder` aggregate directly links draft, payment, entitlement, master, variants, and fulfilment. | Minimum model aligned to the two mandated flows. |

## 2. Current Code Audit and Gaps

### Current restoration behavior

- `RestoreNewPage.tsx:57-59, 211-225` uses permanent demo payment mode and only navigates after “Approve Order”; it does not persist commercial selection/payment/entitlement.
- `RestoreOrderPage.tsx:85-98` auto-dispatches every `PENDING`/`QUEUED` item when the page loads.
- `restoration.controller.ts:236-240` permits processing while a restoration order is `PENDING` in demo mode.
- `restoration.service.ts:322-562` atomically claims an item for processing but does not require verified Bank Alfalah payment or an immutable commercial entitlement.
- Current payment service applies payment to legacy generic `Order`, credits wallet/subscription, and queues product-image work (`payment.service.ts:332-486`); it is not a safe restoration-first entitlement gate.

### Current master/variant behavior

- `SharpOutputValidator` validates provider output decode before persistence (`DefaultRestorationExecutionPorts.ts:29-53`).
- Current coordinator calls provider, validates output, builds `master`, `4hd`, and `2hd`, uploads all three to R2, then marks completion (`RestorationExecutionCoordinator.ts:58-136`). This is a useful ordering seam but does not yet enforce paid entitlement or one paid restoration per commercial order.
- The current master is the validated provider bytes and preserves provider content type (`DefaultRestorationExecutionPorts.ts:59-64`).
- Current `4hd` means JPEG width capped at 4096 without enlargement, quality 90 (`66-70`). Current `2hd` means JPEG resize width 2048, quality 90, and does **not** prevent enlargement (`72-76`). These are resolution limits, not demonstrated “2x/4x” scale factors.
- Existing product/UI claims such as `2HD`/`4HD` dimensions and print readiness are not a confirmed business contract. Tier semantic, max dimensions, maximum file size, output format, price relationship, and print suitability are owner decisions before launch.

### Canonical document status

`commerce.md` remains absent. Historical archive commerce/payment files are not canonical and conflict with source. When a canonical commerce/UI/status document is designated, update it after each passed implementation packet with the finalized fixed-order, one-call, Sharp, route, schema, and permission boundaries. Do not create duplicate canonical documents.

## 3. Flow A: Download Only Specification

1. Customer selects/confirm market/country; server derives `PAKISTAN/PKR` for Pakistan or `INTERNATIONAL/USD` for supported non-Pakistan country.
2. `POST /restoration-drafts` accepts original upload only. API validates declared type/size, decodes image metadata, stores original safely in R2, and returns an ownership-protected source preview. This does not call Replicate, Sharp paid-variant processing, or any paid AI.
3. Customer reviews original preview and chooses one digital tier: `ORIGINAL`, `2HD`, or `4HD`.
4. Server returns market-specific, server-owned tier offer(s). Client submits only tier identifier and draft/order id, never amount/currency.
5. `POST /fixed-orders/restoration` freezes a `RESTORATION_DIGITAL` order: market, currency, price-book version, minor-unit amount, one digital line item, ownership reference, draft/original link, and expiration/cancellation policy. It cannot be edited or receive a second payment.
6. `POST /fixed-orders/:orderNo/payment-attempt` creates the single permitted Bank Alfalah attempt and returns only approved gateway redirect/form data.
7. Verified server callback/event matches exact fixed order, provider reference, currency, minor amount, and allowed state. In one transaction, it marks payment verified, locks order, creates paid restoration/digital entitlements, and creates an idempotent first-restoration queue claim.
8. Worker claims only the payment-created restoration job, calls Replicate once, validates output, persists permanent restored master to R2, records provider request reference/hash/metadata, then creates the originally purchased Sharp variant if required.
9. Customer sees restored before/after, master/result status, and only the purchased download entitlement. Signed download is issued from the purchased `ImageVariant` after ownership check.
10. Failure: provider/validation/persistence failure does not re-dispatch automatically; it enters bounded retry/refund-review policy. A retry must reuse the same single restoration job identity and must not create a second paid entitlement or payment.

## 4. Flow B: Restoration Plus Prepaid Print Specification

1. Steps 1-3 of Flow A occur free through digital-tier selection.
2. Customer selects a market-available print SKU, quantity, address, and shipping method. Server validates SKU/options/quantity, destination/shipping availability, and all market/currency constraints. Prior to restoration, it may show source suitability warnings only; it must not claim actual restored print readiness.
3. `POST /fixed-orders/restoration-with-print` freezes one `RESTORATION_WITH_PRINT` order containing restoration service, chosen digital tier, print SKU/quantity, shipping line, address snapshot, market/currency, minor-unit totals, and full delivery price. Nothing may be added/repriced/changed after creation.
4. One payment attempt is created; only verified payment grants restoration, digital, and prepaid-print entitlements and queues the one Replicate job.
5. On permanent master validation, Sharp generates the purchased digital output and bounded print derivative(s). Print derivative metadata/crop/readiness is validated against the selected SKU. If a customer crop/approval policy is required, that policy must be defined before fulfillment release.
6. Print entitlement transitions from `WAITING_FOR_MASTER` to `PRINT_FILE_READY` to `FULFILMENT_READY` only after valid master/derivative exists. Fulfilment may then assign partner, print, dispatch, and track delivery. No new Replicate call occurs.
7. Paid digital download unlocks at the same time as its generated variant; print fulfilment progresses independently from delivery/download.

## 5. Add-On Upgrade and Printing Specification

### Digital upgrade

1. Customer accesses a completed owned restoration with a validated permanent master.
2. Customer selects an unowned `ORIGINAL`, `2HD`, or `4HD` tier. The server rejects a tier already entitled unless a defined duplicate-purchase policy exists.
3. Server creates `DIGITAL_UPGRADE` fixed order linked to original restoration/master and source original order, locks current market/currency only after country/market policy validation, and snapshots a server price. It has its own payment attempt/events/receipt/status/entitlement.
4. Verified payment creates one variant-generation job. It downloads master from R2, uses Sharp only, validates/persists/reuses a deterministic `ImageVariant`, then grants the new digital entitlement/download.
5. Unpaid/cancelled/failed add-on cannot generate, unlock, or expose a variant. It cannot trigger Replicate.

### Print add-on

1. Customer accesses a completed owned restoration/master and chooses a print SKU, address, shipping method, and quantity.
2. Server creates `PRINT_ADD_ON` fixed order linked to original restoration/master and snapshots the new market/currency price, shipping, and address. This is not an edit of the original paid order.
3. Verified payment creates/reuses a Sharp print derivative, then transitions the print entitlement to fulfilment readiness. No Replicate.
4. Reorder always creates a new add-on fixed order at current approved market price; historical original order is unchanged.

## 6. One-Call Replicate Enforcement Design

### Invariants

- One `RestorationMaster` exists per first-paid restoration entitlement and owns exactly one provider execution record.
- A unique database constraint enforces `RestorationMaster.firstPaidRestorationOrderId` and `ReplicateExecution.restorationMasterId`; one queue job uses a deterministic idempotency key derived from fixed-order/restoration entitlement identity.
- Only the verified-payment transaction may create `RestorationMaster(status=NOT_STARTED)` and its one `RestorationExecution(status=QUEUED)` record. Browser routes, admin actions, return URLs, payment retries, and add-on endpoints cannot create provider execution.
- Worker claims execution with compare-and-set (`QUEUED -> PROCESSING`) in a transaction. A repeated callback sees the same payment event/execution and returns idempotent success; no second queue insertion/provider call.
- On success, execution stores sanitized provider request/prediction reference, output hash/dimensions/content type, master R2 key, and completion time. On failure it stores bounded failure state, no auto-rerun.

### Existing seam changes required later

- Preserve the current Replicate execution boundary and validator/persistence ordering. Move tier-specific variant generation out of unconditional `RestorationExecutionCoordinator` so the first paid order produces only entitled derivative(s), and add-ons use a master-to-variant Sharp service.
- The new commercial worker invokes the unchanged Replicate executor only after it has claimed the single `ReplicateExecution`. It must never read `RESTORATION_PROVIDER=runpod` or alter provider routing.
- Existing `RestorationItem.status` atomic claim is insufficient alone because it is unrelated to payment/order identity; introduce fixed-order/master/execution guards rather than relying on metadata fields.

## 7. Sharp Variant Generation Design

### Tier audit and owner decisions

| Tier | Current code behavior | R9.2 required definition |
| --- | --- | --- |
| `ORIGINAL` | UI maps `original` to `master`; master is provider output bytes. | Define whether customer receives exact restored master or a normalized Sharp derivative. Recommended: exact validated master when its format/size meets delivery policy; otherwise document normalized derivative. |
| `2HD` | JPEG width 2048 at q90, may enlarge. | Owner must define named-package semantics, target/max dimensions, whether enlargement is allowed, format/quality, and price. Current code does not prove 2x scale. |
| `4HD` | JPEG max width 4096, no enlargement, q90. | Owner must define package semantics, target/max dimensions, format/quality, file cap, and price. Current code does not prove 4x scale. |
| Print | Static UI SKUs; no real print API. | Owner must define SKU target dimensions/DPI, crop/bleed/color profile/file format, maximum source shortfall, customer approval, and fulfilment acceptance. |

### Bounded service contract

- `MasterVariantService.generate({ restorationMasterId, variantSpecId, entitlementId })` reads only a validated master from R2 and only runs after the related entitlement is verified, except a first fixed order’s already-paid included variant.
- `VariantSpec` is server configuration tied to digital tier or print SKU. It specifies target dimensions, fit/crop policy, output format/quality, metadata policy, max output bytes, max pixels, and optional DPI metadata. No client-supplied Sharp options.
- Decode input with `sharp(..., { sequentialRead: true, limitInputPixels: <approved cap> })`; reject undecodable, animated/unapproved, excessive-pixel, and unsafe input. Exact production caps are owner/operations decisions, not inferred from current code.
- Apply `.rotate()`, explicit `resize` fit/position/enlargement rule, quality/format, metadata stripping/preservation policy, and output byte cap. For print use product-specific aspect/crop rule; never silently crop without the policy-required customer approval.
- Validate output with decode, width/height, content type/magic bytes, byte length, SHA-256, and specification conformance before R2 persistence.
- R2 key shape is deterministic and non-guessable by ownership context, e.g. `restorations/{masterId}/variants/{specVersion}/{hash-or-id}`; final naming convention must be documented. Persist source master key, output key, output hash, width, height, content type, variant spec version, generator version, and status.
- Uniqueness on `(restorationMasterId, variantSpecId, sourceMasterSha256)` plus a transactional generation claim ensures retry/callback/add-on concurrency reuses valid cached variants rather than re-running Sharp. Failed/partial output is never marked available.
- Master, derived download variants, and print production files have distinct retention/access paths. Only signed/authorized download URLs expose consumer variants; print keys never become public downloads by default.

## 8. Customer UI Route and Component Plan

| Route | Page/components | API dependency | Required states |
| --- | --- | --- | --- |
| `/market` | `MarketSelectionPage`, `CountryConfirmDialog` | markets/select-market | Suggested/confirmed/unsupported; PKR-only or USD-only context. |
| `/restore/new` | `RestorationUploadPage`, `UploadDropzone`, `UploadValidationSummary` | create draft/upload | Empty, validation, upload progress, source preview loading/error; no paid AI claim. |
| `/restore/drafts/:draftId/preview` | `OriginalPreviewPage`, accessible source dialog | draft detail | Clearly label **original uploaded image**; no restored/result wording. |
| `/restore/drafts/:draftId/select` | `DigitalTierSelector`, `ServerPriceCard`, `PrintChoiceEntry` | offers/fixed-order preflight | Original/2HD/4HD only from server, PKR/USD locked to confirmed market. |
| `/restore/drafts/:draftId/print` | `PrepaidPrintConfigurator`, `AddressForm`, `ShippingMethodSelector` | print catalog/shipping preview | Optional Flow B; unavailable SKU/rate/address errors; source-only suitability warning. |
| `/restore/drafts/:draftId/review` | `FixedOrderReviewPage`, `ServerOrderSummary`, `ImmutableOrderNotice` | create fixed order | Shows all locked lines/market/currency/total before payment. |
| `/orders/:orderNo/payment` | `BankAlfalahPaymentPage` | create/retrieve payment attempt | Redirect/form descriptor only; one-attempt policy displayed. |
| `/payments/:attemptId/{return,pending,success,failure,cancelled}` | `PaymentOutcomePage` | payment attempt state | Return is not success until server verifies; bounded polling; retry only under documented attempt policy. |
| `/orders/:orderNo/restoration` | `RestorationProcessingPage`, `OneCallStatusPanel` | fixed order/restoration status | Payment verified, queued, processing, master validated, result ready, failed/retry-review. |
| `/orders/:orderNo/result` | `RestoredResultPage`, `BeforeAfterCompare`, `MasterStatusCard`, `PurchasedDownloads` | order/result/entitlement | Distinguish restored result, master (not necessarily downloadable), purchased variant, print derivative. |
| `/restorations/:masterId/upgrade` | `DigitalUpgradePage`, `ServerPriceCard` | add-on offers/create | Only completed owned master; excludes already entitled tiers; creates separate `DIGITAL_UPGRADE`. |
| `/restorations/:masterId/print` | `PrintAddOnPage`, address/shipping summary | add-on print offers/create | Separate `PRINT_ADD_ON`; no mutation of source order. |
| `/orders/:orderNo/downloads` | `DownloadsPage`, `DownloadEntitlementCard` | signed entitlement download | Locked/generating/available/downloaded/expired-link recovery. |
| `/orders/:orderNo/tracking` | `PrintTrackingPage`, `FulfilmentTimeline` | shipment/tracking | Prepaid waiting-for-master, production, dispatched, in transit, delivered, exception. |

Mobile behavior for all commerce states: full-width primary actions; sticky server-total/payment CTA only before fixed order creation; no horizontal tables; tier/SKU cards stack; accessible focus dialogs; test 360, 390, 430, 768, 1024, 1440 px. The UI must never label original preview as restored result or print derivative.

## 9. Admin UI Module Plan

| Module | Route | Required fields/actions | Roles |
| --- | --- | --- | --- |
| Fixed restoration orders | `/admin/restoration-orders`, `/:orderNo` | Order type, market/currency, locked totals, line snapshots, payment/entitlement/state history, original source, immutable flag | SUPER_ADMIN, OPERATIONS; FINANCE read |
| Replicate one-call queue | `/admin/restoration-executions`, `/:id` | One-call status, execution idempotency key, provider request ref, attempt count, explicit `replicateAlreadyCalled`, master link; bounded retry/refund-review only | SUPER_ADMIN, OPERATIONS, RESTORATION_REVIEWER read |
| Master validation | `/admin/restoration-masters`, `/:id` | R2 key, hash, dimensions, content type, validation result, source execution, generated variants | SUPER_ADMIN, OPERATIONS, RESTORATION_REVIEWER |
| Sharp variants | `/admin/image-variants`, `/:id` | Master/order/entitlement/spec/hash/dimensions/key/status/reuse count; regenerate only through state guard | SUPER_ADMIN, OPERATIONS; FULFILMENT print-read |
| Digital entitlements | `/admin/digital-entitlements` | Order/master/tier/availability/download events; revoke only policy-defined, auditable path | SUPER_ADMIN, OPERATIONS, CUSTOMER_SUPPORT read |
| Prepaid print/add-ons | `/admin/print-orders`, `/:orderNo` | Original order/add-on link, SKU/qty/address snapshot, print entitlement, derivative, fulfilment/shipment | SUPER_ADMIN, OPERATIONS, FULFILMENT |
| Payments/events | `/admin/payments`, `/:attemptId`; `/admin/payment-events` | Bank event verification result, amount/currency/order match, duplicate flag, receipt status; no secret/raw sensitive payload | SUPER_ADMIN, FINANCE |
| Failed payment/callback | `/admin/payment-exceptions` | Invalid signature/mismatch/duplicate/pending/expiry diagnostics; no manual paid override absent policy | SUPER_ADMIN, FINANCE |
| Fulfilment/tracking | `/admin/fulfilment`, `/admin/shipments` | print-ready status, partner, production, dispatch, tracking, delivery exception | SUPER_ADMIN, OPERATIONS, FULFILMENT |
| Refunds/reports | `/admin/refunds`, `/admin/reports` | original currency, refund cap, payment/master/fulfilment constraints, PKR/USD separated reports | SUPER_ADMIN, FINANCE; CUSTOMER_SUPPORT request-only |
| Product/price | `/admin/catalog`, `/admin/price-books` | market price books, tier/SKU specs, effective dates; no post-payment alteration of order snapshots | SUPER_ADMIN; FINANCE read/propose |
| Audit | `/admin/audit-logs` | actor, permission, order/master/payment/callback correlation, before/after state redaction | SUPER_ADMIN, FINANCE scoped read |

Every administrative action is server permission-checked and state-checked, returns 403 for unauthorized role, and writes an append-only audit event. Display of `replicateAlreadyCalled`, provider reference, master R2 key, variants, original order, linked add-ons, payment evidence, and fulfilment status is mandatory in the relevant detail views.

## 10. Minimum Schema and API Plan

### Minimum safe model

- `RestorationDraft`: owner (user/customer or guest token hash), market/country/currency selection, original R2 key/hash/metadata, source-preview key, state `UPLOADED|PREVIEW_READY|ORDER_SELECTION|EXPIRED|CANCELLED`; no commercial amount or provider job.
- `FixedOrder`: `orderNo`, `type`, owner, market, currency, price-book/version snapshot, total minor amounts, immutable-at/payment-lock timestamp, source draft, optional original restoration order and master relation, state history. Exactly one initial payment lifecycle by unique relation/constraint.
- `FixedOrderItem`: immutable item snapshots for restoration service, digital tier, print SKU/quantity, shipping, discount/tax lines, each amount in minor units.
- `PaymentAttempt`: one active/terminal Bank Alfalah transaction lifecycle per fixed order under policy, exact amount/currency, provider ref, merchant alias, idempotency key, return/cancel correlation, timestamps.
- `PaymentEvent`: append-only provider callback/return evidence with unique provider event id or dedupe hash; signature/match result and redacted payload. Only verified event can transition paid state.
- `RestorationEntitlement`: paid first-restoration authorization linked to the original fixed order and draft; owns the one master/execution relation.
- `RestorationMaster`: permanent R2 master key/hash/dimensions/content type/status; unique original restoration entitlement/order relation.
- `ReplicateExecution`: one-to-one master relation; deterministic queue key, provider request reference, status/timestamps/failure/retry policy evidence.
- `ImageVariant`: master/spec/source hash/Sharp output metadata/R2 key/status; unique cache identity.
- `DigitalEntitlement`: fixed order item/master/tier/variant/status/download audit events.
- `PrintEntitlement`: fixed order item/master/print SKU/variant/status/fulfilment relation.
- `AddOnOrderLink`: add-on fixed order -> original fixed restoration order/master; constrained to `DIGITAL_UPGRADE|PRINT_ADD_ON` and completed master.
- `FulfilmentOrder`, `Shipment`, `TrackingEvent`: prepaid print only; all transitions and partner data auditable.
- `AuditEvent`: correlation IDs for fixed order/payment/master/execution/variant/fulfilment plus actor/action/state data. Preserve legacy `AuditLog`/`AdminAuditLog` through a read adapter or migration plan.

Keep legacy `Order`, `Payment`, `Package`, `RestorationOrder`, and `RestorationItem` readable during migration. Do not infer/backfill a market, currency, tier, or paid entitlement from old metadata. Add new tables/nullable relations first, feature-flag new flow, and migrate only known records.

### API surface

- `POST /api/restoration-drafts`, `GET /api/restoration-drafts/:id`, `POST /api/restoration-drafts/:id/preview`.
- `GET /api/restoration-drafts/:id/offers`, `POST /api/fixed-orders/restoration-digital`, `POST /api/fixed-orders/restoration-with-print`.
- `GET /api/fixed-orders/:orderNo`, `POST /api/fixed-orders/:orderNo/payment-attempt`; all post-lock order PATCH/add-line/reprice endpoints return conflict.
- `POST /api/payments/bank-alfalah/callback`, `GET /api/payment-attempts/:id`; bank callback operates on preserved raw body only after documented signature rules are available.
- Internal queue endpoint/service only: `queueFirstPaidRestoration(orderId)`; not customer/admin-routable. It validates verified payment + fixed first-restoration entitlement + unique execution claim.
- `GET /api/fixed-orders/:orderNo/restoration-status`, `GET /api/restoration-masters/:id/result`, `POST /api/digital-entitlements/:id/download`.
- `POST /api/restoration-masters/:id/digital-upgrades`, `POST /api/restoration-masters/:id/print-add-ons`, each returns new fixed order/payment attempt only.
- Internal variant service queue: `generateEntitledVariant(entitlementId)`; not a direct public arbitrary-size API.
- `GET /api/fixed-orders/:orderNo/tracking` and protected fulfilment/admin endpoints.

## 11. State Machines, Actors, Guards, Failure, and Rollback

| Machine | Transitions | Actor/source | Guard/idempotency/failure/rollback |
| --- | --- | --- | --- |
| Upload draft | `UPLOADED -> PREVIEW_READY -> ORDER_SELECTION` | Customer upload/API | Ownership, type/size/decode/R2 validation; no paid AI. Retry upload creates/updates draft safely. Expire/cancel deletes access, not paid data. |
| Fixed order | `CREATED -> PAYMENT_PENDING -> PAYMENT_VERIFIED -> LOCKED` | Server creates; gateway verified event locks | Snapshot immutable from creation; only one permitted attempt lifecycle; payment event transaction. Return URL/manual/admin UI cannot verify payment. Cancel/expiry stays unlocked only if policy says no payment received; never edit a paid order. |
| Restoration | `NOT_STARTED -> QUEUED_AFTER_PAYMENT -> PROCESSING -> MASTER_VALIDATED -> RESULT_READY` or `FAILED` | Verified-payment service then worker | Unique entitlement/master/execution and compare-and-set worker claim. Validation/R2 persistence before master valid. Failed execution has bounded retry/refund-review, not automatic duplicate provider dispatch. |
| Digital entitlement | `LOCKED -> GENERATING_FROM_MASTER -> AVAILABLE -> DOWNLOADED` or `LOCKED -> AVAILABLE -> DOWNLOADED` | Variant worker/download service | First order included tier can be generated after master validation; add-on only after its verified payment. Unique variant cache claim; download event is non-exclusive/auditable. |
| Print entitlement | `PREPAID -> WAITING_FOR_MASTER -> PRINT_FILE_READY -> FULFILMENT_READY -> IN_PRODUCTION -> DISPATCHED -> IN_TRANSIT -> DELIVERED` | Payment/master/Sharp/fulfilment roles | Verified first/print-add-on payment required; valid master/print derivative required; partner actions role/state-checked; delivery failures enter exception/support policy. |
| Add-on order | `CREATED_FROM_COMPLETED_RESTORATION -> PAYMENT_PENDING -> PAYMENT_VERIFIED -> GENERATING_FROM_MASTER -> AVAILABLE_OR_FULFILMENT_READY` | Customer/server/gateway/worker | Master must be completed and owned; creates new order/payment only; no Replicate route exists. Failure leaves entitlement locked; refund policy applies. |

## 12. Implementation Packets, Acceptance Tests, and Rollback

1. **R9.2-P0: Fixed-order model, one-call data guards, truthful lint/test harness**
   - Add draft/fixed-order/payment-event/master/execution/variant/entitlement schema and feature flag; replace masked lint setup with real config; establish unit/API/browser harness.
   - Acceptance: migrations preserve legacy reads; fixed paid order rejects mutation/second payment; money/market validation; unique master/execution constraints; lint is truthful.
   - Rollback: disable new-flow flag, retain additive tables/migrations and audit records; no destructive migration rollback.

2. **R9.2-P1: Free upload/source preview and fixed first-purchase creation**
   - Implement draft upload/original preview/server offers/immutable `RESTORATION_DIGITAL` and `RESTORATION_WITH_PRINT` order creation. Do not dispatch Replicate.
   - Acceptance: upload has zero provider calls; client cannot alter tier/amount/currency; PKR/USD market isolation; post-create order edits/reprice/add line rejected.
   - Rollback: disable new routes/CTA, preserve drafts/orders as read-only.

3. **R9.2-P2: Bank Alfalah sandbox payment gate and idempotent paid transition**
   - Only after bank evidence is provided, implement provider adapter, raw callback verification, attempt/events, verified settlement, receipt, one-time restoration queue claim. Sandbox only.
   - Acceptance: no Replicate before verified payment; invalid signature/mismatch rejected; duplicate callback produces exactly one order lock/entitlement/execution/receipt; browser return cannot mark paid.
   - Rollback: disable gateway feature flag; pending orders remain unpaid/locked from processing; no fake success fallback.

4. **R9.2-P3: Replicate-once master and Sharp variant pipeline**
   - Bind existing validated Replicate boundary to unique paid execution; persist permanent master then paid first-order variant; build master-to-variant service for tiers/print/add-ons.
   - Acceptance: one paid restoration produces at most one Replicate execution; provider failure cannot produce master/variant/fulfilment; upgrades/print call Sharp only; cached valid variants are reused.
   - Rollback: pause new worker/variant queues, retain valid master/outputs; no provider routing changes.

5. **R9.2-P4: Customer Flow A/Flow B and add-on UI**
   - Implement all customer routes/components, payment outcomes, result/download/upgrade/print/tracking states.
   - Acceptance: original preview clearly distinct from restored result; paid-download gating; unpaid add-on blocked; mobile/browser/a11y tests at all required widths.
   - Rollback: hide new customer flow under flag; preserve fixed order/history and prevent bypass to demo processing.

6. **R9.2-P5: Admin one-call, entitlement, payment, and fulfilment operations**
   - Implement modules in section 9 with expanded RBAC/action auditing.
   - Acceptance: admin sees master/execution/variant/add-on/payment/fulfilment linkage; unauthorized actions 403; bounded retries only; finance/report separation by PKR/USD.
   - Rollback: permission/feature-flag disable new modules while retaining immutable evidence.

7. **R9.2-P6: Print/fulfilment, refunds, reconciliation, and controlled activation**
   - Implement partner/shipment/refund/reconciliation after business/bank confirmation; sandbox/staging checks and production activation runbook.
   - Acceptance: prepaid print waits for valid master; refunds use original currency/cap; no live automated payments; controlled rollback drill passes.
   - Rollback: stop new checkout/fulfilment release while preserving paid entitlements and reconciling pending cases manually.

Each packet follows **repair -> test -> repair -> test** until all relevant tests pass and no regression remains. After passing, update the designated canonical commerce/UI/status documents and record finalized routes, API/state/schema/permission boundaries and protected scope protocol.

## 13. Required Test Matrix

- No Replicate call before verified payment.
- A first paid restoration creates at most one Replicate execution, including concurrent callback/worker conditions.
- Duplicate payment callback cannot create another Replicate job, Sharp job, entitlement, download, print fulfilment, or receipt.
- Original/2HD/4HD offers/prices are server-owned; client tier/amount/currency/payment status values are ignored/rejected.
- Pakistan pays PKR only; International pays USD only; payment currency equals fixed-order currency.
- Paid original order rejects edit/reprice/product addition/currency change/second payment.
- Upgrade and print purchases create a separate linked add-on order; unpaid add-on cannot generate/unlock output.
- Upgrade/print generation calls Sharp and never provider executor; valid cached variant reuse works.
- Prepaid print fulfilment waits for a validated master and valid print derivative.
- Master/output hash/dimensions/content type/R2 persistence validation failures fail closed.
- Unauthorized admin actions return 403; all allowed sensitive actions create audit event.
- Component/browser checks cover empty/loading/error/return/pending/cancelled/failed states and 360, 390, 430, 768, 1024, 1440 px.

## 14. Bank Alfalah Documentation Blockers

No repository evidence establishes Bank Alfalah protocol or USD support. Obtain and approve:

1. PKR and USD merchant enrollment/profile, allowed countries/card types, settlement currencies/timing, limits, and sandbox/production activation.
2. Approved hosted redirect/form/API integration method and PCI obligations.
3. Exact endpoints, request/response fields, amount minor-unit/precision, reference rules, signing/HMAC/encryption/canonicalization/encoding, certificates/keys/rotation.
4. Return/cancel/callback/IPN mechanism, raw body requirements, event ID, retries, acknowledgement, network allowlist/certificate requirements, callback order and finality.
5. 3DS/authorization/capture semantics and complete status mapping.
6. Full/partial refund, dispute/chargeback, settlement/reporting/reconciliation APIs and constraints.
7. Sandbox credentials/test cards and explicit approval before any production activation.

Until then Bank Alfalah is feature-disabled and no live payment occurs. Manual screenshots, localStorage, query strings, return routes, or manual status actions are never accepted as payment proof.

## 15. Exact Frozen Files

- `rules.md`
- `apps/api/src/runpod/**`
- `apps/api/src/restoration-providers/runpod/**`
- `apps/api/runpod-worker*/**`
- `runpod-worker-dev/**`
- `docs/restoration/RUNPOD_*.md`
- `docs/restoration/runpod-*.json`
- `docs/restoration/runpod-*.test.ts`
- Every RunPod provider/route/worker/image/digest/endpoint/config/workflow/Gate/packet/protocol/validator and all associated protected files
- `.env*`, merchant credentials/certificates/webhook secrets, deployment secrets, and any secret-bearing infrastructure configuration
- Pre-existing dirty files are never cleaned, reverted, staged, or modified in these packets.

## 16. Completion Percentages (Historical Baseline — Superseded)

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 75% | 25% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 33% | 67% |
| Admin operations/RBAC | 25% | 75% |
| Test/browser/deployment readiness | 65% | 35% |
| **Overall R9.2 launch readiness** | **46%** | **54%** |

> Historical baseline retained for audit chronology. Superseded by the authoritative current table in the latest reconciliation record below; this table is not silently rewritten.

## R9.2-P2R Unblocked Work Sequencing — 2026-08-03

Classification: **PLAN ONLY**. Bank Alfalah and P2A1 remain frozen. No payment verification, provider call, master, execution, entitlement, variant, print, shipment, schema, or application change is authorized by this packet.

### Holds

- Bank Alfalah remains frozen pending merchant/sandbox activation, authenticated protocol and credentials, Return/IPN registration and allowlisting, test cases, and confirmed USD processing/settlement. `BankAlfalahAdapter` remains `ready:false`.
- P2A1 remains frozen because the repository has no authoritative persisted server-verified payment state. `PAYMENT_VERIFIED`, `PAID`, and `PaymentEvent.verified` are schema vocabulary/test fixtures only until a real verification packet exists; they are not evidence.
- Overall remains **46% complete / 54% remaining**.

### Candidate readiness matrix

| Candidate | Status | Exact dependency | Schema impact | Likely files | Required tests | Protected files affected | Ranking reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Permanent-master validation/persistence foundation | BLOCKED | Requires a verified payment/entitlement boundary and authoritative master ownership; local artifacts cannot represent a paid production master | Likely additive master/storage provenance fields | `restoration.service.ts`, execution coordinator, master persistence tests, likely schema/migration | validation, persistence, idempotency, authorization, no-provider tests | `restoration.service.ts`, Replicate boundary, master schema | Unsafe before payment/entitlement authority; would risk fake or detached master records |
| B. Upload/source-preview persistence hardening | BLOCKED for this packet | Existing upload/draft/preview path is already implemented; meaningful hardening requires a scoped security finding and may touch protected upload/storage behavior | Possibly additive metadata only, not justified by current evidence | `restoration-draft.service.ts`, image validation, storage service, upload controllers/tests | ownership, MIME/decode, size, retention, signed URL, cleanup tests | upload/storage controllers and services | Valuable but not the smallest unambiguous next packet without a concrete defect specification |
| C. Sharp derivative foundation | BLOCKED | Requires a real validated persistent master; existing Sharp builder is coupled to execution output and creating a standalone master would invent upstream state | Likely variant/master linkage | Sharp variant builder, storage, variant schema/tests | fixture decode, dimensions, derivative integrity, idempotency | Sharp/print and master persistence boundaries | Depends on master/payment execution semantics; unsafe to create detached variants |
| D. Non-payment customer/admin UI | READY | Existing read-only fixed-order, payment-readiness, and payment-attempt APIs; no verified payment or provider dependency | None | existing `apps/web/src/pages/FixedOrderReviewPage.tsx`, customer API/types, admin payment/order views, focused browser tests | blocked-payment display, PKR/USD formatting, readiness reasons, attempt status, untrusted return/pending state, responsive/accessibility/network-safety | No protected backend/provider files; frontend UI only | Smallest safe value: truthful visibility of existing states without changing payment or restoration behavior |
| E. Other safer packet | BLOCKED | No additional candidate with a clearer independent boundary was found in inspected source | Unknown | Unknown | Unknown | Unknown | Introducing a new boundary without explicit contract would expand scope |

### Selected next packet: R9.2-P2R-UI

Implement non-payment customer/admin UI only. Display immutable FixedOrder market/currency/amount snapshots, payment-readiness reasons, existing PaymentAttempt state, and explicit provider-unavailable/pending states. Browser-return data must remain non-authoritative; no UI action may mark payment verified or trigger restoration. Do not add a Bank Alfalah URL, callback, status verifier, entitlement, master, execution, variant, print, shipment, or external call.

Acceptance tests:

1. Approved PriceBook order data renders the persisted market, currency, tier, and minor-unit display without recomputation.
2. Existing fixture/unapproved orders visibly remain payment-blocked with truthful reasons.
3. Bank Alfalah unavailable state remains explicit; no checkout is presented as available.
4. Browser return/query/frontend state renders pending correlation only and never paid/restoration-ready.
5. Existing PaymentAttempt statuses render without changing server state.
6. Customer ownership and admin authorization remain enforced through existing APIs.
7. PKR and USD formatting is display-only and does not perform FX conversion.
8. Responsive, accessibility, and network-safety browser tests pass with zero external/provider calls.

Exact low-token implementation prompt:

```text
R9.2-P2R-UI, Agent mode. Implement only non-payment customer/admin UI for existing FixedOrder, payment-readiness, and PaymentAttempt read APIs. Preserve server authority: no payment verification, Bank Alfalah changes, callback/status route, entitlement/master/execution/variant/print/shipment creation, provider/network calls, schema/migration, or restoration.service.ts changes. Show persisted PKR/USD market/currency/amount, fixture-blocked reasons, provider-unavailable state, attempt status, and browser-return pending correlation. Add focused responsive/accessibility/network-safety tests. Do not invent payment state. Run focused tests, existing browser tests, lint, typecheck, build, and Git diff checks. Stage only UI files/tests and the canonical plan.
```

Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**. Schema/concurrency/storage work remains deferred and would require Terra Agent High after its dependencies are authorized.

### Protected Scope Protocol

This sequencing record changes no source. Future P2R-UI work must not modify `rules.md`, PriceBook/P1C-B invariants, Bank Alfalah files/config/URLs, payment verification, `restoration.service.ts`, Replicate routing, RunPod, Sharp/print code, schema/migrations, production database, deployment, or unrelated dirty files. Replicate remains production; RunPod remains unauthorized.

### Exact current 13-stage table

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 75% | 25% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 33% | 67% |
| Admin operations/RBAC | 25% | 75% |
| Test/browser/deployment readiness | 65% | 35% |
| **Overall R9.2 launch readiness** | **46%** | **54%** |

(Updated 2026-08-03 after R9.2-P1C-B; see "R9.2-P1C-B Completion Record" at the end of this document. A real, owner-approved, versioned PriceBook now prices both markets -- PKR and, for the first time, USD -- with immutable per-order snapshots, fail-closed effective-window/approval validation, and no automatic FX. Bank Alfalah remains permanently not-ready (unchanged); no checkout, callback, entitlement, Replicate, Sharp, print, or admin-UI work was done.)

(Updated 2026-08-02 after R9.2-P1B; see "R9.2-P1B Completion Record" at the end of this document. Payment readiness -> idempotent PaymentAttempt lifecycle -> evidence-ready Bank Alfalah adapter shell is now implemented, but the adapter itself remains permanently not-ready in production -- no verified Bank Alfalah technical evidence exists anywhere in the repository. No live payment, callback, entitlement, Replicate, Sharp, print, or admin-UI work was done.)

(Updated 2026-08-02 after R9.2-P1A; see "R9.2-P1A Completion Record" at the end of this document. The full free-upload -> preview -> tier-select -> immutable fixed-order-review customer flow is now implemented end to end, stopping before payment, with a PKR-only local-fixture offer provider (USD recorded as an owner-approval blocker) -- no payment, Replicate, Sharp, print, or admin-UI work was done.)

## R9.2-P1C-C2 APG URL Contract And Evidence Extraction — 2026-08-03

Classification: **PARTIAL / BLOCKED_MISSING_EVIDENCE**. Plan/documentation only. `BankAlfalahAdapter` remains `ready:false`; no payment, route, schema, credential, migration, provider, or Replicate call was added.

### Proposed ThanNow URLs

- Proposed APG Return URL: `https://api.thannow.com/api/payments/bank-alfalah/return`
- Proposed APG listener/IPN URL: `https://api.thannow.com/api/payments/bank-alfalah/ipn`
- Proposed frontend outcome page: `https://thannow.com/payment/return`
- These are design proposals only. The guide requires merchant-portal configuration and does not confirm that these URLs are registered, allowlisted, reachable, or accepted for this merchant.
- Current inspected API routing has payment-attempt routes only; no Bank Alfalah return or listener/IPN route exists. The frontend outcome page is not confirmed by current routing. No DNS/deployment change was made.

### Exact guide evidence

- **Return URL definition and configuration:** PDF page 7, `Initiate HandshakeRequest URL`, defines `HS_ReturnURL` as the merchant URL to which the customer is redirected after payment success/failure. PDF page 11 repeats `ReturnURL` for transaction requests. PDF page 22 defines `HS_ReturnURL` for card redirection as the public URL receiving the authentication token; PDF page 24 defines `ReturnURL` as the URL receiving the customer after payment success/failure.
- **Return HTTP method:** PDF page 23 states APG sends `auth_token` to `HS_ReturnURL` as a **GET** parameter. For the final customer return, PDF page 26 says the customer is redirected back to the merchant Return URL/website; it does not specify a separate HTTP method for that final redirect beyond the browser redirect.
- **Listener/IPN configuration:** PDF pages 26-27 instruct the merchant to create a listener URL and configure it under `Merchant portal > Login > GoLive > Access Sandbox > Credentials Generator > Listener URL`.
- **Listener HTTP method and encoding:** PDF page 27 explicitly states APG makes a **POST** call to the listener URL with a `url` parameter. The guide shows the parameter in the query string and does not specify a request body content type or an encoding rule beyond that example.
- **Callback/IPN field:** The documented listener notification contains the `url` parameter whose value is an APG `OrderStatus` URL. The guide does not document a signed callback payload, callback event ID, acknowledgement body/status, or retry policy.
- **Required acknowledgement:** **MISSING.** The guide says the merchant must issue a GET to the URL supplied in `url`; it does not state the required listener HTTP response status/body or acknowledgement semantics.
- **Retry behavior:** **MISSING.** No APG retry/backoff/duplicate-notification behavior is specified.
- **URL referrer rule:** PDF page 5 requires HTTPS and says the URL Referrer should be the same as the Return URL configured in the merchant portal. It does not define exact header validation behavior, proxy handling, or whether this applies identically to listener URLs.
- **IP allowlisting:** PDF page 28 states the configured IPN URL must be provided to the APG business owner for Bank Alfalah network whitelisting before transaction statuses can be received. Exact source IP ranges and certificate requirements are **MISSING**.
- **OrderStatus endpoint and method:** PDF page 26 documents sandbox `https://sandbox.bankalfalah.com/HS/api/IPN/OrderStatus/{MerchantId}/{StoreId}/{OrderId}` and production `https://payments.bankalfalah.com/HS/api/IPN/OrderStatus/{MerchantId}/{StoreId}/{OrderId}`; it explicitly says the merchant initiates a **GET**. This endpoint is APG’s status inquiry, not the merchant listener.
- **Full URL versus origin:** The guide’s fields and portal screenshots require a Return URL and Listener URL, and its examples show full URLs. It does not authorize configuring only an origin; use of a full path is the documented form, subject to merchant-portal acceptance.
- **Separate sandbox/production URLs:** The guide provides separate sandbox and production APG endpoints on pages 7, 10, 15, 21, 23, and 26. It does not explicitly state whether ThanNow must use distinct merchant Return/Listener URLs per environment; this requires bank confirmation. Separate environment-specific URLs remain the safer proposal.

### Confirmed versus missing behavior

- Confirmed from guide: browser return is correlation input; `O` order ID is returned on the Return URL; merchant then performs server-side GET status inquiry; listener is configured separately; APG listener notification is POST with `url`; OrderStatus is a distinct merchant-initiated GET; IPN URL requires Bank Alfalah allowlisting.
- Missing from guide: listener acknowledgement, retries, callback authentication/signature, event identity/idempotency, exact error/status catalogue, timeout/expiry, refund/cancel contract, USD capability, merchant-specific identifiers, credentials, activation, and exact environment URL registration.
- The guide’s REST transaction section on PDF page 11 states the currency value used will always be `PKR`; no USD capability is established for ThanNow. The card redirection section lists currency as a string but does not prove USD support.

### Bank questions before P1C-C implementation

1. Confirm whether the three proposed ThanNow URLs are accepted and registered for sandbox, and whether production requires separate paths.
2. Confirm whether Return URL final redirect is GET, including exact query/path fields and encoding.
3. Define listener acknowledgement HTTP status/body, timeout, retry/backoff, and duplicate-notification behavior.
4. Confirm whether the listener POST or OrderStatus response has authentication/signature, source validation, or certificate requirements.
5. Provide exact callback/status error and transaction-state catalogue, including terminal/final states.
6. Confirm OrderStatus URL construction, URL encoding, timeout, rate limits, and idempotent inquiry rules.
7. Confirm whether the guide’s PKR-only REST restriction applies to card redirection and whether ThanNow’s USD PriceBook is supported.
8. Supply ThanNow sandbox merchant/store identifiers, activation confirmation, allowlist confirmation, test cases, and technical contact.

### Fail-closed and protected scope

- Browser Return URL never marks payment paid. Listener notification alone never marks payment paid. Only authenticated server verification through the documented OrderStatus flow may transition payment state after exact order/reference/amount/currency validation and replay-safe deduplication.
- No Replicate, entitlement, fulfilment, or downstream processing occurs inside callback/listener handling; processing begins only after committed verified payment.
- Protected Scope Protocol: only this canonical plan was edited and re-staged. `rules.md`, P1C-B source/tests/migration, Bank Alfalah adapter/payment services, schema/migrations, env/config/secrets, restoration/Replicate/RunPod, Sharp/print, production database, deployment, and unrelated dirty files remain unchanged.

### Current completion table

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 75% | 25% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 33% | 67% |
| Admin operations/RBAC | 25% | 75% |
| Test/browser/deployment readiness | 65% | 35% |
| **Overall R9.2 launch readiness** | **46%** | **54%** |

(Updated 2026-08-02 after R9.2-P0C2; see "R9.2-P0C2 Completion Record" at the end of this document. A small Playwright browser-test foundation (28 passing tests: smoke, responsive matrix, network safety) was added for the currently-implemented web app, with two small, behavior-preserving UI fixes discovered while making the suite genuinely testable -- no commerce UI, payment, admin redesign, Replicate dispatch, Sharp, printing, shipping, or deployment work was done.)

(Updated 2026-08-02 after R9.2-P0C1B; see "R9.2-P0C1B Completion Record" at the end of this document for the verified evidence behind the latest delta. Earlier rows are carried forward unchanged from their own records above. P0C1B applied the owner-authorized four-line idempotency amendment to `20260729000100_add_guest_ownership_token_hash`, proving a clean from-empty deploy on one disposable database and an inert already-applied path on a second -- no payment, UI, provider dispatch, or fulfilment code changed.)

## 17. Recommended First Implementation Packet and Model

Start with **R9.2-P0: Fixed-order model, one-call data guards, and truthful lint/test harness** using **Codex GPT-5.6 Terra with high reasoning effort**, followed by an independent data/security review. It creates the immutable payment/entitlement/master invariants before any gateway or UI can spend provider cost.

---

# R9.2-P1C-A: PriceBook and Bank Alfalah Enablement Plan

## Classification and Preflight

**COMPLETE for planning. BLOCKED for implementation.**

The owner-approved PriceBook and authenticated official Bank Alfalah technical protocol are both absent. The next allowed implementation is P1C-B only after owner-approved PKR/USD prices are supplied. P1C-C and P1C-D remain blocked until authenticated official Bank Alfalah technical material is accepted.

Preflight recorded on branch `fix/runpod-output-sha256-contract` at `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce`:

- Existing dirty state is pre-existing and remains untouched: `apps/api/package.json`, `apps/api/src/config/env.ts`, `apps/api/src/services/restoration.service.ts`, `docs/restoration/RUNPOD_GATE3_APPROVAL_PACKET.md`, `docs/restoration/runpod-gate3-readiness.json`, `docs/restoration/runpod-gate3-readiness.test.ts`, `rules.md`, plus listed untracked RunPod/pipeline/planning/document files.
- P1A boundary: `apps/api/src/services/fixed-order.service.ts` creates immutable `RESTORATION_DIGITAL` orders only; it does not create payment events, entitlements, masters, executions, variants, or provider calls. `apps/api/src/routes/fixed-order.routes.ts` exposes only fixed-order creation/read.
- P1B boundary: `apps/api/src/services/payment-attempt.service.ts` reads persisted fixed order/items, enforces one idempotent `PaymentAttempt`, and never creates `PaymentEvent`, entitlement, master, execution, or variant. It makes no provider call while a transaction is open.
- Fail-closed adapter: `apps/api/src/domain/payment/bankAlfalahAdapter.ts:29-54` has seven explicit missing-evidence reasons, always returns `ready:false`, and throws from checkout initialization. It remains unchanged until P1C-C receives verified protocol authority.
- Fixture boundary: `apps/api/src/domain/pricing/offerProvider.ts:3-25,58-97` contains PKR-only local demo fixtures, no USD fixture, and all P1A fixed-order items are written as `pricingSource=local_fixture`, `pricingApproved=false` (`fixed-order.service.ts:134-153`). `paymentReadiness.ts:84-89` therefore blocks payment.
- Evidence searched: repository-wide tracked text search for `BankAlfalah`, `bank alfalah`, `local_fixture`, and `pricingApproved`; current fixed-order/payment/pricing source; Prisma schema/migrations; R9.2 plan; `AI_code_audit_report_RI.md`; archived Bank Alfalah/payment references. No official gateway API material, technical email attachment, merchant protocol, endpoint, credentials, or approved PriceBook was found. Historical archive claims are contradicted by source and are not protocol authority.

## Owner Decisions Required for P1C-B

| Market | Currency | ORIGINAL minor-unit amount | 2HD minor-unit amount | 4HD minor-unit amount | PriceBook version | Effective start/end | Approval evidence/reference |
| --- | --- | ---: | ---: | ---: | --- | --- | --- |
| Pakistan | PKR | Owner required | Owner required | Owner required | Owner required | Owner required | Owner required |
| International | USD | Owner required | Owner required | Owner required | Owner required | Owner required | Owner required |

The owner must also approve the exact tier labels/definitions, whether tax is included/excluded, and the authorized approver identity/reference. PKR must never be converted to USD automatically. Existing `local_fixture` values must never be marked approved or made payment-eligible.

## Minimum Typed PriceBook Design

- `PriceBook`: immutable `id`, `market`, `currency`, `version`, `approvalStatus`, `active`, `effectiveStartsAt`, `effectiveEndsAt`, `ownerApprovalReference`, `createdAt`, `approvedAt`, `createdBy`, `approvedBy`.
- `PriceBookEntry`: `priceBookId`, `digitalTier`, `amountMinor` as integer/BigInt, active/effective bounds, and immutable creation/audit fields.
- Only `APPROVED` and active PriceBooks inside their effective window may produce payment-eligible offers.
- Creating a FixedOrder snapshots PriceBook id/version, owner approval reference, market/currency, tier, and every integer minor-unit line amount. No later PriceBook change alters an existing order.
- P1C-B must preserve `local_fixture` records as unapproved and ensure fixture orders remain payment-ineligible by database/service tests.

## Official Bank Alfalah Evidence Checklist

Only owner-supplied official documents or authenticated official Bank Alfalah material may become protocol authority. General pricing/onboarding emails are not technical specifications. Required evidence:

1. Sandbox and production base URLs.
2. Merchant/store identifiers for PKR and USD, including merchant capability/eligibility and settlement facts.
3. Authentication, request signing/HMAC/encryption algorithm, key/certificate lifecycle, canonical field order, and encoding.
4. Required checkout/session request and response fields, validation constraints, order/reference rules.
5. PKR/USD support, card/instrument and country restrictions, amount minor-unit or decimal representation, rounding rules.
6. Hosted checkout/session creation flow, redirect/form behavior, return/cancel URL semantics, and 3DS flow where applicable.
7. Trusted callback/IPN endpoint contract: method/content type/raw body, event identity, signature verification, retry/acknowledgement, source validation, timing/order/finality.
8. Transaction/status inquiry API and its authentication, response contract, retry/timeouts.
9. Duplicate notification/replay behavior and provider event identifiers.
10. Expiry/timeout/abandonment rules.
11. Refund/void API, partial/full rules, status callbacks, disputes, and settlement/reconciliation reports.
12. Error/status code mapping, sandbox credentials, official test cases, and production activation/approval procedure.

## Future Trusted Payment Flow

`approved PriceBook -> immutable FixedOrder -> one PaymentAttempt -> Bank Alfalah checkout initialization -> customer redirect -> untrusted browser return -> trusted callback/IPN or server status inquiry -> signature + order/amount/currency verification -> deduplicated PaymentEvent -> transactionally paid/locked order -> exactly one RestorationEntitlement -> processing eligible`.

- Browser return/query params/localStorage/screenshots/manual status actions never mark an order paid.
- Callback is authenticated from official protocol evidence, replay-safe, and persisted as an append-only deduplicated `PaymentEvent` before side effects.
- Currency and amount must exactly equal locked `PaymentAttempt` and `FixedOrder`; mismatch produces a non-entitling exception/audit event.
- The verified-payment transaction creates exactly one entitlement and payment receipt/audit event. It creates no Replicate call inside callback handling.
- Processing is eligible only after commit; a separate internal queue dispatcher claims the unique execution after the successful transaction.
- Initialization/provider failures remain retryable only through the same permitted PaymentAttempt lifecycle; they never create a second row or payment lifecycle.

## Future Implementation Map

### P1C-B: Owner-approved PriceBook implementation

- Future files: `apps/api/prisma/schema.prisma`; new additive Prisma migration; `apps/api/src/domain/pricing/*`; `apps/api/src/services/fixed-order.service.ts`; `apps/api/src/domain/payment/paymentReadiness.ts`; focused unit/integration/disposable DB tests; designated canonical plan/status update after passing.
- Replace fixture-only offer provider with approved PriceBook read service; retain fixture source as explicitly unapproved test/local data.
- PriceBook publication requires owner approval evidence, effective-window validation, PKR/PAKISTAN and USD/INTERNATIONAL pairing, and immutable order snapshots.
- Rollback: feature flag live PriceBooks off; additive data remains; no existing FixedOrder is repriced or made eligible accidentally.

### P1C-C: Verified Bank Alfalah sandbox adapter and checkout initialization

- Future files: `apps/api/src/domain/payment/bankAlfalahAdapter.ts`, provider contract types, payment-attempt service/routes/controller, config schema and secret references, sandbox-only tests.
- Adapter methods after official evidence: readiness from validated configuration; `createCheckoutSession`; safe provider-error normalization; documented request construction/signing; no generic guessed callback parser.
- Configuration names must come from official documentation; use neutral placeholders in the implementation plan until then. Secrets live only in deployment secret management and are redacted from logs/API/errors.
- Rollback: feature flag forces adapter `ready:false`; existing attempts retain immutable audit state, no order becomes paid.

### P1C-D: Callback/IPN, status inquiry, PaymentEvent and entitlement transaction

- Future files: Bank callback/status controller/routes, raw-body middleware only if official signing requires it, `PaymentVerificationService`, transaction repository, entitlement service, audit/receipt service, test suites.
- Transaction boundary: dedupe provider event; load/lock payment attempt/order; verify signature/status/order/provider reference/amount/currency; persist verification evidence; set paid/locked state; create one entitlement and receipt/audit rows; commit. Dispatch processing after commit through the existing future one-call queue boundary, never inside callback transaction.
- Callback error map: invalid/missing signature -> 401/official acknowledgement behavior; malformed payload -> 400; unknown reference/ownership/mismatch -> non-entitling exception and safe response per bank protocol; duplicate verified event -> idempotent acknowledgement; transient DB failure -> retry-safe non-success response per bank guidance. Exact outbound status/ack semantics are blocked pending official contract.
- Rollback: disable callback route/feature flag only in a way documented by bank protocol; preserve events; finance resolves pending attempts through reconciliation rather than manual paid state mutation.

### P1C-E: GPT-5.6 Sol independent payment-security review

- Review approved PriceBook provenance, request/callback authenticity, canonical signature implementation, raw-body behavior, secret handling, callback replay/idempotency, transaction isolation, amount/currency/order matching, authorization, logging redaction, error leakage, SSRF/open redirect constraints, return-route trust, and rollback/incident handling.
- Block production activation on unresolved critical/high findings.

## State Transition Table

| From | Event/actor | To | Guard |
| --- | --- | --- | --- |
| `CREATED` fixed order | approved PriceBook + owner request | `PAYMENT_PENDING` | all line snapshots approved/current/effective; no existing attempt |
| `PAYMENT_PENDING` | checkout initialization | `REDIRECT_READY` attempt | approved PriceBook; official-ready adapter; same persisted attempt only |
| `REDIRECT_READY` | browser return | unchanged/pending | return is untrusted; may only correlate UI to attempt |
| pending attempt | verified callback or verified official status inquiry | `PAID`; order `PAYMENT_VERIFIED -> LOCKED` | signature/event/idempotency/order/ref/amount/currency/status all match |
| `PAID` | repeat verified event | unchanged | dedupe event; no second entitlement/receipt/queue claim |
| `PAID` | post-commit dispatcher | processing eligible | committed one entitlement; no provider call in callback |
| `CREATED`/`FAILED` attempt | documented retry | same attempt lifecycle | provider-specific official retry policy; never a second PaymentAttempt |
| any non-verified state | client/admin/browser/manual artifact | unchanged | never proves payment |

## Test and Security Acceptance Criteria

- PriceBook unit tests: required owner evidence/status/window; exact market/currency; integer minor units; no automatic FX; immutable FixedOrder snapshot.
- Disposable database tests: approved PKR and USD books/entries can produce only matching market orders; fixtures stay unapproved; invalid/expired/inactive books cannot create eligible orders.
- Sandbox adapter tests: no external production call; exact official request/signature vectors; currency/amount/reference validation; safe error redaction.
- Callback tests: raw signature valid/invalid, malformed payload, unknown attempt, status mismatch, amount/currency/order mismatch, callback replay/concurrency, status inquiry fallback, exactly-one event/entitlement/receipt, zero Replicate call inside callback.
- Playwright: approved/blocked PriceBook display, disabled fixture payment CTA, untrusted return remains pending, only verified server status shows paid, refresh/deep-link behavior, no external payment/provider traffic outside sandbox mocks.
- Security review: secret scans, structured-log redaction, no raw gateway payload/credential exposure, endpoint rate limiting, request size/type limits, callback source controls only if official protocol permits, authorization/ownership checks, open redirect prevention, transaction/locking review, reconciliation evidence preservation.

## Required Validation for This Planning Result

- `git diff --check`.
- Verify every referenced P1A/P1B/adapter/pricing file exists.
- Verify only this canonical plan changed in Native Plan Mode.
- Verify `BankAlfalahAdapter` still has unconditional `ready:false` and checkout throw.
- Verify `local_fixture` remains unapproved and no source/schema/migration/env file changed.
- Verify canonical plans remain tracked before future selective staging.

## Protected Scope Protocol

P1A/P1B finalized boundaries are protected against drift: fixtures remain unapproved/payment-ineligible; adapter stays fail-closed; payment attempt service remains non-entitling/non-dispatching; no callback route exists until P1C-D. No changes are authorized to `rules.md`, source outside future packet scope, Prisma schema/migrations, environment/secrets, restoration service, Replicate routing, RunPod, Sharp, print/fulfilment, production database, deployment configuration, or unrelated dirty files in P1C-A.

## Completion and Next Action

- Baseline remains **43% complete / 57% remaining**. Planning-only P1C-A does not increase implementation completion.
- Owner action required: provide a signed/recorded approval containing PKR/USD tier prices, version, effective dates, and approval reference. Then authorize P1C-B with **Codex GPT-5.6 Terra, Agent mode, high reasoning**.
- Bank Alfalah technical material remains separately required before P1C-C/P1C-D.
- Selective staging commands, not executed:

```powershell
git add -- ".kilo/plans/1785668100937-dual-market-commerce-bank-alfalah-admin-ui-plan.md"
git status --short
```

Native Plan Mode prevented creation of a separate P1C-A plan and prevented appending `AI_code_audit_report_RI.md`; the R9.2 canonical plan above is the sole permitted plan-file update for this turn.

## Final R9.2 Record

- Revised plan path: `.kilo/plans/1785668100937-dual-market-commerce-bank-alfalah-admin-ui-plan.md`
- Files changed: this plan file only.
- Validations run: `npm run typecheck` passed; `npm run build` passed; `npm run lint` reported missing ESLint flat configuration but exited 0 because the root script masks it; `npm test --workspaces --if-present` produced no frontend/browser coverage.
- Current HEAD: `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce` on `fix/runpod-output-sha256-contract`.
- Current git status: pre-existing modified files include `apps/api/package.json`, `apps/api/src/config/env.ts`, `apps/api/src/services/restoration.service.ts`, `rules.md`, protected RunPod/Gate documents, and many untracked RunPod/pipeline/doc files; none were changed, staged, cleaned, reverted, committed, or pushed by this phase.
- Overall complete/remaining: 20% / 80%.
- Recommended next implementation packet: R9.2-P0, Fixed-order model, one-call data guards, and truthful lint/test harness.

## 1. Current Code and Commerce Gap Matrix

### Commerce document audit

`commerce.md` is absent from the repository. It therefore cannot be canonical, audited section-by-section, or amended in this phase. The only commerce-like documents found are historical archives:

| Evidence | Status | Conflict/gap |
| --- | --- | --- |
| `docs/archive/benchmark/results/ops120/.../commerce_workflow.md` | Historical, not canonical | Defines PKR/USD prices but no market persistence, price book, tax, shipping, or Bank Alfalah contract. It claims a payment sequence inconsistent with current UI/API. |
| `docs/archive/benchmark/results/ops122/.../commerce_frontend.md` | Historical, not canonical | Claims package/payment/print flow is implemented; current print page is static and payment is demo-only. |
| `docs/archive/benchmark/results/ops118/.../payment_flow.md` | Historical, unverified | Claims Bank Alfalah PKR/USD configured but current config/factory supports only JazzCash/EasyPaisa/manual/demo. |
| `docs/archive/benchmark/results/ops124/.../payment_test_report.md` | Historical, contradicted by source | Calls generic secret equality “HMAC” and claims Bank Alfalah sandbox tests without Bank Alfalah provider code. |
| `rules.md:39-40` | Current architecture authority for payment mode | Manual proof/demo only during development; no live gateway activation authority. |

### Exact future `commerce.md` amendment outline

When a canonical `commerce.md` is supplied or designated, amend that one document in this order; do not create a duplicate commerce document:

1. **Authority and scope**: canonical status, ThanNow journey, precedence over archived reports, Replicate-only production restoration boundary, and protected RunPod exclusion.
2. **Market determination**: `PAKISTAN`/`INTERNATIONAL`, ISO country rules, customer confirmation, supported-country list owner, IP suggestion policy, account/address consistency, and market-change behavior.
3. **Currency and money**: PKR-only Pakistan, USD-only International, ISO 4217 codes, integer minor units, server formatting, immutable order currency, and prohibited FX/browser conversion.
4. **Catalog and SKU model**: restoration, upscale, digital export, print size/material/frame/quantity, shipping SKU, active dates, media, compatibility/readiness rules, and market availability.
5. **Price books and quotations**: PKR/USD price book versioning, effective dates, list price/discount/tax/shipping totals, quote expiry, snapshot at order placement, and repricing rules.
6. **Promotions/taxes/shipping**: coupon eligibility/limits, tax classification and owner, Pakistan/international zones, delivery estimates, server-side rate selection, and unavailable-destination behavior.
7. **Payment**: Bank Alfalah merchant scopes, hosted/form integration only after approved bank evidence, signed request/return/callback rules, 3DS policy, idempotency, terminal states, receipts, reconciliation, and activation checklist.
8. **Entitlement and restoration**: paid trigger, digital tier/upscale rights, revision/retry policy, print readiness, no output/download before entitlement, and failed processing/refund rules.
9. **Fulfilment and returns**: print production, partner assignment, shipment/tracking, delivery proof, cancellation windows, return/refund policy, and support ownership.
10. **Administration and audit**: role matrix, immutable money/event records, approval limits, finance reconciliation, fraud/dispute review, privacy/retention.
11. **State machines and API contracts**: canonical transitions, ownership/authorization, blocked transitions, idempotency keys, and event sources.
12. **Testing, rollout, rollback, and protected-scope protocol**: sandbox-only gateway testing, database migration/backfill policy, deployment gates, packet completion records, and drift prevention.

### Current-code gap matrix

| Area | Existing source | Status | Required change |
| --- | --- | --- | --- |
| Market/country | No market entity/field in `schema.prisma` | Missing | Market and confirmed country on cart, quote, order, payment, refund, address, shipment. |
| Currency/money | `Order`, `Payment`, `Package` use `Decimal(10,2)` and string currency (`schema.prisma:159-347`) | Unsafe/incomplete | Integer minor-unit columns and currency enum/value validation; preserve historical decimals until migrated. |
| Catalog | `Package` is one generic PKR package model (`330-352`) | Product-photo legacy | Versioned products/SKUs/market price books, print options, and compatibility. |
| Cart/quote | No cart, quote, quote expiry, or snapshot | Missing | Server-owned cart and immutable quote/order-price snapshot. |
| Restoration commercial link | `RestorationOrder` has optional generic `packageId`, metadata (`613-639`) | Disconnected | Explicit commercial order/entitlement linkage; do not overload JSON metadata for money/state. |
| Print commerce | `RestorePrintPage.tsx:4-14` static only; no print API | Missing | Product selection, actual readiness, address/shipping/fulfilment/payment. |
| Payment provider | Factory only supports JazzCash/EasyPaisa/manual/demo (`payment.interface.ts:1`, `factory.ts:6-28`) | No Bank Alfalah | Dedicated Bank Alfalah adapter after evidence; strict currency/amount/merchant configuration. |
| Payment signature | Generic plain equality check (`payment.providers.ts:57-82`) | Not a gateway implementation | Bank-defined canonical signing/verification plus raw-body handling; reject all invalid/mismatched callbacks. |
| Payment states | `PaymentStatus` has six states (`schema.prisma:22-29`) | Insufficient | Attempt/event/refund/dispute states and state history. |
| Callback idempotency | `WebhookEvent` unique source/providerEventId (`543-555`), payment status guard (`payment.service.ts:341-348`) | Partial | Provider event persistence before side effects, idempotency keys, amount/currency/order matching, transaction locks. |
| Customer flow | demo payment and page-load processing in R9.0 findings | Unsafe | Persisted commercial state machine; no paid action starts from UI load. |
| Admin RBAC | five roles, localStorage tokens (`admin-auth.service.ts:8-23`, `adminApi.ts:5-68`) | Incomplete | Requested seven roles/permissions, server authorization, module-specific actions, secure session hardening. |
| Admin modules | Existing generic dashboard/payments/orders/restorations (`admin.routes.ts:17-64`) | Partial | Market/price/shipping/fulfilment/refund/reconciliation/cases/content modules. |

## 2. Pakistan Customer Flow

1. `/market`: customer chooses Pakistan or confirms suggested Pakistan. The server stores `market=PAKISTAN`, `country=PK`, `currency=PKR` in draft cart/session; a country change invalidates its quote.
2. `/restore/new`: upload validation, source metadata, and server-created restoration draft. Customer selects restoration and eligible upscale/digital options from Pakistan price book.
3. `/restore/:draftId/preview`: pre-processing source review; no paid result claim. Server quote displays PKR only, quote ID/version/expiry, terms, and exact inclusions.
4. `/restore/:draftId/print`: optional print product/SKU, size, material, frame, quantity. Server uses real persisted output/source dimensions where available, otherwise states that print suitability will be determined after restoration. Pakistan-only SKUs and rates are returned.
5. `/checkout/address`: Pakistan address and contact validation; available Pakistan shipping methods/delivery estimates returned by server.
6. `/checkout/review`: server reprices; order snapshot in PKR contains items, discount, tax, shipping, total, quote expiry, and selected market. Customer accepts terms.
7. `/checkout/payment`: create PKR Bank Alfalah attempt from locked order. Redirect or approved hosted form is rendered from bank-approved response only. No card/payment data reaches ThanNow unless Bank Alfalah’s approved method requires it and PCI obligations are explicitly accepted.
8. `/payment/return`, `/payment/pending`, `/payment/success`, `/payment/failure`, `/payment/cancelled`: each reads server state, never query params as settlement proof. Callback/webhook remains the authoritative settlement source.
9. After verified PKR payment, server grants paid entitlement and queues Replicate restoration. Customer sees processing, before/after when completed, approved digital download and/or print fulfilment tracking.
10. `/orders/:orderNo`, `/orders/:orderNo/downloads`, `/orders/:orderNo/tracking`, `/orders/:orderNo/support`, `/orders/:orderNo/refund`: ownership-protected history, delivery/download, support/refund request, and eligible reorder using a fresh PKR quote.

## 3. International Customer Flow

The route sequence matches Pakistan, with these enforced differences:

- `/market` confirms a supported non-PK country and persists `market=INTERNATIONAL`, exact country code, `currency=USD`.
- Catalog, restoration/upscale/digital/print SKUs, shipping zones, delivery estimates, discounts, tax, and totals are all fetched from the USD international price book.
- Address validation uses selected country requirements; unavailable countries stop checkout before payment.
- Payment attempt is created with the Bank Alfalah configuration that has been bank-confirmed for USD. If USD merchant acceptance/settlement is not confirmed, checkout remains unavailable and the customer receives an explicit supported-market notice, not a conversion to PKR.
- Reorder always creates a new USD quote using current international price book/rates; historical order remains USD.

## 4. PKR and USD Pricing Architecture

### Rules

- `Market`: `PAKISTAN`, `INTERNATIONAL`. `Currency`: `PKR`, `USD`. Both are server enums/validated values.
- Store `amountMinor` as `BigInt` or a validated integer backed by PostgreSQL `BigInt`; never binary float or browser arithmetic. Formatting is server-supported/shared-library currency formatting only.
- A `PriceBook` belongs to one market/currency, has status `DRAFT|ACTIVE|RETIRED`, effective window, version, and approval/audit metadata. It owns prices for every sellable SKU and shipping rate.
- A `Quote` snapshots line unit price, quantity, discount, tax, shipping, total, market, currency, price-book version, expiry, and eligibility. `Order` copies this immutable commercial snapshot before payment.
- The client submits only identifiers and quantities. The server resolves all product/price/country/shipping/coupon eligibility and rejects client money/currency fields.
- Price changes affect only new/repriced carts/quotes. An existing order’s price snapshot and refund currency never change.

### Required calculation order

1. Resolve confirmed market/country.
2. Resolve active market-specific SKUs and price book.
3. Validate restoration/upscale/print compatibility and quantities.
4. Resolve coupon/discount eligibility.
5. Resolve taxable classification and tax rule, pending tax-policy owner confirmation.
6. Resolve shipping zone/method/rate from address/country.
7. Calculate integer minor-unit line totals, discount, tax, shipping, grand total.
8. Persist quote; on checkout revalidate all input/expiry and persist immutable order snapshot.

## 5. Bank Alfalah Payment Architecture and Confirmation Blockers

### Repository audit

- Current gateway config permits `jazzcash`, `easypaisa`, `manual`, `demo` only (`apps/api/src/config/env.ts:80-114, 221-325`).
- Existing providers generate a local `/checkout` URL and compare a header string to a secret (`apps/api/src/payments/payment.providers.ts:15-82`). This is not evidence of Bank Alfalah integration, HMAC, hosted checkout, callback verification, or USD payment capability.
- Payment records use Decimal and have no attempt/event/refund entities (`schema.prisma:304-328`).
- `PaymentService` finalizes a paid legacy product order and queues generic image processing (`payment.service.ts:332-486`); it must not be reused blindly for restoration/print entitlements.

### Target adapter boundary

Create a `BankAlfalahPaymentProvider` only after bank evidence is accepted. It owns:

- creating a gateway request from locked `PaymentAttempt` values only;
- selecting a bank-confirmed PKR or USD merchant configuration by order market/currency;
- returning only gateway-approved redirect/form instructions to the client;
- validating return/cancel correlation without treating it as settlement;
- verifying server callback/IPN from raw request body and bank-defined signing/authentication rules;
- normalizing verified bank statuses into internal payment events;
- performing/refusing refunds according to documented bank API/capabilities.

The commerce service owns order/entitlement transition and uses a database transaction/idempotency lock. The controller must preserve raw callback bytes before JSON parsing if bank signing requires raw payload verification. All Bank Alfalah secrets belong in Northflank secret configuration, never client bundles, logs, `rawPayload`, plan documents, or R2.

### Required Bank confirmation blockers

1. Approved gateway product/API and whether hosted redirect, server-to-server form, API, or another flow is permitted.
2. PKR merchant ID/profile, sandbox/prod endpoint, permitted currencies, transaction limits, and settlement currency/timing.
3. USD merchant ID/profile, whether non-Pakistan cardholders/countries are accepted, settlement currency/timing, cross-border/3DS rules, and whether USD is actually supported for this merchant.
4. Exact request fields, amount unit/precision, order/reference constraints, hash/HMAC/encryption algorithm, canonical field ordering, encoding, keys/certificates, key rotation, and signature verification rules.
5. Return, cancel, callback/IPN URLs, expected HTTP methods/content types, retry rules, source-IP/certificate allowlisting, timeout, acknowledgement response, event identifier, and notification order.
6. Status taxonomy for authorized/captured/paid/failed/cancelled/expired/refunded/disputed/chargeback, partial capture if applicable, and finality definition.
7. Refund API/process, partial/full refund constraints, refund callback/reconciliation, dispute/chargeback feed, and reporting/export access.
8. Sandbox test cards/flows and bank approval required before production activation.

Until all relevant answers are confirmed, Bank Alfalah stays feature-disabled, no live checkout is exposed, and manual/demo mode must not mark payment verified in production.

### Payment state model

- `PaymentAttempt`: `CREATED -> REDIRECT_READY -> CUSTOMER_RETURNED | CANCELLED_BY_CUSTOMER | EXPIRED | CALLBACK_PENDING -> AUTHORIZED -> PAID`; terminal adverse states `FAILED`, `CANCELLED`, `EXPIRED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `DISPUTED`, `CHARGEBACK`.
- Provider event is append-only and independently idempotent. A callback may be received before/after return; only a verified, amount/currency/order-matched successful callback transitions entitlement to paid.
- An authorization without documented capture semantics does not grant a paid entitlement. If the bank uses only paid/success, normalize directly only after confirmation.
- A duplicate callback records no duplicate entitlement, queue job, wallet mutation, fulfilment action, or receipt.

## 6. Complete Business State Machines

### Commercial cart -> order -> payment -> entitlement

`CART_DRAFT -> QUOTED -> CHECKOUT_READY -> ORDER_CREATED -> PAYMENT_PENDING -> PAYMENT_VERIFIED -> ENTITLED`.

- `CART_DRAFT -> QUOTED`: server validates market/country/catalog/prices; client may request only with ownership token/session.
- `QUOTED -> CART_DRAFT`: quote expired, market/country/address/shipping/product/coupon changes, or price-book change; recalculate server-side.
- `CHECKOUT_READY -> ORDER_CREATED`: quote valid; immutable order snapshot created transactionally.
- `ORDER_CREATED -> PAYMENT_PENDING`: one active payment attempt; attempting another requires expiry/cancel/explicit retry policy and idempotency key.
- `PAYMENT_PENDING -> PAYMENT_VERIFIED`: verified Bank Alfalah event matches exact provider reference, order, market, currency, and minor amount.
- `PAYMENT_VERIFIED -> ENTITLED`: single transaction creates specific entitlement(s); receipt/notification after commit.
- Blocked: direct client status updates, payment in other currency/market, callback without signature, changing order line items after attempt, processing/download before entitlement.

### Digital restoration / restoration plus upscale

`ENTITLED -> RESTORATION_QUEUED -> PROCESSING -> REVIEW_READY -> CUSTOMER_APPROVED | REVISION_REQUESTED -> COMPLETED`.

- The entitlement identifies digital master and any paid upscale/export tier. Processing remains Replicate-only.
- `REVISION_REQUESTED` is allowed within declared policy and creates one bounded revision task; it cannot silently rerun an unbounded paid provider call.
- `PROCESSING_FAILED -> RETRY_ELIGIBLE | REFUND_REVIEW | RETRY_EXHAUSTED`; retry authorization, count, cost, and audit event are server-owned.
- `COMPLETED -> DOWNLOAD_ENTITLED` only for purchased, available variants; signed downloads enforce ownership/expiry and do not bypass payment.

### Restoration plus printing

`ENTITLED -> PRINT_READINESS_PENDING -> PRINT_READY | PRINT_REQUIRES_CUSTOMER_DECISION -> PRINT_ORDER_READY -> FULFILMENT_QUEUED -> IN_PRODUCTION -> DISPATCHED -> IN_TRANSIT -> DELIVERED`.

- Print SKU requires completed accessible output and selected product options. Server recomputes crop/readiness; customer accepts any warnings/crop decision before fulfilment.
- Print and digital entitlements are separate line-level rights on the same commercial order/snapshot.
- Blocked: print dispatch before verified entitlement, incompatible SKU, missing address/shipping method, or unresolved readiness/crop decision.

### Cancellation, refund, reconciliation, guest conversion

- `PAYMENT_PENDING -> CANCELLED` on documented customer/bank cancel or expiry; no entitlement.
- `PAID/ENTITLED -> REFUND_REQUESTED -> REFUND_APPROVED | REFUND_REJECTED -> REFUND_PENDING_GATEWAY -> REFUNDED | PARTIALLY_REFUNDED | REFUND_FAILED`; all refund values use original order currency and cannot exceed paid less prior refunds.
- `DISPATCHED/DELIVERED -> RETURN_REQUESTED -> RETURN_APPROVED | RETURN_REJECTED -> RETURN_RECEIVED -> REFUND_*`, subject to commerce policy.
- `SETTLEMENT_OPEN -> RECONCILED | VARIANCE_REVIEW`; reconciliation compares immutable attempts/events/refunds with Bank Alfalah settlement evidence by merchant and currency. Finance resolves variance with an audit trail; it must not fabricate payment state.
- Guest order access requires a hashed ownership token. On registration/login, `GUEST -> ACCOUNT_LINKED` only after valid guest token or verified account identity; retain token-hash/audit linkage and do not expose cross-customer records.

### Source of truth and ownership

- Database state/event rows are source of truth; gateway response query parameters and browser local storage are presentation-only.
- Customer may view/change only owned draft/cart/order/support record. Guest token and authenticated user ownership are checked server-side for every read/mutation.
- Admin action uses role permission plus entity/state guard; all approval, override, refund, retry, price-book publish, fulfilment, and reconciliation decisions emit immutable audit events.

## 7. Customer Route and Component Plan

| Route | Page/components | APIs | States and mobile behavior |
| --- | --- | --- | --- |
| `/market` | `MarketSelectionPage`, `CountryConfirmDialog` | `POST /api/commerce/market-selection`, `GET /api/commerce/markets` | Loading supported countries; unsupported-country error; 360-430 full-width country picker and sticky Continue. |
| `/restore/new` | `RestorationStartPage`, `UploadDropzone`, `OfferSelector` | draft/upload/offer endpoints | Empty, validation, upload progress/retry, quote loading/expired. No package hard-coding. |
| `/restore/:draftId/review` | `SourceReviewPage`, metadata/readiness cards | draft/quote endpoint | Source-only review, no paid result claim; accessible image dialog. |
| `/restore/:draftId/options` | `DigitalOptionSelector`, `UpscaleReadinessPanel` | catalog/quote | PKR or USD only according to persisted market; changing option requotes. |
| `/restore/:draftId/print` | `PrintConfigurator`, `PrintReadinessCard`, `QuantityControl` | print products/configure quote | Show unavailable/incompatible SKU; stack option cards on mobile. |
| `/checkout/address` | `AddressPage`, `ShippingMethodSelector` | addresses/shipping quote | Country immutable without cart rebuild; field errors, no-rate/support path. |
| `/checkout/review` | `OrderReviewPage`, `ServerOrderSummary`, `CouponForm` | create/reprice order | Quote expiry/reprice, tax/shipping/discount rows, desktop sidebar/mobile sticky total. |
| `/checkout/payment` | `BankAlfalahRedirectPage`/approved form component | create payment attempt | Redirect only from server response; no input of bank secret/payment details; return-state recovery. |
| `/payment/return`, `/payment/pending`, `/payment/success`, `/payment/failure`, `/payment/cancelled` | `PaymentOutcomePage` | retrieve attempt/order state | Poll bounded server status while pending; success means verified server status only; retry is new permitted attempt. |
| `/orders` | `CustomerOrdersPage` | list owned orders | Empty/loading/error/filter market/status; mobile cards. |
| `/orders/:orderNo` | `CustomerOrderDetailPage`, timeline, `BeforeAfterCompare` | owned order detail | Processing/revision/failed/retry eligible/download/fulfilment conditional panels. |
| `/orders/:orderNo/downloads` | `DownloadsPage` | entitlement/download endpoint | Only entitled variants; signing/expiry errors and reissue path. |
| `/orders/:orderNo/tracking` | `ShipmentTrackingPage` | shipment tracking endpoint | No shipment, delayed, delivered, event timeline. |
| `/orders/:orderNo/support` | `SupportCasePage` | support endpoints | Create/view ownership-protected case, attachments constrained by policy. |
| `/orders/:orderNo/refund` | `RefundRequestPage` | refund eligibility/request endpoint | Explain status/eligibility; no client promise of approval. |
| `/orders/:orderNo/reorder` | `ReorderPage` | new draft from prior order | Fresh current price book/market only; never clone price/payment state. |

Reusable components: `Money`, `MarketBadge`, `ServerOrderSummary`, `StateTimeline`, `AccessibleDialog`, `BeforeAfterCompare`, `CheckoutStepper`, `QuoteExpiryNotice`, `EmptyState`, `ErrorRecovery`, `StickyMobileCheckoutBar`, `AddressForm`, `ProductConfigurator`, `PaymentStatusPanel`, `DownloadEntitlementCard`.

## 8. Admin Route, Module, Permission, and Audit Plan

### Roles and permission policy

- `SUPER_ADMIN`: all modules; role grants, price-book publish, feature flags, emergency remediation. Two-person approval required for production merchant configuration and refunds above policy threshold.
- `FINANCE`: payments, reconciliation, refunds/disputes, finance reports, read-only price books/orders/customers; no provider/processing routing changes.
- `OPERATIONS`: restoration orders/jobs/retries, fulfilment coordination, order/customer read; no payment approval/refund or price publication.
- `RESTORATION_REVIEWER`: restoration preview/review/revision decision only; no payment, customer export, fulfilment, price, or user changes.
- `FULFILMENT`: print queue, partner assignment, shipment/tracking, delivery exception; no prices/payments/refunds.
- `CUSTOMER_SUPPORT`: customers, owned order context, support cases, cancellation/refund request intake; no approval/refund execution or raw payment data.
- `CONTENT_ADMIN`: gallery/review/content approval and read-only SKU media; no commercial/account/processing changes.

Replace legacy `SUPPORT`/`READ_ONLY` only through a migration mapping and compatibility window, not an unsafe enum rewrite. Define a server permission map, use route-level guard plus service-level entity/state guard, and hide inaccessible nav items only as a convenience.

| Module route | Page / filters / table fields / detail / actions | APIs and data | Roles | Audit event |
| --- | --- | --- | --- | --- |
| `/admin/dashboard` | KPIs by market/currency/date: orders, paid, pending, revenue, refund, processing, fulfilment, reconciliation variance | dashboard metrics; orders/payments/jobs/shipments | all scoped dashboard | `admin.dashboard_viewed` optional/no sensitive payload |
| `/admin/customers` and `/:id` | Search, market, country, status; contact, orders, cases, consent, guest conversion | customers/users/orders/addresses/cases | SUPER_ADMIN, OPERATIONS, CUSTOMER_SUPPORT | `customer.viewed`, note/flag changes |
| `/admin/restorations`, `/:id` | Market/status/provider/date/retry filters; item, previews, history, entitlement, costs; review/revision/retry | restoration order/item/review/revision/entitlement/job | SUPER_ADMIN, OPERATIONS, RESTORATION_REVIEWER | review/revision/retry decision |
| `/admin/jobs` and `/admin/jobs/failures` | queue/status/provider/date; attempts/errors/heartbeat; bounded retry/dead-letter view | processing jobs/provider cost logs | SUPER_ADMIN, OPERATIONS | retry/override |
| `/admin/payments`, `/:id` | market/currency/status/merchant/date/order/ref filters; attempts/events/signature result/receipt; no raw secret | payment attempts/events/orders/refunds | SUPER_ADMIN, FINANCE | payment review/manual exception |
| `/admin/webhooks` | source/status/event/ref/date; immutable event payload redaction and processing outcome; replay only documented sandbox/admin action | webhook events/payment events | SUPER_ADMIN, FINANCE | replay/reprocess request |
| `/admin/reconciliation` | merchant/currency/period/status/variance; settlement lines, matched/unmatched | settlement/reconciliation/payment/refund | SUPER_ADMIN, FINANCE | reconciliation close/variance decision |
| `/admin/refunds` and `/:id` | market/currency/status/reason/date; order/payment/refund amount; approve/reject/submit/query | refunds/payment attempts/events | SUPER_ADMIN, FINANCE; support request-only | refund decision/dispatch/result |
| `/admin/disputes` | merchant/currency/status/deadline; evidence checklist | disputes/payment events/orders | SUPER_ADMIN, FINANCE | dispute status/evidence action |
| `/admin/orders` and `/:id` | market/country/currency/status/fulfilment/date; snapshot, address redaction, items, payment, support | commercial order/items/quote/address/shipment | SUPER_ADMIN, OPERATIONS, FINANCE read, SUPPORT read | cancel/override action |
| `/admin/price-books` | market/currency/status/effective date; SKU price/discount/tax config; draft/compare/publish/retire | price books/prices/products/SKUs | SUPER_ADMIN; FINANCE propose/read | price draft/publish/retire |
| `/admin/catalog/restoration-packages` | market/active; packages/tiers/digital rights | products/SKUs/prices | SUPER_ADMIN; CONTENT_ADMIN media-only | catalog change |
| `/admin/catalog/print-products` | market/category/size/material/frame/active; SKU compatibility/media | products/SKUs/options/media | SUPER_ADMIN; CONTENT_ADMIN media-only | catalog/SKU change |
| `/admin/shipping/countries-zones-rates` | market/country/zone/method/active; rates/estimate/effective date | supported countries/zones/rates | SUPER_ADMIN, FULFILMENT proposal/read | shipping rate publish |
| `/admin/fulfilment` | partner/status/market; print jobs, production, dispatch, tracking, exceptions | partners/fulfilment orders/shipments | SUPER_ADMIN, OPERATIONS, FULFILMENT | assign/dispatch/tracking change |
| `/admin/coupons` | market/currency/validity/status; usage/limits | promotions/coupons/redemptions | SUPER_ADMIN; FINANCE read | coupon publish/change |
| `/admin/support` | market/status/type/assignee/date; case timeline and safe attachments | support cases/messages/order refs | SUPER_ADMIN, CUSTOMER_SUPPORT, OPERATIONS read | case/message/status |
| `/admin/content` | gallery/review/type/status; provenance/consent/market targeting | content assets/reviews/approvals | SUPER_ADMIN, CONTENT_ADMIN | approve/publish/unpublish |
| `/admin/users` and `/admin/roles` | admin role/status/date; session activity; invite/deactivate/role change | admin users/sessions/permission assignments | SUPER_ADMIN | admin account/role change |
| `/admin/audit-logs` | actor/action/entity/market/date; immutable detail redaction | admin audit/audit log | SUPER_ADMIN; FINANCE scoped finance-read if policy permits | none (read may be logged) |
| `/admin/settings` and `/admin/feature-flags` | environment-safe flags/market rollout; no secret values | settings/feature flags | SUPER_ADMIN | flag/config action |
| `/admin/reports` | revenue/order/payment/refund/processing/fulfilment; market/currency/date exports | reporting views | SUPER_ADMIN, FINANCE; OPERATIONS scoped | report export |

## 9. Data Model and API Change Plan

### Minimum entity strategy

Do not force all commerce into existing generic `Order`, `Package`, `Payment`, and JSON metadata. Introduce a commercial aggregate that can reference `RestorationOrder`; keep legacy product-photo order records readable during migration.

Proposed entities/extensions:

- `Market` enum and `CurrencyCode` validation.
- `MarketConfiguration`: market, supported countries, active, merchant configuration key reference, launch flag.
- `Product`, `ProductSku`, `SkuOption`/typed option metadata: canonical catalog identity; market availability; no price on product/SKU itself.
- `PriceBook`, `PriceBookEntry`: market/currency/version/effective dates/status and minor-unit price/tax category.
- `Cart`, `CartItem`, `Quote`, `QuoteLine`: draft ownership, country, market/currency, server-derived snapshots, expiry/idempotency.
- `CommerceOrder`, `CommerceOrderItem`: immutable market/currency/price-book/amount snapshots, relation to user/customer/guest token and optional restoration order.
- `PaymentAttempt`, `PaymentEvent`: merchant key alias, provider reference, exact minor amount/currency, idempotency key, status history, redacted gateway metadata, callback correlation.
- `Refund`, `RefundEvent`, `Dispute`, `Settlement`, `ReconciliationRun`, `ReconciliationLine`: original currency and amount constraints.
- `Entitlement`: owner/order/item/SKU/grant status, download/upscale/print/revision scope, consumed/reserved timestamps.
- `Address`, `ShippingZone`, `ShippingRate`, `Shipment`, `FulfilmentPartner`, `FulfilmentOrder`, `TrackingEvent`.
- `RestorationReview`, `RevisionRequest`, `SupportCase`, `SupportMessage`.
- `Promotion`, `Coupon`, `CouponRedemption`; `ContentAsset`, `CustomerReviewApproval` if content administration enters scope.
- `AdminPermission`/role mapping or code-managed permission map with expanded `AdminRole`; extend `AdminAuditLog` with market/currency/correlation metadata only where necessary.

Migration approach: add nullable/new tables and read adapters first; backfill legacy records as `LEGACY`/unmigrated rather than guessing markets/currencies; dual-read during transition; enable new checkout only after catalog/price books and provider validation; do not mutate historic monetary amounts. Every schema packet includes Prisma migration, migration test, rollback/feature flag, and snapshot/backfill verification.

### Proposed public API contracts

- `GET /api/commerce/markets`: supported markets/countries, no pricing secrets.
- `POST /api/commerce/market-selection`: `{countryCode, confirmation}` -> persisted draft/session market/currency.
- `POST /api/commerce/carts`, `GET/PATCH /api/commerce/carts/:id`, `POST /api/commerce/carts/:id/requote`: identifier/quantity/address/coupon input only; response includes quote snapshot and expiry.
- `GET /api/commerce/catalog?market=...`: server-selected market catalog; server rejects mismatch with persisted cart.
- `POST /api/commerce/orders`: quote ID plus idempotency key -> immutable order summary. No amount/currency fields accepted from client.
- `GET /api/commerce/orders/:orderNo`: ownership-protected commercial order/timeline/entitlement/fulfilment view.
- `POST /api/commerce/orders/:orderNo/payment-attempts`: creates one valid Bank Alfalah attempt; returns bank-approved redirect/form descriptor only.
- `GET /api/commerce/payment-attempts/:id`: server status for return/pending UI.
- `POST /api/payments/bank-alfalah/callback`: raw body verification, internal event persistence, idempotent state transition; bank-only network/auth protections once documented.
- `POST /api/commerce/orders/:orderNo/refund-requests`, `GET /api/commerce/orders/:orderNo/downloads`, `POST /api/commerce/orders/:orderNo/downloads/:entitlementId`: ownership/state checked.
- `POST /api/commerce/orders/:orderNo/support-cases`, `GET /api/commerce/orders/:orderNo/tracking`, `POST /api/commerce/orders/:orderNo/reorder`.
- Admin APIs mirror the module plan with pagination/filtering, explicit action commands, idempotency where applicable, and no generic direct state patch endpoint.

## 10. Implementation Packets in Dependency Order

1. **R9.1-P0 Commerce authority, data foundation, and truthful lint/test harness**
   - Add canonical `commerce.md` only if owner designates/provides it; otherwise add the amendment content to the designated existing canonical commerce/status document. Introduce market/currency/price-book/cart/quote/order snapshot foundations and feature flags, plus truthful ESLint configuration and test harness.
   - Acceptance: schema migration/backfill verification; Pakistan/International market rules; integer money tests; no legacy break; lint fails truthfully when violations exist.
   - Rollback: disable new commerce feature flag; retain added tables/read-only records; do not reverse applied production migration destructively.

2. **R9.1-P1 Server-owned restoration checkout and entitlement linkage**
   - Replace demo/client-only selection/payment/auto-processing with cart/quote/order/entitlement API linkage; maintain Replicate-only processing boundary unchanged.
   - Acceptance: no process/download before verified entitlement; market change reprices; customer cannot alter amount/currency; guest/account ownership verified.
   - Rollback: disable new checkout routes/CTA; retain existing outputs and orders; do not route to legacy fake payment success.

3. **R9.1-P2 Catalog, print configuration, addresses, and shipping**
   - Implement server catalog/SKUs/price books, print readiness from real output metadata, shipping zones/rates, addresses, and immutable checkout summaries.
   - Acceptance: PK customer sees/charges PKR products/rates only; international sees USD only; incompatible print blocked; quote/order snapshot survives refresh.
   - Rollback: hide print purchase path while digital restoration remains available; retain catalog records.

4. **R9.1-P3 Bank Alfalah evidence intake and sandbox adapter**
   - After every bank blocker is resolved, add adapter/config secret references/raw callback verification/payment attempt/events/idempotency/reconciliation model. Sandbox only.
   - Acceptance: documented signing exactness; invalid signature rejected; duplicate callback idempotent; amount/currency/order mismatch rejected; no live payment.
   - Rollback: feature flag gateway disabled; attempts remain auditable; no entitlement created for pending/unknown settlement.

5. **R9.1-P4 Customer dual-market checkout and lifecycle UI**
   - Build routes/components in section 7, payment outcome pages, order/download/tracking/support/refund/reorder views with mobile validation.
   - Acceptance: market selection confirmation, exact server totals, no browser FX, return/pending/cancel handling, accessibility/browser tests at all required widths.
   - Rollback: retain server state; hide checkout entry under feature flag and keep order history readable.

6. **R9.1-P5 Admin RBAC and operations portal**
   - Expand roles/permission map, admin route modules/APIs/table/detail/action patterns, audit trail, finance/reconciliation/refund/fulfilment/content/support controls.
   - Acceptance: unauthorized role actions return 403 and are absent from UI; all sensitive actions generate audit event; market/currency filters and redaction verified.
   - Rollback: retain expanded roles/tables; disable new admin routes by permission/feature flag without downgrading historical audit evidence.

7. **R9.1-P6 Bank Alfalah production readiness, deployment, and controlled activation**
   - Bank-approved production merchant configuration, callback network rules, reconciliation runbook, monitoring, receipts, production deployment checks, and launch authorization. No RunPod changes.
   - Acceptance: approved sandbox sign-off, bank production test/approval, reconciliation dry-run, zero live-payment test automation, rollback tested.
   - Rollback: disable market-specific Bank Alfalah checkout, leave existing paid entitlements/fulfilment intact, and reconcile pending attempts manually via finance controls.

Every packet follows **repair -> test -> repair -> test** until relevant tests pass and no new regression remains. After a packet passes, update the designated canonical commerce/UI/status document with finalized route, API, state, schema, permission, rollback, and protected-scope boundaries.

## 11. Acceptance Tests and Deployment Plan

### Baseline recorded

- `npm run typecheck`: passed for API and web.
- `npm run build`: passed for API and web; web build produced 70 modules, CSS 33.55 kB/7.40 kB gzip, JS 288.17 kB/81.90 kB gzip.
- `npm run lint`: ESLint reports missing flat config, but root script masks failure using `|| exit 0`; not a valid lint pass.
- `npm test --workspaces --if-present`: no frontend/browser test command emitted coverage.
- Playwright/Puppeteer/Axe or equivalent supported browser tooling is absent.
- No paid provider call or live payment occurred.

### Required future test matrix

- Unit/contract: market resolver; country confirmation; price-book resolver; integer money; quote invalidation; coupon/tax/shipping rules; state transition guards; ownership; gateway request mapper; signature verifier; raw callback parser; payment idempotency; refund limits/currency; RBAC.
- API integration: Pakistan cannot pay USD; International cannot pay PKR; client amount/currency ignored/rejected; market change reprices cart; payment currency equals order currency; invalid signature rejected; duplicate callback creates one paid transition/entitlement/queue action; no processing/download before verified payment/entitlement; refund uses original currency; unauthorized admin actions return 403.
- Database: migrations, unique constraints, provider event idempotency, money overflow/negative values, snapshot immutability, legacy read compatibility.
- Component: market selector, price display, checkout summary, payment outcomes, dialog/focus, input/error/loading/empty states, admin permission visibility.
- Browser/E2E: sandbox/mock gateway only; mobile and desktop console/network checks at 360, 390, 430, 768, 1024, 1440 px; deep links on Cloudflare Pages; no console errors; accessibility scan plus keyboard pass.
- Security: no secrets in client/network/log/test fixtures; callback replay/signature/mismatch behavior; ownership enumeration prevention; rate limits; CSP/third-party payment return policy after gateway confirmation.
- Deployment: Cloudflare Pages preview; Northflank API health/version/CORS; Prisma migration; queue worker health; Bank Alfalah sandbox callback reachability; R2 signed-download verification; staging reconciliation fixture; feature-flag/rollback drill.

## 12. Exact Frozen and Protected Files

- `rules.md`
- `apps/api/src/runpod/**`
- `apps/api/src/restoration-providers/runpod/**`
- `apps/api/runpod-worker*/**`
- `runpod-worker-dev/**`
- `docs/restoration/RUNPOD_*.md`
- `docs/restoration/runpod-*.json`
- `docs/restoration/runpod-*.test.ts`
- All RunPod workflows, provider routes, workers, images, digests, endpoints, configurations, Gates, packets, protocols, validators, and related protected files
- All `.env*`, deployment secret configurations, merchant keys/certificates, webhook secrets, and payment credentials
- Pre-existing dirty files are never cleaned, reverted, staged, or modified by these packets unless separately authorized.

## 13. Risks and Unresolved Decisions

1. `commerce.md` does not exist and has no canonical designation. Owner must identify the canonical commerce/status document before any documentation amendment.
2. Bank Alfalah PKR/USD technical and merchant evidence is absent; all gateway details remain blocked.
3. The supported international country list, tax obligations, delivery regions, fulfilment partners, service-level estimates, cancellation/return policy, and refund approval thresholds require owner/business decisions.
4. Whether restoration payment happens before processing is already the safe R9.0 direction; any preview-before-payment policy must explicitly cap provider cost and distinguish free preview entitlement.
5. Existing schema has legacy generic orders, Decimals, package pricing, and overlapping restoration concepts. A migration compatibility plan is mandatory; no automatic conversion of historical PKR data to USD/market.
6. Existing admin tokens are stored in browser localStorage. Admin expansion should include secure session hardening but must be sequenced to avoid breaking current sessions unexpectedly.
7. Historic archive claims about Bank Alfalah configuration/tests conflict with source and cannot be treated as evidence.

## 14. Completion Percentages

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Protected Replicate restoration boundary | 100% | 0% |
| Market/country/currency authority | 0% | 100% |
| PKR/USD price books and integer money | 0% | 100% |
| Cart/quote/order snapshot commerce core | 5% | 95% |
| Restoration payment/entitlement linkage | 20% | 80% |
| Upscale/print readiness and catalog | 15% | 85% |
| Print/shipping/fulfilment | 5% | 95% |
| Bank Alfalah sandbox integration | 0% | 100% |
| Bank Alfalah production activation | 0% | 100% |
| Customer dual-market UX | 10% | 90% |
| Admin RBAC and operational modules | 25% | 75% |
| Reconciliation/refunds/disputes | 5% | 95% |
| Testing/browser/deployment readiness | 20% | 80% |
| **Overall dual-market launch readiness** | **16%** | **84%** |

## 15. Recommended First Packet and Model

Start with **R9.1-P0: Commerce authority, data foundation, and truthful lint/test harness** using **Codex GPT-5.6 Terra with high reasoning effort**, followed by an independent security/data-migration review. It resolves the source-of-truth and pricing boundaries required before introducing payment or customer-facing international commerce.

## Final Audit Record

- Plan file path: `.kilo/plans/1785668100937-dual-market-commerce-bank-alfalah-admin-ui-plan.md`
- Files changed: this plan file only.
- Validation commands/results: `npm run typecheck` passed; `npm run build` passed; `npm run lint` reported missing ESLint configuration but exited 0 due to masking; `npm test --workspaces --if-present` produced no frontend/browser test coverage.
- Current HEAD: `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce` on `fix/runpod-output-sha256-contract`.
- Git status: pre-existing modifications/untracked files include protected RunPod/Gate-related files and prior plan/document evidence; they were not changed, cleaned, reverted, staged, committed, or pushed in this phase.
- Overall complete/remaining: 16% / 84%.
- Recommended first implementation packet: R9.1-P0, Commerce authority, data foundation, and truthful lint/test harness.

## R9.2-P0A Completion Record — 2026-08-02

Classification: **COMPLETE** (data foundation and guards only; payment, UI, provider dispatch, Sharp, print fulfilment, and deployment are explicitly out of scope for this packet and remain unimplemented, as required).

- Files changed: `apps/api/prisma/schema.prisma` (additive), new migration `apps/api/prisma/migrations/20260802183254_r92_p0a_fixed_order_foundation/migration.sql`, new `apps/api/src/domain/fixedOrder/fixedOrderGuards.ts` and `fixedOrderGuards.test.ts`, `AI_code_audit_report_RI.md` (new section appended), this plan file (percentage table + this record).
- Schema added: 17 enums, 15 models (`RestorationDraft`, `FixedOrder`, `FixedOrderItem`, `PaymentAttempt`, `PaymentEvent`, `RestorationEntitlement`, `RestorationMaster`, `ReplicateExecution`, `ImageVariant`, `DigitalEntitlement`, `PrintEntitlement`, `AddOnOrderLink`, `FulfilmentOrder`, `Shipment`, `AuditEvent`); legacy models untouched (referenced only via plain scalar ids).
- One-call invariants: unique `RestorationEntitlement.fixedOrderId`, unique `RestorationMaster.restorationEntitlementId`, unique `ReplicateExecution.restorationMasterId` + unique `idempotencyKey`, unique `PaymentAttempt.fixedOrderId`, unique `PaymentEvent.dedupeHash`/`[provider, providerEventId]`, unique `ImageVariant[restorationMasterId, variantSpecId, sourceMasterSha256]`, plus 6 hand-authored CHECK constraints for non-negative money/positive quantity/market-currency pairing.
- Domain guards (pure, unwired): market/currency pairing, allowed order types, integer minor-amount validation, fixed-order immutability, second-payment rejection, add-on-requires-validated-master, first-restoration eligibility (excludes `DIGITAL_UPGRADE`/`PRINT_ADD_ON`), deterministic one-call execution idempotency-claim validation.
- Tests: `apps/api/src/domain/fixedOrder/fixedOrderGuards.test.ts`, all 11 required scenarios plus extra boundary cases; run via `npx tsx` (not wired into `apps/api/package.json` -- see blocker below).
- Validation run: `prisma format`/`validate`/`generate` passed; `prisma migrate diff` (datamodel-to-datamodel, no live DB) produced additive-only SQL; `tsc --noEmit` and `tsc` build passed; existing restoration/coordinator/router/entitlement tests (23 assertions across 5 files) still pass, no regression; root `npm run lint` truthfully fails (`npx eslint ... --max-warnings 0` exits 2, no flat config) once its `|| exit 0` mask is bypassed -- confirms the known gap, not fixed here.
- Environment limitation: no local Postgres/Docker/psql was available, so the migration could not be applied to a live/clean test database in this environment; it was produced and verified by pure schema-diff instead. Running `prisma migrate deploy` against a real disposable Postgres instance remains an open follow-up.
- Blocked item: `apps/api/package.json` already carried pre-existing, unrelated dirty changes (RunPod `test:*` scripts) at the start of this packet, so no `test:fixed-order-guards` script was added to it, per the preflight no-unrelated-file-edits rule.
- Protected files verified unchanged: `rules.md`, all RunPod provider/route/worker/config/Gate files, `apps/api/src/services/restoration.service.ts`.
- Pre-existing dirty files left untouched: `apps/api/package.json`, `apps/api/src/config/env.ts`, `apps/api/src/services/restoration.service.ts`, `docs/restoration/RUNPOD_GATE3_APPROVAL_PACKET.md`, `docs/restoration/runpod-gate3-readiness.json`, `docs/restoration/runpod-gate3-readiness.test.ts`, `rules.md`, plus all untracked files present at the start of this packet.
- Current HEAD at packet start: `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce` on `fix/runpod-output-sha256-contract`. No commit was created by this packet (see AI_code_audit_report_RI.md for the exact staged-file recommendation).
- Overall complete/remaining after this packet: 24% / 76% (see updated table above).
- Recommended next packet: R9.2-P0B, truthful lint/test/browser harness, using Codex GPT-5.6 Terra at medium reasoning effort.

## R9.2-P0B Completion Record — 2026-08-02

Classification: **COMPLETE** (lint/test harness only; no browser tests, payment, UI, provider dispatch, Sharp, printing, deployment, or new database models, as required).

- Files changed: new `eslint.config.mjs`; root `package.json` (lint script mask removed, ESLint devDependencies pinned, 3 new test scripts) and `package-lock.json`; `apps/api/package.json` (one isolated new script line inside its pre-existing dirty diff); 28 application source files with exact-line lint fixes (see `AI_code_audit_report_RI.md` "R9.2-P0B" section for the full list); this plan file.
- ESLint: real flat config (ESLint 9.39.5 + typescript-eslint 8.65.0), covering all of `apps/api/**` and `apps/web/**` except generated/build/vendor/evidence dirs and a documented protected-scope carve-out (current restoration-provider/RunPod implementation code, which this packet is barred from editing) -- the P0A router/coordinator seam stays linted with zero findings.
- Lint errors: 70 real errors found (via unmasked `eslint -f json`) -> 0, fixed with exact-line, behavior-preserving edits (dead-import/dead-code removal, `_`-prefixed unused bindings, one `let`->`const`, one `arguments`->rest-param rewrite of dead code, two `require`->`import` conversions). 99 pre-existing `no-explicit-any`/`react-hooks/exhaustive-deps` warnings remain, visible but non-blocking (documented reason: rule severity intentionally kept at "warn", not disabled).
- Lint truthfulness proof: injected a throwaway file with an unused variable -> `npm run lint` exited 1 with 1 reported error; removed it -> exited 0 again.
- Test commands added: `test:fixed-order-guards`, `test:restoration-safe` (entitlement/view/coordinator/ports/router bundle), `test:workspace-safe` (every deterministic apps/api test, no live provider/DB calls).
- Validation run: `npm run lint` exit 0 (0 errors/99 warnings), `npm run typecheck` exit 0, `npm run build` exit 0, `npm run test:fixed-order-guards`/`test:restoration-safe`/`test:workspace-safe` all exit 0 with 0 failures across every suite.
- Protected files verified unchanged: `rules.md`, Prisma schema/P0A migration, `restoration.service.ts`, `restoration-providers/providers/**`, `restoration-providers/runpod/**`, `RestorationProviderRouter.ts` -- `git diff` confirms `restoration.service.ts` and `env.ts` are byte-for-byte identical to their pre-existing (pre-P0B) diffs.
- Pre-existing dirty files separated: `env.ts`, `restoration.service.ts`, the three RunPod/Gate docs, and `rules.md` were left untouched; `apps/api/package.json`'s one new line was verified isolated from its existing unrelated diff both before and after the edit.
- Limitation: no browser/E2E runner exists yet; carried forward to P0C.
- Current HEAD at packet start/end: `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce` on `fix/runpod-output-sha256-contract`. No commit made (unrelated protected files remain dirty); safe selective add/commit commands recorded in `AI_code_audit_report_RI.md`, not executed. No push.
- Overall complete/remaining after this packet: 27% / 73%.
- Recommended next packet: R9.2-P0C, disposable PostgreSQL migration verification and browser test foundation, using Codex GPT-5.6 Terra at medium reasoning effort.

## R9.2-P0C1 Completion Record — 2026-08-02

Classification: **COMPLETE** (database verification only; no browser tests, UI, payment, Replicate dispatch, Sharp, printing, shipping, or deployment, as required).

- Environment: Docker unavailable; no PostgreSQL version pinned in repo config, so none was guessed. Used the real, locally-installed, non-Docker PostgreSQL 17.7 toolchain (`initdb`/`pg_ctl`/`createdb`/`psql`) to stand up a fully disposable instance (fresh data dir, random temp superuser, loopback-only custom port `55491`, one throwaway database), entirely separate from the pre-existing persistent `postgresql-X64-17` service already running on port 5432.
- Migration deploy: `prisma migrate deploy` from empty surfaced two genuine defects, both diagnosed and resolved without silently rewriting tracked migration files: (1) a pre-existing, unrelated bug in `20260729000100_add_guest_ownership_token_hash` (redundant non-idempotent column add; worked around only inside the disposable DB via `psql` + `prisma migrate resolve --applied`; smallest fix proposed -- add `IF NOT EXISTS` -- pending separate authorization to edit that tracked file); (2) a UTF-8 BOM as the first byte of the untracked P0A migration file, blocking Postgres's parser -- **user-authorized** before removal, byte-level fix only, zero SQL content change. After both, `prisma migrate deploy` applied `20260802183254_r92_p0a_fixed_order_foundation` successfully.
- Repeat deploy: second `prisma migrate deploy` -> "No pending migrations to apply"; `prisma migrate status` -> "Database schema is up to date!"; no unresolved failed/rolled-back state remains.
- Constraints verified (real introspection): 15/15 enums, 15/15 tables, 21 foreign keys, 15 primary keys, 29 unique indexes (all one-call/idempotency-critical ones present), 7/7 hand-authored CHECK constraints (P0A's record said "6"; actual count is 7 -- corrected here).
- Negative tests: all 13 required cases proven rejected with the correct error class (CHECK vs. unique violation) via real inserts. Positive tests: one valid Pakistan/PKR chain and one valid International/USD chain inserted and read back correctly. 20/20 total checks passed.
- Reusable script: `apps/api/src/scripts/verify-disposable-db.ts` / `npm run verify:disposable-db` -- requires an explicit `DISPOSABLE_DATABASE_URL`, refuses non-loopback hosts and known managed-provider URL patterns (proven against a Neon-shaped URL and a missing URL), never logs credentials, cleans up all its own rows (confirmed 0 residual rows afterward).
- Validation run: `npm run lint` exit 0 (0 errors/99 warnings, unchanged), `npm run typecheck`/`npm run build` exit 0, `test:fixed-order-guards`/`test:restoration-safe`/`test:workspace-safe` all exit 0, `prisma validate`/`generate` succeeded.
- Cleanup: disposable Postgres instance stopped (`pg_ctl stop -m fast`), temp data directory/log/pwfile deleted, temp port confirmed free, scratchpad confirmed empty, persistent PG17 service left untouched throughout.
- Protected files verified unchanged: `rules.md`, `restoration.service.ts`, `config/env.ts`, current provider routing, all RunPod files -- only the P0A migration's leading BOM byte was removed (authorized), its SQL content is otherwise identical.
- Pre-existing dirty files separated: `env.ts`, `restoration.service.ts`, RunPod/Gate docs, `rules.md` untouched; `apps/api/package.json`'s one new line verified isolated.
- Remaining limitations: the pre-existing `20260729000100` migration defect is documented but not fixed in the tracked file (needs separate authorization); no browser/E2E runner yet (deferred to P0C2); local PostgreSQL 17.7 was used because no canonical version is pinned and Docker is unavailable -- if production Neon Postgres differs materially, that gap isn't covered here.
- Current HEAD at packet start/end: `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce` on `fix/runpod-output-sha256-contract`. No commit made (unrelated protected files remain dirty); safe selective add/commit commands recorded in `AI_code_audit_report_RI.md`, not executed. No push.
- Overall complete/remaining after this packet: 30% / 70%.
- Recommended next packet: R9.2-P0C2, Playwright browser and responsive test foundation, using Codex GPT-5.6 Terra at medium reasoning effort.

## R9.2-P0C1B Completion Record — 2026-08-02

Classification: **COMPLETE** (migration-history remediation only; no Playwright/UI/payment/Replicate/Sharp/printing/shipping/deployment work, as required). Implements the plan in `.kilo/plans/1785700000000-r92-p0c1a-migration-history-remediation-plan.md`, now marked implemented.

- File changed: exactly `apps/api/prisma/migrations/20260729000100_add_guest_ownership_token_hash/migration.sql` -- the four authorized clauses (`ADD COLUMN` -> `ADD COLUMN IF NOT EXISTS` x2, `CREATE INDEX` -> `CREATE INDEX IF NOT EXISTS` x2). `20260728_add_guest_ownership_token` and the P0A migration confirmed byte-unchanged.
- Checksums: old `681d6c65dcbdd2b2c6095925779aa18c1fe65b5394f12bab5a3a92d54279d0b1` -> new `7ecb110b16f69ac1db8b2e6206bebbcfdc6279e5d9bb49483e82d0a266c4d1e6`.
- Fresh-database result (disposable Test A): `prisma migrate deploy` applied all 18 migrations unattended from empty, zero manual workaround; second deploy reported zero pending; `migrate status` reported up to date; `_prisma_migrations` showed 0 failed/rolled-back rows; `npm run verify:disposable-db` passed 20/20.
- Already-applied-path result (disposable Test B, scratch prisma copy, tracked files untouched): reconstructed the "already applied under the original checksum" state, then swapped in the real amended file -- `migrate status`/`migrate deploy` treated it as inert (no error, no reapplication, no duplicate column/index; confirmed exactly 2 `_prisma_migrations` rows and exactly 4 guest-ownership indexes). Reconfirms the R9.2-P0C1A plan's empirical finding with the real (not synthetic) amendment.
- `prisma migrate dev`: refused to run in this non-interactive agent environment (Prisma's own by-design restriction); documented as a residual, human-only verification step with the developer procedure recorded in `AI_code_audit_report_RI.md`, not bypassed or hidden.
- Production status-read: not performed (no production credentials available in this environment, none requested/guessed); recorded as an owner-operated release prerequisite before/at shipping.
- Validation run: `npm run lint` exit 0 (0 errors/99 warnings), `npm run typecheck`/`npm run build` exit 0, `test:fixed-order-guards`/`test:restoration-safe`/`test:workspace-safe` all exit 0, `prisma validate`/`generate` succeeded.
- Cleanup: both disposable instances (ports 55493, 55494) stopped and fully deleted (data dirs, logs, pwfiles); Test B's scratch prisma copy and one-off SQL fixture deleted; both ports confirmed free; scratchpad confirmed empty; persistent PG17 service untouched throughout.
- Protected files verified unchanged: `rules.md`, `20260728_add_guest_ownership_token`, P0A schema/migration, `restoration.service.ts`, `config/env.ts`, current provider routing, all RunPod files.
- Pre-existing dirty files separated: `env.ts`, `restoration.service.ts`, RunPod/Gate docs, `rules.md`, `apps/api/package.json`'s prior additions -- all untouched.
- Current HEAD at packet start/end: `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce` on `fix/runpod-output-sha256-contract`. No commit made (unrelated protected files remain dirty); safe selective add commands recorded in `AI_code_audit_report_RI.md`, not executed. No push.
- Overall complete/remaining after this packet: 32% / 68%.
- Recommended next packet: R9.2-P0C2, Playwright browser and responsive test foundation, using Codex GPT-5.6 Terra at medium reasoning effort, Agent mode.

## R9.2-P0C2 Completion Record — 2026-08-02

Classification: **COMPLETE** (Playwright browser/responsive test foundation only; no commerce UI, payment, admin redesign, Replicate dispatch, Sharp, printing, shipping, or deployment, as required).

- Files: new `apps/web/playwright.config.ts`, `apps/web/tests/browser/fixtures/index.ts`, `smoke.spec.ts`, `responsive.spec.ts`, `network-safety.spec.ts`; modified `apps/web/package.json` (`@playwright/test@1.62.1` exact-pinned, Chromium only, 3 scripts), root `package.json` (3 delegating scripts), `.gitignore` (2 scoped ignore lines for temporary Playwright evidence only), and two small app-source fixes (below).
- Tested routes: `/` (home), `/login`, `/signup`, `/restore/new` (upload step), `/restore` (mocked loading/empty/error), and an invented-nonexistent path proving the real unknown-route behavior (redirect to `/`, no fake 404). All routes verified to exist in `App.tsx` before testing; none invented.
- Mocked boundaries: `**/api/packages`, `**/api/auth/me`, `**/api/restorations` (delayed-empty and 500-error variants). No real `apps/api` process ever started.
- Network safety: a `page.route("**/*")` guard allows only `localhost`/`127.0.0.1`, aborts everything else. Proven against real Replicate/RunPod/Bank-Alfalah-shaped/production-API/advertising hosts (permanent `network-safety.spec.ts`), and proven to genuinely fail a test on a real violation via a temporary disposable spec (added, run red, deleted, suite re-run green). One documented, non-failing exception: the pre-existing, unconditional Facebook Pixel/GA bootstrap in `main.tsx` (still always aborted, just not counted as a violation, or every test would fail on it).
- Viewport matrix: exactly 360x800/390x844/430x932/768x1024/1024x768/1440x900 across 3 representative pages, one parametrized loop (18 tests), not duplicated per page.
- Two small, behavior-preserving UI fixes made in scope: (1) `RestorationHistoryPage.tsx` no longer spins forever for an anonymous visitor (one-line `setLoading(false)` fix); (2) `RestoreNewPage.tsx`'s upload dropzone is now keyboard-reachable (`role="button"`, `tabIndex`, `onKeyDown`, mirroring an identical existing pattern elsewhere in the same file).
- Validation: `npm run lint` exit 0 (0 errors/99 warnings -- one real error found and fixed: `eslint-plugin-react-hooks` false-flagging Playwright's `use` fixture callback, renamed to `provide`), `typecheck`/`build` exit 0, `test:fixed-order-guards`/`test:restoration-safe`/`test:workspace-safe` all exit 0, `npx playwright test` 28/28 passed, `npm run test:browser` 10/10, `npm run test:browser:responsive` 18/18.
- Cleanup: `apps/web/test-results/` and `apps/web/playwright-report/` deleted and now git-ignored (config/tests remain tracked).
- Protected files verified unchanged: `rules.md`, Prisma schema/migrations, `restoration.service.ts`, `config/env.ts`, current provider routing, all RunPod files.
- Pre-existing dirty files separated: all prior P0A/P0B/P0C1/P0C1B diffs left exactly as they were; this packet's edits to already-dirty `RestoreNewPage.tsx` were additive/isolated on top of its existing diff.
- Coverage gap flagged (not fixed): `/orders`, `/wallet`, `/payments`, `/subscription` have no auth guard wired in `App.tsx` despite `RequireAuth.tsx` existing in the codebase -- out of scope for a behavior-preserving fix, noted for a future packet.
- Current HEAD at packet start/end: `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce` on `fix/runpod-output-sha256-contract`. No commit made (unrelated protected files remain dirty); safe selective add commands recorded in `AI_code_audit_report_RI.md`, not executed. No push.
- Overall complete/remaining after this packet: 34% / 66%.
- Recommended next packet: R9.2-P1A, free upload/original preview/fixed-order creation, using Codex GPT-5.6 Terra at high reasoning effort, Agent mode.

## R9.2-P1A Completion Record — 2026-08-02

Classification: **COMPLETE**. Implements the full scoped flow (confirm market -> free upload -> validated draft -> protected original preview -> ORIGINAL/2HD/4HD selection -> server-owned PKR offer -> one immutable RESTORATION_DIGITAL FixedOrder -> locked review), stopping before payment. No Replicate/RunPod/Sharp/print/fulfilment/Bank Alfalah/admin-UI/deployment work.

- New backend: draft/order services, controllers, routes; pure domain modules for offer pricing, market derivation, and image validation; a shared ownership util (`assertOwnership`, uniform 404 anti-enumeration); one additive migration (`FixedOrder.sourceDraftId` index -> unique, the idempotency mechanism). New frontend: `OriginalPreviewPage`, `DigitalTierSelectPage`, `FixedOrderReviewPage`; `RestoreNewPage` rewritten for market-confirm + free upload (replacing its old legacy multi-step demo flow at the same route).
- Upload: verified by decode (magic bytes + real sharp metadata read), not by client-declared extension/type; 10 MB / 30 MP caps; EXIF-orientation-aware width/height; SHA-256 computed and persisted; stored via the existing R2/mock `StorageService` (private key only, no public URL); protected preview via the existing 15-minute signed-URL mechanism against the original bytes only (never labeled restored/enhanced/processed).
- Pricing: audited first -- no approved PriceBook/USD price exists anywhere in the repo. PKR served from a new, explicitly-labeled `local_fixture` offer provider (reusing the only pre-existing PKR numbers in the codebase, the old demo constants); International/USD returns a truthful `available:false` state and order creation fails closed with `409 PRICING_UNAVAILABLE` -- real USD pricing is recorded as an **owner-approval blocker**.
- Fixed-order creation is transactional; idempotency key = the draft id itself (a draft may source at most one FixedOrder, ever, enforced by the new unique index; a concurrent-race loser catches Prisma P2002 and returns the winner). Client sends only `draftId`/`tier` -- amount/currency always come from the server offer.
- Tests: all 15 required scenarios pass (pure-logic tests for offers/market/image-validation, plus a 15-check disposable-PostgreSQL-17.7 integration test covering ownership, idempotency, no-payment/no-entitlement/no-master/no-execution/no-variant creation, and refresh consistency). The existing P0A `verify-disposable-db.ts` re-run clean (20/20) against the same instance after the schema change. `test:workspace-safe` (legacy flow) unchanged, all passing.
- Browser: 38/38 Playwright tests pass across 4 spec files (9 smoke, 18 responsive, 1 network-safety, 10 new fixed-order-flow tests covering the Pakistan PKR-only path, the International truthful-unavailable path, loading/validation/API-error states, deep-link/refresh, and a 6-viewport check) -- all fully mocked, zero real backend calls, zero external network calls.
- Validation: `npm run lint` exit 0 (0 errors/97 warnings, no new findings), `typecheck`/`build` exit 0, `test:fixed-order-guards`/`test:restoration-safe`/`test:workspace-safe`/`test:browser`/`test:browser:responsive` all exit 0/pass.
- Protected files verified unchanged: `rules.md`, `config/env.ts`, `restoration.service.ts`, current provider routing, all RunPod files, the P0A and P0C1B-amended migrations.
- Pre-existing dirty files separated: all prior packets' diffs left exactly as they were; `apps/api/index.ts`/`auth.middleware.ts` received isolated additive edits around their existing one-line diffs.
- Remaining gaps: USD/PriceBook owner approval; no payment/entitlement/master/execution/variant yet (by design); `/orders` etc. still lack an auth guard (pre-existing, flagged in P0C2).
- Current HEAD at packet start/end: `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce` on `fix/runpod-output-sha256-contract`. No commit made (unrelated protected files remain dirty); safe selective add commands recorded in `AI_code_audit_report_RI.md`, not executed. No push.
- Overall complete/remaining after this packet: 41% / 59%.
- Recommended next packet: R9.2-P1B, payment-attempt boundary and Bank Alfalah evidence-ready adapter shell, using Codex GPT-5.6 Terra at high reasoning effort, Agent mode.

## R9.2-P1B Completion Record — 2026-08-02

Classification: **COMPLETE**. Implements the full scoped boundary (locked FixedOrder -> payment readiness check -> one idempotent PaymentAttempt lifecycle -> evidence-ready Bank Alfalah adapter interface -> truthful customer payment-unavailable state). No live payment, callback, entitlement, Replicate, Sharp, print, admin UI, or deployment work.

- **Bank Alfalah evidence audit**: exhaustive, repeated for this packet -- zero verified sandbox/production endpoint, merchant enrollment, request/response fields, signature/HMAC rule, amount format, return/cancel/webhook contract, status-inquiry/refund API, or sandbox credential name exists anywhere in the tracked repository. Recorded verbatim in `bankAlfalahAdapter.ts`'s `BANK_ALFALAH_MISSING_EVIDENCE_REASONS`. Per this finding, `BankAlfalahAdapter.getReadiness()` always returns `ready:false` with these exact reasons, unconditionally, in every environment -- no config or market/currency combination can make it ready. `createCheckoutSession()` throws (defense-in-depth; unreachable because callers must check readiness first). A test-only `MockPaymentProvider` (never wired into production) exercises the ready/failure paths deterministically with a fake `http://localhost/mock-checkout/...` reference -- zero real network calls.
- **Pricing provenance**: audited -- `FixedOrder.priceBookVersion` existed but was dead (zero call sites); no pricing-source/approval flag existed anywhere. Added the smallest explicit, typed columns (not JSON): `FixedOrderItem.pricingSource` (`String`, default `"local_fixture"`) and `FixedOrderItem.pricingApproved` (`Boolean`, default `false`), via one additive migration (`20260803010000_r92_p1b_fixed_order_item_pricing_provenance`). `FixedOrder.priceBookVersion` is now populated (`"local_fixture-v1"`) instead of staying dead. Every order created by any existing service (all P1A orders) is `local_fixture` / not approved -- truthfully payment-ineligible by construction; no code path in this repository can ever set `pricingApproved:true` without a real, owner-approved price book.
- **Payment domain**: new `PaymentProvider` interface (`domain/payment/paymentProvider.ts`, separate from the legacy generic-`Order` payment interface, which is untouched), `BankAlfalahAdapter` (fails closed), `MockPaymentProvider` (test-only), and a pure `computeOrderPaymentReasons` guard (`domain/payment/paymentReadiness.ts`) checking order type/status/market-currency/amount/items/existing-attempt-status -- mirrors the existing `fixedOrderGuards.ts` style (no DB/network imports, independently unit-tested).
- **Orchestration**: `PaymentAttemptService` + `PaymentAttemptController` + `payment-attempt.routes.ts`, mounted at `GET /api/fixed-orders/:orderNo/payment-readiness`, `POST /api/fixed-orders/:orderNo/payment-attempts`, `GET /api/fixed-orders/:orderNo/payment-attempt` (registered in the route registry and `index.ts` alongside the existing fixed-order router). Every route uses the existing `assertOwnership` (uniform 404). Client requests carry no amount/currency/provider/idempotency-key field at all -- server always reads from the persisted `FixedOrder`, and the idempotency key is deterministically derived server-side (`payment-attempt:${fixedOrderId}`). A second creation request, a concurrent race, or a client-supplied different key all resolve to the same single row, enforced by the pre-existing unique `PaymentAttempt.fixedOrderId` constraint (P2002 caught and the winner refetched). The provider is only ever called *after* the readiness gate passes and *outside* the row-create transaction; a provider failure updates the same row to `FAILED` and a retry reuses it (never a second row).
- **Tests**: all 15 required scenarios pass. Pure-logic: `paymentReadiness.test.ts` (guard reasons) and the existing `fixedOrderGuards.test.ts`/`offerProvider.test.ts` unaffected. Integration: a new 13-check disposable-PostgreSQL-17.7 test (`p1b-payment-attempt-flow.test.ts`) covering local_fixture/unapproved blocking, zero rows/zero external calls on a blocked attempt, uniform not-found for a wrong owner, a mock-ready order producing exactly one attempt matching the server amount, idempotent repeat/concurrent requests, a second idempotency key being rejected at the DB layer, provider-failure retry reusing the same row, a paid/cancelled order being rejected, and zero PaymentEvent/entitlement/master/execution/variant rows anywhere. The existing P1A 15-check flow test and the P0A `verify-disposable-db.ts` (20/20) were re-run clean against the same instance after the schema change.
- **Browser**: `payment-attempt-flow.spec.ts` (new, 6 tests: readiness loading, local_fixture blocked state, provider-unavailable state, server-error/retry, a ready-mock-adapter checkout-link flow that never shows a fake paid/success label, International/USD truthful display, and refresh/deep-link re-check) plus 2 existing `fixed-order-flow.spec.ts` tests updated (the stale "Payment setup pending" placeholder assertion replaced with the real blocked-CTA/reason text). Full suite: 26/26 (`test:browser`), 18/18 (`test:browser:responsive`). All fully mocked, zero real backend process, zero external network calls (the mock checkout URL is always `http://localhost/...` and is only rendered as a link, never auto-navigated).
- **Bug fixed in shared code while wiring this up**: `apps/web/src/lib/api.ts`'s envelope-unwrapping (`payload?.data ?? payload`) collapsed a legitimate `data: null` response (e.g. "no PaymentAttempt exists yet") back to the whole `{success,data}` envelope, because `??` treats an explicit `null` as nullish too. Fixed to check for the `data` key's presence instead of nullish-coalescing its value; existing callers (which always have non-null `data`) are unaffected. Also fixed: the controller's `getAttempt` now returns `200 {data:null}` for "no attempt yet" instead of `404`, since 404 is reserved exclusively for "order not found/not yours" (`assertOwnership`) -- avoids conflating two different meanings under one status code, and avoids a spurious "Failed to load resource" browser console error on every normal review-page load.
- **Documentation reconciliation**: added a clarifying note (did not edit the original sentence) next to P1A's "Remaining Gaps" line about the `20260729000100` migration, since that defect was already fixed by P0C1B one packet earlier -- the original sentence was accurate about P1A's own scope but could be misread as "still broken."
- Validation: `npm run lint` exit 0 (0 errors/97 warnings, identical count to the P1A baseline, no new findings), `typecheck`/`build` exit 0 (both workspaces), `prisma validate`/`generate` exit 0, `test:fixed-order-guards`/`test:workspace-safe`/`test:browser`/`test:browser:responsive` all exit 0/pass, `test:p1a-fixed-order-flow` and `test:p1b-payment-attempt-flow` both pass against a disposable PostgreSQL 17.7 instance (loopback-only, random port, fully torn down afterward).
- Protected files verified unchanged: `rules.md`, `config/env.ts`, `restoration.service.ts`, current Replicate/RunPod provider routing, all RunPod files, Sharp pipeline, print/fulfilment code, live Bank Alfalah credentials (none exist), production database, deployment configuration -- none opened for edit.
- Pre-existing dirty files separated: all prior packets' diffs (P0A/P0B/P0C1/P0C1A/P0C1B/P0C2/P1A) left exactly as they were; `apps/api/index.ts`, `fixed-order.service.ts`, `customerApi.ts`, `portal-types.ts`, and `FixedOrderReviewPage.tsx` received isolated additive edits around their existing diffs.
- Current HEAD at packet start/end: `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce` on `fix/runpod-output-sha256-contract`. No commit made (unrelated protected files remain dirty); safe selective add commands recorded in `AI_code_audit_report_RI.md`, not executed. No push.
- Overall complete/remaining after this packet: 43% / 57%.
- Recommended next packet: R9.2-P1C, owner-approved PriceBook plus verified Bank Alfalah sandbox adapter/callback (plan-only until official technical documents exist, or full implementation if they are supplied), using Codex GPT-5.6 Terra at high reasoning effort for implementation, then GPT-5.6 Sol for an independent payment-security review.

## R9.2-P1C-A1 Canonical Plan Tracking And Validation Repair — 2026-08-03

Classification: **COMPLETE** for canonical-plan tracking and fail-closed validation repair only. No application, payment, restoration, provider, UI, print, or deployment implementation was performed.

- Preflight: branch `fix/runpod-output-sha256-contract`; HEAD `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce`. The canonical plan was previously untracked and not ignored. Pre-existing dirty files were left untouched; they include the already-dirty `.gitignore`, `AI_code_audit_report_RI.md` (ignored), application/source/schema/migration files, existing plan files, RunPod files, and other workspace changes shown by the preflight `git status --short`.
- Tracking repair: staged the exact canonical path `.kilo/plans/1785668100937-dual-market-commerce-bank-alfalah-admin-ui-plan.md` with `git add --`. `.gitignore` was not changed because no rule ignored `.kilo/plans`; no force-add or broad unignore was used. The plan is tracked in the index as a newly staged file, not committed.
- Validation tooling: `rg` was unavailable and was not installed. Native PowerShell `Get-Content`/`Select-String` targeted checks confirmed: `BankAlfalahAdapter.getReadiness()` unconditionally returns `ready:false`; `createCheckoutSession()` throws; fixture pricing uses `source: "local_fixture"`; no approved USD fixture exists; fixed-order creation writes `pricingApproved: false`; `paymentReadiness.ts` rejects unapproved pricing; `payment-attempt.service.ts` does not create PaymentEvent, entitlement, master, execution, or variant rows; and no Bank Alfalah callback route exists.
- Validation results: `git diff --check` and `git diff --cached --check` completed with exit code 0. Any line-ending notices were warnings only, not diff errors. `git ls-files --error-unmatch` for the canonical plan exited 0; `git check-ignore` returned no match; `git status --short` showed the plan as staged `A`. No unrelated file was staged.
- Documentation: `AI_code_audit_report_RI.md` remains unchanged and unstaged because it is an ignored audit report and protected from staging by this packet. No second canonical plan or duplicate packet was created.
- Protected Scope Protocol: `rules.md`, application source, Prisma schema/migrations, env/config/secrets, payment implementation, `restoration.service.ts`, Replicate routing, every RunPod file, Sharp/print code, production database, deployment configuration, and unrelated dirty files were not modified by this repair.
- Baseline remains **43% complete / 57% remaining**. This tracking and validation packet does not increase implementation completion.
- Next action: P1C-B only after owner-approved PKR/USD PriceBook values are supplied. Model: **Codex GPT-5.6 Terra**; mode: **Agent**; effort: **High**.

## R9.2-P1C-A2 Payment Boundary Validator And Plan Finalization — 2026-08-03

Classification: **PARTIAL**. This packet closes the prior P1C-A1 static-evidence gap with the tracked `apps/api/src/domain/payment/p1b-boundary.validator.test.ts` validator. Its exact scope is limited to `payment-attempt.service.ts`, `payment-attempt.routes.ts`, `bankAlfalahAdapter.ts`, `offerProvider.ts`, `fixed-order.service.ts`, and `paymentReadiness.ts`; it makes no repository-wide claim.

- Prior unresolved gap: an ad-hoc PowerShell pattern could not deterministically validate the multiline no-downstream-mutation contract in `payment-attempt.service.ts`.
- Static evidence: the validator uses the local TypeScript compiler API to inspect imports, identifiers/property access, call expressions, and Express route declarations. It rejects forbidden downstream models, prohibited implementation imports, callback/IPN/webhook routes, and network-client calls.
- Truthfulness: synthetic in-memory forbidden snippets must be rejected for `tx.paymentEvent.create(...)`, `tx.restorationEntitlement.create(...)`, `router.post("/bank-alfalah/callback", ...)`, and `fetch("https://payment-provider.example")`; no temporary production-source violation is inserted.
- Static result: `npx tsx apps/api/src/domain/payment/p1b-boundary.validator.test.ts` exited 0 after correcting two validator defects found by its own focused runs (repo-root calculation and lower-camel Prisma delegate detection). Real source passed all six scoped boundaries; all four required synthetic forbidden examples were rejected.
- Behavioral evidence status: the exact existing script is `npm run test:p1b-payment-attempt-flow -w apps/api`. It requires an already-migrated loopback-only `DISPOSABLE_DATABASE_URL`; preflight found no such environment variable, Docker executable, or `psql` executable. The test was not run because creating or pointing at an unapproved database would violate its own safety contract. Therefore its existing zero-row, one-lifecycle, blocked-readiness, and zero-external-call evidence is not re-asserted by this packet. No disposable database, credentials, logs, or temporary data were created.
- Finalization: only the validator and canonical plan are staged. `AI_code_audit_report_RI.md` remains ignored and unstaged. No commit or push is made.
- Protected Scope Protocol: only this validator and this canonical plan are edited. Existing application behavior, Prisma schema/migrations, payment services/adapters/pricing/readiness, restoration/Replicate/RunPod/Sharp/print/UI/deployment code, configuration/secrets, production database, and unrelated dirty files remain untouched.
- Baseline remains **43% complete / 57% remaining**. Owner blockers remain approved PKR/USD PriceBook values, version, effective date/time, and approval evidence, plus verified Bank Alfalah technical documentation before later payment implementation.

## R9.2-P1C-A5 Detached PostgreSQL Lifecycle Proof — 2026-08-03

Classification: **COMPLETE**. Proves a stable disposable-PostgreSQL start/health-check/connect/stop/cleanup cycle using a detached `Start-Process` launch of `postgres.exe` (not `pg_ctl start`), closing the A2 gap where no `psql`/Docker/`DISPOSABLE_DATABASE_URL` was available. No Prisma migrations and no P1B DB test were run in this packet -- both are deferred to A6 as scoped.

- Preflight: branch `fix/runpod-output-sha256-contract`; HEAD `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce` (unchanged start/end). Persistent service `postgresql-X64-17` confirmed `Running`, PID `5312`, data path `C:\Program Files\PostgreSQL\17\data` -- identical before and after this packet. Process-table scan (`Win32_Process`, filtered to `postgres*`) found only children of the persistent service's postmaster (PIDs 7144/6864/7292/7300/7408/7420/7432, all parented by 5312/7144 on port 5433); no orphaned temporary R9.2 data-path process existed at preflight, so no process was stopped or deleted by name.
- Lifecycle method: fresh temp dir `D:\Temp\claude\r92-p1c-a5-20260803030925` (outside the repo). `initdb.exe -U pgtempadmin --pwfile=<random 31-char password> -A scram-sha-256` (random temporary credentials, not trust auth). Free port selected and verified unused: `31291`. Started via `Start-Process -FilePath postgres.exe -ArgumentList -D <datadir> -p 31291 -h 127.0.0.1 -RedirectStandardOutput/-RedirectStandardError -PassThru` (no `pg_ctl start` anywhere in the launch path) -- captured PID `17748` directly from the `-PassThru` handle. State (dataDir/port/pid/user/pwfile/log paths) saved to `state.json` in the same temp dir.
- Verification (all in separate short commands, none over 30s): `pg_isready -h 127.0.0.1 -p 31291` returned "accepting connections" inside the 20s poll window. `Get-NetTCPConnection -LocalPort 31291` showed exactly one listener, `OwningProcess 17748`. `Win32_Process` for PID `17748` showed `CommandLine` containing the exact temp data directory. `pgdata\postmaster.pid` existed and its first four lines matched PID `17748`, the exact data directory, and port `31291`. `psql -c "SELECT version();"` returned `PostgreSQL 17.7 on x86_64-windows`.
- Database probe: `createdb a5_lifecycle_probe` succeeded; `SELECT 1 AS probe;` returned `1`; `dropdb a5_lifecycle_probe` succeeded; a follow-up `pg_database` query for that name returned 0 rows, confirming the drop.
- Stop/cleanup: `pg_ctl -D <exact verified datadir> stop -m fast -w` reported "server stopped". Confirmed PID `17748` no longer exists and port `31291` has no listener. `Remove-Item -Recurse -Force` deleted the entire temp directory (data, logs, pwfile, state.json); `Test-Path` on that directory returned `False`. No repair/retry was needed -- the lifecycle passed on the first attempt.
- Git: only the two required files remained staged throughout and after this packet -- `.kilo/plans/1785668100937-dual-market-commerce-bank-alfalah-admin-ui-plan.md` and `apps/api/src/domain/payment/p1b-boundary.validator.test.ts` (`git status --porcelain` before/after shows an identical unrelated-dirty-file set; no file was cleaned, reverted, unstaged, committed, or pushed).
- Protected Scope Protocol: no application source, Prisma schema/migrations, payment services/adapter, env/config/secrets, `restoration.service.ts`, Replicate routing, RunPod files, Sharp/print code, package files, or `.gitignore` were modified. Only this canonical plan was edited (and is being re-staged after this edit, per instruction).
- Protected detached-start procedure (for reuse in A6 and later packets): `initdb` with a random `--pwfile` and `scram-sha-256` auth into a fresh out-of-repo temp dir -> pick and verify a free high port -> `Start-Process postgres.exe -ArgumentList -D <datadir> -p <port> -h 127.0.0.1 -RedirectStandardOutput/-Error <logs> -PassThru` -> persist `{dataDir, port, pid}` to a temp state file -> `pg_isready` poll (<=20s) -> verify listener/PID-cmdline/`postmaster.pid`/`psql SELECT version()` before trusting the instance -> `pg_ctl -D <exact datadir> stop -m fast -w` -> delete the entire temp dir -> re-verify port free and persistent service PID/path unchanged. Never `pg_ctl start`; never kill a process by name alone -- only by a verified PID whose command line proves the exact temporary data path.
- Baseline remains **43% complete / 57% remaining** -- this is an infrastructure-proof packet only, no implementation percentage change.
- Next action: R9.2-P1C-A6, run migrations, `verify:disposable-db`, and the P1B payment-attempt DB test using this proven lifecycle. Model: **Codex GPT-5.6 Terra**; mode: **Agent**; effort: **Medium**.

## R9.2-P1C-A6 P1B Disposable Database Validation — 2026-08-03

Classification: **COMPLETE**. Using the A5-proven detached `Start-Process` lifecycle, ran `prisma migrate deploy` from empty, `verify:disposable-db`, and the real `test:p1b-payment-attempt-flow` database test against an isolated disposable PostgreSQL instance, then fully cleaned up. P1C-A validation status is now **COMPLETE** (A1's static-only gap and A2's missing-`psql`/DISPOSABLE_DATABASE_URL gap are both closed). No PriceBook, Bank Alfalah checkout/callback, entitlement processing, Replicate, Sharp, print, UI, or deployment work was done.

- Preflight: branch `fix/runpod-output-sha256-contract`; HEAD `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce` (unchanged start/end). Persistent service `postgresql-X64-17` confirmed `Running`, PID `5312`, data path `C:\Program Files\PostgreSQL\17\data` before this packet; re-confirmed identical after. Process scan found only the persistent service's own postmaster/children (no orphaned temporary process). Both required files (`p1b-boundary.validator.test.ts`, canonical plan) confirmed staged before starting; validator sanity-run against real source passed (10/10) before any DB work began.
- Disposable instance: fresh temp dir `D:\Temp\claude\r92-p1c-a6-20260803032017` (outside the repo), `initdb -U pgtempadmin --pwfile=<random 32-char password> -A scram-sha-256`, port `41870` (verified free), started via `Start-Process postgres.exe -ArgumentList -D <datadir> -p 41870 -h 127.0.0.1 -PassThru` (no `pg_ctl start`) -- PID `15180`. Verified: listener on `41870` owned by PID `15180`; `Win32_Process` command line for that PID contained the exact temp data directory; `postmaster.pid` present and matching; `psql SELECT version()` returned `PostgreSQL 17.7 on x86_64-windows`. `DATABASE_URL`/`DISPOSABLE_DATABASE_URL` were set only per-command (never persisted to the user/machine environment).
- Migrations (checkpoint 3/4/5): `prisma migrate deploy` against the empty `r92_p1b_a6_disposable` database applied all **20 migrations** in one unattended pass (identical set to prior packets, including the P1B `20260803010000_r92_p1b_fixed_order_item_pricing_provenance` migration) -- "All migrations have been successfully applied." A second `prisma migrate deploy` reported "No pending migrations to apply." `prisma migrate status` reported "Database schema is up to date!".
- `verify:disposable-db` (checkpoint 6): **20/20 checks passed** (5 schema-introspection checks: enums, tables, foreign keys, unique indexes, CHECK constraints; 15 positive/negative invariant checks, including the second-PaymentAttempt-per-order rejection and every duplicate/uniqueness constraint from P0A).
- `npm run test:p1b-payment-attempt-flow -w apps/api` (checkpoint 7, the exact existing script -- no ad-hoc script needed): **13/13 checks passed**, covering all 15 required scenarios (local_fixture/unapproved blocking with zero rows and zero external calls, uniform not-found for a wrong owner, a mock-ready order producing exactly one attempt matching the server amount, idempotent repeated/concurrent requests reusing that one row, a second idempotency key rejected at the DB unique-constraint layer, a provider-initialization failure reusing/updating the same lifecycle on retry, a paid/cancelled order rejected, and zero PaymentEvent/entitlement/master/execution/variant rows). The `prisma:error` P2002 lines in the console output are the *expected*, caught unique-constraint violations that tests #9/#10 deliberately trigger to prove the one-lifecycle guarantee -- not failures.
- Row-count proof (checkpoint 8, independent of the test's own internal assertions): a direct `psql -f` query (avoiding native-argument quoting issues with inline `-c`) against 14 tables after both scripts' own cleanup ran -- `FixedOrder`, `FixedOrderItem`, `RestorationDraft`, `PaymentAttempt`, `PaymentEvent`, `RestorationEntitlement`, `RestorationMaster`, `ReplicateExecution`, `ImageVariant`, `DigitalEntitlement`, `PrintEntitlement`, `FulfilmentOrder`, `Shipment`, `AddOnOrderLink` -- **every count is exactly 0**.
- Provider/external call count: **zero**. No code path in this packet's tests reaches a real network client (proven by the P1B boundary validator's static AST scan and the P1B test's own `CountingProvider` assertions, both re-verified in this packet).
- Stop/cleanup (checkpoint 9): `pg_ctl -D <exact verified datadir> stop -m fast -w` -> "server stopped"; PID `15180` confirmed gone, port `41870` confirmed free; entire temp directory (`pgdata`, logs, pwfile, state.json, the row-count SQL file) deleted via `Remove-Item -Recurse -Force`, `Test-Path` returned `False`. `DATABASE_URL`/`DISPOSABLE_DATABASE_URL`/`PGPASSWORD` confirmed unset at the environment-variable level (they were only ever process-scoped per command). Repo-wide scan for leftover `pwfile`/`state.json`/`rowcounts.sql`/postgres log files found none inside the repository. Persistent service re-confirmed `Running`, PID `5312`, same data path.
- Final validation suite (checkpoint 10, exact exit codes): P1B boundary validator exit 0 (10/10 PASS); `test:payment-readiness` exit 0; `test:fixed-order-guards` exit 0; `prisma:validate` (workspace script, auto-loads `.env`) exit 0 "The schema ... is valid"; `prisma:generate` exit 0; `git diff --check` exit 0 (line-ending-only warnings on 5 pre-existing files, no errors); `git diff --cached --check` exit 0; `test:workspace-safe` exit 0 (all ten sub-suites report `fail 0`); `npm run lint` exit 0, 0 errors/97 warnings (identical to the P1B baseline, no new findings); `npm run typecheck` exit 0 (both workspaces); `npm run build` exit 0 (both workspaces).
- No repair loop was needed -- every checkpoint passed on the first attempt; no test-harness or validator defect was found, so nothing was repaired and no application/schema/migration behavior was touched.
- Git: only `.kilo/plans/1785668100937-dual-market-commerce-bank-alfalah-admin-ui-plan.md` and `apps/api/src/domain/payment/p1b-boundary.validator.test.ts` remain staged (the plan re-staged after this edit); no other file staged, cleaned, reverted, unstaged, committed, or pushed.
- Protected Scope Protocol: `rules.md`, Prisma schema/finalized migrations, payment application behavior, env/config/secrets, `restoration.service.ts`, Replicate routing, RunPod files, Sharp/print code, production database, deployment configuration, and unrelated dirty files were not modified. **The P1B static boundary validator (`p1b-boundary.validator.test.ts`) and the P1B disposable-database verification procedure (this packet's checkpointed detached-lifecycle method) are now finalized under Protected Scope Protocol** -- any further change to either requires the same owner-authorization discipline used for finalized migrations.
- P1C-A validation status: **COMPLETE** (static boundary evidence from A2 plus real disposable-database evidence from this packet together fully validate the P1B payment-attempt boundary).
- Baseline remains **43% complete / 57% remaining** -- this packet is validation evidence only, no implementation percentage change.
- Next owner action: supply approved values for PKR/USD ORIGINAL/2HD/4HD pricing, PriceBook version, effective date/time, optional expiry, and approval evidence/reference so R9.2-P1C-B can begin. Model: **Codex GPT-5.6 Terra**; mode: **Agent**; effort: **High**.

## R9.2-P1C-B0 Owner PriceBook Decision Packet — 2026-08-03

Classification: **PLAN ONLY**. P1C-A is reconciled as **COMPLETE** by the later A5/A6 records above: the tracked static boundary validator and disposable-database verification procedure are finalized. P1C-B is **BLOCKED_PENDING_OWNER_APPROVAL**. No source, schema, migration, test, package, environment, payment, or configuration file was edited.

### Current inspected state

- Preflight: branch `fix/runpod-output-sha256-contract`; HEAD `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce`. The canonical plan and `apps/api/src/domain/payment/p1b-boundary.validator.test.ts` remain staged; all other dirty files were pre-existing and untouched.
- `offerProvider.ts`: Pakistan returns only `local_fixture` PKR offers (the existing 25000/35000/50000 minor-unit fixtures); International returns unavailable because USD pricing is not approved. No approved USD pricing was found in this inspected source.
- `fixed-order.service.ts`: resolves amount/currency server-side, writes `priceBookVersion` as the fixture version, and writes every fixture item with `pricingSource: "local_fixture"` and `pricingApproved: false`.
- `paymentReadiness.ts`: rejects any item where `pricingApproved` is false, so fixture orders remain payment-ineligible.
- `bankAlfalahAdapter.ts`: `getReadiness()` unconditionally returns `ready:false` and checkout initialization throws. The inspected adapter contains no real endpoint or network client.
- `payment-attempt.routes.ts` and the tracked P1C-A validator contain no callback/IPN/webhook route implementation. No automatic PKR/USD conversion was found in the inspected pricing/payment sources; market/currency pairing is validated rather than converted.
- Protected/pre-existing dirty files remain separated. `AI_code_audit_report_RI.md` remains ignored and unstaged.

### Owner decision table

| Market | Currency | Tier | Amount in minor units |
| --- | --- | --- | --- |
| Pakistan | PKR | ORIGINAL | OWNER_REQUIRED |
| Pakistan | PKR | 2HD | OWNER_REQUIRED |
| Pakistan | PKR | 4HD | OWNER_REQUIRED |
| International | USD | ORIGINAL | OWNER_REQUIRED |
| International | USD | 2HD | OWNER_REQUIRED |
| International | USD | 4HD | OWNER_REQUIRED |

Owner must also provide `PriceBook version`, `effectiveAt` in UTC ISO-8601, optional `expiresAt`, `approvedBy`, approval evidence/reference, whether prices include taxes, confirmation that printing is excluded, and confirmation that no FX conversion is allowed.

```text
PRICEBOOK_APPROVAL
version:
effectiveAt:
expiresAt:
approvedBy:
approvalReference:

PKR_ORIGINAL_MINOR:
PKR_2HD_MINOR:
PKR_4HD_MINOR:

USD_ORIGINAL_MINOR:
USD_2HD_MINOR:
USD_4HD_MINOR:

pricesIncludeTax:
printingIncluded:
automaticFxAllowed: false
END_PRICEBOOK_APPROVAL
```

### Smallest P1C-B implementation map

- Add a typed, versioned PriceBook source/domain module containing exactly six market/tier records, integer minor-unit amounts, approval metadata, and effective/expiry windows.
- Replace the fixture provider wiring with an approved PriceBook provider while retaining existing `local_fixture` orders as permanently unapproved and payment-ineligible.
- Add approval, UTC effective-date, expiry, market/currency, and integer-safe validation; fail closed for missing, future, expired, or unapproved books.
- Preserve immutable FixedOrder snapshots: version/source/market/currency/amount are copied at creation, and later PriceBook changes never mutate existing orders.
- Enforce one active approved version per market/currency and deterministic concurrent order creation; reject overlapping active versions rather than choosing nondeterministically.
- Keep amount/currency absent from client authority, prohibit FX conversion, and leave payment blocked until the selected PriceBook entry is approved.
- Likely future files: `apps/api/src/domain/pricing/priceBook.ts`, `apps/api/src/domain/pricing/priceBookValidator.ts`, `apps/api/src/domain/pricing/approvedOfferProvider.ts`, `apps/api/src/domain/pricing/priceBook.test.ts`, `apps/api/src/services/fixed-order.service.ts`, `apps/api/src/domain/payment/paymentReadiness.ts`, `apps/api/prisma/schema.prisma`, and one additive migration. Exact edits require owner approval and a separate Agent packet.

### Required P1C-B tests

1. Six approved market/tier prices are served exactly once per active version.
2. Pakistan accepts PKR only; International accepts USD only.
3. Fractional, negative, unsafe, zero, and non-integer minor-unit values are rejected.
4. Future, expired, missing, and unapproved PriceBook versions fail closed.
5. Two simultaneously active versions for one market/currency are rejected deterministically.
6. Existing `local_fixture` orders remain unapproved and payment-blocked.
7. FixedOrder stores immutable version, source, market, currency, and amount snapshots.
8. Later PriceBook changes do not alter existing FixedOrders.
9. Client-supplied amount and currency are ignored/rejected and never become authoritative.
10. PaymentAttempt remains blocked until pricing is approved.
11. Concurrent creation uses one active approved version and does not produce conflicting snapshots.
12. No external/payment/provider calls occur during PriceBook validation or blocked payment paths.

- Protected Scope Protocol: this packet edits only the existing canonical plan. No application source, schema/migration, package, env/config/secret, payment, restoration, Replicate, RunPod, Sharp, print, production database, deployment, or unrelated dirty file is changed. Replicate remains production; RunPod remains unauthorized.
- Baseline remains **43% complete / 57% remaining**. Next action after owner approval: R9.2-P1C-B implementation with **Codex GPT-5.6 Terra**, Agent mode, High effort.

## R9.2-P1C-B Owner-Approved PriceBook Implementation — 2026-08-03

Classification: **COMPLETE**. Implements the smallest typed, versioned, server-controlled PriceBook and immutable FixedOrder pricing snapshot described in P1C-B0, using the owner's explicit `PRICEBOOK_APPROVAL` record. No Bank Alfalah checkout/callback, paid-state processing, entitlement creation, Replicate dispatch, Sharp, printing, or deployment work.

### Approval record used (no secrets)

`version: PB-2026-08-03-v1`, `effectiveAt: 2026-08-03T00:00:00Z`, `expiresAt: NONE`, `approvedBy: Muhammad Nazim Saeed`, `approvalReference: OWNER-CHAT-2026-08-03-P1C-B-01`. PKR minor units: ORIGINAL 25000, 2HD 35000, 4HD 50000. USD minor units: ORIGINAL 150, 2HD 250, 4HD 350. `pricesIncludeTax: false`, `printingIncluded: false`, `automaticFxAllowed: false`. All eight approval-gate checks (no `OWNER_REQUIRED` remaining, six positive safe integers, PKR-only for Pakistan, USD-only for International, `automaticFxAllowed` exactly `false`, valid version/UTC dates, approver+reference present, `expiresAt` absent) passed before any file was edited.

### Files added/edited

**New:** `apps/api/src/domain/pricing/priceBook.ts` (the one typed, versioned, owner-approved record), `priceBookValidator.ts` (pure `selectActivePriceBookEntry` guard, injected-clock effective-window/approval/overlap enforcement), `approvedOfferProvider.ts` (real `OfferProvider` implementation replacing the fixture default), `priceBook.test.ts` (9 pure scenarios), `apps/api/src/services/p1c-b-pricebook-flow.test.ts` (10-check disposable-DB integration test), one additive migration `20260803020000_r92_p1c_b_fixed_order_pricebook_snapshot`.
**Edited:** `apps/api/prisma/schema.prisma` (`FixedOrder.priceBookApprovalReference`, `priceBookEffectiveAt` -- additive, nullable), `apps/api/src/domain/pricing/offerProvider.ts` (widened `DigitalOffer.source` to `"local_fixture" | "approved_pricebook"` + three optional provenance fields -- additive, non-breaking), `apps/api/src/services/fixed-order.service.ts` (default provider now `ApprovedOfferProvider`; persists the full immutable snapshot; `FixedOrderSafeView` now exposes `priceBookVersion`/`priceBookApprovalReference`/`priceBookEffectiveAt`), `apps/api/src/services/restoration-draft.service.ts` (default provider changed to match, so the price shown pre-order and the price charged can never drift), `apps/api/src/domain/payment/paymentReadiness.ts` (new snapshot-integrity guard: an approved item requires a non-empty order-level PriceBook version *and* approval reference, or payment fails closed), `apps/api/src/services/payment-attempt.service.ts` (passes the new snapshot fields through).
**Test repairs (documented, not application-behavior weakening):** `p1a-fixed-order-flow.test.ts` (test 8 and the International-order-creation test updated -- USD is now genuinely approved and available, so the old "truthfully unavailable" assertion was stale, exactly like the P1B Playwright placeholder fix; both test files' order services now inject a deterministic post-effectiveAt clock instead of depending on wall-clock timing), `p1b-payment-attempt-flow.test.ts` (`orderService` now explicitly pinned to `FixtureOfferProvider` so its "local_fixture blocked" premise stays intact now that the service's *default* changed; `approvePricing()` test helper now also sets the order-level PriceBook version/approval reference, since the new snapshot-integrity guard correctly rejects an approved item with an incomplete snapshot), `apps/api/src/domain/payment/p1b-boundary.validator.test.ts` (one check repaired -- see below).

### Boundary-validator repair (genuine defect, documented per the repair-loop rule)

The finalized P1B validator's "fixed-order fixture approval remains false" check required the literal text `pricingApproved: false` -- correct only because nothing could ever be approved yet. Real owner approval now legitimately makes `pricingApproved: true` possible by design, so that literal-text check is stale. Repaired to test the actually-required, *stronger* invariant: `pricingApproved` must be strictly derived from `offer.source === "approved_pricebook"` (regex-verified), never a hardcoded blanket boolean in either direction (a `requireNoMatch` on a literal `pricingApproved: true` now also guards against a future regression). This is the exact "validator repair reflecting intended behavior change" scenario the repair-loop rule anticipates, not a weakened guard. Full 10/10 validator pass confirmed after the repair.

### Schema/migration result

Additive only, hand-inspected, UTF-8 without BOM, no drops/destructive alterations/backfills:
```sql
ALTER TABLE "FixedOrder" ADD COLUMN "priceBookApprovalReference" TEXT;
ALTER TABLE "FixedOrder" ADD COLUMN "priceBookEffectiveAt" TIMESTAMP(3);
```
Both nullable, no default beyond `NULL` -- existing/local_fixture orders correctly show `NULL` for both (truthful: they have no approval reference or PriceBook effective date), never backfilled to a fabricated value. Rollback: disable the feature by reverting `FixedOrderService`'s/`RestorationDraftService`'s default constructor argument to `FixtureOfferProvider` (one line each) -- the additive columns can remain in place harmlessly, or be dropped in a separate, explicitly authorized migration; no existing order is affected either way.

### Disposable-database result (A5/A6 lifecycle, PostgreSQL 17.7, detached `Start-Process`)

Fresh temp instance (PID `4948`, then a `createdb` client hang on a missing `PGPASSWORD` was found, killed by verified PID, and retried successfully -- the server process itself was never affected). `prisma migrate deploy` from empty: **21 migrations** applied in one pass (20 prior + this packet's one). Second deploy: "No pending migrations to apply." `migrate status`: "Database schema is up to date!" `verify:disposable-db`: **20/20**. `p1c-b-pricebook-flow.test.ts`: **10/10** (covering all 9 required DB-level scenarios). Re-ran `p1a-fixed-order-flow.test.ts` (**15/15**, including the updated USD-approved assertions) and `p1b-payment-attempt-flow.test.ts` (**13/13**) against the same instance -- both pass with the new default provider and the new snapshot-integrity guard. Independent `psql`-file row-count query across all 13 downstream/payment tables after every test's own cleanup: **every count is exactly 0**. Instance stopped via `pg_ctl` with the exact data directory, PID/port confirmed gone/free, entire temp directory deleted, persistent service (`postgresql-X64-17`, PID `5312`, same data path) re-confirmed unchanged.

### PriceBook values, effective-window, and immutability proof

Six approved prices resolve exactly (PKR 25000/35000/50000, USD 150/250/350) from `ApprovedOfferProvider`, both via the pure `priceBook.test.ts` and the live disposable-DB flow. Effective-window boundary proven with an injected clock: inactive at `effectiveStartsAt - 1ms`, active at `effectiveStartsAt` exactly (inclusive). Future/expired/unapproved/overlapping/empty PriceBook sets all fail closed with an explicit reason, never a best guess. A real FixedOrder created under the approved book persists `priceBookVersion: "PB-2026-08-03-v1"`, `priceBookApprovalReference: "OWNER-CHAT-2026-08-03-P1C-B-01"`, `priceBookEffectiveAt: 2026-08-03T00:00:00.000Z`, and the exact minor-unit amount; re-fetching that same order through a service instance wired to a *different, later* PriceBook (different version, different prices) returns the untouched original snapshot -- proving persisted orders are immune to future PriceBook changes, not merely untested.

### Fixture-pricing, concurrency, and payment-readiness results

`local_fixture` orders (created via an explicitly-pinned `FixtureOfferProvider`) remain `pricingApproved:false`, `priceBookApprovalReference: null`, and payment-ineligible -- unchanged and untouched. Two concurrent `createRestorationDigitalOrder` calls for different drafts both resolved the identical `PB-2026-08-03-v1` version and identical 2HD amount (35000), proving no conflicting snapshot under concurrency (PriceBook selection is a pure in-memory function of `now` + static data -- no time-of-check/time-of-use gap is possible). A deliberately corrupted snapshot (an approved item with its order-level approval reference nulled out) is rejected by the new payment-readiness guard with an explicit "incomplete snapshot" reason. A genuinely valid, fully-approved snapshot passes every pricing check (no pricing-related blocker in the reasons array) yet payment remains unavailable, because the real `BankAlfalahAdapter` is still unconditionally `ready:false` -- proving the pricing and provider gates are independent and both required.

### Row counts and external calls

Zero `PaymentEvent`/`RestorationEntitlement`/`RestorationMaster`/`ReplicateExecution`/`ImageVariant` rows anywhere in this packet's tests (independently re-verified via direct `psql` query, not just the tests' own assertions). **Zero external/provider/payment network calls** -- `ApprovedOfferProvider`/`priceBookValidator.ts` are pure in-memory modules with no network imports at all, and the `CountingProvider` wrapper used throughout confirms zero `createCheckoutSession` invocations during PriceBook validation or any blocked-payment path.

### Validation (exact results)

`test:price-book` PASS (9/9); `test:payment-readiness` PASS; `test:fixed-order-guards` PASS; `test:offer-provider` PASS; P1B boundary validator PASS (10/10, post-repair); `verify:disposable-db` 20/20; `test:p1a-fixed-order-flow` 15/15; `test:p1b-payment-attempt-flow` 13/13; `test:p1c-b-pricebook-flow` 10/10; `test:workspace-safe` exit 0 (all ten sub-suites `fail 0`); `test:browser` 26/26 (fully mocked, unaffected by backend pricing changes since every API response is intercepted); `test:browser:responsive` 18/18; `npm run lint` exit 0, **0 errors / 97 warnings** (one transient unused-variable error found and fixed mid-packet, back to the exact P1B baseline count); `npm run typecheck` exit 0 (both workspaces); `npm run build` exit 0 (both workspaces); `npx prisma validate` exit 0; `npx prisma generate` exit 0; `prisma migrate deploy` x2 + `migrate status` all as reported above; `git diff --check` exit 0 (line-ending-only warnings on 6 pre-existing/this-packet's-own files, no errors); `git diff --cached --check` exit 0.

### Protected Scope Protocol

`rules.md`, finalized historical migrations, Bank Alfalah live adapter/callback, `restoration.service.ts`, Replicate routing, RunPod files, Sharp/print fulfilment, production database, deployment configuration, and unrelated dirty files were not modified. Replicate remains production; RunPod remains unauthorized. **`priceBook.ts` (the approved data record), `priceBookValidator.ts`, `approvedOfferProvider.ts`, the immutable FixedOrder snapshot fields/invariants, and the repaired P1B boundary validator are now finalized under Protected Scope Protocol** -- any further change (including a future PriceBook version) requires the same owner-approval-gate discipline used here.

### Pre-existing dirty files separated

All prior packets' diffs (P0A through P1C-A6) left exactly as they were; every P1C-B edit was an isolated, additive change layered on top of each file's existing diff, verified via targeted review before editing.

### Git

HEAD/branch unchanged: `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce` on `fix/runpod-output-sha256-contract`. No commit, no push. Staged, per this packet's explicit instruction: this canonical plan, the repaired `p1b-boundary.validator.test.ts`, `schema.prisma`, the new additive migration, `apps/api/package.json` (new test scripts), and every P1C-B implementation/test file (`offerProvider.ts`, `priceBook.ts`, `priceBookValidator.ts`, `approvedOfferProvider.ts`, `priceBook.test.ts`, `paymentReadiness.ts`, `paymentReadiness.test.ts`, `fixed-order.service.ts`, `restoration-draft.service.ts`, `payment-attempt.service.ts`, `p1a-fixed-order-flow.test.ts`, `p1b-payment-attempt-flow.test.ts`, `p1c-b-pricebook-flow.test.ts`). `schema.prisma` and `apps/api/package.json` are tracked files never staged in any prior packet, so staging them now necessarily includes their full accumulated P0A-through-P1C-B diff, not only this packet's delta -- an unavoidable consequence of git's file-level staging granularity, not a scope expansion. All other pre-existing dirty/protected files (`rules.md`, `config/env.ts`, `restoration.service.ts`, controllers, routes, RunPod files, frontend files, etc.) remain untouched and unstaged.

- Overall complete/remaining after this packet: **46% / 54%** (up from 43%/57% -- a conservative increase reflecting that market/currency pricing and the fixed-order model both took real, validated, tested steps forward; Bank Alfalah, UI, admin, and print remain untouched).
- Recommended next packet: R9.2-P1C-C, verified Bank Alfalah sandbox checkout implementation -- only after authenticated official technical documentation and sandbox credentials are supplied. Model: **Codex GPT-5.6 Terra**; mode: **Agent**; effort: **High**.

## R9.2-P1C-C0 Bank Alfalah Evidence Gate — 2026-08-03

Classification: **BLOCKED_EXTERNAL_EVIDENCE**. Plan/audit only. No checkout, callback/IPN, status inquiry, refund, paid-state, entitlement, Replicate, fulfilment, or deployment implementation was performed.

- Preflight: branch `fix/runpod-output-sha256-contract`; HEAD `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce`. Existing P1C-B files and the repaired P1B validator remain staged; unrelated dirty files remain untouched. `AI_code_audit_report_RI.md` remains ignored and unstaged.
- Public-source search: the official public Bank Alfalah homepage was reachable at `https://www.bankalfalah.com/`, but the public pages inspected did not expose an authenticated merchant gateway specification. Candidate public payment-gateway/e-commerce URLs returned 404. GitHub unauthenticated code search was sign-in gated and produced no authenticated protocol evidence. Public or historical references are not accepted as merchant protocol authority.
- Authenticated source/version: **MISSING**. No authenticated official technical document title, version, date, merchant-specific source, or bank-issued integration package was supplied or found.

### Evidence status

| Required category | Status |
| --- | --- |
| Official document title/version/date/authenticated source | MISSING |
| Sandbox and production base URLs | MISSING |
| Merchant payment flow | MISSING |
| Merchant/store/terminal identifiers | MISSING |
| Authentication and credential type | MISSING |
| Signing/hash algorithm and canonical field order | MISSING |
| Amount and currency formatting | MISSING |
| Create-payment request/response fields | MISSING |
| Browser return specification | MISSING |
| Server callback/IPN specification | MISSING |
| Status inquiry specification | MISSING |
| Refund/cancel specification | MISSING |
| Transaction states/error codes | MISSING |
| Replay, duplicate, idempotency rules | MISSING |
| Timestamp, expiry, timezone rules | MISSING |
| Sandbox test accounts/cards/wallets/cases | MISSING |
| IP/domain allowlisting/certificate requirements | MISSING |
| Official support contact and sandbox activation evidence | MISSING |

### Fail-closed rules

- `BankAlfalahAdapter.getReadiness()` remains unconditionally `ready:false`; checkout initialization still throws.
- Browser returns cannot mark an order paid. Only authenticated server verification may transition payment state.
- No callback/IPN handler, PaymentEvent, entitlement, fulfilment, or Replicate action may be added until authenticated protocol evidence is accepted. No Replicate, entitlement, or fulfilment action may run inside callback processing.

```text
BANK_ALFALAH_SANDBOX_INPUT

officialTechnicalDocument: MISSING
documentVersion: MISSING
authenticatedSource: MISSING
sandboxBaseUrl: MISSING
paymentFlow: MISSING
merchantIdAvailable: MISSING
storeOrTerminalIdAvailable: MISSING
sandboxCredentialsAvailable: MISSING
signingSecretOrCertificateAvailable: MISSING
callbackIpnSpecAvailable: MISSING
statusInquirySpecAvailable: MISSING
refundSpecAvailable: MISSING
testCasesAvailable: MISSING
allowlistingCompleted: MISSING
sandboxAccountActivated: MISSING
bankTechnicalContact: MISSING

END_BANK_ALFALAH_SANDBOX_INPUT
```

- P1C-B finalized files remain protected and staged as previously recorded: typed PriceBook, validation/provider sources and tests, immutable FixedOrder snapshot migration/service changes, payment-readiness updates, P1A/P1B/P1C-B tests, package script updates, and the P1B boundary validator. No P1C-B implementation file was edited in this packet.
- Protected Scope Protocol: only this canonical plan was edited and re-staged. `rules.md`, application/payment code, schema/migrations, env/config/secrets, restoration/Replicate/RunPod, Sharp/print, production database, deployment configuration, and unrelated dirty files were not modified. Replicate remains production; RunPod remains unauthorized.
- Overall progress remains **46% complete / 54% remaining**. Next action after all authenticated evidence is supplied: R9.2-P1C-C, Bank Alfalah sandbox checkout and server-verification implementation, using **Codex GPT-5.6 Terra**, Agent mode, High effort; then GPT-5.6 Sol independent payment-security review.

## R9.2-P1C-C1 BAF APG Guide Review — 2026-08-03

The workspace `BAF/APG Merchant Integration Guide v1.1.pdf` was inspected. It is a 29-page document titled **Alfa Payment Gateway Merchant Integration Guide V 1.1** and contains materially useful APG integration information. It is not yet authenticated merchant-specific activation evidence, so application implementation remains blocked pending owner/bank confirmation of applicability and credentials.

### Evidence extracted from the guide

- Integration modes: Alfa Wallet and Alfalah Bank Account use REST API (redirection also supported); Credit/Debit Card uses secure APG redirection.
- Sandbox REST endpoints: `https://sandbox.bankalfalah.com/HS/api/HSAPI/HSAPI`, `/HS/api/Tran/DoTran`, and `/HS/api/ProcessTran/ProTran`.
- Production REST endpoints: `https://payments.bankalfalah.com/HS/api/HSAPI/HSAPI`, `/HS/api/Tran/DoTran`, and `/HS/api/ProcessTran/ProTran`.
- Card redirection endpoints: sandbox `https://sandbox.bankalfalah.com/HS/HS/HS` and `https://sandbox.bankalfalah.com/SSO/SSO/SSO`; production equivalents use `https://payments.bankalfalah.com`.
- Channel identifiers: API `1002`; page redirection `1001`.
- Handshake fields include merchant/store identifiers, return URL, merchant hash, username/password, transaction reference, and encrypted request hash. API flow is handshake -> transaction request -> process transaction request.
- Request encryption is documented as AES/CBC/PKCS7Padding using merchant `Key1` and `Key2`; field serialization is generated from form input IDs in encountered order and excludes the trailing delimiter. This ordering must be confirmed against the merchant-specific package before implementation.
- API transaction fields include currency, transaction type, transaction reference, amount, account number, country, email, mobile, auth token, OTP/OTAC fields, hash key, and request hash. The guide explicitly states the REST transaction currency value is always `PKR` in the documented example.
- Browser return is described as untrusted correlation input: the return URL receives an order alias, after which the merchant performs a server-side APG status inquiry.
- Status inquiry is documented as a GET pattern under `/HS/api/IPN/OrderStatus/{MerchantId}/{StoreId}/{OrderId}` and returns response code, transaction reference/id, amount, and transaction status. A configurable listener URL receives a POST containing a `url` parameter, after which the merchant GETs the status URL.
- IPN listener requires Bank Alfalah network allowlisting. The guide says the order may be completed based on `TransactionStatus = "Paid"`, but ThanNow must additionally require authenticated server verification, exact order/amount/currency matching, replay-safe deduplication, and transaction boundaries.
- Go-live requires merchant portal sandbox access, generated credentials, and production encryption keys supplied by the APG business owner.

### Evidence still missing or requiring confirmation

- Authenticated provenance for this PDF: merchant portal/download source, issuance date, and confirmation that v1.1 applies to ThanNow’s account.
- ThanNow merchant/store/terminal identifiers and sandbox activation confirmation.
- Credential delivery and secret/certificate type through an approved secure channel.
- Whether the documented REST flow supports ThanNow’s International USD PriceBook. The guide’s explicit REST currency note says `PKR`; no USD support is established.
- Exact merchant-specific canonical field order for every endpoint and whether the sample form-ID ordering is normative.
- Request-hash encoding/output representation and key length/format constraints.
- Complete transaction status/error-code catalogue, timeout/expiry rules, replay/duplicate/idempotency guarantees, and callback acknowledgement/retry semantics.
- Refund, void, cancellation, partial-refund, dispute, and settlement/reconciliation API contract. The guide shows a portal “Refunds” menu but does not provide an API specification.
- Official sandbox test accounts, cards/wallets, test scenarios, certificate requirements, and technical contact/activation timeline.

Classification remains **BLOCKED_MISSING_EVIDENCE** for implementation. The PDF may be treated as a candidate protocol source for a follow-up evidence review, not as permission to enable the adapter. No payment code was changed; `BankAlfalahAdapter` remains fail-closed.

## R9.2-P2R-UI Customer Order/Payment-State UI — 2026-08-03

Implemented the smallest truthful customer UI on top of already-persisted, already-implemented read-only APIs (`GET /api/fixed-orders/:orderNo`, `GET /api/fixed-orders/:orderNo/payment-readiness`, `GET /api/fixed-orders/:orderNo/payment-attempt`). No backend endpoint, schema, payment logic, Bank Alfalah adapter, PriceBook/FixedOrder invariant, restoration engine, Replicate/RunPod, or print code was added or modified.

### UI states/files implemented

- `apps/web/src/lib/portal-types.ts`: `FixedOrderRecord` now carries `priceBookVersion`, `priceBookApprovalReference`, `priceBookEffectiveAt` — fields the backend (`FixedOrderService.toSafeView`) already returned but the frontend type previously dropped.
- `apps/web/src/pages/FixedOrderReviewPage.tsx`:
  - Shows the PriceBook version (`order.priceBookVersion`) when present.
  - Shows an explicit approved-vs-fixture pricing state (`data-testid="pricing-state-approved"` / `"pricing-state-unapproved"`), derived only from each item's server-returned `pricingApproved`/`pricingSource` — unapproved/fixture pricing is always rendered inside the existing payment-blocked panel too, never as payable.
  - Adds an explicit "No payment attempt has been started yet" state (`data-testid="attempt-status"`) for the previously-blank case where readiness is ready and no `PaymentAttempt` exists yet — still zero auto-POST on mount; the state is purely a GET-derived render.
  - Adds `role="status"`/`aria-live="polite"` to informational panels (readiness loading, blocked-payment reasons, attempt status) and `role="alert"` to error panels, plus an `aria-label` on the blocking-reasons list, so loading/blocked/error/attempt states are accessible, not just visually distinct.
  - No behavior change to server-authority rules already enforced here: amount/currency/provider/status always come from the server payload; `PAID`/any terminal status is rendered only from `paymentAttemptApi.getAttempt()`'s persisted response; no `useSearchParams`-derived value ever feeds a payment or pricing state; `createAttempt` is still only ever called from the `Pay Now`/`Retry Payment` button click handler, never from a `useEffect` on mount.
- `apps/web/tests/browser/fixed-order-review-ui.spec.ts` (new, Playwright, following the existing `tests/browser/fixtures` network-guard/accessibility conventions): approved order + PriceBook version + integer-minor-unit formatting; fixture/unapproved pricing shown as blocked, never approved; every server-provided blocking reason rendered (not just the first); PENDING/terminal attempt status rendered from the persisted API; a PAID attempt renders only from a mocked persisted API response, and an identical request with fake `?paid=true&status=success&return=1` query params but a null-attempt API response proves query-string manipulation alone cannot produce a PAID (or any "PAID") render; accessible `role="status"` panels are present.
  Registered in `apps/web/package.json`'s `test:browser` script alongside the existing `fixed-order-flow.spec.ts` / `payment-attempt-flow.spec.ts`.

### Admin UI — PARTIAL_BACKEND_READ_GAP

No admin controller/route exposes a read endpoint for `FixedOrder`, `PriceBook`, or `PaymentAttempt` (`apps/api/src/controllers/fixed-order.controller.ts` and `payment-attempt.controller.ts` only define customer-facing, ownership-checked routes; no admin equivalent exists). Per this packet's instruction to skip rather than invent a backend endpoint, no admin UI was added for these three concepts — recorded here as `PARTIAL_BACKEND_READ_GAP` pending a future read-only admin endpoint being added by a backend packet.

### Validation evidence (this packet)

- `npx playwright test tests/browser/fixed-order-review-ui.spec.ts tests/browser/payment-attempt-flow.spec.ts` → 12/12 passed.
- `npx playwright test tests/browser/smoke.spec.ts tests/browser/network-safety.spec.ts tests/browser/fixed-order-flow.spec.ts` (pre-existing regression, unmodified) → 20/20 passed.
- `npm run typecheck` (apps/web, `tsc -p tsconfig.json --noEmit`) → exit 0, no output.
- `npm run build` (apps/web, `tsc && vite build`) → exit 0, built successfully.
- `npx eslint apps/web/src/pages/FixedOrderReviewPage.tsx apps/web/src/lib/portal-types.ts apps/web/tests/browser/fixed-order-review-ui.spec.ts` → exit 0, no findings.
- `git diff --check` and `git diff --cached --check` → both exit 0 (only pre-existing, unrelated LF/CRLF warnings on files this packet did not touch).
- Responsive coverage: the pre-existing `tests/browser/responsive.spec.ts` (360/390/430/768/1024/1440px matrix) and `fixed-order-flow.spec.ts`'s 360/390/430/768/1024/1440px block were not modified and continue to pass; the new spec's assertions are state/content-based per the existing project convention, run under the same viewport-capable Playwright harness.
- External-network-call guard: every new test uses the existing `tests/browser/fixtures` `blockedRequests`/`expectCleanNetwork` fixture, which aborts and records any non-mocked, non-local request; all new tests assert a clean network via `expectCleanNetwork(blockedRequests)` where applicable, and the pre-existing `network-safety.spec.ts` (unmodified) continues to pass.

### Protected Scope Protocol

Only this canonical plan, `apps/web/src/lib/portal-types.ts`, `apps/web/src/pages/FixedOrderReviewPage.tsx`, `apps/web/package.json` (test:browser script line only), and the new `apps/web/tests/browser/fixed-order-review-ui.spec.ts` were added/edited by this packet. No backend/API file, Prisma schema/migration, payment service/adapter/domain file, restoration/Replicate/RunPod file, Sharp/print file, `rules.md`, env/config/secret, production database, deployment configuration, or any other pre-existing dirty/staged file was touched. `BankAlfalahAdapter` remains `ready:false`; no Return URL/IPN/callback/status-inquiry/credential/verification code was added.

### Updated 13-stage table (conservative)

| Stage | Complete | Remaining |
| --- | --- | --- |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 75% | 25% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 40% | 60% |
| Admin operations/RBAC | 25% | 75% |
| Test/browser/deployment readiness | 68% | 32% |
| **Overall R9.2 launch readiness** | **47%** | **53%** |

Increase reflects only the "Customer two-flow UI" (33%→40%: PriceBook-version/pricing-state/no-attempt-yet/accessibility display truthfully wired to already-existing read APIs) and "Test/browser/deployment readiness" (65%→68%: one new focused Playwright spec, green, registered in the npm script) rows moving forward with real, validated, tested work. Bank Alfalah, admin UI, print, and every other row are unchanged — this packet did not touch them. Overall rounds conservatively from 46% to 47%.

- Suggested next packet: R9.2-P1C-C (Bank Alfalah sandbox checkout and server-side verification), still blocked on authenticated merchant-specific credentials/evidence per the BAF APG guide review above; recommended model **Codex GPT-5.6 Terra**, Agent mode, High effort, followed by an independent payment-security review pass.

## R9.2-P2R-ADMIN Read-Only Commerce Admin API + UI — 2026-08-03

Classification: **COMPLETE for its stated scope**. Closes the previously-recorded gap that no admin controller/route exposed any read endpoint for FixedOrder, PriceBook, or PaymentAttempt. Bank Alfalah remains `ready:false`; no checkout, Return/IPN, callback, status inquiry, paid-state persistence, refund, or verification logic was added anywhere. No schema/migration change. `restoration.service.ts`, RunPod, Sharp/print code, and every other protected file listed in "Exact Frozen Files" above are untouched.

### New routes

- `GET /api/admin/commerce-orders` — paginated list (`page`/`pageSize` query params, `pageSize` capped at 100, default 20; optional filters `orderNo`, `status`, `market`, `currency`, `paymentStatus`; deterministic `createdAt desc, id desc` ordering; response `{ items, total, page, pageSize }`).
- `GET /api/admin/commerce-orders/:orderNo` — single-order detail. Unknown `orderNo` returns a generic 404 (`ORDER_NOT_FOUND` / "Order not found", no stack trace, no other detail).
- Both routes follow the pre-existing route-registration convention in `apps/api/src/routes/admin.routes.ts` (same file as `/admin/restorations`, `/admin/payments`, etc.) rather than inventing a new pattern; no deviation from the existing convention was needed.

### Exact returned fields

- List item: `id`, `orderNo`, `type`, `market`, `currency`, `totalAmountMinor` (string, integer minor units), `status`, `paymentStatus` (nullable), `createdAt`, `updatedAt`.
- Detail: `orderNo`, `type`, `status`, `market`, `currency`, `totalAmountMinor`; `priceBookVersion`, `priceBookApprovalReference`, `priceBookEffectiveAt` (the immutable PriceBook snapshot, read as-is, never recomputed); `items[]` (`id`, `kind`, `tierOrSku`, `quantity`, `unitAmountMinor`, `totalAmountMinor`, `currency`, `pricingSource`, `pricingApproved`); `paymentReadiness` (`ready`, `reasons[]`, computed by calling the existing `computeOrderPaymentReasons()` plus `BankAlfalahAdapter.getReadiness()` — not reimplemented); `paymentAttempt` (`id`, `status`, `provider`, `providerRef`, or `null`); `createdAt`, `updatedAt`.
- Explicitly never returned: `ownerUserId`, `guestOwnershipTokenHash`, any encryption key/credential/secret, raw provider webhook payloads, auth tokens/JWTs, or stack traces.

### RBAC

- Both routes are wired through the existing, unmodified `requireAdminAuth(config, allowedRoles)` middleware (`apps/api/src/middleware/admin-auth.middleware.ts` — no change made to this file).
- Allowed roles: `SUPER_ADMIN`, `OPERATIONS`, `FINANCE` (matches the canonical plan's admin module table, section 9, "Fixed restoration orders" row: `SUPER_ADMIN, OPERATIONS; FINANCE read`). No write role exists because no mutation endpoint exists on this controller at all.
- Proof: `apps/api/src/routes/admin-commerce-routes.test.ts` — static source-scan assertion that no `post`/`put`/`patch`/`delete` verb is ever registered on `/admin/commerce-orders`, plus live exercise of the real `requireAdminAuth` middleware proving unauthenticated (401), wrong-role (403), and each of the three allowed roles (success) with a faked session store.

### UI

- `apps/web/src/pages/AdminCommerceOrdersPage.tsx` — filterable, paginated list (reuses `Pagination`, `StatusBadge`, `formatMoney`/`formatDateTime` exactly as `AdminWalletsPage.tsx` does); loading/error-with-retry/empty states; zero non-GET calls.
- `apps/web/src/pages/AdminCommerceOrderDetailPage.tsx` — order summary, PriceBook provenance panel, per-item approved/unapproved pricing indicator, payment-readiness reasons (every reason rendered, not just the first), payment-attempt state or explicit "no payment attempt has been started" state, safe not-found panel for an unknown order. Zero mutation control anywhere (no mark-paid, retry-provider, refund, or fulfilment trigger); the page issues exactly one GET per load.
- Routes added in `apps/web/src/App.tsx`: `/admin/commerce-orders`, `/admin/commerce-orders/:orderNo` (inside the existing `RequireAdminPortal`-gated admin layout, unchanged).
- Types added to `apps/web/src/lib/portal-types.ts` (`AdminCommerceOrderListItem`, `AdminCommerceOrderItemView`, `AdminCommerceOrderDetail`); methods added to `apps/web/src/services/adminApi.ts` (`commerceOrders`, `commerceOrderDetail`), both GET-only.

### Tests added

- `apps/api/src/services/admin-commerce-read.test.ts` (9 cases, `node:test`, no live DB — `prisma.fixedOrder` is monkey-patched with recording fakes): no-secret-field assertion on list and detail (`assertNoForbiddenFields`, scans every key against `/token|secret|password|authorization|key$/i`), page-size cap, default-fallback pagination, filter-to-`where`-clause mapping (all five filters), deterministic ordering, safe 404 for an unknown order, **zero write-capable Prisma method invoked** (`create`/`update`/`delete`/`upsert`/`deleteMany`/`updateMany`/`createMany` all wired to throw if ever called; asserted empty after exercising both read paths), fixture/unapproved-pricing-surfaces-as-blocked.
- `apps/api/src/routes/admin-commerce-routes.test.ts` (5 cases): route-wiring/RBAC proof described above.
- `apps/web/tests/browser/admin-commerce-orders-ui.spec.ts` (12 cases, Playwright, fully mocked via `page.route`, no real API process): list render + only-GET-methods-seen proof, empty state, error+retry state, responsive 360/390/430px (both list and detail), keyboard-accessible/labeled filter inputs, PriceBook provenance + approved pricing + no-attempt state, fixture/unapproved pricing renders as `payment-blocked` with the "provider unavailable" reason distinctly visible, existing (`CANCELLED_BY_CUSTOMER`) and `PAID` payment-attempt states rendered strictly from the mocked API response (a manipulated `?paid=true&status=success` query string is asserted to have no effect, matching the same proof pattern already used in `fixed-order-review-ui.spec.ts`), safe not-found state for an unknown order, only-GET-requests-issued proof on the detail page.
- Both new npm scripts (`test:admin-commerce-read`, `test:admin-commerce-routes` in `apps/api/package.json`; `test:browser:admin-commerce` in `apps/web/package.json`, and the new spec appended to the existing `test:browser` script) all run green; all 32 pre-existing customer-facing browser specs (`smoke`, `network-safety`, `fixed-order-flow`, `payment-attempt-flow`, `fixed-order-review-ui`) and all 18 `responsive.spec.ts` cases were re-run unmodified and still pass.

### Bank Alfalah and verified-payment holds (explicit)

- `BankAlfalahAdapter` remains `ready:false` unconditionally; `getReadiness()` is called read-only from the admin detail service exactly as it already is from `PaymentAttemptService` — no new call site touches the network, and none of this packet's code can ever construct a checkout session.
- No `PAYMENT_VERIFIED`/paid state is ever written by this packet. The admin UI displays whatever `PaymentAttempt.status` the database already holds (including `PAID`, if a future packet ever writes one) — it cannot fabricate, infer, or accept one from a query string, since the admin pages read no query parameters at all.

### Protected Scope Protocol

Under the "Exact Frozen Files" list above, this packet did not modify `rules.md`, any RunPod file, Bank Alfalah files/config, payment verification logic, `restoration.service.ts`, schema/migrations, or any pre-existing dirty file from other in-flight phases (FixedOrder/PriceBook/PaymentAttempt/RunPod restoration-engine work staged before this packet started was left byte-for-byte unchanged and reconfirmed via `git status --porcelain=v1` before/after). The finalized read boundary above is the smallest closure of the previously-identified admin visibility gap; no write/mutation admin endpoint for commerce orders exists anywhere in the repository after this packet.

### Updated 13-stage table

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 75% | 25% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 40% | 60% |
| Admin operations/RBAC | 35% | 65% |
| Test/browser/deployment readiness | 70% | 30% |
| **Overall R9.2 launch readiness** | **48%** | **52%** |

Increase reflects only "Admin operations/RBAC" (25%→35%: the first real read-only admin visibility into FixedOrder/PriceBook/PaymentAttempt now exists and is RBAC-enforced and tested — the remaining 65% is every other admin module in section 9's table: execution/master/variant/entitlement/print/fulfilment/refunds/audit, and any write/action endpoint) and "Test/browser/deployment readiness" (68%→70%: 26 new green tests — 9 service, 5 route/RBAC, 12 browser — with all pre-existing tests re-run and still passing). No other row changed. Overall rounds conservatively from 47% to 48%.

- Suggested next packet: candidate B from the R9.2-P2R sequencing table above (upload/source-preview persistence hardening) remains blocked pending a concrete security-finding scope; alternatively, admin write/action modules (retry/audit) for the commerce-orders resource, still gated on the same payment/entitlement authority boundary as candidates A/C. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort** for further read-only admin modules (execution/master/variant visibility once those tables are populated by a future packet); **High effort** if any write/action endpoint is ever authorized.

## R9.2-P2R-AUTH Customer Route Auth Hardening — 2026-08-03

Classification: **COMPLETE for its stated scope**. Pure frontend routing/guard hardening using the pre-existing auth mechanism (`apps/web/src/lib/auth.tsx`'s `AuthProvider`/`useAuth`, `apps/web/src/components/RequireAuth.tsx`). No new auth system was built. No backend auth/payment/admin RBAC file, schema/migration, Bank Alfalah/Replicate/RunPod/`restoration.service.ts`/master-execution-entitlement/Sharp-print file, or production database was touched.

### What was found

- `RequireAuth.tsx` already existed (loading state, `Navigate` to `/login` with `state={{ from: location.pathname }}` when unauthenticated, `Outlet` when authenticated) but was wired to **zero routes** in `App.tsx` before this packet — `/orders`, `/wallet`, `/payments`, `/subscription` were reachable by an anonymous user; only each page's own internal `useEffect(() => { if (status !== "ready" || !token) return; ... })` guard skipped its *data fetch*, not its *render*, so `CustomerLayout`'s "Signed in" shell and page chrome rendered for anonymous visitors.
- `AuthProvider` already determines "authenticated" from a real server round-trip (`GET /api/auth/me` with the stored token, falling back to `/api/auth/refresh`), not from the mere presence of a localStorage value — a forged/stale token fails that call and `persist(null)` clears the stored session.

### Routes protected vs. left unchanged

- Now wrapped in the existing `RequireAuth` (`apps/web/src/App.tsx`): `/orders`, `/wallet`, `/payments`, `/subscription` (nested inside `<Route element={<RequireAuth />}><Route element={<CustomerLayout />}>...</Route></Route>`).
- Left completely unprotected and functionally unchanged (guest-capable FixedOrder/restoration-draft flow): `/restore/new`, `/restore/drafts/:draftId/preview`, `/restore/drafts/:draftId/select`, `/restore/drafts/:draftId/review`, `/restore/:orderId`, `/restore/:orderId/print`, `/restore`, `/history/restorations`, `/account`.
- `/admin/*` routing (`RequireAdminPortal`) was not touched.

### Open-redirect hardening

- `apps/web/src/pages/LoginPage.tsx`'s post-login redirect target (`location.state.from`, read only by this page) is now validated before use: it must be a string starting with a single `/` (not `//`), must not contain `://`, and must not be a backslash-prefixed pseudo-path — anything else falls back to the existing safe default (`/orders`). `RequireAuth` itself only ever sets `from` to `location.pathname` (already same-origin), but `history.state` is client-settable in principle, so `LoginPage` now defends independently rather than trusting it.

### Tests added

`apps/web/tests/browser/customer-route-auth.spec.ts` (new, 23 cases, Playwright, following the existing `tests/browser/fixtures` network-guard/`seedAuthSession` conventions, every backend call mocked via `page.route`):

1. Anonymous `GET` on each of `/orders`, `/wallet`, `/payments`, `/subscription` redirects to `/login`; `CustomerLayout`'s exact "Signed in" text is asserted absent (`toHaveCount(0)`, `exact:true`) — never rendered, not even momentarily.
2. Authenticated access to all four routes renders real content (`"authenticated user can access ... and sees real content"`, one case per route).
3. `"slow auth hydration shows a loading state and never renders protected content meanwhile"` — a gated `/api/auth/me` response proves `RequireAuth`'s existing loading branch (`"Restoring your account"`) renders, and protected content stays absent, until hydration resolves.
4. `"after logout, a previously-accessible protected route redirects to login again"` — clicks `CustomerLayout`'s existing "Sign out" button, then a fresh navigation to a different protected route redirects again.
5. Forged/bypass attempts: a fake `?authenticated=true` query param, an unrelated forged `localStorage.setItem("isAdmin","true")`, and a fully forged `auth`-storage session whose token is rejected by a mocked 401 `/api/auth/me`/`/api/auth/refresh` (asserting the forged session is actually cleared from storage afterward) — none grant access.
6. Open-redirect rejection: an absolute (`https://evil.com/steal`) and a protocol-relative (`//evil.com/steal`) `history.state.from` are both proven rejected (login proceeds to the safe `/orders` default, URL never contains `evil.com`), and a legitimate same-origin `from` (set by `RequireAuth` itself via `/wallet` → `/login` → back to `/wallet`) is proven honored.
7. `/restore/new` remains accessible with no auth prompt for an anonymous user; a guest FixedOrder review deep link (`/restore/drafts/:id/review?orderNo=...`) remains fully accessible and renders `"Order Review"` for an anonymous user with no login redirect.
8. `/admin/dashboard` still redirects to `/admin/login` exactly as before (no regression to `RequireAdminPortal`).
9. Mobile viewports 360/390/430px: the login-redirect state renders without horizontal overflow.
10. Keyboard/accessibility: `Email` then `Password` fields are reachable and focusable via `Tab` from the login-redirect state, both correctly labeled.
11. Every case uses the existing `blockedRequests`/`expectCleanNetwork` fixture — zero uncontrolled external network calls in any scenario.

### Validation evidence (real, this packet)

- `npx playwright test tests/browser/customer-route-auth.spec.ts` → **23/23 passed**.
- `npx playwright test tests/browser/fixed-order-flow.spec.ts tests/browser/payment-attempt-flow.spec.ts tests/browser/fixed-order-review-ui.spec.ts tests/browser/admin-commerce-orders-ui.spec.ts tests/browser/smoke.spec.ts tests/browser/network-safety.spec.ts tests/browser/responsive.spec.ts` (pre-existing regression, unmodified) → **62/62 passed**.
- `npm run test:admin-commerce-read` (apps/api, `tsx --test`) → exit 0, **9/9 passed**.
- `npm run test:admin-commerce-routes` (apps/api, `tsx --test`) → exit 0, **5/5 passed**.
- `npx eslint apps/web/src/App.tsx apps/web/src/pages/LoginPage.tsx apps/web/tests/browser/customer-route-auth.spec.ts` → exit 0, no findings.
- `npm run typecheck` (apps/web, `tsc -p tsconfig.json --noEmit`) → exit 0, no output.
- `npm run build` (apps/web, `tsc && vite build`) → exit 0, built successfully (`dist/assets/index-B9vvUTuf.js`, 297.35 kB).
- `git diff --check` and `git diff --cached --check` → both exit 0 (only pre-existing, unrelated LF/CRLF warnings on files this packet did not touch: `apps/api/prisma/migrations/20260729000100_add_guest_ownership_token_hash/migration.sql`, `apps/api/src/services/restoration-view.test.ts`, `apps/web/src/pages/RestoreNewPage.tsx`, `apps/web/src/pages/RestoreOrderPage.tsx`).

### Protected Scope Protocol

Only `apps/web/src/App.tsx` (RequireAuth import + wrapping the four customer routes — the ADMIN packet's already-staged admin routes/imports were re-read after this edit and are byte-identical to before), `apps/web/src/pages/LoginPage.tsx` (redirect-target validation only), the new `apps/web/tests/browser/customer-route-auth.spec.ts`, and this canonical plan were changed by this packet. `RequireAuth.tsx` and `lib/auth.tsx` were read but not modified — the existing guard and provider already satisfied every requirement (loading state, real server-verified "authenticated" signal, logout propagation) without changes. No backend file, Prisma schema/migration, payment/admin-auth/RBAC file, `restoration.service.ts`, Replicate/RunPod file, Sharp/print file, `rules.md`, env/config/secret, production database, deployment configuration, or any other pre-existing dirty/staged file was touched. `git status --porcelain=v1` was captured before this packet started and reconfirmed unchanged for every path outside the four listed above.

### Updated 13-stage table

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 75% | 25% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 42% | 58% |
| Admin operations/RBAC | 35% | 65% |
| Test/browser/deployment readiness | 72% | 28% |
| **Overall R9.2 launch readiness** | **48%** | **52%** |

Increase reflects only "Customer two-flow UI" (40%→42%: the four account-only customer routes now require a real, server-verified session instead of being reachable by anonymous visitors — a routing/authorization correctness fix, not a new customer-flow feature) and "Test/browser/deployment readiness" (70%→72%: 23 new green browser tests covering anonymous/authenticated/hydration/logout/bypass/open-redirect/guest-route/admin-regression/responsive/accessibility/network-safety, with all 62 pre-existing browser tests and 14 apps/api node:test cases re-run and still passing). No other row changed; the overall percentage still rounds to 48% (47.7% unrounded ≈ 48%, matching the ADMIN packet's baseline — this packet closed a real gap but the launch-readiness weight of routing-guard correctness relative to the full 13-row scope is small). **This 48%/52% table is historical and superseded by the authoritative current table in the reconciliation record below.**

- Suggested next packet: candidate B from the R9.2-P2R sequencing table above (upload/source-preview persistence hardening) remains blocked pending a concrete security-finding scope; alternatively, admin write/action modules (retry/audit) for the commerce-orders resource, still gated on the same payment/entitlement authority boundary as candidates A/C. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort** — this packet's scope (frontend routing/guard reuse, no new invariants) did not require High effort.

## R9.2-P2R-CUSTOMER-ORDERS Authenticated Customer FixedOrder History — 2026-08-03

Classification: **COMPLETE for its stated scope**. Adds one new authenticated, read-only list endpoint for a customer's own FixedOrders, plus one new additive "Restoration orders" section in the existing (already-authenticated, per P2R-AUTH) `/orders` page. The pre-existing `GET /api/fixed-orders/:orderNo` guest-capable detail route, `FixedOrderService.getOrderByOrderNo`, `FixedOrderController.getOrder`, and every legacy `OrdersPage` credit/wallet/order-status feature are unchanged.

### Route added

`GET /api/fixed-orders` (list) — registered in `apps/api/src/routes/fixed-order.routes.ts` **before** the existing `GET /api/fixed-orders/:orderNo` line so the literal path is never captured as an `orderNo` param. Protected by the existing customer `requireAuth(config)` middleware (`apps/api/src/middleware/auth.middleware.ts`) — not `optionalAuth`, and not admin auth. No guest-token mode exists for this endpoint.

- Ownership: `FixedOrderController.listMyOrders` (`apps/api/src/controllers/fixed-order.controller.ts`) reads `req.user?.sub` (the verified JWT subject) as the sole owner id; a missing `req.user` throws a 401 before the service is ever called. `FixedOrderService.listMyOrders(ownerUserId, params)` (`apps/api/src/services/fixed-order.service.ts`) always includes `{ ownerUserId }` in the Prisma `where` clause — no query/body parameter can add, remove, or override it.
- Pagination: default `pageSize` 20, hard cap 100 (`CUSTOMER_ORDERS_DEFAULT_PAGE_SIZE`, `CUSTOMER_ORDERS_MAX_PAGE_SIZE`), same clamp pattern as `admin-commerce.service.ts`.
- Ordering: `[{ createdAt: "desc" }, { id: "desc" }]` — deterministic, matching the admin list convention.
- Optional filters: `status`, `market`, `currency` (uppercased, combined with — never replacing — the mandatory `ownerUserId` filter).
- Response fields per order: `orderNo`, `type`, `status`, `market`, `currency`, `totalAmountMinor`, `priceBookVersion`, `items[].{tierOrSku,pricingSource,pricingApproved}`, `paymentAttempt` (`{id,status}` or `null` — no `checkoutUrl`, no provider payload), `createdAt`, `updatedAt`. No guest ownership token/hash, secret, credential, or stack trace is ever included.
- Zero database writes: the method only calls `prisma.fixedOrder.findMany`/`count`.
- Empty result for an owner with no orders: `{ items: [], total: 0, page, pageSize }` — never an error.

### UI added

`apps/web/src/components/RestorationOrdersHistorySection.tsx` (new) — a "Restoration orders" card rendered by `apps/web/src/pages/OrdersPage.tsx` immediately after its existing "Order status" card, only when a token is present (the page is already wrapped in `RequireAuth` per P2R-AUTH, so this is effectively always true once mounted). Nothing existing in `OrdersPage.tsx` was removed, reordered, or restructured — this is a strict append.

- Calls `customerFixedOrdersApi.list(token, { pageSize: 20 })` (new, `apps/web/src/services/customerApi.ts`) on mount — a single `GET`, no `POST`/PaymentAttempt creation is ever triggered from this section.
- Per-order card shows: order number, formatted date, status, tier (`TIER_LABELS` mapping, falls back to the raw code), PKR/USD-formatted amount (`Intl.NumberFormat` over the integer `totalAmountMinor` / 100, matching `FixedOrderReviewPage.tsx`'s existing `formatMinorAmount` convention), an approved-vs-fixture pricing indicator (`"Owner-approved pricing"` only if some item has `pricingApproved:true`, else `"Fixture pricing (not payment-eligible)"`), a payment-attempt line (`"Payment: <STATUS>"` or `"No payment attempt yet"` when `paymentAttempt` is `null`), and a "View order" link to `/restore/drafts/account/review?orderNo=<orderNo>` (reuses the existing guest/customer `FixedOrderReviewPage` — `account` is a non-empty placeholder draftId so the page's existing `if (!orderNo || !draftId) return` guard passes; the page's own token-based fetch, not the placeholder draftId, resolves the real order).
- States: loading (`"Loading your restoration orders..."`), error with an accessible `role="alert"` panel and a "Retry" button that re-calls the same read, empty (`"You have no restoration orders yet."`), and populated. Every displayed status/amount/pricing/payment value comes directly from the just-fetched API response for that render — nothing is derived from a URL query parameter, matching the existing truthful-payment-state convention in `FixedOrderReviewPage.tsx`/`payment-attempt-flow.spec.ts`.
- Types: `CustomerFixedOrderListItem`/`CustomerFixedOrderListResponse` added to `apps/web/src/lib/portal-types.ts`, reusing the existing `Market`/`FixedOrderCurrency`/`PaymentAttemptStatus`/`FixedOrderRecord["type"]` unions.

### Tests added

`apps/api/src/services/p2r-customer-orders-list.test.ts` (new, node:test, pure-logic — mirrors `admin-commerce-read.test.ts`'s monkey-patched-Prisma pattern, no live database):

1. `"list response contains no secret/sensitive field names"` — recursive key-name scan (token/secret/password/authorization/checkoutUrl/hash/key$) proves no-secret-field.
2. `"owner filter always uses the caller-supplied ownerUserId, never anything else"` and `"another owner's orders are excluded (cross-account isolation)"` — ownership-isolation proof.
3. `"a user with zero orders gets a truthful empty array, not an error"`.
4. `"page size is capped at the documented maximum"` and `"deterministic newest-first ordering with id tiebreaker"`.
5. `"status/market/currency filters combine with, and never override, the owner filter"`.
6. `"fixture vs approved pricing represented truthfully per item"` and `"no-attempt state renders as null, not a fabricated status"`.
7. `"no write-capable Prisma method is ever invoked"` — zero-write proof (spies on `create`/`update`/`delete`/`upsert`/`deleteMany`/`updateMany`/`createMany`, throws if any is called).

`apps/web/tests/browser/customer-orders-history-ui.spec.ts` (new, Playwright, following the existing `tests/browser/fixtures` conventions, every backend call mocked via `page.route`):

1. `"legacy order-status content is preserved and the new section appears with real data"` — asserts the pre-existing `OrdersPage` H1 and the new section's H2 both render; legacy-behavior-preserved proof.
2. `"empty state is truthful when the customer has no orders"`.
3. `"no-attempt state renders truthfully, not as a fabricated status"`.
4. `"error state shows a retry control that succeeds on retry"`.
5. `"tampering with URL query params cannot fabricate a PAID display"` — navigates to `/orders?paid=true&status=PAID` while the mocked API returns `CREATED`/no attempt, then asserts neither a fabricated "Payment: PAID" line nor status appears; payment-truth (query-param-cannot-fabricate-PAID) proof.
6. Responsive @ 360/390/430px — no horizontal overflow.
7. Keyboard/accessibility — the "View order" link is focusable and correctly labeled.

Client-supplied-owner-id-ignored and unauthenticated-401 behavior are proved structurally rather than by a live HTTP round-trip in this packet: `FixedOrderController.listMyOrders` never reads any request field except `req.user?.sub` to build the owner id (no `req.query.userId`/`req.body.ownerId` code path exists to test against), and the route is registered behind `requireAuth(config)` (`apps/api/src/middleware/auth.middleware.ts`, unmodified — the same middleware already covering the four P2R-AUTH customer routes), which throws a 401 `AppError` before any handler code runs when no valid bearer token is present.

### Guest-detail-flow-preserved proof

`GET /api/fixed-orders/:orderNo` and `FixedOrderService.getOrderByOrderNo`/`FixedOrderController.getOrder` were not edited at all (only a new `listMyOrders` route/controller-method/service-method were added alongside them). Re-ran `apps/web/tests/browser/customer-route-auth.spec.ts`'s `"guest FixedOrder review flow (draft review page) remains fully accessible to an anonymous user"` case (exercises this exact detail endpoint via a guest-mocked request) and it still passes unmodified — see validation evidence below.

### Validation evidence (real, this packet)

- `npx tsx --test apps/api/src/services/p2r-customer-orders-list.test.ts` → exit 0, **10/10 passed**.
- `npx playwright test tests/browser/customer-orders-history-ui.spec.ts` → exit 0, **9/9 passed**.
- `npx playwright test tests/browser/customer-route-auth.spec.ts tests/browser/fixed-order-flow.spec.ts tests/browser/fixed-order-review-ui.spec.ts tests/browser/payment-attempt-flow.spec.ts tests/browser/admin-commerce-orders-ui.spec.ts tests/browser/smoke.spec.ts tests/browser/network-safety.spec.ts tests/browser/responsive.spec.ts` (pre-existing regression, unmodified) → exit 0, **85/85 passed**.
- `npx eslint apps/api/src/services/fixed-order.service.ts apps/api/src/controllers/fixed-order.controller.ts apps/api/src/routes/fixed-order.routes.ts apps/api/src/services/p2r-customer-orders-list.test.ts apps/web/src/pages/OrdersPage.tsx apps/web/src/components/RestorationOrdersHistorySection.tsx apps/web/src/services/customerApi.ts apps/web/src/lib/portal-types.ts apps/web/tests/browser/customer-orders-history-ui.spec.ts` → exit 0, no findings.
- `npx tsc --noEmit` (apps/api) → exit 0. `npx tsc --noEmit` (apps/web) → exit 0.
- `npm run build` (apps/api, `tsc -p tsconfig.json`) → exit 0. `npx vite build` (apps/web) → exit 0 (`dist/assets/index-CnyCcgHz.js`, 300.46 kB).
- `git diff --check` and `git diff --cached --check` → both exit 0 (only pre-existing, unrelated LF/CRLF warnings, same files as the prior AUTH packet).
- No Prisma schema/migration file was touched by this packet, so `prisma validate`/`prisma generate` were not re-run (nothing to validate).

### Protected Scope Protocol

Only `apps/api/src/services/fixed-order.service.ts` (new `listMyOrders` method + list types, existing methods untouched), `apps/api/src/controllers/fixed-order.controller.ts` (new `listMyOrders` handler, existing `getOrder`/`createRestorationDigitalOrder` untouched), `apps/api/src/routes/fixed-order.routes.ts` (one new `GET /fixed-orders` line ahead of the existing `:orderNo` line), the new `apps/api/src/services/p2r-customer-orders-list.test.ts`, `apps/web/src/pages/OrdersPage.tsx` (one new import + one new appended section, nothing removed), the new `apps/web/src/components/RestorationOrdersHistorySection.tsx`, `apps/web/src/services/customerApi.ts` (new `customerFixedOrdersApi` export, existing exports untouched), `apps/web/src/lib/portal-types.ts` (new additive types), the new `apps/web/tests/browser/customer-orders-history-ui.spec.ts`, and this canonical plan were changed by this packet. `rules.md`, Prisma `schema.prisma`/any migration, `restoration.service.ts`, Bank Alfalah/Replicate/RunPod files, Sharp/print fulfilment code, admin auth/RBAC files, production database, and every other pre-existing staged/unstaged file were not touched — `git status --porcelain=v1` was captured before this packet started and reconfirmed unchanged for every path outside the list above.

### Pre-edit 13-stage table (as found, verbatim)

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 75% | 25% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 42% | 58% |
| Admin operations/RBAC | 35% | 65% |
| Test/browser/deployment readiness | 72% | 28% |
| **Overall R9.2 launch readiness** | **48%** | **52%** |

### Updated 13-stage table (conservative, post-edit)

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 75% | 25% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 44% | 56% |
| Admin operations/RBAC | 35% | 65% |
| Test/browser/deployment readiness | 73% | 27% |
| **Overall R9.2 launch readiness** | **49%** | **51%** |

## R9.2-P2R-CUSTOMER-ORDERS Audit Repair — 2026-08-03

Classification: **REPAIRED_VERIFIED**. Independent audit found and repaired one in-scope defect: `FixedOrderService.listMyOrders()` previously uppercased `status`, `market`, and `currency` without validating them before Prisma. Invalid enum-like values could therefore reach Prisma and produce an internal/database error.

- Repair: `fixed-order.service.ts` now accepts only normalized `FixedOrderStatus` (`CREATED`, `PAYMENT_PENDING`, `PAYMENT_VERIFIED`, `LOCKED`, `CANCELLED`, `EXPIRED`), `Market` (`PAKISTAN`, `INTERNATIONAL`), and `FixedOrderCurrency` (`PKR`, `USD`) values. Empty/unknown values throw the existing safe `AppError` with `400 INVALID_FILTER` before any Prisma read or mutation. Valid lowercase/mixed-case values retain prior normalization behavior.
- Controller hardening: `fixed-order.controller.ts` accepts only scalar query values; array/object query values become absent filters rather than unsafe casts. Ownership remains derived only from verified `req.user.sub`; `ownerId`/`userId` query/body values never enter the service.
- Focused API evidence: `npx tsx --test src/services/p2r-customer-orders-list.test.ts` exited 0 with **13/13** passing. Tests cover every accepted status/market/currency, case normalization, invalid/empty rejection before any Prisma call, owner-scoped filters, cap 100, exact `createdAt DESC, id DESC` ordering, nested no-secret scan, exact BigInt string serialization, cross-account exclusion, fixture truth, no-attempt truth, and zero write/raw Prisma calls.
- UI evidence: `RestorationOrdersHistorySection` remains GET-only on mount and displays payment status only from persisted list response data. Query `paid/status` values cannot fabricate `PAID`; the test asserts its absence when the API returns no attempt. Review links retain `encodeURIComponent(orderNo)`. Existing guest detail route remains optional-auth and unchanged.
- Test-harness repair: `customer-route-auth.spec.ts` now mocks the new authenticated `GET /api/fixed-orders` list API in its shared account-read fixture. This repaired a genuine false-negative `ERR_CONNECTION_REFUSED` in authenticated `/orders` coverage without weakening assertions.
- Browser evidence: customer list/auth suite exited 0 with **32/32** passing; fixed-order/admin/smoke/network-safety/responsive suite exited 0 with **46/46** passing. All calls were fixture-routed/local; no uncontrolled external request, payment attempt, provider call, or write was introduced.
- Additional validation: admin-commerce read **9/9** and route **5/5** passed; `test:payment-readiness` passed. `test:p1a-fixed-order-flow` and `test:p1c-b-pricebook-flow` correctly refused to run without `DISPOSABLE_DATABASE_URL` and did not access any database. `test:workspace-safe`, focused API/web lint, API/web typecheck, and API/web build all exited 0.
- Protected Scope Protocol: only CUSTOMER-ORDERS filter/controller/test files, its route-auth test fixture, and this canonical plan were edited. No schema/migration, PriceBook/payment guard, Bank Alfalah, restoration, Replicate/RunPod, Sharp/print, production database, deployment, or unrelated dirty file was modified. Bank Alfalah remains frozen and `ready:false`; Replicate remains production; RunPod remains unauthorized.
- Overall remains **49% complete / 51% remaining**; audit repair adds no new product capability. Next safe packet: R9.2-P2R UI status/readiness refinement only, using **Codex GPT-5.6 Terra**, Agent mode, Medium effort.

Increase reflects only "Customer two-flow UI" (42%→44%: a customer can now see their own persisted RESTORATION_DIGITAL FixedOrder history — order number, status, tier, truthful pricing/payment state — from an authenticated read endpoint, closing a real, previously-empty page gap; still only a read/history view, no new order-creation or payment-action surface) and "Test/browser/deployment readiness" (72%→73%: 10 new green apps/api unit tests + 9 new green Playwright cases, with all 85 pre-existing browser tests re-run and still passing). No other row changed.

- Suggested next packet: candidate B from the R9.2-P2R sequencing table above (upload/source-preview persistence hardening) remains blocked pending a concrete security-finding scope; alternatively, admin write/action modules (retry/audit) for the commerce-orders resource, still gated on the same payment/entitlement authority boundary as candidates A/C. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort** — this packet's scope (one additive read endpoint + one additive UI section reusing existing auth/format conventions) did not require High effort.

## R9.2-P2R Status Reconciliation — 2026-08-03

Classification: **COMPLETE** for documentation reconciliation. No application-code or schema change was made in this packet.

- Chronology reconciliation: the original 33%/25%/65% table, the prior 42%/35%/72% table, and their associated 46%/48% records are preserved as historical evidence. Their stale values are explicitly superseded here; no historical table was rewritten.
- Authoritative current result: the latest CUSTOMER-ORDERS audit repair remains **REPAIRED_VERIFIED**. Repair-only work does not increase progress. Current values are Customer two-flow UI 44%/56%, Admin operations/RBAC 35%/65%, Test/browser/deployment readiness 73%/27%, and Overall 49%/51%.
- CUSTOMER-ORDERS repair evidence: invalid status/market/currency filters now normalize valid values and reject invalid/empty values with `400 INVALID_FILTER` before Prisma; ownership remains verified `req.user.sub`; nested safe fields and exact stringified BigInt amounts are preserved; zero Prisma writes/raw calls are proven; browser query parameters cannot fabricate `PAID`; mount remains GET-only and guest detail behavior is unchanged.
- Exact changed files: `apps/api/src/services/fixed-order.service.ts`, `apps/api/src/controllers/fixed-order.controller.ts`, `apps/api/src/services/p2r-customer-orders-list.test.ts`, and `apps/web/tests/browser/customer-route-auth.spec.ts`. The canonical plan is the only documentation file edited. Existing staged files remain preserved.
- Validation evidence: focused API `13/13`; customer orders/auth browser `32/32`; fixed-order/admin/smoke/network-safety/responsive browser `46/46`; admin-commerce read `9/9`; admin-commerce routes `5/5`; workspace-safe, focused lint, API/web typecheck, API/web build, and both Git diff checks exited 0. P1A/P1C-B disposable database commands were **NOT RUN — `DISPOSABLE_DATABASE_URL` absent; fail-closed; no fallback**.
- Protected Scope Protocol: finalized CUSTOMER-ORDERS source/tests and enum-filter invariants are protected. No rules, schema/migration, PriceBook/payment guard, Bank Alfalah, restoration, Replicate/RunPod, Sharp/print, production DB, deployment, or unrelated dirty file was modified. Bank Alfalah remains frozen and `ready:false`; Replicate remains production; RunPod remains unauthorized.

### Authoritative Current 13-Stage Table

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 75% | 25% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 44% | 56% |
| Admin operations/RBAC | 35% | 65% |
| Test/browser/deployment readiness | 73% | 27% |
| **Overall R9.2 launch readiness** | **49%** | **51%** |

- Next safe packet: non-payment customer/admin status and readiness refinement only, after a separate scoped request. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

## R9.2-P2R Status Plan — 2026-08-03

Classification: **COMPLETE** for planning. No application source or tests were modified. Overall remains **49% complete / 51% remaining**.

### Status/readiness audit matrix

| Area | Current behavior | Truthful expected behavior | Status | Dependency |
| --- | --- | --- | --- | --- |
| FixedOrderReviewPage pricing | Shows approved pricing only when every item is approved; otherwise shows source and blocks payment | Preserve server-derived approval; fixture/unapproved remains blocked | READY | Existing response only |
| Customer order history pricing | Shows approved if any item is approved, otherwise fixture blocked | Must use a shared explicit presentation rule and avoid mixed-line ambiguity | READY | UI/types/tests only |
| No PaymentAttempt | Shows explicit no-attempt state | Preserve null as no attempt, never fabricate status | READY | Existing API |
| Attempt statuses | Review page groups terminal statuses but displays raw values; history displays raw values | Consistent customer labels for `CREATED`, `REDIRECT_READY`, `CUSTOMER_RETURNED`, `CALLBACK_PENDING`, `AUTHORIZED`, `FAILED`, cancellation, expiry, refund/dispute/chargeback, and `PAID`; no new statuses | READY | UI-only mapping/tests |
| Provider unavailable vs failure | Readiness explains provider unavailable; a failed attempt displays generic failure/retry | Keep provider-unavailable distinct from persisted `FAILED`; never claim bank failure from adapter unavailable | READY | UI-only mapping/tests |
| Blocked readiness reasons | Review maps several reasons; admin detail renders raw reasons | Preserve every server reason, add only safe presentation labels for known existing reason text | READY | UI-only |
| FixedOrder status | Review/history/admin display raw server status | Consistent labels while preserving exact server value | READY | UI-only |
| Market/currency/amount | Uses server currency and minor amounts divided by 100 | Preserve server currency and integer minor-unit source; no FX or client amount | READY | Existing response |
| Browser-return/query parameters | Existing tests prove query cannot fabricate `PAID`; pages do not derive payment from URL | Preserve; no return-state success mapping | READY | Existing tests |
| Loading/empty/retry/inaccessible | Customer history and admin detail have loading, empty, retry/not-found states; review has loading/error | Preserve truthful states; add status mapping without hiding errors | READY | UI tests |
| Customer/admin terminology | Customer uses raw statuses; admin uses `StatusBadge` and raw readiness reasons | Shared terminology for status category and provider availability, while retaining exact raw status for audit context | READY | UI-only shared helper |
| Mobile/accessibility | Existing focused responsive and role tests cover current pages | Extend status presentation tests at existing mobile widths and ARIA roles | READY | Browser tests |
| Backend/API/schema | Existing read APIs expose required persisted fields | No endpoint, schema, mutation, or payment change needed | READY | None |

### Selected next packet: R9.2-P2R-STATUS-UI

Implement one shared, read-only status presentation layer for `FixedOrderReviewPage`, `RestorationOrdersHistorySection`, `AdminCommerceOrdersPage`, and `AdminCommerceOrderDetailPage`. Map only the existing server enum values and existing readiness reason categories. Display both a truthful human label and the raw persisted status where useful. Keep `provider unavailable` separate from `FAILED`; keep `PAID` exclusively sourced from persisted API data; preserve all blocker reasons; never add mutation controls or payment/provider calls.

Exact files:

- `apps/web/src/components/PaymentStatusLabel.tsx` or the repository’s existing shared presentation component location
- `apps/web/src/pages/FixedOrderReviewPage.tsx`
- `apps/web/src/components/RestorationOrdersHistorySection.tsx`
- `apps/web/src/pages/AdminCommerceOrdersPage.tsx`
- `apps/web/src/pages/AdminCommerceOrderDetailPage.tsx`
- `apps/web/tests/browser/fixed-order-review-ui.spec.ts`
- `apps/web/tests/browser/customer-orders-history-ui.spec.ts`
- `apps/web/tests/browser/admin-commerce-orders-ui.spec.ts`

Acceptance tests:

1. Every existing `PaymentAttemptStatus` renders a deterministic label without inventing a status.
2. Persisted `PAID` renders paid only when the API attempt status is `PAID`.
3. Query parameters, browser-return values, and frontend state cannot produce paid.
4. Provider-unavailable readiness renders as unavailable, never failed.
5. Persisted `FAILED` renders failed and retry guidance only where the existing page already permits retry; no request is made on mount.
6. `CANCELLED`, `CANCELLED_BY_CUSTOMER`, `EXPIRED`, `REFUNDED`, `PARTIALLY_REFUNDED`, `DISPUTED`, and `CHARGEBACK` remain distinct.
7. `CREATED`, `REDIRECT_READY`, `CUSTOMER_RETURNED`, `CALLBACK_PENDING`, and `AUTHORIZED` remain pending/processing categories, not paid.
8. FixedOrder status, market, currency, and exact minor-unit display remain server-derived with no FX conversion.
9. All blocked readiness reasons remain visible and accessible.
10. Loading, empty, retry, inaccessible-order, responsive, and keyboard/accessibility tests remain passing.
11. Browser tests observe only existing GET requests; zero PaymentAttempt creation, provider, Bank Alfalah, Replicate, RunPod, or external calls occur.

Implementation prompt:

```text
R9.2-P2R-STATUS-UI, Agent mode. Add only a shared read-only presentation mapping for existing FixedOrder and PaymentAttempt statuses plus existing payment-readiness reason categories. Update the four existing customer/admin status surfaces and focused browser tests. Preserve server authority: PAID only from persisted API status; query/browser-return/frontend state never qualifies. Distinguish provider unavailable from FAILED. Do not add statuses, endpoints, mutations, payment verification, callback, Bank Alfalah, schema, provider, restoration, Replicate, RunPod, Sharp, print, or external calls. Run focused browser tests, lint, typecheck, build, and Git diff checks. Stage only UI/tests and the canonical plan.
```

Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

## R9.2-P2R-UPLOAD-SECURITY-AUDIT-B1 Storage/DB Consistency — 2026-08-03

Classification: **REPAIRED_VERIFIED**. This bounded packet recovered the interrupted untracked test and audited only storage-object/database consistency. Signed previews, ownership, and guest-token behavior are deferred to B2.

- Test recovery: `apps/api/src/services/p2r-upload-storage-ownership.test.ts` had a syntax error from `await validBase64()` nested in a non-async object expression. The test was repaired without removing assertions, then executed by the project `tsx` runner.
- Confirmed defect: `RestorationDraftService.createDraft()` uploaded a validated original before `prisma.restorationDraft.create()`, but did not compensate if that DB create failed, leaving an unmanaged storage object.
- Repair: if the DB create fails, the service now calls `StorageService.deleteFile()` with only the exact server-generated `uploadResult.key`. If cleanup fails, it returns generic `502 STORAGE_CLEANUP_ERROR` without exposing the storage key or original DB/storage failure detail. Successful rows continue to persist the exact generated key and validated SHA-256.
- Evidence: focused storage test passed **5/5**: upload failure performs zero DB writes; DB failure deletes exactly the generated object; cleanup failure returns no key leak; authenticated/guest ownership tests retained for B2 context; guest token hash test retained for B2 context. Audit-A upload-input suite passed **17/17** and upload-boundary suite passed **11/11**; image validation and image-binary tests passed.
- Validation: focused API lint, API typecheck, API build, `git diff --check`, and `git diff --cached --check` exited 0. DB-dependent P1A/P1C-B tests were **NOT RUN — `DISPOSABLE_DATABASE_URL` absent; fail-closed; no fallback**.
- Protected Scope Protocol: only `apps/api/src/services/restoration-draft.service.ts`, the recovered `apps/api/src/services/p2r-upload-storage-ownership.test.ts`, and this canonical plan were changed. No rules, schema/migration, Audit-A validator, signing/ownership/token implementation, PriceBook/FixedOrder/payment, Bank Alfalah, restoration, Replicate/RunPod, Sharp/print, production DB, deployment, or unrelated dirty file changed. Bank Alfalah remains frozen and `ready:false`; Replicate remains production; RunPod remains unauthorized.
- Progress remains **50% complete / 50% remaining**. The repair hardens an existing upload consistency invariant but does not change the 13-stage estimates.
- Next packet: R9.2-P2R-UPLOAD-SECURITY-AUDIT-B2, signed preview authorization, expiry, authenticated/guest ownership, and token leakage audit. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

## R9.2-P2R-UPLOAD-SECURITY-AUDIT-B2A Signed Preview And Access Control — 2026-08-03

Classification: **REPAIRED_VERIFIED**. This bounded packet audited draft-read authorization, signing order, anti-enumeration, and signed-preview privacy only. Guest-token randomness/hashing/order inheritance remain deferred to B2B.

- Confirmed defect: `toSafeView()` would call `StorageService.getSignedUrl()` for an empty persisted `originalStorageKey`. A corrupted/incomplete row could therefore receive a meaningless signed URL rather than failing closed.
- Repair: after ownership succeeds and before signing, `toSafeView()` rejects a missing/blank persisted key with generic `409 PREVIEW_UNAVAILABLE`. No signer call, key, token, or URL is exposed on that path.
- Authorization evidence: `getDraft()` loads the draft, calls uniform `assertOwnership()`, then signs only the persisted `originalStorageKey`. Wrong authenticated owner, wrong/missing guest token, and unknown draft share `404 NOT_FOUND`; the focused test proves signer call count stays zero for unauthorized access.
- Key/query isolation: controller passes only route `id` plus verified request actor; no query/body/client URL/key enters the signing API. Safe views omit `originalStorageKey`; no preview URL is returned after authorization or signing failure.
- Fresh/expiry evidence: each authorized read invokes `getSignedUrl()` with the persisted key only; R2 signing uses 900 seconds and `previewExpiresAt` is generated from the same 15-minute constant. The focused test proves distinct signer outputs on successive authorized reads.
- Privacy/logging: generic `PREVIEW_UNAVAILABLE` contains no storage key. Storage signing failures are converted by StorageService to generic `STORAGE_R2_ERROR`; no image bytes, guest token, signed URL, or key is included in service error responses. No payment, entitlement, Replicate, RunPod, or external provider call is imported or invoked by this path.
- Evidence commands: `npx tsx --test src/services/p2r-preview-authorization.test.ts` **3/3** exit 0; B1 **5/5**, Audit-A input **17/17**, and upload-boundary **11/11** exit 0; fixed-order-flow plus network-safety Playwright **11/11** exit 0; API lint/typecheck/build and both Git diff checks exit 0. P1A DB flow was **NOT RUN — `DISPOSABLE_DATABASE_URL` absent; fail-closed; no fallback**.
- Protected Scope Protocol: only `apps/api/src/services/restoration-draft.service.ts`, `apps/api/src/services/p2r-preview-authorization.test.ts`, and this canonical plan changed. B1 compensation behavior, Audit-A validation, schema/migrations, ownership/token internals, PriceBook/FixedOrder/payment, Bank Alfalah, restoration, Replicate/RunPod, Sharp/print, production DB, deployment, and unrelated dirty files remain unchanged. Bank Alfalah remains frozen and `ready:false`; Replicate remains production; RunPod remains unauthorized.
- Overall remains **50% complete / 50% remaining**. This targeted hardening does not change the 13-stage estimates.
- Next packet: R9.2-P2R-UPLOAD-SECURITY-AUDIT-B2B, guest-token randomness/hashing and draft-to-order inheritance audit. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

## R9.2-P2R-UPLOAD-SECURITY-AUDIT-B2B Guest Token And Order Inheritance — 2026-08-03

Classification: **REPAIRED_VERIFIED**. This bounded packet audited guest-token security, authenticated-versus-guest precedence, and draft-to-FixedOrder ownership inheritance.

- Confirmed defect: `assertOwnership()` could fall back to a valid guest token when `actor.userId` was present but did not match a guest-owned record. A logged-in unrelated user possessing a guest token could therefore access that guest-owned draft/order.
- Repair: a verified authenticated identity is now authoritative. When `actor.userId` is present, only an exact `ownerUserId` match succeeds; otherwise the uniform `404 NOT_FOUND` is returned and guest-token fallback is forbidden.
- Token evidence: `createGuestOwnershipToken()` uses `randomBytes(32)` (256 bits) encoded as 64 lowercase hex characters; SHA-256 hashes only are persisted. Malformed/wrong/missing tokens fail closed. The raw token is generated only for anonymous draft creation and is not included in safe draft/order views; authenticated draft creation does not issue one.
- Isolation/inheritance evidence: draft-to-order creation loads and verifies the server-side source draft before any order work. The order copies only the verified draft `ownerUserId` and `guestOwnershipTokenHash`; it creates no replacement token when a draft hash exists. The unique `sourceDraftId` constraint/idempotent winner path prevents replay from binding a second order to another draft. Client request types contain no owner/hash fields.
- Focused evidence: new guest-token utility suite passed **4/4** (entropy/format, hash-only storage representation, malformed/wrong token failure, authenticated precedence, cross-draft/cross-order isolation). B2A passed **3/3**, B1 **5/5**, Audit-A input **17/17**, and upload-boundary **11/11**. API lint, typecheck, build, and Git diff checks exited 0.
- Database-backed P1A ownership/inheritance flow was **NOT RUN — `DISPOSABLE_DATABASE_URL` absent; fail-closed; no fallback**. No payment, entitlement, Replicate, RunPod, Bank Alfalah, or external/provider call was added or invoked.
- Protected Scope Protocol: only `apps/api/src/utils/ownership.ts`, `apps/api/src/utils/guest-ownership.test.ts`, and this canonical plan changed. Audit-A/B1/B2A code/tests, schema/migrations, token-generation/hash implementation, preview signing/storage cleanup, PriceBook/FixedOrder/payment, Bank Alfalah, restoration, Replicate/RunPod, Sharp/print, production DB, deployment, and unrelated dirty files remain unchanged. Bank Alfalah remains frozen and `ready:false`; Replicate remains production; RunPod remains unauthorized.
- Overall remains **50% complete / 50% remaining**. This targeted ownership hardening does not change the 13-stage estimates.
- Next safe packet: R9.2-P2R-UPLOAD-SECURITY-AUDIT-C, audit-only review of request-rate/abuse controls and endpoint error normalization. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

## R9.2-P2R-UPLOAD-SECURITY-AUDIT-C Draft/Original Lifecycle And Retention — 2026-08-03

Classification: **BLOCKED_RETENTION_POLICY**. No application source, schema, route, job, R2 configuration, or destructive operation was changed.

- Inspected: `RestorationDraft`/`FixedOrder` schema relation and lifecycle fields; `restoration-draft.service.ts`; `storage.service.ts`; `workers/cleanup.worker.ts`; `services/cleanup.service.ts`; existing upload/ownership tests; and canonical policy records.
- Current enforceable facts: P1A drafts persist an immutable, server-generated `originalStorageKey`, optional `expiresAt`, status, and a unique `FixedOrder.sourceDraftId` relation. B1 ensures failed draft DB creation compensates its uploaded object; B2A fails closed for missing keys before preview signing; B2B protects ownership. No customer deletion endpoint or P1A draft cleanup job exists.
- Existing cleanup isolation: `cleanup.worker.ts` and `CleanupService` operate only on legacy `Order`, `OrderImage`, `RestorationItem`, temporary, benchmark, preview, and final records. Searches found no `RestorationDraft` or `FixedOrder.sourceDraftId` selection in their deletion paths. Their legacy/hard-coded original retention values must not be inherited by P1A drafts.
- Policy blocker: no approved P1A `RestorationDraft` original retention/deletion policy exists. The schema `expiresAt` field alone does not authorize deletion. Implementing cleanup would require an owner decision for: eligible draft statuses; retention duration/timezone; whether an order-referenced draft is retained indefinitely or under a separate legal/business schedule; object deletion versus tombstone/metadata retention; retry/idempotency and storage-absence semantics; manual/admin authorization; and R2 lifecycle rule scope. No duration or deletion rule was invented.
- Safety conclusion: without that policy, no destructive cleanup can prove protection of FixedOrder-referenced originals, safe concurrency, or lawful expiry. Existing `StorageService.deleteFile()` is server-side only, but a new caller/job/route must not be created in this packet. Existing legacy cleanup’s best-effort deletion behavior is not approved for P1A objects.
- Database-backed lifecycle tests were **NOT RUN — `DISPOSABLE_DATABASE_URL` absent; fail-closed; no fallback**. No payment, entitlement, Replicate, RunPod, Bank Alfalah, or external provider call occurred.
- Protected Scope Protocol: Audit-A/B1/B2A/B2B remain finalized and unchanged. No rules, schema/migrations, payment/PriceBook, Bank Alfalah, restoration, Replicate/RunPod, Sharp/print, production database/R2, deployment, or unrelated dirty file was modified. Bank Alfalah remains frozen and `ready:false`; Replicate remains production; RunPod remains unauthorized.
- Overall remains **50% complete / 50% remaining**. No table estimate changes for blocked policy work.
- Required owner decision before lifecycle implementation: provide an approved `RESTORATION_DRAFT_RETENTION_POLICY` with scope, retention intervals, reference-protection rules, expiry semantics, deletion/tombstone requirements, legal hold/backups, authorized initiator, R2 lifecycle compatibility, and approval evidence.
- Next safe packet: R9.2-P2R-UPLOAD-SECURITY-AUDIT-D, non-destructive audit of rate limits, request error normalization, and abuse monitoring only. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

## R9.2-P2R-UPLOAD-SECURITY-AUDIT-D Rate Limiting And Error Normalization — 2026-08-03

Classification: **REPAIRED_VERIFIED**. This bounded packet audited only the RestorationDraft request/read rate and error boundary. Audit-C remains **BLOCKED_RETENTION_POLICY** and no lifecycle/deletion/R2 policy work was performed.

- Confirmed defect 1: draft read and offers routes had no route-specific rate limiter, allowing inexpensive preview-signing/ownership reads to bypass the upload route’s tighter abuse boundary. Repair: both `GET /api/restoration-drafts/:id` and `GET /api/restoration-drafts/:id/offers` now use the existing 60-request/60-second limiter after optional authentication. Upload remains 10 requests/60 seconds. Rejections happen before controller/service/storage/DB/signing work and return deterministic `429 RATE_LIMITED` with existing rate-limit headers.
- Confirmed defect 2: unknown exceptions in `RestorationDraftController` were serialized with `toErrorMessage(error)`, leaking internal backend messages, keys, URLs, base64, or credential text to clients. Repair: unknown failures now return only `{ success:false, code:"INTERNAL_ERROR", message:"Unable to process this request" }`; known `AppError` status/code mappings remain unchanged.
- Request middleware order: global CORS/connection/global rate limit run before `express.json({ limit:"12mb" })`; route `optionalAuth` then route limiter then controller run for drafts. The global 12 MB JSON parser rejects oversized JSON before controller/service/storage/DB. Malformed parser error normalization is not implemented as a restoration-draft-specific handler; a global middleware redesign was not authorized in this packet.
- Proxy fact: `app.set("trust proxy", 1)` controls `req.ip`, which keys the existing in-memory limiter. Whether one proxy hop exactly matches production ingress is an infrastructure fact not established in tracked deployment configuration; it was not guessed or changed. Client forwarding headers cannot independently override `req.ip` beyond Express’s configured trusted-proxy behavior.
- Error/privacy evidence: known `INVALID_BASE64`, `IMAGE_TOO_LARGE`, `INVALID_IMAGE_BINARY`, `NOT_FOUND`, `PREVIEW_UNAVAILABLE`, and `STORAGE_CLEANUP_ERROR` retain their existing AppError status/code paths. Wrong-owner and unknown remain uniform `404 NOT_FOUND`; unknown exceptions are generic 500; no success response is emitted for errors.
- Evidence: Audit-D focused controller/route suite **2/2** exit 0; B2B **4/4**, B2A **3/3**, B1 **5/5**, Audit-A input **17/17**, and upload-boundary **11/11** all exit 0; network-safety Playwright **1/1** exit 0; focused API lint, API typecheck, API build, `git diff --check`, and `git diff --cached --check` exit 0. DB-dependent tests were **NOT RUN — `DISPOSABLE_DATABASE_URL` absent; fail-closed; no fallback**.
- Zero side effects: rate-limit/error paths add no payment, entitlement, Replicate, RunPod, Bank Alfalah, storage, DB, signing, or external/provider call.
- Protected Scope Protocol: only `apps/api/src/middleware/rate-limit.middleware.ts`, `apps/api/src/routes/restoration-draft.routes.ts`, `apps/api/src/controllers/restoration-draft.controller.ts`, their two focused tests, and this canonical plan changed. No rules, schema/migration, retention/deletion policy, Audit-A/B code/tests, PriceBook/FixedOrder/payment, Bank Alfalah, restoration, Replicate/RunPod, Sharp/print, production DB/R2/deployment, or unrelated dirty file was changed. Bank Alfalah remains frozen and `ready:false`; Replicate remains production; RunPod remains unauthorized.
- Overall remains **50% complete / 50% remaining**. This hardening does not alter the 13-stage estimates.
- Next safe packet: R9.2-P2R-UPLOAD-SECURITY-AUDIT-E, audit-only verification of production proxy/trusted-ingress configuration and error middleware contract after deployment evidence is supplied. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

## R9.2-P2R Proxy/Ingress Evidence Plan — 2026-08-03

Decision: **BLOCKED_DEPLOYMENT_EVIDENCE**. Plan/documentation only; no source, deployment, infrastructure, or proxy configuration was changed.

### Proven repository facts

- `apps/api/src/index.ts` currently sets `app.set("trust proxy", 1)` before global middleware. Global order is CORS, connection lifecycle, global in-memory rate limiter, and `express.json({ limit: "12mb" })`.
- `rules.md` documents `Cloudflare Pages -> api.thannow.com (Northflank)`, while `RAILWAY_DEPLOYMENT.md` and `DeploymentExecutionPlan.md` document `Cloudflare Pages -> Railway API -> Neon PostgreSQL -> Redis -> Cloudflare R2 -> Replicate`. Other tracked planning material references Cloud Run. These are contradictory planning/runtime descriptions, not proof of the active ingress.
- `.github/workflows/deploy.yml` deploys to Northflank and probes `https://api.thannow.com/api/health`; this proves a workflow target/reference, not the complete client-to-Express hop chain or proxy mode.
- No tracked Cloudflare DNS/proxy status, Northflank ingress configuration, Railway/Cloud Run active-origin restriction, load-balancer count, Nginx configuration, forwarded-header trace, or direct-origin firewall/access-control evidence was found.
- The tracked health path is `GET /api/health`. The production API hostname referenced by deployment workflow/rules is `api.thannow.com`; the frontend hostname is `thannow.com`.

### Required analysis status

- Expected chain: **UNVERIFIED**. Candidate descriptions are Cloudflare Pages/CDN -> Northflank or Railway or Cloud Run -> Express, but the active hosting target and number of intermediary proxy/load-balancer hops are not established.
- `X-Forwarded-For` and `X-Forwarded-Proto` setter: **UNVERIFIED**. Cloudflare/Northflank/Railway/Cloud Run may contribute headers, but no active request trace proves which component sets or overwrites them.
- `CF-Connecting-IP`: **UNVERIFIED**. No tracked Express handling or verified ingress trace was found.
- Direct origin access: **UNVERIFIED**. No origin hostname/firewall/allowlist evidence proves whether clients can bypass the public proxy and reach the application directly.
- Header spoofing: **UNVERIFIED**. With `trust proxy = 1`, Express trusts the address one hop away according to its proxy-addr behavior; without the actual hop chain and ingress sanitization proof, client-controlled forwarded headers cannot be classified safely.
- `trust proxy = 1`: **UNVERIFIED**, neither proven correct nor proven incorrect.
- Required trust configuration: **UNVERIFIED**. It may be a fixed hop count, trusted proxy IP ranges, or a custom trust function, but selecting one requires active deployment evidence.
- Local/test behavior: preserve current localhost direct-access behavior and existing rate-limit/browser tests; no proxy setting change is authorized in this packet.
- Effects: the current setting influences `req.ip` and therefore rate-limit keys, secure-cookie/protocol interpretation where used, and request logs. Exact production effects remain unverified.

### Minimum owner/deployment evidence required

1. Active API hosting provider/service and exact public service/origin topology.
2. Cloudflare DNS record proxy status and whether `api.thannow.com` is orange-cloud/proxied or DNS-only.
3. Actual proxy/load-balancer hop count between the public client and Express, including any Northflank/Railway/Cloud Run ingress layer.
4. Confirmation that the application origin cannot be directly reached or, if reachable, the origin access-control policy.
5. Sanitized request trace captured at Express for `/api/health` showing remote address, `X-Forwarded-For`, `X-Forwarded-Proto`, `CF-Connecting-IP`, and host; remove credentials, cookies, tokens, and user data.
6. Deployment configuration proving forwarded-header overwrite/sanitization behavior and trusted proxy IP ranges, if used.

### Audit-D protection and next scope

- Audit-D rate limits and error mappings remain **REPAIRED_VERIFIED** and unchanged. Until ingress evidence exists, do not alter `trust proxy`, client-IP extraction, rate-limit identity, secure-cookie behavior, protocol detection, or logging.
- Protected Scope Protocol: only this canonical plan was edited. No rules, application source, tests, schema/migrations, payment/PriceBook, Bank Alfalah, restoration, Replicate/RunPod, Sharp/print, production DB/R2/deployment, or unrelated dirty file was modified.
- Overall remains **50% complete / 50% remaining**; this plan-only packet changes no percentages.
- Next bounded action after evidence: validate the sanitized trace against the active topology and produce a minimal proxy configuration/test plan. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

Protected files remain unchanged: `rules.md`, schema/migrations, PriceBook/payment guards, Bank Alfalah, payment services, restoration service, Replicate/RunPod, Sharp/print, production database, deployment configuration, and unrelated dirty files. Planning work does not change the authoritative 13-stage table or completion percentage.

## R9.2-P2R-STATUS-UI — 2026-08-03

Classification: **COMPLETE**. One shared, read-only, presentation-only status layer for existing customer/admin FixedOrder/PaymentAttempt/payment-readiness displays. Pure UI consolidation over values the API already returns -- no new status enum, no new domain rule, and no backend/API/schema/business-state change of any kind.

### Shared component/helper

`apps/web/src/components/PaymentStatusLabel.tsx` exports:

- `getPaymentStatusPresentation(status)` -- a pure function mapping a `PaymentAttemptStatus | string | null | undefined` to `{ label, description, ariaLabel, tone, isKnown }`.
- `getProviderUnavailablePresentation()` / `getReadinessBlockedPresentation()` -- pure helpers for the two non-`PaymentAttemptStatus` blocked states described below.
- `<PaymentStatusLabel status={...} />` -- a pure, read-only React component (no fetch, no mutation, no `useEffect`) that renders the raw persisted status text plus a visual tone token, an `aria-label`, and a `title` description. Status meaning never depends on color alone: visible text is always present alongside the tone.

Exact mapping for every existing `PaymentAttemptStatus` literal (label / description / accessible-text pattern `Payment status: {label} ({RAW_STATUS})`):

| Status (raw, as persisted) | Label | Description | Tone |
| --- | --- | --- | --- |
| `CREATED` | Attempt created | A payment attempt has been created but has not yet reached the provider. | neutral |
| `REDIRECT_READY` | Redirect ready | A payment session is ready; the customer has not yet completed it. | info |
| `CUSTOMER_RETURNED` | Returned from provider | The customer returned from the payment provider; the outcome is not yet final. | info |
| `CANCELLED_BY_CUSTOMER` | Cancelled by customer | The customer cancelled this payment attempt before it completed. | neutral |
| `EXPIRED` | Expired | This payment attempt expired before it was completed. | warning |
| `CALLBACK_PENDING` | Awaiting confirmation | Waiting for the payment provider to confirm the outcome of this attempt. | info |
| `AUTHORIZED` | Authorized | The payment provider has authorized this payment; settlement is not yet final. | info |
| `PAID` | Paid | This payment has been completed and persisted by the provider. | success |
| `FAILED` | Failed | This payment attempt failed and did not complete. | danger |
| `CANCELLED` | Cancelled | This payment attempt was cancelled. | neutral |
| `REFUNDED` | Refunded | This payment was completed and has since been refunded in full. | neutral |
| `PARTIALLY_REFUNDED` | Partially refunded | This payment was completed and has since been partially refunded. | neutral |
| `DISPUTED` | Disputed | This payment is under dispute with the provider. | warning |
| `CHARGEBACK` | Chargeback | A chargeback was filed against this payment. | danger |

Plus three states that are explicitly **not** `PaymentAttemptStatus` values and are never conflated with one:

| State | Label | When used | Distinct from |
| --- | --- | --- | --- |
| No attempt | No payment attempt | `status` is `null`/`undefined`/absent | `CREATED` (never rendered as a pending attempt) |
| Provider unavailable | Provider unavailable | Payment-readiness reports the Bank Alfalah adapter is not configured/reachable | `FAILED` (readiness blocker, not a persisted attempt outcome) |
| Readiness blocked | Payment blocked | General payment-readiness blocker (e.g. unapproved pricing, order status) | `FAILED`/`CANCELLED` (readiness blocker, not a persisted attempt outcome) |
| Unknown/unrecognized | Status unavailable | Any status string outside the known `PaymentAttemptStatus` set | Never mapped to `PAID` or any success-implying label; raw value still shown for diagnostics, `isKnown: false` |

### Consuming pages (existing testids/behavior preserved, exact visible text unchanged except where noted)

- `apps/web/src/pages/FixedOrderReviewPage.tsx` -- the terminal-attempt and `REDIRECT_READY` branches now render `<PaymentStatusLabel status={attempt.status} />` alongside the existing sentence; `describeReason()`'s provider-unavailable/pricing/order-status/already-terminal reason mapping and all existing testids (`attempt-status`, `payment-blocked`, `pricing-state-approved/unapproved`, `payment-panel`) are unchanged.
- `apps/web/src/components/RestorationOrdersHistorySection.tsx` -- the existing exact visible strings ("No payment attempt yet", `Payment: {status}`) are preserved unchanged (protecting the CUSTOMER-ORDERS packet's existing regression coverage); the surrounding `<dd>` now additionally carries `aria-label={getPaymentStatusPresentation(...).ariaLabel}` so the accessible name is shared with the other three pages without changing rendered text.
- `apps/web/src/pages/AdminCommerceOrdersPage.tsx` -- the payment-status list cell now renders `<PaymentStatusLabel status={order.paymentStatus} />` in place of the previous ad-hoc `StatusBadge`; the null-case literal text `"No attempt yet"` (required by the existing ADMIN packet's test) is unchanged.
- `apps/web/src/pages/AdminCommerceOrderDetailPage.tsx` -- the payment-attempt-state `<dd>` now renders `<PaymentStatusLabel status={order.paymentAttempt.status} />` in place of `StatusBadge`; the null-case `no-payment-attempt` branch and the provider-unavailable-reason readiness-reasons branch are untouched. `FixedOrder.status` continues to use the separate, unrelated `StatusBadge` component -- it is never conflated with `PaymentAttempt.status` or routed through `PaymentStatusLabel`.

No data-fetching logic, loading/empty/error/retry behavior, existing `data-testid` attribute, fixture/unapproved-pricing blocking logic, or "no PaymentAttempt creation on mount" guarantee was changed. All four pages continue to read status only from the persisted API response object, never from `location.search`.

### Tests

New focused spec: `apps/web/tests/browser/payment-status-presentation.spec.ts` (28 tests, reusing the same `fixtures.ts` network-safety/responsive helpers as the other suites). Key proof points:

- Persisted-only-PAID: `"PAID renders only when the mocked API response's PaymentAttempt.status is literally PAID, and query params cannot fabricate it"` (query string `?paid=true&status=PAID&success=1` has zero effect); reinforced by the pre-existing, untouched `fixed-order-review-ui.spec.ts` (`"a PAID attempt is only ever rendered from the persisted API response..."`) and `admin-commerce-orders-ui.spec.ts` (`"PAID attempt renders only from the API response, never fabricated by query params"`).
- Provider-unavailable vs FAILED: `"provider-unavailable readiness reason is shown distinctly from a FAILED/CANCELLED attempt"`.
- Readiness-blocked vs failed/cancelled: `"readiness-blocked (unapproved pricing) is shown distinctly from a failed/cancelled attempt"`.
- No-attempt vs any attempt status: `"no attempt is rendered distinctly, never as PENDING or any attempt status"`.
- Unknown-value fail-safe: `"an unexpected/unknown status string renders the neutral fail-safe presentation, never a success-implying label"` (asserts `data-payment-status-known="false"`, `aria-label` matches `/unavailable/i`, never `/paid/i`).
- Every known status renders truthfully with an accessible name: 14 parameterized cases under `"PaymentStatusLabel: every known PaymentAttemptStatus renders truthfully"`.
- Consumption proof (one test per page): `"AdminCommerceOrderDetailPage renders the shared badge..."`, `"AdminCommerceOrdersPage renders the shared badge..."`, `"FixedOrderReviewPage renders the shared badge..."`, `"RestorationOrdersHistorySection carries the shared aria-label without changing its visible text"`.
- No-mutation/network-safety: `"rendering every status never issues a mutation request and only touches known first-party APIs"` (asserts every observed request method is `GET`, plus `expectCleanNetwork`/`expectNoFailedFirstPartyRequests`/`expectNoPageErrors`).
- Accessibility/responsive: `"the status badge is reachable via accessible name for a screen reader without depending on color alone"`; 3 mobile-width (360/390/430px) no-horizontal-overflow cases.

### Validation evidence (real, this packet)

- `npx eslint` on the 5 changed/added files (`PaymentStatusLabel.tsx`, `RestorationOrdersHistorySection.tsx`, `FixedOrderReviewPage.tsx`, `AdminCommerceOrdersPage.tsx`, `AdminCommerceOrderDetailPage.tsx`, `payment-status-presentation.spec.ts`) → exit **0**.
- `npx tsc -p tsconfig.json --noEmit` (apps/web) → exit **0**.
- `npx vite build` (apps/web) → exit **0** (`dist/assets/index-D7k6iyU4.js`, 303.60 kB).
- `npx playwright test` across `payment-status-presentation.spec.ts`, `fixed-order-review-ui.spec.ts`, `customer-orders-history-ui.spec.ts`, `customer-route-auth.spec.ts`, `admin-commerce-orders-ui.spec.ts`, `payment-attempt-flow.spec.ts`, `smoke.spec.ts`, `network-safety.spec.ts`, `responsive.spec.ts`, `fixed-order-flow.spec.ts` → **122/122 passed** (new suite: 28/28; all 94 pre-existing browser tests across the other 9 suites still pass unchanged).
- Initial reproduction found `git diff --check` exit **0** and `git diff --cached --check` exit **2** because this canonical plan had one extra blank line at EOF (`new blank line at EOF`, line 1956). The smallest whitespace-only repair removed that blank line without changing/reordering content; after restaging, both `git diff --check` and `git diff --cached --check` exit **0**. Remaining LF/CRLF notices are warnings only on unrelated pre-existing files.
- Prisma/database: **NOT APPLICABLE — no backend/schema change made** in this packet.

### Protected Scope Protocol

Only `apps/web/src/components/PaymentStatusLabel.tsx` (new), `apps/web/src/pages/FixedOrderReviewPage.tsx`, `apps/web/src/components/RestorationOrdersHistorySection.tsx`, `apps/web/src/pages/AdminCommerceOrdersPage.tsx`, `apps/web/src/pages/AdminCommerceOrderDetailPage.tsx` (existing PaymentAttempt-status rendering swapped for the shared component; every other line unchanged), the new `apps/web/tests/browser/payment-status-presentation.spec.ts`, and this canonical plan were changed by this packet. `rules.md`, Prisma `schema.prisma`/any migration, `restoration.service.ts`, Bank Alfalah/Replicate/RunPod files, Sharp/print fulfilment code, admin auth/RBAC files, production database, and every other pre-existing staged/unstaged file (confirmed via `git status --porcelain=v1` snapshot before vs. after this packet) were not touched. Replicate remains production; RunPod remains unauthorized; Bank Alfalah remains frozen and `ready:false`.

### Updated 13-stage table (conservative, post-edit)

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 75% | 25% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 50% | 50% |
| Admin operations/RBAC | 40% | 60% |
| Test/browser/deployment readiness | 76% | 24% |
| **Overall R9.2 launch readiness** | **50%** | **50%** |

Authoritative current result after final verification: STATUS-UI source matched the completion report. The shared component maps only existing `PaymentAttemptStatus` values, unknown values are neutral, PAID remains persisted-API-only, provider-unavailable/readiness-blocked remain distinct, FixedOrder status remains separate, and the component has no fetch/mutation/effect/provider/external call. The focused spec passed 28/28; web lint, typecheck, build, and final Git checks exited 0. The authoritative table is retained at **50% complete / 50% remaining**.

- Suggested next packet: candidate B from the R9.2-P2R sequencing table (upload/source-preview persistence hardening) remains blocked pending a concrete security-finding scope; alternatively, admin write/action modules (retry/audit) for the commerce-orders resource, still gated on the same payment/entitlement authority boundary as candidates A/C. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort** — this packet's scope (one additive presentation component + swapping four existing render call sites + one new test file) did not require High effort.

## R9.2-P2R Percentage Reconciliation — 2026-08-03

Classification: **COMPLETE** for documentation reconciliation. No application source or tests were modified.

- Chronology: CUSTOMER-ORDERS established 44%/35%/73% and overall 49%/51%. STATUS-UI implementation record at lines 1948-1953 introduced Customer UI 50%, Admin/RBAC 40%, Test readiness 76%, while claiming only the legitimate 44%→45%, 35%→36%, and 73%→74% changes. The final-verification packet changed only one blank line at EOF and added no functionality.
- Evidence review: the STATUS-UI component, four consuming pages, focused 28-test Playwright spec, lint, typecheck, and build support only the legitimate increases 44%→45%, 35%→36%, and 73%→74%. No separate implementation packet, source behavior, test result, schema change, or completed work supports 50%/40%/76%.
- Reconciliation: the 50%/40%/76% table is preserved as historical evidence but explicitly superseded as documentation drift. No other stage is changed. STATUS-UI remains **COMPLETE_VERIFIED**; final verification remains whitespace-only and caused no development-percentage increase.
- Protected Scope Protocol: only this canonical plan was edited. All STATUS-UI source/tests and mappings remain protected unchanged; no rules, API/backend, schema/migration, Bank Alfalah, payment verification, PriceBook/FixedOrder invariant, restoration, Replicate/RunPod, Sharp/print, production DB, deployment, or unrelated dirty file was modified.

### Authoritative Current 13-Stage Table

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 75% | 25% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 45% | 55% |
| Admin operations/RBAC | 36% | 64% |
| Test/browser/deployment readiness | 74% | 26% |
| **Overall R9.2 launch readiness** | **50%** | **50%** |

### Next Packet: R9.2-P2R-UPLOAD-SECURITY-AUDIT

Audit-first only. Inspect and test upload/source-preview persistence, ownership, MIME/decode validation, size limits, path/key safety, signed URL exposure, retention/cleanup, and malformed/hostile input handling. Do not invent a defect, change protected storage code, modify schema/config, or implement unrelated behavior without a concrete finding and separate approval.

Exact next prompt:

```text
R9.2-P2R-UPLOAD-SECURITY-AUDIT, Plan/Agent audit-first. Inspect only existing upload/source-preview persistence and security boundaries. Record preflight Git state, inspect source/tests/storage contracts, and identify concrete reproducible defects or missing tests. Do not modify application source, schema, migrations, config, credentials, payment, Bank Alfalah, restoration, Replicate, RunPod, Sharp, print, or deployment code unless a concrete in-scope security finding is proven and explicitly repaired. Prefer focused tests and report exact commands/exit codes. If no concrete defect exists, classify BLOCKED_NO_CONCRETE_UPLOAD_FINDING. Preserve staged/dirty files; edit only the canonical plan after evidence. Bank Alfalah remains frozen and ready:false; Replicate remains production; RunPod remains unauthorized.
```

Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

## R9.2-P2R-UPLOAD-SECURITY-AUDIT-A Upload Request/Input-Validation Boundary — 2026-08-03

Classification: **REPAIRED_VERIFIED** (3 reproducible defects repaired + 1 defense-in-depth hardening; 12 properties verified safe with no defect; 0 BLOCKED_REQUIRES_AUTHORIZATION).

Bounded scope: request-body size, base64 parsing, decoded-byte limits, claimed-vs-real MIME, sharp decode, format/page/pixel/orientation limits, unsafe file-name text, and validation-before-side-effect ordering for `POST /api/restoration-drafts`. Storage consistency, signed-preview ownership, and guest-token security were explicitly OUT OF SCOPE and were not modified (packet B).

### Files inspected

`rules.md`; this canonical plan; `apps/api/src/routes/restoration-draft.routes.ts`; `apps/api/src/controllers/restoration-draft.controller.ts`; `apps/api/src/services/restoration-draft.service.ts`; `apps/api/src/domain/restorationDraft/imageValidation.ts` + `imageValidation.test.ts`; `apps/api/src/domain/restorationDraft/market.ts` + `market.test.ts`; `apps/api/src/utils/image-binary.ts` + `image-binary.test.ts`; `apps/api/src/utils/errors.ts`; `apps/api/src/utils/ownership.ts` (read-only, protected, untouched); `apps/api/src/services/storage.service.ts` (read-only: `buildStorageKey`, `uploadOriginal`); `apps/api/src/db/prisma.ts`; `apps/api/src/index.ts` (`express.json({ limit: "12mb" })`); `apps/api/src/services/p1a-fixed-order-flow.test.ts`; `apps/api/package.json`; `apps/web/src/pages/RestoreNewPage.tsx`, `apps/web/src/pages/OrdersPage.tsx`, `apps/web/src/services/customerApi.ts` (client base64 producer); `apps/web/tests/browser/*.spec.ts`.

### 16 verified properties and dispositions

1. Encoded request size bounded before allocation — **COMPLETE_NO_DEFECT.** `express.json({ limit: "12mb" })` (`index.ts:88`) rejects over-limit bodies before the route/controller runs, plus `rateLimit(60_000, 10)` on the create route. Informational (not a defect, no change made): 12 MB encoded is ~9 MB decoded, so the encoded cap binds before the 10 MB decoded cap. Fail-closed and conservative; limits were deliberately **not** raised.
2. Missing/malformed/non-canonical base64 fails cleanly — **REPAIRED_VERIFIED.**
3. No silent partial accept of invalid base64 — **REPAIRED_VERIFIED.** Reproduced: `Buffer.from(validPngB64 + "!!!***", "base64")` returned bytes **byte-identical** to the clean image (probe output `junk-suffix decode len 98 equal? true`), and a payload with one character stripped still decoded to the full 98 bytes. The old `decodeBase64Input` did no shape validation. Repair: `decodeDraftImageBase64()` validates alphabet, length%4, canonical padding, and a byte-exact re-encode round trip **before** decoding, throwing `INVALID_BASE64` (400). Legitimate clients are unaffected: browser `FileReader.readAsDataURL` output is canonical, and MIME line-chunked payloads are still accepted.
4. Decoded-byte 10 MB cap — **COMPLETE_NO_DEFECT.** `MAX_DRAFT_UPLOAD_BYTES` is compared against `body.length` (decoded Buffer), proven with an exactly-one-byte-over fixture and with a base64-round-tripped fixture. Limit unchanged.
5. Claimed extension/contentType cannot override detection — **COMPLETE_NO_DEFECT.** `validateRestorationDraftImage(body)` takes bytes only; the persisted `originalMimeType` and the storage `contentType` come from `detectImageMime`, never from `input.contentType`. Proven by a PNG uploaded as `lie.jpg` + `contentType: image/jpeg` persisting `image/png`.
6. Corrupt images fail a real Sharp decode — **COMPLETE_NO_DEFECT.** A valid JPEG magic prefix + garbage, and a 30-byte truncated PNG, both fail `sharp(body).metadata()` and yield `INVALID_IMAGE_BINARY`.
7. SVG/unsupported formats fail closed — **COMPLETE_NO_DEFECT.** SVG (including an XXE `<!DOCTYPE ... ENTITY SYSTEM "file:///etc/passwd">` payload), GIF, TIFF, and PDF are all rejected `UNSUPPORTED_IMAGE_TYPE` at the magic-byte gate before sharp ever sees them — SVG never reaches an XML parser.
8. Multi-page/animated containers cannot bypass the pixel cap — **REPAIRED (defense in depth).** No reproducible bypass fixture could be produced in this libvips build (it does not report `n-pages` for animated WebP and reads a single page), so this is not classified as a proven defect. The pixel budget is nevertheless now charged per page (`width * height * pages`), which cannot reject any image previously accepted as single-page.
9. Safe dimension arithmetic — **COMPLETE_NO_DEFECT (hardened).** JS float64 cannot wrap; the pre-existing `!width || !height` guard already rejected `0`/`NaN`/`undefined`. Added explicit `Number.isFinite`/non-negative guards so a non-finite metadata value can never reach the `>` comparison.
10. 30 MP limit applied to effective (orientation-corrected) dimensions — **COMPLETE_NO_DEFECT.** EXIF orientations 5–8 swap the reported width/height; verified a 600×300 orientation-6 JPEG validates as 300×600.
11. Orientation cannot bypass the dimension limit — **COMPLETE_NO_DEFECT.** The cap compares the product `w*h`, which is orientation-invariant (`w*h === h*w`), so no orientation-swapped file can be under the cap in one orientation and over it in the other; an orientation-6 7000×6000 (42 MP) file is rejected.
12. Empty/zero-dimension input rejected — **COMPLETE_NO_DEFECT.** `EMPTY_FILE` for a zero-length buffer; zero/absent dimensions yield `INVALID_IMAGE_BINARY`. No division is performed anywhere on the path.
13. Unsafe file-name text — **REPAIRED_VERIFIED.** `StorageService.buildStorageKey` already applied `basename()` + `[^a-zA-Z0-9._-]+ -> _`, so traversal separators and NUL bytes could not alter a key, and the file name never reaches a response header or the safe view. Two gaps were real: the name was **unbounded in length** (a multi-megabyte name flowed straight into a storage key) and control characters were only silently substituted rather than rejected. Repair: `assertSafeUploadFileName()` (trim, required, ≤255 chars, no `U+0000–U+001F`/`U+007F`) runs at the boundary before any key is built. Additionally `deriveMarketFromCountry` echoed the raw client `country` verbatim into its error message/log — now bounded to 16 characters.
14. No storage/DB write before validation succeeds — **COMPLETE_NO_DEFECT.** Order in `createDraft` is market-confirm → country derive → required fields → file-name validation → strict base64 decode → image validation → `storage.uploadOriginal` → `prisma.restorationDraft.create`. Proven with in-process spies: 9 distinct rejection cases each produced **zero** storage and **zero** DB calls; the valid case produced exactly `storage.uploadOriginal | db.restorationDraft.create` in that order.
15. No secrets/raw bytes in errors or logs — **COMPLETE_NO_DEFECT (with the item-13 echo repair).** All errors are `AppError`s with static, non-reflective messages; asserted that no rejection message/serialized error contains the base64 payload, the raw input bytes, a storage key, or an unbounded client string. The upload path performs no `logger` call at all, and the safe view does not expose `originalStorageKey`.
16. Zero payment/entitlement/Replicate/RunPod/network calls — **COMPLETE_NO_DEFECT.** Proven by replacing `globalThis.fetch` with a throwing spy across all 11 boundary tests: no outbound call was attempted. The path imports only prisma, StorageService, the validators, and the guest-token/ownership helpers.

### Files changed

- `apps/api/src/domain/restorationDraft/imageValidation.ts` — added `assertSafeUploadFileName()`, `decodeDraftImageBase64()`, `MAX_DRAFT_FILE_NAME_LENGTH`; finite/non-negative dimension guards; per-page pixel accounting. Existing limits (`MAX_DRAFT_UPLOAD_BYTES` 10 MB, `MAX_DRAFT_UPLOAD_PIXELS` 30 MP) and the accepted format list (JPEG/PNG/WebP) are unchanged.
- `apps/api/src/domain/restorationDraft/market.ts` — bounded the echoed rejected country value to 16 characters.
- `apps/api/src/services/restoration-draft.service.ts` — removed the lenient local `decodeBase64Input`; now calls `assertSafeUploadFileName` + `decodeDraftImageBase64` before decode/validation, and passes the validated file name to storage.
- `apps/api/src/domain/restorationDraft/uploadInputValidation.test.ts` — **new**, 17 focused input-validation tests.
- `apps/api/src/services/p2r-upload-boundary.test.ts` — **new**, 11 service-level ordering/side-effect/no-network tests.

### Validation (real commands and exit codes)

- `npx tsx src/domain/restorationDraft/uploadInputValidation.test.ts` → exit **0**, **17/17 passed**.
- `npx tsx src/services/p2r-upload-boundary.test.ts` → exit **0**, **11/11 passed**.
- `npx tsx src/domain/restorationDraft/imageValidation.test.ts` (pre-existing) → exit **0**, passed unchanged.
- `npx tsx src/domain/restorationDraft/market.test.ts` (pre-existing) → exit **0**, passed unchanged.
- `npx tsx src/utils/image-binary.test.ts` (pre-existing binary-detection suite) → exit **0**, passed unchanged.
- `npx eslint` on the 5 changed files → exit **0**.
- `npx tsc -p tsconfig.json --noEmit` (apps/api) → exit **0**; `npx tsc -p tsconfig.json` (build) → exit **0**.
- `npx playwright test network-safety.spec.ts` → exit **0**, **1/1 passed**.
- `npx playwright test fixed-order-flow.spec.ts smoke.spec.ts` (upload-adjacent browser specs) → exit **0**, **19/19 passed**.
- `git diff --check` → exit **0**; `git diff --cached --check` → exit **0** (only pre-existing unrelated LF/CRLF warnings).
- P1A upload flow test (`src/services/p1a-fixed-order-flow.test.ts`) and every other live-database test: **NOT RUN — DISPOSABLE_DATABASE_URL absent; fail-closed; no fallback.**
- apps/web typecheck/build: **NOT APPLICABLE — no web file was changed.** No Prisma schema or migration change was made.

### Protected Scope Protocol

Finalized upload input-validation invariants (must not regress in any future packet): the 10 MB decoded-byte cap and 30 MP pixel cap must never be raised; the accepted format list stays JPEG/PNG/WebP with SVG/GIF/TIFF/PDF failing closed at the magic-byte gate; MIME must be derived from the bytes only and never from a client-claimed `contentType`/extension; base64 must be shape-validated (alphabet, length%4, canonical padding, round-trip) before decoding; client file names must stay bounded (≤255) and control-character-free; a real `sharp` decode must remain part of validation; no storage or DB write may precede validation; error messages must remain static and non-reflective of client input; and the path must remain free of any network/payment/provider call. Regression coverage: `apps/api/src/domain/restorationDraft/uploadInputValidation.test.ts` (17) and `apps/api/src/services/p2r-upload-boundary.test.ts` (11), plus the pre-existing `imageValidation.test.ts`, `market.test.ts`, and `image-binary.test.ts`.

Untouched and protected in this packet: `rules.md`, `apps/api/src/utils/ownership.ts` and all ownership/guest-token logic, signed-preview authorization, `prisma/schema.prisma` and every migration, PriceBook/FixedOrder invariants, payment/Bank Alfalah code, `restoration.service.ts`, Replicate/RunPod, the Sharp restoration/output pipeline, `storage.service.ts`, print/fulfilment, `apps/api/package.json` (test scripts deliberately not added so a pre-existing staged file stays byte-unchanged; the new suites are run via the explicit `npx tsx` commands above), production DB/deployment, and every other pre-existing staged/unstaged file (verified by a `git status --porcelain=v1` snapshot before vs. after). Replicate remains production; RunPod remains unauthorized; Bank Alfalah remains frozen and `ready:false`.

### Updated 13-stage table (post-packet)

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 78% | 22% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 45% | 55% |
| Admin operations/RBAC | 36% | 64% |
| Test/browser/deployment readiness | 75% | 25% |
| **Overall R9.2 launch readiness** | **50%** | **50%** |

Only the two stages backed by material verified hardening moved (upload boundary 75%→78% for three repaired defects with passing regression tests; test readiness 74%→75% for 28 new focused tests). Audit-only, no-defect findings produced no increase; overall readiness stays 50%.

### Next Packet: R9.2-P2R-UPLOAD-SECURITY-AUDIT-B

Deferred, explicitly out of scope here: storage-key/object consistency and retention, signed-preview URL exposure and ownership authorization, and guest-ownership token security (`apps/api/src/utils/ownership.ts`, `guest-ownership.ts`, `StorageService.getSignedUrl`, preview TTL). Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

## R9.2-P2R-DEPLOYMENT-SOURCE-OF-TRUTH-RECONCILIATION — 2026-08-03

Classification: **COMPLETE_RECONCILED**. This is a documentation/config reconciliation packet only — no application, payment, restoration, schema, pricing, upload, Sharp, print, or fulfilment code was touched, no DNS/deploy/production-infrastructure action occurred, and the 13-stage table above is unchanged (no row or overall percentage was altered by this packet).

### Owner-authoritative deployment decision (ground truth for this reconciliation)

- Frontend production: Cloudflare Pages (`thannow.com`).
- API production: Northflank (containerized Node.js/Express), auto-deploy from GitHub `main` via `.github/workflows/deploy.yml`.
- Production API hostname: `api.thannow.com`.
- Railway: RETIRED — historical reference only; not an active deploy or rollback target.
- Google Cloud / Cloud Run: RETIRED — historical reference only; not an active deploy or rollback target.
- Replicate remains the production restoration provider (untouched). RunPod production routing remains unauthorized (untouched). Bank Alfalah remains frozen, `ready:false` (untouched).
- Cloudflare proxy mode and exact proxy-hop count remain **UNVERIFIED** — not claimed otherwise anywhere in this packet's edits.
- Express `trust proxy` setting (`apps/api/src/index.ts`, `app.set("trust proxy", 1)`) is **unchanged** in this packet and remains unverified relative to the real ingress topology, exactly as established by the prior R9.2-P2R-UPLOAD-SECURITY-AUDIT-D record above (lines ~1920-1948).

### Discovery method

`git rev-parse HEAD` and `git status --porcelain=v1` were snapshotted before any change (HEAD `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce`, unchanged throughout — no commit was made). `git grep -n -i -E "railway|cloud run|google cloud|gcloud|gcp|northflank|api\.thannow\.com|trust proxy|deployment"` was run across tracked files (`.codex/**` sandbox-cache noise excluded) and every Railway/GCP/Northflank hit was individually inspected before any edit.

### Files inspected

`rules.md`; `.kilo/plans/1785668100937-dual-market-commerce-bank-alfalah-admin-ui-plan.md` (full, prior packets' sections including the existing Audit-D proxy-evidence record); `README.md`; `RAILWAY_DEPLOYMENT.md`; `.ai-project/DEPLOY_TARGETS.json`; `.ai-project/SAFE_COMMANDS.md`; `AI_PROJECT_RULES.md`; `BACKUP_AND_RECOVERY_GUIDE.md`; `.env.project.example`; `cloudbuild.yaml`; `deploy-cloudrun.ps1`; `scripts/safe-deploy.bat`; `scripts/safe-deploy-enterprise.bat`; `scripts/safe-deploy-enterprise.sh`; `.github/workflows/deploy.yml`; `.github/workflows/docker-build.yml`; `.github/workflows/validate-restoration.yml`; `apps/api/src/config/env.ts` (read only — one Railway-referencing comment found, left untouched: it is pre-existing modified application source outside this packet's documentation/config-only scope); `apps/api/src/index.ts` (read only, to reconfirm the `trust proxy` line — not edited). Also reviewed (found to be already correctly stated, no edit needed): `apps/web/.env.example`, `docs/restoration/*` production-status references, `scripts/guest-restoration-e2e.mjs`, `scripts/restoration-paid-smoke.mjs`.

### Files reconciled (edited) and why

1. **`README.md`** — CURRENT-classified onboarding doc. Its "Railway Deployment Note" section described Railway as the live deployment target with no caveat. Rewritten to a "Deployment Note" section stating Cloudflare Pages + Northflank + `api.thannow.com`, with an explicit "Railway and Google Cloud/Cloud Run are RETIRED — historical reference only; not an active deploy or rollback target" sentence and an unverified-proxy caveat.
2. **`RAILWAY_DEPLOYMENT.md`** — HISTORICAL EVIDENCE. Body describes a genuine prior deployment path (`Cloudflare Pages -> Railway API -> ...`) and is preserved verbatim below a new blockquote notice: "RETIRED — historical reference only; not an active deploy or rollback target," pointing to `rules.md` for the current architecture. No historical fact in the body was rewritten.
3. **`.ai-project/DEPLOY_TARGETS.json`** — added a `"status": "RETIRED — historical reference only; not an active deploy or rollback target."` field inside the existing `gcp` object (all original GCP identifiers preserved unchanged) and a new `"northflank"` object recording the active target and hostname plus an explicit unverified-proxy note. Confirmed no script reads this file (`grep` across `*.js/*.ts/*.mjs/*.cjs` for `DEPLOY_TARGETS`/`gcp` found no consumer other than the file itself), so the added keys are inert to any tooling. Re-parsed with `node -e "JSON.parse(...)"` → OK.
4. **`.ai-project/SAFE_COMMANDS.md`** — the `railway:check` line documented a command as an active "safe command"; `grep` of the root `package.json` proved no `railway:check` script exists at all (only `r2:check` and related scripts do). Annotated the line RETIRED with the factual note that the script does not currently exist, and added a sentence stating the current production target (Northflank/`api.thannow.com`).
5. **`AI_PROJECT_RULES.md`** — an active, still-enforced agent rules file. Rule 2 ("Never Deploy Without Verification") named Railway; corrected to Northflank/Cloudflare with a RETIRED parenthetical for Railway. Rule 4 ("Never Change Railway Target") pinned a specific Railway project ID as if still authoritative; retitled "Never Change Production API Target" and corrected to Northflank/`api.thannow.com`, with the old Railway project ID kept but explicitly marked RETIRED (historical evidence, not deleted). Rule 13 ("Frontend Binding Required") required binding to "the Railway production API"; corrected to `api.thannow.com` (Northflank) with a RETIRED parenthetical for Railway. Rules 1, 3, 5-12, 14-15 and the Phase P/Q notes were not Railway/GCP-related and were left untouched.
6. **`BACKUP_AND_RECOVERY_GUIDE.md`** — an active operational runbook. Its "Database Backups" section instructed `railway run -- pg_dump ...` / `railway run -- psql ...` as the current backup/restore procedure. Added a RETIRED blockquote notice naming Neon (via Northflank `DATABASE_URL`) as the current production database, and rewrote the two command blocks to a direct `pg_dump "$DATABASE_URL"` / `psql "$DATABASE_URL"` form (labelled "historical Railway invocation; use a direct Neon `DATABASE_URL` instead") so the runbook is truthful without deleting the historical Railway-era commands' intent. R2 retention, Prisma recovery, snapshot/rollback, and audit-trail sections were not Railway/GCP-related and were left untouched.
7. **`deploy-cloudrun.ps1`** — ACTIVE EXECUTABLE CONFIG. Confirmed by reading the full script: it is a real, runnable `gcloud builds submit` deploy trigger to Cloud Run with no owner-consent gate. No GitHub Actions workflow references it (confirmed: no `deploy-cloudrun` or `cloudbuild.yaml` string appears in any `.github/workflows/*.yml`), so it is a locally-invocable, not CI-triggered, live risk. Added an early, unconditional `exit 1` guard printing a RETIRED notice naming Northflank/`api.thannow.com` as current, ahead of the original `gcloud builds submit` body, which is preserved below the guard as historical/inert reference.
8. **`cloudbuild.yaml`** — ACTIVE EXECUTABLE CONFIG referenced only by `deploy-cloudrun.ps1` (now guarded) and by no CI workflow. Added a top-of-file RETIRED comment; the build/deploy steps themselves were left as historical evidence since the file cannot execute standalone (it requires an explicit `gcloud builds submit` invocation, which is now blocked upstream).
9. **`scripts/safe-deploy.bat`**, **`scripts/safe-deploy-enterprise.bat`**, **`scripts/safe-deploy-enterprise.sh`** — ACTIVE EXECUTABLE CONFIG. Each is a real, runnable script ending in `railway up` with no CI reference (confirmed absent from all `.github/workflows/*.yml`). Each was given an early, unconditional exit guard (`exit /b 1` / `exit 1`) printing a RETIRED notice naming Northflank/`api.thannow.com` as the current target, ahead of the original Railway-era body, which is preserved below the guard as historical/inert reference.

### Files found with Railway/GCP/Cloud Run references and left untouched (with reasoning)

- `.env.project.example` — GCP/Railway sections already carry explicit `[LEGACY]` inline comments and a "Keep for rollback. Do not use for new deployments." header; already correctly classified, no edit needed.
- `apps/api/src/config/env.ts` line 1 (`// Railway production deploy 2026-07-27`) — a stale code comment, but this file is pre-existing **modified, unstaged** application source from a prior in-progress packet outside this reconciliation's authorized scope ("documentation/config/workflow files describing deployment target, not application logic"); read but not edited, to avoid touching a protected pre-existing dirty file.
- `.github/workflows/docker-build.yml` — inspected in full; it builds/publishes AI service images to GHCR and updates RunPod templates/endpoints. Contains no Railway or GCP/Cloud Run reference at all (only RunPod, out of this packet's scope per the owner's explicit "RunPod production routing remains unauthorized (do not touch)").
- `.gcloudignore`, `.gitignore` GCP/Railway ignore-pattern lines (`.gcp-service-account.json`, `railway-env.txt`, etc.) — these are ignore-pattern housekeeping, not deployment-target claims; no active/current infra claim to correct.
- `SECRET_MAPPING.md`, `apipln.md`, `debugging_tasks.json`, `deploy_sync_tasks.json`, `.project-lock/identity.json`, `.project-lock/safe-railway.ps1`, `scripts/project-info.js`, `scripts/create-snapshot.js`, `scripts/verify-project.js`, `scripts/rollback.js` — inspected via grep excerpts; these are either explicitly phase-dated historical migration/secret-mapping records, ad hoc personal task-scratch files, or read-only status/identity-check tooling (no deploy action). They describe/reference Railway or GCP but do not claim either is the current production target in a way that would mislead an operator into deploying there, and correcting every one was judged out of proportion to this packet's narrow reconciliation mandate; flagged here for a future, smaller follow-up cleanup pass rather than silently left unaddressed.
- Every `.kilo/plans/*.md` file other than the canonical plan itself (e.g. `1784309455551-gpu-architecture-benchmark-plan.md`, `1784378677984-production-operations-plan.md`, `1785135525327-railway-fresh-project-migration.md`, `migrate-northflank.md`, `e2e-verification.md`, `phase-1-5-signoff-plan.md`, `production-hardening.md`, `redis-migration-assessment.md`, `redis-migration-execution.md`, `ops79-provider-abstraction-plan.md`, and the OPS-5x plans) — HISTORICAL EVIDENCE by nature (dated, superseded planning/migration records); left byte-unchanged per the instruction to preserve historical chronology and not rewrite old planning content. None of these is treated as a current source of truth by any live tooling.
- `docs/restoration/*` files referencing "deployment" — all describe RunPod Gate 2/3/4 authorization boundaries (explicitly out of this packet's scope) or reference `api.thannow.com`/Northflank correctly already; no Railway/GCP conflict found in this tree.

### Northflank architecture (current, unchanged by this packet — restated from `rules.md` for this reconciliation record)

Frontend: Cloudflare Pages, direct upload via `npx wrangler pages deploy`, domain `thannow.com`. API: Northflank, containerized Node.js/Express, 1 instance (`nf-compute-10`, free tier), auto-deploy from `main` via `.github/workflows/deploy.yml`, which PATCHes the Northflank runtime environment and polls `https://api.thannow.com/api/health` and `/api/version` post-deploy. Database: Neon PostgreSQL via Prisma. Redis: Northflank addon (BullMQ). Storage: Cloudflare R2. AI: Replicate only (`sczhou/codeformer`), RunPod implemented but not routed.

### Railway / Google Cloud-Cloud Run retirement status

Both are RETIRED — historical reference only; not an active deploy or rollback target, confirmed by: no `.github/workflows/*.yml` deploys to either (only `.github/workflows/deploy.yml` → Northflank does any production API deployment); the three locally-runnable Railway/GCP deploy scripts identified above are now blocked with an unconditional exit guard; `rules.md` already stated Cloudflare Pages + Northflank + Replicate-only with no Railway/GCP claim (no edit was needed there); and every corrected document above now states the retirement explicitly rather than by omission.

### Remaining proxy-evidence gap (explicitly unresolved by this packet, as instructed)

Cloudflare proxy mode (orange-cloud/proxied vs. DNS-only) for `api.thannow.com`, the exact proxy/load-balancer hop count between the public client and the Northflank-hosted Express process, and whether the existing `app.set("trust proxy", 1)` correctly matches that real hop count remain **UNVERIFIED** — exactly as already recorded in the prior R9.2-P2R-UPLOAD-SECURITY-AUDIT-D entry above (`BLOCKED_DEPLOYMENT_EVIDENCE`, lines ~1920-1948). This packet did not gather new proxy/ingress evidence and did not change `trust proxy`, client-IP extraction, rate-limit identity, secure-cookie behavior, or protocol detection.

### Validation commands and results (Step 6)

| Command | Result |
| --- | --- |
| `git rev-parse HEAD` (before) | `d00d5a45c4b1ffb2db1ab9f287018d933b4d81ce` |
| `git status --porcelain=v1` (before) | snapshotted in full; matches the pre-existing dirty/staged file list from the session start, no unexpected entries |
| `node -e "JSON.parse(fs.readFileSync('.ai-project/DEPLOY_TARGETS.json'))"` | exit 0 |
| `node -e "require('js-yaml').load(fs.readFileSync('cloudbuild.yaml'))"` | exit 0, "YAML OK via js-yaml" |
| `python -c "import yaml; yaml.safe_load(open('cloudbuild.yaml'))"` | exit 0, "YAML OK via python" |
| `git diff --check` | exit 0, no whitespace conflicts in this packet's changes |
| `git diff --cached --check` | exit 0 |
| `git status --short` | shows only this packet's files plus the exact pre-existing staged/unstaged set from the before-snapshot |
| `git diff --name-only` | `.ai-project/DEPLOY_TARGETS.json`, `.ai-project/SAFE_COMMANDS.md`, `AI_PROJECT_RULES.md`, `BACKUP_AND_RECOVERY_GUIDE.md`, `RAILWAY_DEPLOYMENT.md`, `README.md`, `cloudbuild.yaml`, `deploy-cloudrun.ps1`, `scripts/safe-deploy.bat`, `scripts/safe-deploy-enterprise.bat`, `scripts/safe-deploy-enterprise.sh`, plus this canonical plan, plus the pre-existing unstaged files already dirty before this packet started |
| `git diff --cached --name-only` | unchanged pre-existing staged list only (this packet's files are staged separately in Step 8 below and were not yet added at validation time) |
| `npm run lint`/`typecheck`/`build` | **not run** — this packet touched no application/config source that affects build (docs, a JSON annotation with no consumer, a YAML comment, and shell/PowerShell scripts already guarded by an early exit); running the full build was judged unnecessary per the task's own instruction to skip it when out of scope |
| `actionlint` | not installed (`Get-Command actionlint` — not found); no `.github/workflows/*.yml` was modified by this packet, so no workflow validation was required |

### Final grep confirmation

Final `git grep -n -i -E "railway|cloud run|google cloud|gcloud|gcp"` still returns hits, but every remaining hit is now one of: (a) explicitly labeled RETIRED in the file where it appears (`RAILWAY_DEPLOYMENT.md`, `README.md`, `AI_PROJECT_RULES.md`, `BACKUP_AND_RECOVERY_GUIDE.md`, `.ai-project/DEPLOY_TARGETS.json`, `.ai-project/SAFE_COMMANDS.md`, `cloudbuild.yaml`, `deploy-cloudrun.ps1`, `scripts/safe-deploy*.{bat,sh}`); (b) preserved historical evidence in dated `.kilo/plans/*.md` records not read as current; or (c) an old file/variable name or ignore-pattern reference not describing current infra (`.env.project.example` `[LEGACY]` block, `.gitignore`/`.gcloudignore` entries, `apps/api/src/config/env.ts`'s stale comment — left untouched as pre-existing protected application source). No CURRENT-classified document still claims Railway or GCP/Cloud Run as active production.

### Deployment Source-of-Truth Protected Scope Protocol

Going forward: no tracked document may describe Railway or Google Cloud/Cloud Run as the current or fallback production deployment target; any new Railway/GCP mention must either carry the exact phrase "RETIRED — historical reference only; not an active deploy or rollback target" or sit inside dated historical evidence that is not presented as current. Northflank (`api.thannow.com`) is the sole active API deployment target and Cloudflare Pages (`thannow.com`) is the sole active frontend target; any change to this must be a separate, explicit owner-authorized packet, not an incidental edit. `apps/api/src/index.ts`'s `trust proxy` setting may not be changed until real Cloudflare/Northflank ingress evidence (DNS proxy status, hop count, forwarded-header behavior) is supplied — this remains gated exactly as recorded in the Audit-D entry above. Replicate remains production restoration; RunPod remains unauthorized for production routing; Bank Alfalah remains frozen, `ready:false`. This protocol does not authorize any deploy, DNS, or infrastructure action — it governs tracked-file text only.

### Unchanged authoritative 13-stage table (copied forward verbatim, no percentage changed by this packet)

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 78% | 22% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 45% | 55% |
| Admin operations/RBAC | 36% | 64% |
| Test/browser/deployment readiness | 75% | 25% |
| **Overall R9.2 launch readiness** | **50%** | **50%** |

Overall remains **50% complete / 50% remaining**. This reconciliation packet is documentation/config-only and changes no implementation percentage.

### Honest note on "Audit-D" leftover state

No unexpected Audit-D leftover state was found. The canonical plan already contains a real, previously-completed "R9.2-P2R-UPLOAD-SECURITY-AUDIT-D" record (rate-limiting/error-mapping hardening, classified `REPAIRED_VERIFIED`, with `apps/api/src/middleware/rate-limit.middleware.ts`, `apps/api/src/routes/restoration-draft-rate-limit.test.ts`, and related route/controller files already staged from that earlier, successful packet) and a separate, later, explicitly `BLOCKED_DEPLOYMENT_EVIDENCE` proxy-evidence entry — both pre-date this reconciliation task and were not created or altered by it. The `git status --porcelain=v1` snapshot taken before this packet started matches the pre-existing staged/unstaged file list exactly, with no additional half-finished files beyond what was already there; this confirms the separately-reported "most-recent Audit-D attempt failed before making any file changes" claim is consistent with the repository's actual state — there is nothing further to repair or distrust here.

### Next safe packet

R9.2-P2R-UPLOAD-SECURITY-AUDIT-B (storage-key/object consistency, retention, signed-preview URL exposure/ownership authorization, guest-ownership token security), as already queued above — unaffected by this reconciliation. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

## R9.2-P2R Upload Audit Closeout And Next-Work Resequencing — 2026-08-03

Classification: **COMPLETE_RECONCILED**. Plan/documentation only; no application source, tests, schema, deployment, or infrastructure files were modified.

### Verified chronology

- Audit-A request/image validation: **REPAIRED_VERIFIED**. Actual suites recorded 17/17 input-validation and 11/11 upload-boundary tests; finalized strict Base64, MIME/decode, size, pixel, orientation, and validation-before-storage invariants remain protected.
- Audit-B1 storage/DB compensation: **REPAIRED_VERIFIED**. Actual focused suite 5/5; DB-create failure deletes the exact generated object and cleanup failure is generic/safe.
- Audit-B2A preview signing/authorization: **REPAIRED_VERIFIED**. Actual focused suite 3/3; ownership precedes signing, empty persisted key fails closed, and signing uses only the persisted key.
- Audit-B2B guest-token security/inheritance: **REPAIRED_VERIFIED**. Actual focused suite 4/4; authenticated identity takes precedence, tokens are 256-bit random/hash-only, and cross-resource tokens fail closed. Database-backed inheritance evidence remains unavailable without a disposable DB.
- Audit-C lifecycle/retention: **BLOCKED_RETENTION_POLICY**. No approved P1A draft retention/deletion policy exists; no cleanup implementation was added.
- Audit-D rate limits/error normalization: **REPAIRED_VERIFIED**. Actual focused suite 2/2; upload/read route limits, generic unknown-error serialization, and limiter timer cleanup passed; API lint/typecheck/build passed.
- Audit-E/proxy-ingress evidence: **BLOCKED_DEPLOYMENT_EVIDENCE**. `trust proxy = 1` remains unchanged and unverified because tracked records conflict between Northflank, Railway, and Cloud Run and provide no active hop count/header trace.

### Stale recommendation disposition

- The earlier `Next packet: ...-B` recommendation at the end of the B2A record and the older B1/C/D recommendations are preserved as historical chronology. They are marked **SUPERSEDED_NEXT_PACKET_DRIFT** by this closeout because B1, B2A, B2B, and D already have completed records.
- The later broad `R9.2-P2R-UPLOAD-SECURITY-AUDIT` recommendation is likewise superseded; no upload audit stage is rerun. Audit-C and Audit-E remain explicitly blocked on their stated owner/deployment evidence.

### Selected next implementation packet: R9.2-P2R-ADMIN-READINESS-REFINEMENT

This is the smallest genuinely unblocked packet: a read-only customer/admin presentation refinement using existing authoritative FixedOrder, PaymentAttempt, payment-readiness, and status responses. It requires no Bank Alfalah protocol, verified payment, retention approval, proxy evidence, provider call, schema change, or deployment credential.

- Scope: clarify existing provider-unavailable, blocked-readiness, no-attempt, pending, failed, cancelled, and persisted-paid states across existing customer/admin order surfaces; preserve raw server values and never fabricate paid state.
- Likely files: existing `apps/web/src/components/PaymentStatusLabel.tsx`, `RestorationOrdersHistorySection.tsx`, `FixedOrderReviewPage.tsx`, `AdminCommerceOrdersPage.tsx`, `AdminCommerceOrderDetailPage.tsx`, and their focused browser tests. No API/backend file is required unless an existing response-shape mismatch is concretely reproduced.
- Acceptance tests: all existing statuses map deterministically; provider-unavailable is distinct from failed; blocked readiness remains distinct from failure/cancellation; `PAID` requires persisted API status; browser query/return values cannot fabricate success; market/currency/amount remain server-derived; loading/empty/error/retry/inaccessible and mobile/accessibility states remain truthful; mount performs no mutation or provider call.
- Prohibited: Bank Alfalah/payment verification/callbacks, retention/deletion, proxy configuration, schema/migrations, master/entitlement/execution/Replicate/RunPod, Sharp/print, admin writes, deployment, and external calls.
- Rollback: revert only the scoped UI component/page/test changes if any focused browser, typecheck, or network-safety test regresses; preserve all server contracts and prior protected audit fixes.
- Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

### Upload Security Protected Scope Protocol

Audit-A, B1, B2A, B2B, and D source/tests and their invariants are finalized and must not be reopened without a directly reproducible regression. Audit-C cannot add deletion/retention behavior without approved policy. Audit-E cannot change `trust proxy`, forwarded-header handling, rate-limit identity, secure-cookie behavior, protocol detection, or logs without active ingress topology and sanitized Express header evidence. Bank Alfalah remains frozen and `ready:false`; Replicate remains production; RunPod remains unauthorized.

- Overall remains **50% complete / 50% remaining**. This plan-only closeout changes no percentages.

## R9.2-P2R-ADMIN-READINESS-REFINEMENT — 2026-08-03

Classification: **COMPLETE_VERIFIED**. Read-only presentation refinement. No backend, API, schema, migration, route, provider, or payment-verification file was touched; no new API field was introduced; payment readiness remains entirely server-computed and is only *displayed* differently.

### Per-item / per-page inspection matrix (Step 2)

Pages: **A** = `apps/web/src/pages/AdminCommerceOrdersPage.tsx`, **B** = `apps/web/src/pages/AdminCommerceOrderDetailPage.tsx`, **C** = `apps/web/src/pages/FixedOrderReviewPage.tsx`, **D** = `apps/web/src/components/RestorationOrdersHistorySection.tsx`.

| # | Requirement | A | B | C | D |
| --- | --- | --- | --- | --- | --- |
| 1 | Order status / payment status / readiness textually distinct | SATISFIED (`Order status` + `Payment status` are separate `<dt>`s; `StatusBadge` vs `PaymentStatusLabel`) | SATISFIED (`Order status` in the Order card; separate `payment-readiness-panel` and `payment-attempt-panel` cards) | SATISFIED (`Status` in the order card; separate `payment-panel` with `payment-blocked` / `attempt-status`) | SATISFIED (`Status` = order status; `Payment:` = attempt status; verified by the new "order status and payment status remain separate" test) |
| 2 | Immutable order facts shown consistently | SATISFIED (orderNo/type/market/currency/amount; list API returns no PriceBook field) | SATISFIED (type/status/market/currency/total + `pricebook-provenance` card) | SATISFIED (orderNo/tier/market/currency/total/status/`priceBookVersion`) | **GAP — REPAIRED**: `market` and `priceBookVersion` are already returned by `GET /api/fixed-orders` (`CustomerFixedOrderListItem`) and shown on B and C, but were not rendered here |
| 3 | All readiness-block reasons rendered, untruncated | N/A (list surface exposes no readiness) | SATISFIED (`order.paymentReadiness.reasons.map(...)`, full `<ul aria-label="Reasons payment is blocked">`) | SATISFIED (`readiness.reasons.map(describeReason)`, full list; `describeReason` falls back to the raw reason so nothing is hidden) | N/A (list surface exposes no readiness) |
| 4 | Fixture/unapproved pricing shown as payment-blocked wherever pricing is shown | N/A (list API returns no per-item pricing provenance) | SATISFIED (per-item `item-pricing-approved` / `item-pricing-unapproved` pill + `Pricing source`) | SATISFIED (`items.every(...)` → `pricing-state-approved` / `pricing-state-unapproved`) | **GAP — REPAIRED**: `pricingIndicator` used `items.some(...)`, so a mixed order (one approved line + one `local_fixture` line) was labelled "Owner-approved pricing" while the fixture line still blocks payment |
| 5 | No-attempt / provider-unavailable / unknown never imply paid | SATISFIED ("No attempt yet"; `PaymentStatusLabel` fail-safes unknown values to "Status unavailable") | SATISFIED (`no-payment-attempt`; `provider-unavailable-reason` rendered as a readiness reason, never as an attempt outcome) | SATISFIED (`payment-blocked`, "No payment attempt has been started yet.", `describeReason` provider-unavailable branch) | SATISFIED ("No payment attempt yet"; `getPaymentStatusPresentation` drives the accessible name and never maps an unknown value to PAID) |
| 6 | Never reads `location.search`/`URLSearchParams` for payment/readiness/status | SATISFIED (`URLSearchParams` is used only to build the outbound admin filter query from React state; nothing is read from `location.search`) | SATISFIED (no `useSearchParams`; only the `orderNo` route param) | SATISFIED (`useSearchParams` reads `orderNo` only — an identifier passed to the server; readiness/attempt/status all come from the API response) | SATISFIED (no query-param read at all; proven by the pre-existing `?paid=true&status=PAID` test) |
| 7 | PKR/USD display-only from server integer minor units | SATISFIED (`formatMinor` = `Number(amountMinor)/100` + `formatMoney`) | SATISFIED (same `formatMinor`, applied per item with the item's own currency) | SATISFIED (`formatMinorAmount` with `Intl.NumberFormat` and the server currency) | SATISFIED (same `formatMinorAmount`); no FX rate, no cross-currency conversion, and no recomputation exists in any of the four files |
| 8 | Loading / empty / error / retry, responsive, accessible | SATISFIED (`role="status" aria-live="polite"` loading, `role="alert"` + Retry, empty panel) | SATISFIED (loading `role="status"`, `order-not-found`, `role="alert"` + Retry) | SATISFIED (loading panel, error panel, readiness `role="status"`, readiness `role="alert"` + Retry) | **GAP — REPAIRED (minor)**: the loading paragraph had no `role="status" aria-live="polite"`, unlike the equivalent loading state on A/B/C. Empty state, `role="alert"` error, and Retry were already present |

### Gaps found and fixes (all in `apps/web/src/components/RestorationOrdersHistorySection.tsx`)

1. **Item 4 — truthfulness defect.** `pricingIndicator` used `order.items.some((item) => item.pricingApproved)`. Changed to `order.items.length > 0 && order.items.every((item) => item.pricingApproved)`, matching `FixedOrderReviewPage`'s existing `every(...)` rule. A mixed or empty-line order is now presented as "Fixture pricing (not payment-eligible)". Existing visible strings are unchanged; new `data-testid`s `history-pricing-approved` / `history-pricing-unapproved` were added.
2. **Item 2 — consistency gap.** Added `Market` (`history-order-market`) and `Price list version` (`history-order-pricebook-version`, `—` when the snapshot is null) rows, using the already-returned `market` / `priceBookVersion` fields with the same wording as `FixedOrderReviewPage`.
3. **Item 8 — a11y gap.** The loading paragraph is now `role="status" aria-live="polite"`, matching the other three surfaces.

No gap was found on `AdminCommerceOrdersPage.tsx`, `AdminCommerceOrderDetailPage.tsx`, or `FixedOrderReviewPage.tsx`; those files were inspected and left byte-unchanged. No new API field was invented — the admin list surface legitimately has no PriceBook/pricing-provenance field in `AdminCommerceOrderListItem`, so its absence there is not a display gap.

### Tests added (`apps/web/tests/browser/customer-orders-history-ui.spec.ts`, new describe block `readiness/immutable-fact refinement`)

- `a mixed order with any unapproved line is NOT presented as owner-approved pricing` — proves fix 1.
- `a fully approved order is still presented as owner-approved pricing` — proves no regression for the approved case.
- `an order with no line items is never presented as owner-approved pricing` — empty-line fail-safe.
- `market and PriceBook version are shown consistently, and PKR is displayed from minor units without conversion` — proves fix 2 and PKR display-only (35000 minor → 350, no `$`), with `expectCleanNetwork`.
- `a USD order is displayed in USD from its own minor units, with no FX recomputation` — 1200 minor → $12; USD/PKR are formatted independently, never converted.
- `a missing PriceBook snapshot renders as an explicit placeholder, never as an approved version`.
- `order status and payment status remain separate, distinguishable fields` — `LOCKED` (order) vs `Payment: CALLBACK_PENDING` (attempt); asserts `Payment: LOCKED` never appears.

All pre-existing assertions in this spec (including the `?paid=true&status=PAID` anti-fabrication test, the 360/390/430px responsive loop, the retry test, and the keyboard-focus test) were kept unchanged and still pass; no existing `data-testid` was removed or renamed.

### Validation (real commands and exit codes)

- `npx playwright test customer-orders-history-ui.spec.ts --workers=1` → **16/16 passed, exit 0**. (An earlier fully-parallel run showed 3 pre-existing tests timing out on a cold Vite first-compile; re-running parallel against a warm server passed 16/16, exit 0 — cold-start flakiness, unrelated to this change.)
- `npx playwright test payment-status-presentation.spec.ts admin-commerce-orders-ui.spec.ts fixed-order-review-ui.spec.ts customer-route-auth.spec.ts network-safety.spec.ts responsive.spec.ts` → **88/88 passed, exit 0**.
- `npx eslint apps/web/src/components/RestorationOrdersHistorySection.tsx apps/web/tests/browser/customer-orders-history-ui.spec.ts` → exit 0.
- `npx tsc --noEmit -p apps/web/tsconfig.json` → exit 0.
- `npx vite build` (apps/web) → exit 0, 78 modules, built in 1.84s.
- `git diff --check` → exit 0. `git diff --cached --check` → exit 0.
- No backend, Prisma, migration, deployment, or external-network command was run.

### Protected Scope Protocol — commerce/payment presentation (finalized)

These display rules are now finalized and must not be reopened without a directly reproducible regression:

- An order is presented as owner-approved-priced only when it has at least one line and **every** line has `pricingApproved === true`. `.some(...)` semantics are prohibited on any pricing indicator.
- Order status, payment-attempt status, and payment readiness must remain three separately labelled fields on every surface that shows them; they may never be merged into one label.
- All server-provided readiness `reasons` must be rendered in full; truncating, deduplicating to the first reason, or hiding an unrecognized reason is prohibited (`describeReason` must keep its raw-reason fallback).
- `PAID` may only be displayed from a persisted server `PaymentAttempt.status`. No query parameter, referrer, or client state may produce it. Any unrecognized status string must fall through `getPaymentStatusPresentation`'s fail-safe and never map to a success tone/label.
- PKR and USD amounts are formatted for display only from server integer minor units (`/100`). Client-side FX conversion, cross-currency recomputation, or rounding beyond `Intl.NumberFormat` presentation is prohibited.
- Missing immutable snapshot values (e.g. a null `priceBookVersion`) render as an explicit `—` placeholder, never as a fabricated or inferred version.
- Loading states use `role="status" aria-live="polite"`, error states use `role="alert"` with a Retry control, and all four surfaces must remain free of horizontal overflow at 360/390/430px.

Bank Alfalah remains frozen and `ready:false`; Replicate remains production restoration; RunPod remains unauthorized for production routing. This packet authorizes no deploy, no write endpoint, and no payment verification.

### Updated 13-stage table (post-packet)

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 78% | 22% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 47% | 53% |
| Admin operations/RBAC | 36% | 64% |
| Test/browser/deployment readiness | 76% | 24% |
| **Overall R9.2 launch readiness** | **50%** | **50%** |

Only two stages moved, and only by the amount the actual repair justifies: **Customer two-flow UI 45% → 47%** (one customer surface's pricing truthfulness defect fixed and its immutable order facts brought in line with the other surfaces) and **Test/browser/deployment readiness 75% → 76%** (seven new focused browser assertions). No other stage changed. Overall remains **50% complete / 50% remaining** — this is a presentation refinement, not new commerce capability.

### Next safe packet

**R9.2-P2R-ADMIN-COMMERCE-FILTER-VALIDATION** — a read-only hardening of `AdminCommerceOrdersPage`'s filter form: validate/normalize the free-text `status`/`market`/`currency`/`paymentStatus` inputs against the existing enum literals in `portal-types.ts` before they are sent, surface an inline "no such status" hint instead of an empty result set, and add focused browser tests. Still GET-only, no backend change, no new API field. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

## R9.2-P2R-ADMIN-COMMERCE-FILTER-VALIDATION — 2026-08-03

Classification: **COMPLETE_VERIFIED**. Frontend-only, GET-only input hardening. No backend, controller, service, route, schema, migration, provider, deployment, or payment-verification file was touched; no new API field, filter, or endpoint was invented; `PaymentStatusLabel.tsx` and all payment/order-status distinction logic are byte-unchanged.

### Ground-truth query contract used (read, not assumed)

Read from `apps/api/src/controllers/admin-commerce.controller.ts` and `apps/api/src/services/admin-commerce.service.ts`:

- `GET /api/admin/commerce-orders` accepts exactly: `page`, `pageSize`, `orderNo`, `status`, `market`, `currency`, `paymentStatus`.
- **There is no `type` filter.** `type` is a *returned* field only, so no `type` validation was added (adding one would have invented a filter that does not exist server-side).
- `orderNo` is a `contains`/`insensitive` substring search — not enum-backed, therefore intentionally left unvalidated.
- The four enum-like filters are matched by **exact equality after the server's own `.toUpperCase()`** (`where.status = params.status.toUpperCase()`, likewise market/currency, and `where.paymentAttempt = { status: params.paymentStatus.toUpperCase() }`). There is **no 400 and no param-ignoring path** — an unrecognized value simply matches nothing and returns `{ items: [], total: 0 }`.

This is precisely why client-side uppercasing is safe and meaning-preserving here: the server already uppercases, so `"paid"`, `" PAID "` and `"PAID"` are the same request by the API's own definition. No other case-folding or rewriting was invented.

### Per-filter inspection result (Step 2)

| Filter input on `AdminCommerceOrdersPage.tsx` | Control type | Enum-backed? | Server-supported? | Finding |
| --- | --- | --- | --- | --- |
| Order number | free-text `<input>` | No (substring search) | Yes (`orderNo`) | **SATISFIED / out of scope** — a partial string is the intended input; validation would break the feature |
| Status | free-text `<input>` | Yes (`FixedOrderRecord["status"]`) | Yes (`status`) | **GAP — FIXED** |
| Market | free-text `<input>` | Yes (`Market`) | Yes (`market`) | **GAP — FIXED** |
| Currency | free-text `<input>` | Yes (`FixedOrderCurrency`) | Yes (`currency`) | **GAP — FIXED** |
| Payment status | free-text `<input>` | Yes (`PaymentAttemptStatus`) | Yes (`paymentStatus`) | **GAP — FIXED** |
| (order `type`) | **no input exists** | Yes | **No** | **N/A** — no such filter server-side; none added |

No filter was a constrained `<select>`; all four enum-backed filters were free-text and completely unvalidated. Exact pre-fix repro: load `/admin/commerce-orders`, type `PAIDD` into *Payment status*, press *Apply filters* → `GET /api/admin/commerce-orders?page=1&pageSize=20&paymentStatus=PAIDD` was issued and the page rendered "No commerce orders match these filters" — indistinguishable from a genuinely empty result set. The same held for `LOCKEDD` (status), `PAKISTANI` (market), `GBP` (currency), and for any lower-case or whitespace-padded value (e.g. `" paid "` was sent verbatim, and the server's `.toUpperCase()` of `" PAID "` still matched nothing). No pre-existing browser test covered any of this.

### Fix (smallest change; existing inputs reused, no control swapped)

`apps/web/src/lib/portal-types.ts` — the four literal unions were converted to `as const` arrays with the union types **derived from them**, so there is exactly one source of truth and no duplicated literal list: `MARKETS`/`Market`, `FIXED_ORDER_CURRENCIES`/`FixedOrderCurrency`, `DIGITAL_TIERS`/`DigitalTier`, `FIXED_ORDER_TYPES`/`FixedOrderType`, `FIXED_ORDER_STATUSES`/`FixedOrderStatus`, `PAYMENT_ATTEMPT_STATUSES`/`PaymentAttemptStatus`. Every resulting type is structurally identical to what it replaced (`tsc --noEmit` exit 0 across the whole app proves no consumer changed meaning); no value was added or removed.

`apps/web/src/pages/AdminCommerceOrdersPage.tsx`:

1. `ENUM_FILTERS` maps each of the four validated filters to its label and to the imported array — no literal list is restated.
2. `normalizeFilterValue(raw) = raw.trim().toUpperCase()`; `filterHint(name, raw)` returns `null` for empty or valid, otherwise `No such {order status|market|currency|payment status}: "VALUE". Nothing was searched.`
3. `load()` early-returns (and clears `loading`) when any hint is non-null — **no list GET is issued at all** while a value is invalid, and the bad param is not silently dropped either (dropping it would show results that do not match what the operator typed).
4. Valid values are sent **normalized** (`params.set("status", normalizeFilterValue(status))`), so `" locked "` is sent as `LOCKED`.
5. Each invalid field renders a visible `<span role="alert" data-testid="filter-hint-…">` and the input gets `aria-invalid="true"` + `aria-describedby` pointing at it — text, never colour alone.
6. Because the hint renders inside the wrapping `<label>`, each of the four inputs was given an explicit `aria-label` so its accessible name stays "Status"/"Market"/"Currency"/"Payment status" instead of absorbing the error text.
7. The *Apply filters* button is deliberately **not** disabled, so keyboard tab order is unchanged and no operator is trapped; clicking it while invalid simply performs no request.

**No URL reading was added.** The page still reads nothing from `location.search`, preserving the finalized Protected Scope Protocol item ("never reads `location.search` for payment/readiness/status"), which is also the strongest possible answer to requirement 10: an attacker-controlled query string can neither pre-populate a filter nor be forwarded to the API.

### Tests added — `apps/web/tests/browser/admin-commerce-filter-validation.spec.ts` (30 cases, new file)

Per filter (status/market/currency/paymentStatus): `every valid {field} value is accepted and sent as an uppercase GET param` (all 6/2/2/14 enum members exercised individually); `a whitespace-padded, lower-case {field} value is trimmed, uppercased, and accepted`; `an invalid {field} shows an accessible inline hint and issues ZERO list requests` (asserts `role="alert"`, non-empty visible text, `aria-invalid="true"`, `aria-describedby` == the hint's id, and `recorded == []` after clicking Apply); `correcting the invalid {field} clears the hint and resumes normal GET loading`; `clearing the invalid {field} removes the hint and restores the unfiltered list` (also covers a whitespace-only value being treated as empty).

Cross-cutting: `an invalid value supplied in the page URL query string cannot bypass validation or reach the API`; `multiple simultaneously-invalid filters each show their own hint and still produce zero requests`; `pagination still works for valid filters and is not issued while a filter is invalid`; `the error state and Retry control still work when the filters are valid`; `Retry does not fire a request while a filter is invalid`; `the filter and its error message are fully reachable and operable with the keyboard only`; `the inline hint renders without horizontal overflow at 360px|390px|430px`; `no filter or query manipulation can make a PAID payment status appear` (anti-fabrication pattern reused from `payment-status-presentation.spec.ts` / `fixed-order-review-ui.spec.ts` — the mock always answers `CANCELLED_BY_CUSTOMER` regardless of the requested filter, and `?paymentStatus=PAID&paid=true&status=PAID&success=1` plus a literal `PAID` filter value both fail to produce a `PAID` label).

Every test asserts `method === "GET"` on all recorded requests. No pre-existing assertion in any spec was weakened, renamed, or removed; no existing `data-testid` was changed.

### Validation (real commands, real exit codes)

- `npx playwright test admin-commerce-filter-validation.spec.ts --workers=1` → **30/30 passed, exit 0** (passed on the first run; no repair loop iteration was required after the initial implementation).
- `npx playwright test admin-commerce-orders-ui.spec.ts payment-status-presentation.spec.ts customer-route-auth.spec.ts network-safety.spec.ts responsive.spec.ts customer-orders-history-ui.spec.ts fixed-order-review-ui.spec.ts --workers=1` → **104/104 passed, exit 0**.
- `npx eslint apps/web/src/pages/AdminCommerceOrdersPage.tsx apps/web/src/lib/portal-types.ts apps/web/tests/browser/admin-commerce-filter-validation.spec.ts` → exit 0.
- `npx tsc --noEmit -p apps/web/tsconfig.json` → exit 0.
- `npx vite build` (apps/web) → exit 0, 79 modules transformed, built in 2.52s.
- `git diff --check` → exit 0. `git diff --cached --check` → exit 0.
- No backend, Prisma, migration, deployment, or external-network command was run.

### Admin Filter Validation Protected Scope Protocol (finalized)

These rules are now finalized for every admin/customer list filter surface and must not be regressed without a directly reproducible defect:

- An enum-backed filter may only be validated against the `as const` array in `apps/web/src/lib/portal-types.ts` that its union type is derived from. Re-declaring the literal list anywhere else (a second array, a regex, a hand-written `switch`) is prohibited.
- Validation is permitted **only** for a filter the API actually supports. `type` is not a query parameter of `GET /api/admin/commerce-orders`; no UI may add a `type` filter, or validation for one, without a real backend filter existing first.
- `orderNo` is a substring search and must stay unvalidated.
- Normalization is limited to `trim()` + `toUpperCase()`, and is justified solely because `admin-commerce.service.ts` itself uppercases the value. If the server ever stops uppercasing, the client-side uppercase must be removed in the same change. No other normalization (aliasing, fuzzy matching, "did you mean", partial-prefix acceptance) may be introduced.
- While any enum-backed filter holds an invalid value, **zero** list requests may be issued — neither with the invalid value nor with it silently dropped. Silently dropping a bad param is prohibited because it renders a result set that does not match what the operator typed.
- The invalid state must be conveyed by visible text plus `role="alert"` and `aria-describedby`/`aria-invalid` — never by colour alone, and never by only disabling the submit button (which is deliberately left enabled to preserve tab order).
- These pages must remain GET-only and must continue to read **nothing** from `location.search`. Any future need for shareable filter URLs must route the parsed value through the same `filterHint` validation before it is applied or sent.
- A filter value may never be interpreted as evidence of payment state. Requesting `?paymentStatus=PAID` filters a query; it can never cause a `PAID` label to render. `PAID` still renders only from a persisted server `PaymentAttempt.status`.

Bank Alfalah remains frozen and `ready:false`; Replicate remains production restoration; RunPod remains unauthorized for production routing. This packet authorizes no deploy, no write endpoint, and no payment verification.

### Updated 13-stage table (post-packet)

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 78% | 22% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 47% | 53% |
| Admin operations/RBAC | 37% | 63% |
| Test/browser/deployment readiness | 77% | 23% |
| **Overall R9.2 launch readiness** | **50%** | **50%** |

Only two stages moved, each by the minimum the actual repair justifies: **Admin operations/RBAC 36% → 37%** (the sole existing admin commerce surface's filter form no longer produces silent, unexplained empty result sets; no new admin module, capability, or permission was added) and **Test/browser/deployment readiness 76% → 77%** (30 new focused browser assertions, all pre-existing specs re-run green). Every other row is unchanged, and overall remains **50% complete / 50% remaining** — this is input hardening, not new commerce capability.

### Next safe packet

**R9.2-P2R-ADMIN-COMMERCE-ORDERNO-AND-PAGINATION-HARDENING** — audit the remaining unvalidated list-surface inputs on `AdminCommerceOrdersPage`: the `orderNo` substring filter (no trim, no length bound, no debounce — a stray leading space is sent verbatim) and the pagination interaction (whether `page` can be driven past `Math.ceil(total/pageSize)`, and whether an in-flight response for a stale page can overwrite a newer one). Still frontend-only, GET-only, no backend change, no new API field. Recommended model: **Codex GPT-5.6 Terra, Agent mode, Medium effort**.

---

## R9.2-P3A-REPLICATE-ONCE-MASTER-WORKER — internal one-call execution worker + permanent master persistence

Classification: **COMPLETE_VERIFIED** for everything implementable without authorization, with **one honestly-reported sub-gap**: the disposable-Postgres-backed *real* concurrency proof was **NOT RUN** (see "Disposable database status"). No schema change, no new enum value, no new route, no `restoration.service.ts` change, no RunPod file touched, no live credential, no production DB/R2 action.

### Files added (the entire packet's source surface)

- `apps/api/src/services/replicate-execution.worker.ts` — the worker, its ports, its output validator, its pure eligibility function, and production-shaped Prisma/R2 adapters.
- `apps/api/src/services/p3a-replicate-execution-worker.test.ts` — 24 focused tests.

Nothing else in `apps/api/src` was modified. The worker is **not imported by any route, controller, queue processor, or `index.ts`** — it cannot be reached from any HTTP surface, and this packet therefore activates no live customer processing.

### Execution state machine (REAL schema enum values only)

`ReplicateExecutionStatus` is exactly `QUEUED | PROCESSING | SUCCEEDED | FAILED`; `RestorationMasterStatus` is exactly `NOT_STARTED | PROCESSING | VALIDATED | FAILED`. **No new state was invented**, and the packet needed none.

```
ReplicateExecution.QUEUED
   │  (eligibility verified; no mutation yet)
   ├── ineligible ─────────────► left EXACTLY as found (no claim, no provider call, no write)
   │
   ▼  atomic conditional claim
ReplicateExecution.PROCESSING   (startedAt set)
   │
   ├── source download / provider call / validation / upload fails
   │        └──► ReplicateExecution.FAILED + RestorationMaster.FAILED (failureReason = fixed CODE)
   │
   ▼  validate → upload → commit
ReplicateExecution.SUCCEEDED (outputSha256, providerRequestRef, completedAt)
RestorationMaster.VALIDATED  (storageKey, sha256, width, height, contentType, validatedAt)
```

The full chain verified **before** any provider work (`computeExecutionIneligibilityReasons`, a pure function):
execution `QUEUED` → master `NOT_STARTED|PROCESSING` **and** `storageKey == null` → entitlement `GRANTED` → FixedOrder type is `RESTORATION_DIGITAL|RESTORATION_WITH_PRINT` (via the existing `assertFirstRestorationExecutionEligible`) → FixedOrder status `PAYMENT_VERIFIED|LOCKED` → `PaymentAttempt.status == PAID` → valid market/currency pair (via `validateMarketCurrencyPair`) → `idempotencyKey` equals the deterministic `restoration-execution:<masterId>` key (via `validateOneCallExecutionClaim`) → source draft with an `originalStorageKey` exists. Any failure returns `INELIGIBLE` with **zero provider calls and zero writes**.

### One-call / concurrency proof

The claim is a single conditional update — `prisma.replicateExecution.updateMany({ where: { id, status: "QUEUED" }, data: { status: "PROCESSING", startedAt } })` — which compiles to one `UPDATE … WHERE id=$1 AND status='QUEUED'`. Postgres serializes concurrent updates of the same row, so exactly one caller can observe `count === 1`; every other caller sees `0` and returns `CLAIM_LOST` **without touching the provider**. There is no read-then-write window, no advisory lock, and no second dispatch path. An execution already `PROCESSING`/`SUCCEEDED`/`FAILED` never even reaches the claim — it is rejected as `INELIGIBLE` during chain verification, which is the replay-safety guarantee.

Provider isolation: the worker refuses to run at all unless `providerSelection === "replicate"` (checked *before* the claim, so a misconfigured deployment can never consume a queued execution), and it invokes the injected `ProviderExecutionPort` — the same seam `RestorationProviderRouter` fills — **exactly once**, with no retry, no fallback, and no alternate tier. The worker source contains no import from `restoration-providers/runpod/`.

### Persistence ordering, compensation, and privacy

Strict order, no step reachable after a failure of an earlier one:
**provider call → decode/validate output bytes → upload ONE permanent master → DB commit.**

Validation (before anything is written anywhere): non-empty; `MAX_MASTER_OUTPUT_BYTES = 40 MB` byte cap (deliberately *not* the 10 MB free-upload input cap — a restored master is legitimately larger than the customer's input; the cap exists so a hostile/malformed response can never be buffered unbounded); magic-byte format detection reusing the Audit-A `detectImageMime` (the provider's *declared* content type is never trusted — proven by test `(d2)`); a real `sharp` decode; EXIF-orientation-corrected dimensions; the same `30_000_000`-pixel budget as uploads, charged per page for multi-page containers; and a SHA-256 computed over the exact bytes that get uploaded. No validator logic is duplicated — `detectImageMime` is reused, and this file never re-implements `imageValidation.ts`.

Upload uses a **server-generated key only**, via `StorageService.uploadFile({ keyPrefix: "finals", fileName: "restoration-master-<masterId>-<uuid>.<ext>" })` — the same `buildStorageKey` timestamp/UUID/sanitization path `uploadOriginal` uses. No client-supplied name reaches it. **Exactly one** object is written; no 2HD/4HD/print variant is produced, and no `ImageVariant`, `DigitalEntitlement`, `PrintEntitlement`, `FulfilmentOrder`, or payment row is created or mutated anywhere in this path.

Compensation for the "upload succeeded, DB commit failed" window: **exactly one** bounded `deleteObject` attempt, never retried. If it succeeds → execution `FAILED` with `failureReason = COMMIT_FAILED_ORPHAN_DELETED`, outcome `COMMIT_FAILED_COMPENSATED`. If it fails → execution `FAILED` with `failureReason = COMMIT_FAILED_ORPHAN_NEEDS_CLEANUP`, outcome `COMMIT_FAILED_ORPHAN_NEEDS_CLEANUP`. **Success is never reported in either case**, and the master is never marked `VALIDATED`.

Privacy: every persisted `failureReason` is drawn from a fixed uppercase code vocabulary (`SOURCE_UNAVAILABLE`, `PROVIDER_CALL_FAILED`, `OUTPUT_VALIDATION_FAILED`, `MASTER_UPLOAD_FAILED`, `COMMIT_FAILED_ORPHAN_DELETED`, `COMMIT_FAILED_ORPHAN_NEEDS_CLEANUP`). Caught provider/storage errors are **discarded, not interpolated** — no message, payload, stack, key, URL, token, or byte ever reaches a log or the database. `providerRequestRef` is an opaque id/name truncated to 128 chars.

### Disposable database status

**NOT RUN — `DISPOSABLE_DATABASE_URL` is absent and the documented local-Postgres bootstrap (`initdb`/`pg_ctl`/`createdb`, per the R9.2-P0C1 lifecycle in `AI_code_audit_report_RI.md` and `src/scripts/verify-disposable-db.ts`) could not be completed in this environment: `initdb`, `pg_ctl`, `psql`, and `docker` are all absent from PATH on this Windows host; fail-closed; no remote-DB fallback used.** No Neon or any other remote database was contacted, and no synthetic row was written to any database. The concurrency invariant was instead proven in-process against a fake repository that models the Postgres conditional-update semantics exactly (a synchronous, uninterruptible compare-and-set), test `(b)`. The DB-backed version of that proof remains outstanding and is the first item of the recommended next packet.

### Test evidence (real, first-run)

- `npx tsx --test src/services/p3a-replicate-execution-worker.test.ts` → **24 pass / 0 fail, exit 0** (passed on the first run; no repair-loop iteration was required). Covers (a) ineligible chains → zero provider calls, (b) concurrent claim → exactly one provider call + one upload + one commit, (c) replay on `PROCESSING`/`SUCCEEDED`/`FAILED` and on a `VALIDATED` master → zero calls, (d)+(i) success persists one master with the exact hash/dimensions/content-type/provider ref of the mocked output, (e) non-image/empty/oversized/truncated output → no upload, no commit, `FAILED`, (f) provider and source failures → safe `FAILED`, (g) upload failure → no commit, (h) commit-failure-after-upload → compensation attempted / explicit orphan code, (j) `DIGITAL_UPGRADE` and `PRINT_ADD_ON` can never be executed, (k) a real filesystem scan of `src/routes`, `src/controllers`, `src/queues` proving no route/controller/queue references the worker or `replicateExecution`, (l) a throwing `globalThis.fetch` spy plus a worker-source scan proving zero RunPod/payment/Sharp-variant/fulfilment/external calls.
- Existing suites re-run unmodified, all exit 0: `RestorationExecutionCoordinator.test.ts` **7/7**, `DefaultRestorationExecutionPorts.test.ts` **6/6**, `RestorationProviderRouter.test.ts` **10/10**, `fixedOrderGuards.test.ts`, `paymentReadiness.test.ts`, `p1b-boundary.validator.test.ts`, `imageValidation.test.ts`, `uploadInputValidation.test.ts` **17/17**, `p2r-upload-boundary.test.ts` **11/11**, `p2r-preview-authorization.test.ts` **3/3**, `p2r-customer-orders-list.test.ts` **13/13**, `p2r-upload-storage-ownership.test.ts` **5/5**, `guest-ownership.test.ts` **4/4**, `image-binary.test.ts`, `offerProvider.test.ts`, `priceBook.test.ts`, `market.test.ts`, `restoration-view.test.ts`, `admin-commerce-read.test.ts` **9/9**, `admin-commerce-routes.test.ts` **5/5**, `restoration-draft-error.test.ts`, `restoration-draft-rate-limit.test.ts`.
- `p1a-fixed-order-flow.test.ts`, `p1b-payment-attempt-flow.test.ts`, `p1c-b-pricebook-flow.test.ts` require `DISPOSABLE_DATABASE_URL` and were **not run** for the reason above (they fail closed by design rather than falling back).
- `npx eslint` on both new files → exit 0 (1 pre-existing-style `no-explicit-any` warning on the test file's `fetch` spy). `npx tsc -p apps/api/tsconfig.json --noEmit` → exit 0. `npm run build` (API `tsc`) → exit 0. `npx prisma validate` → exit 0, schema valid (schema.prisma itself was **not modified**). `git diff --check` → exit 0. `git diff --cached --check` → exit 0.
- `network-safety.spec.ts` (web) — **N/A / not run**: this packet is backend-only and adds no web asset or request path.

### Protected Scope Protocol — P3A one-call worker & permanent master (finalized)

These are now finalized and must not be regressed without a directly reproducible defect:

- The worker entrypoint accepts **only an already-existing execution id**. It must never create a `ReplicateExecution`, `RestorationMaster`, `RestorationEntitlement`, `PaymentAttempt`, or `FixedOrder`.
- **No public, customer, or admin route may create or dispatch a `ReplicateExecution`.** Test `(k)` scans the real route/controller/queue files and must keep passing; adding such a route requires explicit owner authorization.
- The claim must remain a **single conditional update guarded on `status = "QUEUED"`** returning a row count. Replacing it with read-then-write, an in-memory lock, or an unguarded update is prohibited.
- **Exactly one** provider call per execution. No retry, no fallback provider, no dual dispatch, no second tier. `providerSelection !== "replicate"` must continue to fail closed **before** the claim.
- Ordering is fixed: **validate → upload → DB commit**. A master may never be marked `VALIDATED`, and an execution never `SUCCEEDED`, unless both the validation and the single upload actually succeeded.
- **Exactly one** permanent master object per execution, under a server-generated key via `StorageService`. No 2HD/4HD/print variant, `ImageVariant`, entitlement grant, fulfilment record, or payment record may be created in this path.
- Commit-failure-after-upload must attempt **exactly one** bounded compensation delete and must report `COMMIT_FAILED_COMPENSATED` or `COMMIT_FAILED_ORPHAN_NEEDS_CLEANUP` — **never success**.
- `failureReason` values persisted to the database must remain a **fixed uppercase code vocabulary**. Interpolating a caught error's message, a provider payload, a storage key, a signed URL, a token, or any image bytes into a log, error, or DB column is prohibited.
- Output validation must keep verifying by decode (magic bytes + `sharp`), never by the provider's declared content type, and must keep reusing `utils/image-binary.ts`'s `detectImageMime` rather than re-implementing format detection.
- Any test requiring real persistence/concurrency must use only the documented **local disposable Postgres**. Falling back to Neon or any remote database is prohibited; "not run, here is exactly why" is the required behavior.

Bank Alfalah remains frozen and `ready:false`; Replicate remains production restoration; RunPod remains unauthorized for production routing. This packet authorizes no deploy, no dispatch endpoint, no live customer processing, and no payment verification.

### Pre-edit 13-stage table (as found, verbatim)

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 78% | 22% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 45% | 55% |
| Permanent master validation/persistence | 55% | 45% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 47% | 53% |
| Admin operations/RBAC | 37% | 63% |
| Test/browser/deployment readiness | 77% | 23% |
| **Overall R9.2 launch readiness** | **50%** | **50%** |

### Updated 13-stage table (post-packet)

| Stage | Complete | Remaining |
| --- | ---: | ---: |
| Replicate production restoration boundary | 100% | 0% |
| Free upload/source preview boundary | 78% | 22% |
| Fixed immutable order model | 65% | 35% |
| Market/currency server pricing | 75% | 25% |
| Bank Alfalah verified payment gate | 15% | 85% |
| One-call Replicate execution enforcement | 60% | 40% |
| Permanent master validation/persistence | 68% | 32% |
| Sharp digital variant architecture | 35% | 65% |
| Add-on upgrade/print orders | 10% | 90% |
| Print fulfilment/tracking | 5% | 95% |
| Customer two-flow UI | 47% | 53% |
| Admin operations/RBAC | 37% | 63% |
| Test/browser/deployment readiness | 78% | 22% |
| **Overall R9.2 launch readiness** | **52%** | **48%** |

Three stages moved, each by the minimum the verified implementation justifies. **One-call Replicate execution enforcement 45% → 60%**: the enforcement is no longer only schema uniqueness plus pure guards — an actual atomic claim, replay-safety, provider-isolation, and no-retry/no-fallback worker now exists and is tested; it stops short of 100% because it is not activated, not reachable, and its concurrency proof is not yet DB-backed. **Permanent master validation/persistence 55% → 68%**: validate → single-upload → commit ordering, hash/dimension/content-type/provider-ref persistence, and bounded orphan compensation are implemented and tested; it stops short because nothing has yet persisted a master against a real database or real R2. **Test/browser/deployment readiness 77% → 78%**: 24 new focused backend tests. Every other row is unchanged. Overall **50% → 52%**.

### Next safe packet

**R9.2-P3A-VERIFY — disposable-Postgres concurrency and persistence proof for the P3A worker.** Stand up the documented local disposable PostgreSQL (`initdb`/`pg_ctl`/`createdb` → `prisma migrate deploy` → teardown), then run the P3A worker's `PrismaReplicateExecutionRepository` against it with a genuinely concurrent, multi-process claim race on one seeded `QUEUED` execution, asserting exactly one `PROCESSING` transition and exactly one provider call, plus a real read-back of the committed `RestorationMaster` fields. Test-only rows must be labelled and torn down with the instance. Still no route, no live provider credential, no R2, no deploy. Recommended model: **Claude Opus 5, Agent mode, High effort**.
