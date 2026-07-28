# Project Blueprint

## Vision
Build a WhatsApp-native product photo enhancement service for Pakistan e-commerce sellers with fast onboarding, simple package pricing, and reliable delivery.

## Primary User
- Small and mid-size online sellers using WhatsApp as their sales/support channel.

## Core Journey
1. Customer messages WhatsApp bot.
2. Bot presents services and packages.
3. Customer uploads product images.
4. System creates order and payment link.
5. Payment confirmation triggers processing queue.
6. Final outputs are delivered on WhatsApp or secure links.

## Architecture Baseline (MVP)
- Monorepo:
  - `apps/api`: Express + TypeScript + Prisma + BullMQ workers
  - `apps/web`: React + Vite + TypeScript admin panel
  - `docs`: implementation and ops docs
- Data:
  - PostgreSQL for transactional data
  - Redis for job queue state
- File storage:
  - Cloudflare R2 abstraction for originals, previews, finals
- Integrations:
  - WhatsApp Cloud API webhook
  - Payment provider abstraction (pluggable)
  - AI provider abstraction (pluggable)

## MVP Boundaries
- Build only guided WhatsApp flow, package-based processing, payments, queue processing, delivery, and basic admin monitoring.
- Exclude advanced generation modes and non-MVP SaaS expansion until MVP completion.

## Non-Functional Targets
- Modular provider interfaces for payment/AI/storage.
- Traceable events and audit logs for debugging.
- Strict no-secret-in-repo policy.
- Retention policy enforced by cleanup worker.
