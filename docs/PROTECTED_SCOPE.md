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
