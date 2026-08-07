# Protected Scope

The following areas are protected and may be changed only when a task explicitly authorizes the change:

- Finalized business logic and order/restoration workflows.
- Authentication and authorization middleware/controllers.
- Payment gateway code, payment readiness, payment-attempt flows, and merchant integration records.
- RunPod routing, endpoint identity, worker contracts, authorization gates, and related approval evidence.
- Working AI provider integrations, including the documented production Replicate path.
- Production deployment configuration and service topology, including Cloudflare Pages, Northflank, R2, PostgreSQL, Redis, and related deployment scripts.
- Database schema, Prisma migrations, migration history, and database verification tooling.
- WhatsApp webhook and delivery integrations.

Protected scope can be changed only by an explicitly authorized task with focused verification and documentation updates. Do not expose secrets or treat documentation claims as proof of live production state.

## Finalized UI scope (R9.3, 2026-08-07)
- The ThanNow public shell and homepage are finalized UI per the approved LOCKED design (`UI/DESIGN_LOCK.md`, `UI/index`, `UI/styles`): `apps/web/src/components/PublicLayout.tsx`, `apps/web/src/pages/HomePage.tsx`, the homepage/theme styles in `apps/web/src/styles.css` (scoped under `.thannow-home`), and `apps/web/index.html`.
- The published homepage image set under `/assets/` (`apps/web/public/assets/`, 16 approved human-memory files + `README_ASSETS.txt`) is finalized UI scope. Do not replace these with unapproved images, remove them, or repoint HomePage to other visuals without prior approval.
- Do not redesign the locked direction. Changes require prior intentional approval, consistent with `DESIGN_LOCK.md`.
- `UI/` remains the canonical source reference for the design and must stay tracked (do not ignore or remove).
