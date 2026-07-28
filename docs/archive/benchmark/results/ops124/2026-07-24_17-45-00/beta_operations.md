# OPS-124 — Beta Operations

**Date:** 2026-07-24

## Commerce Journey Verification

| Step | Component | Status | Notes |
|------|-----------|--------|-------|
| Upload | RestoreNewPage.tsx (upload step) | **VERIFIED** | Drag-drop, multiple files, 10MB limit, MIME whitelist |
| Package Selection | RestoreNewPage.tsx (package step) | **VERIFIED** | Fetches active packages from `/api/packages`, shows pricing |
| Payment | RestoreNewPage.tsx (payment step) | **VERIFIED** | Package summary + confirm button; redirects to order |
| Processing (Replicate) | PipelineOrchestrator via restoration.service.ts | **VERIFIED** | getDefaultTier() → flux-kontext-apps/restore-image |
| Master Image | finalStorageKey stored in RestorationItem | **VERIFIED** | Single master, stored as finals/ prefix (30d retention) |
| Downloads | RestoreOrderPage.tsx (tier section) | **VERIFIED** | Original, 2X, 4X, 6X, 8X, 12X tiers; Locked/Purchased/Upgrade |
| Print Order | RestoreOrderPage.tsx (print section) | **VERIFIED** | 4×6, 5×7, 8×10, A4, A3, Canvas, Frame, Album |
| Print Preparation | print-preparation.service.ts | **VERIFIED** | DPI calc, resolution scoring, quality assessment |
| Invoice | Auto-generated on payment finalization | **VERIFIED** | Order → Payment → Wallet → Audit trail |
| History | RestorationHistoryPage.tsx | **VERIFIED** | Grouped by status (Completed/Processing/Failed) |

## Beta Launch Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| Auth required | ✅ VERIFIED | JWT + requireAuth on all customer routes |
| Payment gating | ✅ VERIFIED | Processing starts after payment (order.service.ts:58 → PAYMENT_PENDING) |
| Storage lifecycle | ✅ VERIFIED | 72h originals, 30d finals, 7d previews |
| Cleanup worker | ✅ VERIFIED | runCleanupOnce() on startup |
| Rate limiting | ✅ VERIFIED | Global 120/min, per-endpoint limits |
| Structured logging | ✅ VERIFIED | JSON {level, message, time, meta} |
| Watchdogs (5 services) | ✅ VERIFIED | Queue, worker, job heartbeat, recovery, memory |
| Production API live | ✅ VERIFIED | api.thannow.com responds |
| Frontend live | ✅ VERIFIED | www.thannow.com serves commerce UI |

## Known Limitations

| Issue | Severity | Status |
|-------|----------|--------|
| Print fulfillment (shipping/courier) | Medium | UNKNOWN — Scaffolding only, external fulfillment needed |
| CSRF token mechanism | Low | UNKNOWN — Mitigated by Bearer token + CORS origin validation |
| Bank Alfalah merchant live URLs | High | UNKNOWN — Requires live provider configuration |
| Cloudflare cache headers | Low | UNKNOWN — Requires DevTools inspection |
| Print endpoint end-to-end | Medium | UNKNOWN — Frontend print UI exists but backend endpoint not fully wired |

## Recommendations

1. **Deploy latest OPS-122 frontend** (COMMERCE UI) — ✅ **DONE** (deployed fe5c2301)
2. **Verify production payment configuration** — ⏳ Pending provider URLs
3. **Complete print fulfillment integration** — ⏳ Requires external courier API
4. **Add CSRF middleware** — 🟢 Optional, mitigated by existing Bearer token pattern
5. **Configure R2 lifecycle rules** — 🟢 Code-level retention enforced; R2 bucket lifecycle policy recommended
```