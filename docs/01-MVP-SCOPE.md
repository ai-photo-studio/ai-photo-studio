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
- Wallet and reseller features
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

## MVP Success Criteria
- A first-time customer can place and pay for an order entirely via WhatsApp.
- Paid order enters queue and outputs are generated through provider abstraction.
- Customer receives preview/final output as per package entitlement.
- Admin can monitor orders and failed jobs.
