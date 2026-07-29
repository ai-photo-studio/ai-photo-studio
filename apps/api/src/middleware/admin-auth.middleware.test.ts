import assert from "node:assert/strict";
import test from "node:test";
import jwt from "jsonwebtoken";
import { matchesMachineToken, verifyAdminToken } from "./admin-auth.middleware";

test("machine token is denied when missing or configuration is unset", () => {
  assert.equal(matchesMachineToken("", "secret-value"), false);
  assert.equal(matchesMachineToken("secret-value", ""), false);
});

test("wrong machine token is denied", () => {
  assert.equal(matchesMachineToken("wrong-value", "secret-value"), false);
});

test("correct machine token is accepted", () => {
  assert.equal(matchesMachineToken("secret-value", "secret-value"), true);
});

test("existing JWT verification remains valid", () => {
  const secret = "test-secret";
  const config = { ADMIN_JWT_SECRET: secret } as never;
  const token = jwt.sign({ sub: "admin", sid: "session", role: "SUPER_ADMIN" }, secret);
  assert.equal(verifyAdminToken(config, token).sub, "admin");
});
