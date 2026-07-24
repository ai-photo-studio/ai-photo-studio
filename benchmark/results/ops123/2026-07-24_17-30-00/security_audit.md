# OPS-123 — Security Audit

**Date:** 2026-07-24

## Authentication

| Check | Status | Finding |
|-------|--------|---------|
| JWT-based auth | ✅ | signToken with 7d expiry, HS256 |
| Refresh tokens | ✅ | signRefreshToken with 30d expiry |
| Password hashing | ✅ | AdminUser model includes passwordHash field |
| Token verification | ✅ | verifyToken rejects expired/invalid tokens |

## Authorization

| Check | Status | Finding |
|-------|--------|---------|
| requireAuth on customer routes | ✅ | All /restore/*, /orders/*, /me/* routes |
| requireAdminAuth on admin routes | ✅ | Role-based (SUPER_ADMIN, OPERATIONS, FINANCE, SUPPORT, READ_ONLY) |
| User ownership check | ✅ | restoration.controller.ts:91 verifies order.userId matches token.sub |
| Role gating on admin endpoints | ✅ | DRY: finance ops for payments, ops for orders, admin for packages/users |

## Rate Limiting

| Check | Status | Finding |
|-------|--------|---------|
| Global rate limit | ✅ | 120 req/min per IP |
| Per-endpoint limits | ✅ | restoration POST: 10/min, upload: 20/min, download: 30/min |
| Rate limit headers | ✅ | X-RateLimit-Limit, Remaining, Reset |
| IP-based tracking | ✅ | req.ip (handles X-Forwarded-For via trust proxy) |
| Memory store | ✅ | In-memory Map with periodic cleanup |

## CSRF / CORS

| Check | Status | Finding |
|-------|--------|---------|
| CORS middleware | ✅ | Configurable ALLOWED_ORIGINS |
| CORS credentials | ✅ | Access-Control-Allow-Credentials: true |
| CORS methods | ✅ | GET, POST, PUT, PATCH, DELETE, OPTIONS |
| CORS headers | ✅ | Content-Type, Authorization, x-admin-token |
| CSRF token | ⚠️ **UNKNOWN** | No explicit CSRF token; mitigated by Bearer token auth + Opaque origin validation |

## Input Validation

| Check | Status | Finding |
|-------|--------|---------|
| Environment validation | ✅ | Zod schema validates all env before startup |
| MIME type whitelist | ✅ | SUPPORTED_IMAGE_MIME_TYPES (JPEG, PNG, WebP) |
| File size limit | ✅ | 10 MB max (restoration.controller.ts:11) |
| Base64 decode safety | ✅ | decodeBase64Input with cleaned input |
| Required field validation | ✅ | 400 errors for missing fileName/bodyBase64 |
| Prisma schema validation | ✅ | @db.Decimal, @unique, @default constraints |

## Signed URLs

| Check | Status | Finding |
|-------|--------|---------|
| R2 signed URLs | ✅ | AWS SDK v3 S3RequestPresigner |
| Expiry | ✅ | 15 minutes |
| Auth gated | ✅ | requireAuth on all download endpoints |
| Generate from master only | ✅ | Uses finalStorageKey — no Replicate rerun |

## Audit Logging

| Check | Status | Finding |
|-------|--------|---------|
| AuditLog model | ✅ | actorType, actorId, action, entityType, entityId, meta |
| Payment actions logged | ✅ | manual_payment_proof_submitted, payment_approved, payment_rejected, etc. |
| Admin actions logged | ✅ | AdminAuditLog tracks admin operations separately |
| Non-settlement webhooks logged | ✅ | payment_webhook_ignored with full metadata |
