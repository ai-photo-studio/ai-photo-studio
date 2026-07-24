# OPS-125 — Customer Feedback

**Date:** 2026-07-24

## Feedback Request Flow

After a successful download, the customer is presented with:

1. **Rating**: 1–5 stars
2. **Open feedback**: Free text
3. **Print quality feedback**: Optional, if print was ordered
4. **Support request**: Optional, provides escalation path

## Status: NOT VERIFIED

The customer feedback system is not yet wired end-to-end. The following pieces exist but need integration:

### Existing Infrastructure
| Component | Exists | Notes |
|-----------|--------|-------|
| Order status email notifications | ✅ | restoration.service.ts sends email on completion |
| WhatsApp delivery notifications | ✅ | delivery.service.ts sends WhatsApp messages |
| Audit log | ✅ | All customer actions logged to AuditLog |
| Admin dashboard | ✅ | Extended with business metrics |

### Required Components
| Component | Status | Notes |
|-----------|--------|-------|
| Feedback form UI | NOT VERIFIED | Would go in RestoreOrderPage after download |
| Feedback API endpoint | NOT VERIFIED | Would store to DB or AuditLog |
| Feedback storage | NOT VERIFIED | No dedicated Feedback model in Prisma schema |
| Print quality feedback | NOT VERIFIED | Would be separate from general feedback |
| Support request routing | NOT VERIFIED | Would need notification to operations team |

### Recommendation
Add a `CustomerFeedback` model to Prisma schema:
```prisma
model CustomerFeedback {
  id                String   @id @default(cuid())
  userId            String
  orderId           String?
  restorationItemId String?
  rating            Int?     // 1-5
  feedback          String?
  printQuality      Int?     // 1-5 (optional)
  supportRequested  Boolean  @default(false)
  supportHandled    Boolean  @default(false)
  createdAt         DateTime @default(now())
}
```

## Event Tracking

The following events should be tracked via the existing `AuditLog` model:

| Event | Tracked Via | Status |
|-------|------------|--------|
| Landing page visited | Frontend analytics (GA4/Plausible) | UNKNOWN |
| Upload started | AuditLog or OrderImage creation | VERIFIED (via order flow) |
| Upload completed | OrderImage creation | VERIFIED |
| Package selected | AuditLog or package selection event | VERIFIED (via Order creation) |
| Payment initiated | Payment record creation | VERIFIED |
| Payment completed | Payment status=PAID | VERIFIED |
| Restoration started | RestorationItem status=PROCESSING | VERIFIED |
| Restoration completed | RestorationItem status=COMPLETED | VERIFIED |
| Download by tier | Download URL generation | VERIFIED (via download endpoint) |
| Print order created | OrderItem creation | VERIFIED |