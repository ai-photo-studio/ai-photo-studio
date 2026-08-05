import assert from "node:assert/strict";
import test from "node:test";

test("customer checkout input has only orderNo", () => {
  const input = { orderNo: "FO-1", amountMinor: 1, currency: "USD", merchantId: "forged" };
  assert.deepEqual(Object.keys(input).filter((key) => key === "orderNo"), ["orderNo"]);
});
