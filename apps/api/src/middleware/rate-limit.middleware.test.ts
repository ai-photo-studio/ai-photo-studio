/**
 * R9.2-MPGS-ACTUAL-APP-E2E confirmed-defect regression test.
 *
 * Proves each rateLimit(windowMs, maxRequests) call site gets its own
 * independent counter, not a single Map shared by every route (and the
 * global app.use(rateLimit(..., 120)) middleware) in the whole application.
 *
 *   npx tsx --test src/middleware/rate-limit.middleware.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { rateLimit } from "./rate-limit.middleware";

function fakeReq(ip: string): Request {
  return { ip, socket: { remoteAddress: ip } } as unknown as Request;
}

type FakeRes = { statusCode: number; body: unknown; sentHeaders: Record<string, string> };

function fakeRes(): Response & FakeRes {
  const res: FakeRes & Record<string, unknown> = {
    statusCode: 200,
    body: undefined,
    sentHeaders: {},
    setHeader(name: string, value: string) {
      (res.sentHeaders as Record<string, string>)[name] = value;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    }
  };
  return res as unknown as Response & FakeRes;
}

test("two independent rateLimit() instances for the same IP do not share a counter", () => {
  const strict = rateLimit(60_000, 2); // e.g. draft creation
  const lenient = rateLimit(60_000, 100); // e.g. global middleware

  const req = fakeReq("203.0.113.5");

  // Exhaust the strict limiter's budget of 2.
  strict(req, fakeRes(), () => {});
  strict(req, fakeRes(), () => {});
  const strictBlocked = fakeRes();
  let strictNextCalled = false;
  strict(req, strictBlocked, () => {
    strictNextCalled = true;
  });
  assert.equal(strictBlocked.statusCode, 429);
  assert.equal(strictNextCalled, false);

  // The lenient (global-style) limiter for the SAME IP must be unaffected --
  // this is exactly the bug: before the fix, the strict limiter's three
  // increments would have already counted against the lenient limiter too.
  const lenientRes = fakeRes();
  let lenientNextCalled = false;
  lenient(req, lenientRes, () => {
    lenientNextCalled = true;
  });
  assert.equal(lenientNextCalled, true);
  assert.equal(lenientRes.statusCode, 200);
  assert.equal(lenientRes.sentHeaders["X-RateLimit-Remaining"], "99");
});

test("a fresh IP on the same limiter instance starts with its own budget", () => {
  const limiter = rateLimit(60_000, 1);
  const resA = fakeRes();
  let nextA = false;
  limiter(fakeReq("198.51.100.1"), resA, () => (nextA = true));
  assert.equal(nextA, true);

  const resB = fakeRes();
  let nextB = false;
  limiter(fakeReq("198.51.100.2"), resB, () => (nextB = true));
  assert.equal(nextB, true);
  assert.equal(resB.statusCode, 200);
});
