# R9.2-P6A — Customer Route Authority Hardening Protocol

Branch: `feat/r9.2-p6a-customer-route-hardening`. This is a permanent
protocol document; it is append-only going forward, matching the Protected
Scope Protocol already established in
`docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md`.

## 1. Problem found

Before this packet:

- `/orders`, `/wallet`, `/payments`, and `/subscription` were mounted under
  `CustomerLayout` in `apps/web/src/App.tsx` with **no auth gate at all**.
  `CustomerLayout` itself only *displays* `user?.name`/`user?.email`; it does
  not redirect an anonymous visitor. Any unauthenticated visitor (or a bot,
  or a stale bookmark) could load these routes directly.
- `apps/web/src/pages/RestoreOrderPage.tsx` (the legacy `/restore/:orderId`
  customer flow) fired an automatic `customerApi.processRestorationItem`
  **POST** for every `PENDING`/`QUEUED` item on first successful load,
  guarded only by an in-memory `useRef` (once per page/tab session, but
  re-armed on every fresh page load, deep link, or hard refresh). This meant
  simply opening or reloading the page could dispatch new restoration
  processing — a page-load/refresh side effect, not a payment- or
  worker-driven one.

## 2. Fix

### 2.1 Route protection

`apps/web/src/components/RequireAuth.tsx` already existed (an
`Outlet`-based guard: shows a loading panel while `useAuth().status ===
"loading"`, redirects to `/login` with `state: { from: location.pathname }`
when there is no `user`, otherwise renders `<Outlet />`) but was not wired
into any route. `apps/web/src/pages/LoginPage.tsx` already read
`location.state.from` (falling back to `/orders`) and navigated there after
a successful login — the "preserve intended destination" convention was
already fully implemented and just needed a caller.

`App.tsx` now wraps the existing `CustomerLayout` route group in
`RequireAuth`:

```tsx
<Route element={<RequireAuth />}>
  <Route element={<CustomerLayout />}>
    <Route path="orders" element={<OrdersPage />} />
    <Route path="wallet" element={<WalletPage />} />
    <Route path="payments" element={<PaymentsPage />} />
    <Route path="subscription" element={<SubscriptionPage />} />
  </Route>
</Route>
```

No new auth mechanism was created. Admin routes (`RequireAdminPortal`,
separate token/localStorage key, redirects to `/admin/login` via
`window.location.href`, not React Router) were not touched. Guest
restoration upload/status/history routes (`/restore`, `/restore/new`,
`/restore/:orderId`, `/restore/:orderId/status`, `/restore/:orderId/print`)
remain on `PublicLayout`, unauthenticated by design — this packet did not
add auth to them.

### 2.2 Auto-dispatch removal

The automatic `processRestorationItem` POST block in `RestoreOrderPage.tsx`
(and its now-unused `processingRef`) was deleted outright. The page is now
read-only on load and on every poll/refresh — it only ever issues `GET
/api/restorations/:id`, matching the convention `RestorationStatusPage.tsx`
already established in R9.2-P5A ("Read-only status updates. Refresh never
writes."). No other customer restoration page (`RestorationStatusPage.tsx`,
`RestorationHistoryPage.tsx`, `RestorePrintPage.tsx`) contained a similar
auto-dispatch pattern; `RestoreNewPage.tsx`'s upload/processing calls remain
explicit, user-button-triggered actions, not page-load/refresh side effects,
and were left unchanged.

`customerApi.processRestorationItem` itself (in `customerApi.ts`) was left
in place as a callable client method — it is simply no longer called by any
page-load/refresh path. No new caller was added anywhere.

## 3. Permanent rule

**Only the verified-payment-created internal execution (P4A's
`applyVerifiedPaymentEvidence` → `ReplicateExecution` row) and the P4B
internal worker runner (`p4b-worker-runner-main.ts` / `InternalWorkerRunner`)
may start new restoration processing.** No customer-facing page may issue a
processing-triggering POST as a side effect of mounting, polling, or
refreshing. Any future customer restoration page must be read-only on
mount/refresh; a processing dispatch, if ever needed again, must be an
explicit, single, user-initiated action reviewed against this rule — never
an automatic effect of loading or reloading a page.

This is restated in `rules.md`.

## 4. What this packet did NOT do

- No checkout route was created. `BANK_ALFALAH_MERCHANT_PROFILE_ENABLEMENT_REQUIRED`
  remains open (unchanged, untouched); no MPGS/checkout wiring exists and
  none was added.
- No PriceBook value or PriceBook behavior was changed (see the separate
  R9.2-P6A PriceBook reconciliation record in
  `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` and
  `.kilo/plans/commerceflownew.md`).
- No production deployment, secret, live Replicate/R2/RunPod/MPGS network
  call, or destructive Git operation occurred.

## 5. Test evidence

See `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md` (R9.2-P6A section) for
the full command/result table: 36/36 browser tests (13 pre-existing P5A +
23 new P6A), 11/11 focused backend unit tests (PriceBook/offerProvider,
P5B, guest-ownership/auth), lint/typecheck/build/Prisma all clean, `git
diff` checks clean, zero live external calls.
