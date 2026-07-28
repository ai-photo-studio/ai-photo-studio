# MVP Scope

## Included in MVP
- WhatsApp webhook intake:
  - text
  - interactive selection replies
  - image message intake
- Service menu and package selection conversation
- Order creation from WhatsApp conversation state
- Payment link generation
- Payment webhook confirmation
- Image processing pipeline for package rules
- Watermarked preview for free package
- Final delivery via WhatsApp message/link
- Admin operational dashboard (basic)
- Cleanup worker with retention windows

## Explicitly Excluded in MVP
- Virtual model workflows
- Flat lay generation
- Ghost mannequin workflows
- Video generation
- Customer self-service dashboard
- Advanced BI/reporting dashboards

## Website Customer Foundation (Phase A)
- In scope for the backend only:
  - user registration and login
  - refresh-token based session renewal
  - public package listing API
  - web user-to-order linkage in the database
- Explicitly out of scope for Phase A:
  - public marketing pages
  - customer dashboard
  - payment gateway UI
  - redesign of the existing app shell

## Public Website (Phase B)
- In scope:
  - public home page with hero, features, CTA, and pricing preview
  - pricing page backed by the live packages API
  - signup and login pages
  - protected customer layout with persisted JWT session
- Still out of scope:
  - customer dashboard
  - checkout flow
  - payment gateway UI

## Commercial Readiness (Phase F)
- In scope:
  - wallet ledger with credit, debit, and refund transactions
  - package catalog for `STARTER`, `PRO`, `BUSINESS`, and `DEALER`
  - manual payment proof upload and admin approval/rejection
  - subscriptions and monthly usage tracking
  - credit reservation and settlement during image processing
- Still out of scope:
  - recurring billing
  - live payment gateway integration
  - customer wallet UI

## Production Readiness + Customer Commercial UI (Phase G)
- In scope:
  - customer wallet, payment, and subscription pages
  - admin payments, wallets, subscriptions, packages, and dashboard screens
  - checkout request, payment proof submission, and payment status tracking UI
  - `DELIVERY_MODE=LOG_ONLY|WHATSAPP` production delivery switch
  - environment readiness checklist for Railway, R2, AI provider, and WhatsApp credentials
- Still out of scope:
  - recurring billing
  - public checkout flow redesign
  - finalized public marketing page redesign

## Backend Pipeline Foundation (Phase C)
- In scope:
  - order pipeline tables for orders, order items, and processing jobs
  - order lifecycle states for queueing, processing, completion, failure, and delivery
  - BullMQ queue infrastructure with retry and dead-letter handling
  - R2 upload abstraction for originals, processed files, and signed download URLs
  - WhatsApp webhook foundation for image intake and order creation
  - admin monitoring endpoints for paginated orders and jobs
- Still out of scope:
  - AI generation logic
  - automated image processing worker
  - customer dashboard
  - checkout flow
  - payment gateway UI

## WhatsApp Media Pipeline (Phase D)
- In scope:
  - fetch WhatsApp media metadata and download the binary
  - validate supported image types and file size limits
  - store original images in R2 with 72-hour retention
  - consume BullMQ jobs in a processing worker
  - create placeholder processed outputs in R2
  - persist processed delivery URLs and retention timestamps on orders
  - log notification events for received, processing, completed, and failed states
  - scheduled cleanup for original and processed media
  - detailed admin order view for files, jobs, and status history
- Still out of scope:
  - external AI provider integration
  - production WhatsApp message sending for completion events
  - customer dashboard
  - checkout flow
  - payment gateway UI

## AI Provider Integration (Phase E)
- In scope:
  - provider abstraction for Photoroom and Fal.ai
  - product image workflows for white background, solid color, shadow enhancement, and product studio
  - vehicle workflows for showroom, premium road, dark studio, and plate blur
  - outbound completion notification feature flag with log-only default mode
  - provider and queue failure tracking in admin stats
- Still out of scope:
  - live outbound WhatsApp completion delivery
  - customer dashboard
  - checkout flow
  - payment gateway UI

## MVP Success Criteria
- A first-time customer can place and pay for an order entirely via WhatsApp.
- Paid order enters queue and outputs are generated through provider abstraction.
- Customer receives preview/final output as per package entitlement.
- Admin can monitor orders and failed jobs.
