import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGuestOwnershipToken,
  hashGuestOwnershipToken,
  matchesGuestOwnershipToken
} from "./guest-ownership";
import { assertOwnership } from "./ownership";
import { AppError } from "./errors";

const throwsNotFound = (fn: () => unknown) =>
  assert.throws(fn, (error: unknown) => (error as AppError).code === "NOT_FOUND");

test("guest tokens are independent 256-bit hex values and hashes never expose raw tokens", () => {
  const first = createGuestOwnershipToken();
  const second = createGuestOwnershipToken();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.match(second, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.match(hashGuestOwnershipToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashGuestOwnershipToken(first), first);
});

test("malformed and wrong tokens fail closed without throwing", () => {
  const token = createGuestOwnershipToken();
  const hash = hashGuestOwnershipToken(token);
  assert.equal(matchesGuestOwnershipToken(hash, token), true);
  assert.equal(matchesGuestOwnershipToken(hash, ""), false);
  assert.equal(matchesGuestOwnershipToken(hash, "not-a-token"), false);
  assert.equal(matchesGuestOwnershipToken("bad", token), false);
  assert.equal(matchesGuestOwnershipToken(null, token), false);
});

test("authenticated actors take precedence and cannot fall back to guest tokens", () => {
  const token = createGuestOwnershipToken();
  const guestRecord = { ownerUserId: null, guestOwnershipTokenHash: hashGuestOwnershipToken(token) };
  assert.equal(assertOwnership(guestRecord, { guestToken: token }), guestRecord);
  throwsNotFound(() => assertOwnership(guestRecord, { userId: "unrelated-user", guestToken: token }));
  const userRecord = { ownerUserId: "owner-user", guestOwnershipTokenHash: null };
  assert.equal(assertOwnership(userRecord, { userId: "owner-user", guestToken: token }), userRecord);
  throwsNotFound(() => assertOwnership(userRecord, { userId: "unrelated-user", guestToken: token }));
});

test("one guest token cannot access another draft or order", () => {
  const tokenA = createGuestOwnershipToken();
  const tokenB = createGuestOwnershipToken();
  const draftA = { ownerUserId: null, guestOwnershipTokenHash: hashGuestOwnershipToken(tokenA) };
  const orderA = { ownerUserId: null, guestOwnershipTokenHash: hashGuestOwnershipToken(tokenA) };
  throwsNotFound(() => assertOwnership(draftA, { guestToken: tokenB }));
  throwsNotFound(() => assertOwnership(orderA, { guestToken: tokenB }));
});
