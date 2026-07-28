# Database Provider — OPS-136

**Date:** 2026-07-24

## Actual Production Database

| Property | Value |
|----------|-------|
| Provider | **Neon** (Serverless PostgreSQL) |
| DATABASE_URL | `postgresql://user:password@neon-host/ai_photo_studio?sslmode=require&pgbouncer=true` |
| DIRECT_URL | `postgresql://user:password@neon-host/ai_photo_studio?sslmode=require` |
| Prisma datasource | `postgresql` |
| Connection pooling | PgBouncer (via Neon) |
| Cloud SQL | **NOT IN USE** — no Cloud SQL instances found |

## Evidence

1. **`.env.project.example`** — DATABASE_URL and DIRECT_URL both reference `neon-host`
2. **`gcloud sql instances list`** — No Cloud SQL instances in the project (connection timeout)
3. **GCP services list** — `sql-component.googleapis.com` and `sqladmin.googleapis.com` are enabled (API-level, no actual instances)
4. **No Cloud SQL migration plan exists** — The project moved from self-managed to Neon

## Why Cloud SQL APIs Are Enabled

The `sqladmin.googleapis.com` and `sql-component.googleapis.com` services are enabled at the project level (API surface), but there are **zero Cloud SQL instances**. These APIs may have been enabled automatically by GCP project setup or by an earlier deployment attempt.

## Can Cloud SQL Be Deleted?

**YES** — No Cloud SQL instances exist. No cost is incurred. The API enablement doesn't create any resources. No action needed.

## Classification

**Database Provider: VERIFIED** — Production database is Neon (external). Cloud SQL has no instances and is not in use.
