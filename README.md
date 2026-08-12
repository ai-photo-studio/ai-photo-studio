# AI Product Photo Studio on WhatsApp

## Project Purpose
AI Product Photo Studio is a WhatsApp-first SaaS MVP for Pakistan sellers. Customers share product photos on WhatsApp, select a package, pay through a payment gateway, and receive AI-processed outputs (preview/finals) through WhatsApp delivery flow.

## MVP Scope
- WhatsApp message intake and guided package selection
- Product image upload intake linked to orders
- Payment link generation and payment webhook handling
- AI image processing pipeline for:
  - background removal
  - white background
  - resize
  - static template composition
  - watermarked preview output
- Delivery via WhatsApp messaging or secure signed links
- Simple admin monitoring dashboard (MVP operations only)
- Cleanup worker for file retention windows

Out of scope for MVP phase 1:
- Virtual model generation
- Flat lay generation
- Ghost mannequin generation
- Video generation
- Wallet/reseller dashboard and advanced SaaS panels

## Setup Steps
1. Install Node.js 20+ and npm 10+.
2. Copy env templates:
   - `apps/api/.env.example` -> `apps/api/.env`
   - `apps/web/.env.example` -> `apps/web/.env`
3. Install dependencies from repository root:
   - `npm install`
4. Configure PostgreSQL and Redis URLs in `apps/api/.env`.
5. Run Prisma validation/generation from API workspace:
   - `npm run prisma:validate -w apps/api`
   - `npm run prisma:generate -w apps/api`
6. Start local development:
   - API: `npm run dev -w apps/api`
   - Web: `npm run dev -w apps/web`

## Required Environment Variables
See workspace env templates:
- `apps/api/.env.example`
- `apps/web/.env.example`

No secrets are committed in repository files.

## Railway Deployment Note
- Deploy as two services (`apps/api` and `apps/web`) or one monorepo with workspace-specific start/build commands.
- Use managed PostgreSQL and Redis services.
- Use Cloudflare R2 for all uploaded/processed files (no persistent local image storage).
- Configure WhatsApp and payment webhook URLs to Railway API domain.

## Current Implementation Status
- Step 1 (Project documents): complete.
- Step 2 (Monorepo structure + Prisma schema draft): complete.
- Phase 1 background remover service: complete locally under `services/background-remover`.
- Phase 2 WhatsApp image intake: implemented locally with image download, storage upload, queue handoff, background-remover call, and image reply.
- Runtime features (webhooks, orders, payments, workers): in progress.

## APG Website Compliance

The public website exposes `/faq`, `/terms`, `/privacy-policy`, `/payment-policy`, `/refund-exchange-policy`, `/delivery-policy`, and `/contact` through the shared ThanNow footer. Pakistan customer catalog and checkout amounts remain server-sourced and are displayed in PKR. Checkout links to the applicable terms, privacy, payment, and refund policies without changing order or Bank Alfalah processing logic. No cryptocurrency payment method is displayed or offered.

KYC contact information is shown on `/contact` only: ThanNow, operated by BioTech, the supplied Pakistan phone, support email, and office address. The physical address is intentionally not rendered in the global footer or other public pages. Compliance validation includes source searches for placeholders, prohibited payment methods, address exposure, and a production web build; browser/mobile route review remains part of release validation.

## Launch-Ready Protected Scope

- `apps/web/src/components/BrandLogo.tsx` is the canonical public ThanNow logo component and uses `apps/web/public/assets/logo2.png` everywhere the public or authenticated customer shell displays the brand.
- Public and customer shell branding, direct public compliance routes, checkout policy links, PKR display, and the Contact-only office-address invariant are finalized and protected against unrelated redesign.
- Browser validation covers the public navigation and compliance routes, restoration/upload entry, digital flow, print boundary, cart/order review, and checkout at 1440x900, 768x1024, and 390x844 where the supported local harness exposes each flow.
- Launch print safeguards block aspect-ratio-mismatched print lines before order creation because the current fulfilment variant uses center-crop without a customer crop editor. Triple Canvas remains visible only as a documented unavailable catalog item until physical dimensions and fulfilment specifications are confirmed; it is not an orderable customer choice.
