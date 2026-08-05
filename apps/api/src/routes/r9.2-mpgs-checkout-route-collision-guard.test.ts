/**
 * R9.2-MPGS-ACTUAL-APP-E2E route-collision guard.
 *
 * Confirmed defect (found via the actual-app dry-run harness, not by any
 * unit test): the MPGS checkout routes were previously mounted at
 * /orders/:orderNo/checkout and /orders/:orderNo/payment-status --
 * byte-for-byte identical to the pre-existing legacy
 * OrderController.createOrderCheckout route (order.routes.ts), mounted
 * earlier in index.ts (createOrderRouter before createRestorationRouter).
 * Express matches the first-registered handler for an identical
 * method+path, so the legacy handler always won and the MPGS checkout
 * controller was unreachable via real HTTP traffic -- every mocked
 * Playwright/unit test passed anyway because none of them exercised the
 * real Express router stack or the real index.ts mount order.
 *
 * This test parses the ACTUAL registered `router.<verb>("<path>", ...)`
 * calls out of the two route files' source text (structural scan, same
 * style already used by p4c-bank-alfalah-legacy-apg-retired.test.ts in this
 * repo) rather than constructing the real routers/controllers, which pull
 * in Prisma/S3/service clients unsuited to a fast, network-free unit test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Registered = { method: string; path: string };

function extractRoutes(fileRelativePath: string): Registered[] {
  const content = readFileSync(join(__dirname, fileRelativePath), "utf8");
  const out: Registered[] = [];
  const pattern = /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    out.push({ method: match[1].toUpperCase(), path: match[2] });
  }
  return out;
}

test("the real index.ts mount order (order.routes before restoration.routes) never lets two routers claim the same /orders or /fixed-orders (method, path) pair", () => {
  const orderRoutes = extractRoutes("order.routes.ts");
  const restorationRoutes = extractRoutes("restoration.routes.ts").filter(
    (r) => r.path.startsWith("/orders") || r.path.startsWith("/fixed-orders")
  );

  const orderKeys = new Set(orderRoutes.map((r) => `${r.method} ${r.path}`));
  const collisions = restorationRoutes.filter((r) => orderKeys.has(`${r.method} ${r.path}`));

  assert.deepEqual(
    collisions,
    [],
    `restoration.routes.ts registers a path already claimed by the earlier-mounted order.routes.ts: ${JSON.stringify(collisions)}`
  );
  // Sanity: this scan actually found routes in both files (a silently-empty
  // regex match would make the assertion above vacuously true).
  assert.ok(orderRoutes.length > 0, "no routes parsed from order.routes.ts -- scan pattern is stale");
  assert.ok(restorationRoutes.length > 0, "no /orders or /fixed-orders routes parsed from restoration.routes.ts -- scan pattern is stale");
});

test("the MPGS checkout routes are mounted under /fixed-orders/, not the legacy-claimed /orders/", () => {
  const restorationRoutes = extractRoutes("restoration.routes.ts");
  const checkoutRoute = restorationRoutes.find((r) => r.method === "POST" && r.path.includes("checkout"));
  const statusRoute = restorationRoutes.find((r) => r.method === "GET" && r.path.includes("payment-status"));
  assert.ok(checkoutRoute, "no checkout route found");
  assert.ok(statusRoute, "no payment-status route found");
  assert.equal(checkoutRoute!.path, "/fixed-orders/:orderNo/checkout");
  assert.equal(statusRoute!.path, "/fixed-orders/:orderNo/payment-status");
});

test("index.ts still mounts createOrderRouter before createRestorationRouter (this test's collision-safety proof depends on that order)", () => {
  const indexContent = readFileSync(join(__dirname, "..", "index.ts"), "utf8");
  const orderMountIndex = indexContent.indexOf("createOrderRouter(config)");
  const restorationMountIndex = indexContent.indexOf("createRestorationRouter(config)");
  assert.ok(orderMountIndex >= 0, "createOrderRouter(config) mount not found in index.ts");
  assert.ok(restorationMountIndex >= 0, "createRestorationRouter(config) mount not found in index.ts");
  assert.ok(
    orderMountIndex < restorationMountIndex,
    "index.ts mount order changed: createRestorationRouter now mounts before createOrderRouter -- re-verify no collision exists under the new order"
  );
});
