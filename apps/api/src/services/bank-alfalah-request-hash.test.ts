import assert from "node:assert/strict";
import test from "node:test";
import { buildApgRequestMap, decryptApgRequestHash, encryptApgRequestHash } from "./bank-alfalah-request-hash";

const key = "0123456789abcdef";
const iv = "fedcba9876543210";
const fields = [
  ["HS_ChannelId", "1002"],
  ["HS_MerchantId", "SYNTH-MERCHANT"],
  ["HS_StoreId", "SYNTH-STORE"],
  ["HS_ReturnURL", "https://example.test/return"],
  ["HS_TransactionReferenceNumber", "SYNTH-ORDER-1"]
] as const;

test("APG request map preserves official field order and delimiters", () => {
  assert.equal(buildApgRequestMap(fields), "HS_ChannelId=1002&HS_MerchantId=SYNTH-MERCHANT&HS_StoreId=SYNTH-STORE&HS_ReturnURL=https://example.test/return&HS_TransactionReferenceNumber=SYNTH-ORDER-1");
});

test("same synthetic input, key, and IV produce deterministic Base64 ciphertext", () => {
  const first = encryptApgRequestHash(fields, key, iv);
  assert.equal(first, encryptApgRequestHash(fields, key, iv));
  assert.match(first, /^[A-Za-z0-9+/]+={0,2}$/);
});

test("order and amount changes alter the ciphertext", () => {
  const base = encryptApgRequestHash(fields, key, iv);
  assert.notEqual(encryptApgRequestHash([...fields.slice(0, 4), ["HS_TransactionReferenceNumber", "SYNTH-ORDER-2"]], key, iv), base);
  assert.notEqual(encryptApgRequestHash([...fields, ["TransactionAmount", "1000.01"]], key, iv), base);
  assert.notEqual(encryptApgRequestHash([...fields].reverse(), key, iv), base);
});

test("wrong key or IV changes ciphertext and valid ciphertext decrypts", () => {
  const encrypted = encryptApgRequestHash(fields, key, iv);
  assert.notEqual(encrypted, encryptApgRequestHash(fields, "fedcba9876543210", iv));
  assert.notEqual(encrypted, encryptApgRequestHash(fields, key, "0123456789abcdef"));
  assert.equal(decryptApgRequestHash(encrypted, key, iv), buildApgRequestMap(fields));
});

test("key and IV must be exactly 16 UTF-8 bytes", () => {
  assert.throws(() => encryptApgRequestHash(fields, "short", iv), /exactly 16/);
  assert.throws(() => encryptApgRequestHash(fields, key, "short"), /exactly 16/);
});
