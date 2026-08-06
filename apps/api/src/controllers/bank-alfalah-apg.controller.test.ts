// R9.2-MERGE-P148-P149-AND-APG-URL-FOUNDATION
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isAllowedApgCallbackUrl } from "./bank-alfalah-apg.controller";

test("missing url is rejected", () => {
  const result = isAllowedApgCallbackUrl("", "ipn.example-bank.com");
  assert.equal(result.allowed, false);
  assert.match(result.reason, /missing url/);
});

test("malformed url is rejected", () => {
  const result = isAllowedApgCallbackUrl("not a url", "ipn.example-bank.com");
  assert.equal(result.allowed, false);
  assert.match(result.reason, /malformed/);
});

test("non-HTTPS url is rejected", () => {
  const result = isAllowedApgCallbackUrl("http://ipn.example-bank.com/callback", "ipn.example-bank.com");
  assert.equal(result.allowed, false);
  assert.match(result.reason, /non-HTTPS/);
});

test("empty allowlist rejects every url (fail-closed default)", () => {
  const result = isAllowedApgCallbackUrl("https://ipn.example-bank.com/callback", "");
  assert.equal(result.allowed, false);
  assert.match(result.reason, /no callback host is configured/);
});

test("unapproved host is rejected even when HTTPS", () => {
  const result = isAllowedApgCallbackUrl("https://evil.example.com/callback", "ipn.example-bank.com");
  assert.equal(result.allowed, false);
  assert.match(result.reason, /not on the approved allowlist/);
});

test("approved HTTPS host on the allowlist is accepted", () => {
  const result = isAllowedApgCallbackUrl("https://ipn.example-bank.com/callback", "ipn.example-bank.com, other.example.com");
  assert.equal(result.allowed, true);
});

test("arbitrary attacker-supplied URL with an embedded approved-looking path is still rejected by host, not path", () => {
  // Classic SSRF trick: an approved host name embedded in the path/query,
  // not the actual hostname. Must be rejected because the real hostname is
  // not on the allowlist.
  const result = isAllowedApgCallbackUrl(
    "https://attacker.example.com/ipn.example-bank.com/callback",
    "ipn.example-bank.com"
  );
  assert.equal(result.allowed, false);
});

test("SSRF via userinfo trick (host confusion) is rejected", () => {
  // "https://ipn.example-bank.com@attacker.example.com/" -- the real host
  // (per WHATWG URL parsing) is attacker.example.com, not the allowlisted
  // one that appears before the @.
  const result = isAllowedApgCallbackUrl(
    "https://ipn.example-bank.com@attacker.example.com/callback",
    "ipn.example-bank.com"
  );
  assert.equal(result.allowed, false);
});

test("this file makes no external network call", () => {
  const src = readFileSync(path.join(__dirname, "bank-alfalah-apg.controller.ts"), "utf8");
  assert.doesNotMatch(src, /\bfetch\(/);
  assert.doesNotMatch(src, /http\.request/);
  assert.doesNotMatch(src, /https\.request/);
  assert.doesNotMatch(src, /axios/i);
});
