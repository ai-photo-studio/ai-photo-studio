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
