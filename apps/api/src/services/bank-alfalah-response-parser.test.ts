import assert from "node:assert/strict";
import test from "node:test";
import { parseApgResponse, sanitizeApgMessage } from "./bank-alfalah-response-parser";

test("parses a normal JSON object", () => {
  const result = parseApgResponse('{"success":true,"AuthToken":"hidden"}');
  assert.equal(result.bodyType, "json-object");
  assert.equal(result.depth, 1);
  assert.deepEqual(Object.keys(result.body), ["success", "AuthToken"]);
});

test("parses a JSON string containing an object", () => {
  const result = parseApgResponse(JSON.stringify('{"ErrorCode":"STORE"}'));
  assert.equal(result.bodyType, "json-object");
  assert.equal(result.depth, 2);
  assert.equal(result.body.ErrorCode, "STORE");
});

test("parses double-serialized JSON", () => {
  const result = parseApgResponse(JSON.stringify(JSON.stringify('{"success":false}')));
  assert.equal(result.depth, 3);
  assert.equal(result.body.success, false);
});

test("bounds malformed and excessive nesting safely", () => {
  assert.equal(parseApgResponse("not-json").bodyType, "string");
  assert.equal(parseApgResponse(JSON.stringify(JSON.stringify(JSON.stringify(JSON.stringify({ success: true }))))).bodyType, "json-string");
});

test("sanitizes error messages without exposing arbitrary response data", () => {
  assert.equal(sanitizeApgMessage("Store mismatch: <023774>"), "Store mismatch: 023774");
  assert.equal(sanitizeApgMessage(undefined), "ABSENT");
});
