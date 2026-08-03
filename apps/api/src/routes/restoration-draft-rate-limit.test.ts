import assert from "node:assert/strict";
import { test } from "node:test";
import { createRestorationDraftRouter } from "./restoration-draft.routes";

test("all restoration draft read and upload routes include route-specific rate limiting", () => {
  const router = createRestorationDraftRouter({} as never);
  const stack = (router as unknown as { stack: Array<{ route?: { path: string; stack: Array<{ handle: (...args: unknown[]) => unknown }> } }> }).stack;
  for (const path of ["/restoration-drafts", "/restoration-drafts/:id", "/restoration-drafts/:id/offers"]) {
    const route = stack.find((layer) => layer.route?.path === path)?.route;
    assert(route, `missing route ${path}`);
    assert(route.stack.length >= 3, `${path} must include auth, rate limit, and controller middleware`);
  }
});
