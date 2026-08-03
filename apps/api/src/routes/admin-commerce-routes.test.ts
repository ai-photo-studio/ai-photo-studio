// R9.2-P2R-ADMIN: route-wiring and RBAC proof for the new read-only
// FixedOrder/PaymentAttempt admin endpoints.
//
// Two kinds of proof:
//  1. Static source scan of admin.routes.ts -- proves both routes are
//     registered as GET-only, wired through requireAdminAuth, and scoped to
//     the SUPER_ADMIN/OPERATIONS/FINANCE read roles (no write/mutation verb
//     is ever registered for `/admin/commerce-orders`).
//  2. Live exercise of `requireAdminAuth` (the real middleware, unmodified)
//     with a fake session store standing in for the database, proving: no
//     token => 401; wrong role => 403; each of the three allowed roles with
//     a valid token+session => next() called with no error.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import jwt from "jsonwebtoken";

process.env.DATABASE_URL ||= "postgresql://user:pass@127.0.0.1:5432/test_db_unused";
process.env.ADMIN_JWT_SECRET ||= "test-admin-secret";
process.env.JWT_SECRET ||= "test-jwt-secret";
process.env.REDIS_URL ||= "redis://replace_me";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test-verify-token";
process.env.PAYMENT_GATEWAY_NAME ||= "manual";
process.env.STORAGE_PROVIDER = "mock";

import { requireAdminAuth } from "../middleware/admin-auth.middleware";
import * as adminAuthService from "../services/admin-auth.service";

test("admin.routes.ts registers commerce-orders as GET-only, admin-auth-gated, read-role-scoped", () => {
  const source = readFileSync(join(__dirname, "admin.routes.ts"), "utf8");
  const codeOnly = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  // Both new routes exist, both are GET.
  assert.match(codeOnly, /router\.get\(\s*"\/admin\/commerce-orders",\s*requireAdminAuth\(config,\s*commerceReadRoles\),\s*commerceController\.listOrders\)/);
  assert.match(codeOnly, /router\.get\(\s*"\/admin\/commerce-orders\/:orderNo",\s*requireAdminAuth\(config,\s*commerceReadRoles\),\s*commerceController\.getOrderDetail\)/);

  // No mutation verb is ever registered for this resource.
  const mutationOnCommerceOrders = /router\.(post|put|patch|delete)\(\s*"\/admin\/commerce-orders/;
  assert.equal(mutationOnCommerceOrders.test(codeOnly), false, "a write verb must never be registered on /admin/commerce-orders");

  // The role list is exactly SUPER_ADMIN, OPERATIONS, FINANCE.
  assert.match(codeOnly, /const commerceReadRoles: AdminRole\[\] = \["SUPER_ADMIN", "OPERATIONS", "FINANCE"\]/);
});

test("commerce controller has no create/update/delete method exposed", () => {
  const source = readFileSync(join(__dirname, "..", "controllers", "admin-commerce.controller.ts"), "utf8");
  assert.doesNotMatch(source, /\.(create|update|delete|upsert)\(/i);
});

function signToken(role: string, sub = "admin-1", sid = "session-1") {
  return jwt.sign({ sub, sid, role }, process.env.ADMIN_JWT_SECRET as string);
}

function fakeReqRes(token?: string) {
  const req: any = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res: any = {};
  return { req, res };
}

test("unauthenticated request is rejected (no token)", async () => {
  const config = { ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET } as any;
  const middleware = requireAdminAuth(config, ["SUPER_ADMIN", "OPERATIONS", "FINANCE"]);
  const { req, res } = fakeReqRes();
  let errorPassed: unknown;
  await middleware(req, res, (err?: unknown) => {
    errorPassed = err;
  });
  assert.ok(errorPassed, "expected next() to be called with an error");
  assert.equal((errorPassed as any).statusCode, 401);
});

test("wrong-role authenticated request is rejected (403)", async () => {
  const config = { ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET } as any;
  const middleware = requireAdminAuth(config, ["SUPER_ADMIN", "OPERATIONS", "FINANCE"]);
  const token = signToken("SUPPORT");
  const { req, res } = fakeReqRes(token);
  let errorPassed: unknown;
  await middleware(req, res, (err?: unknown) => {
    errorPassed = err;
  });
  assert.ok(errorPassed);
  assert.equal((errorPassed as any).statusCode, 403);
});

test("each allowed role (SUPER_ADMIN, OPERATIONS, FINANCE) with a valid session succeeds", async () => {
  const originalFindSessionById = adminAuthService.AdminAuthService.prototype.findSessionById;
  adminAuthService.AdminAuthService.prototype.findSessionById = async function (sid: string) {
    return { id: sid, adminUserId: "admin-1" } as any;
  };
  try {
    const config = { ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET } as any;
    const middleware = requireAdminAuth(config, ["SUPER_ADMIN", "OPERATIONS", "FINANCE"]);
    for (const role of ["SUPER_ADMIN", "OPERATIONS", "FINANCE"]) {
      const token = signToken(role);
      const { req, res } = fakeReqRes(token);
      let called = false;
      let errorPassed: unknown = "not-called";
      await middleware(req, res, (err?: unknown) => {
        called = true;
        errorPassed = err;
      });
      assert.ok(called, `next() should be called for role ${role}`);
      assert.equal(errorPassed, undefined, `role ${role} should be authorized, got error: ${String(errorPassed)}`);
    }
  } finally {
    adminAuthService.AdminAuthService.prototype.findSessionById = originalFindSessionById;
  }
});
