import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readSource = (...parts: string[]) => readFileSync(join(__dirname, ...parts), "utf8");

test("restoration customer helpers are present in source", async () => {
  const source = readSource("restoration.service.ts");
  assert.ok(source.includes("getCustomerStatus"));
  assert.ok(source.includes("getCustomerDownload"));
  assert.ok(source.includes("RESTORATION_MASTER_NOT_READY"));
  assert.ok(source.includes("assertOwnership"));
});

test("customer controller handles not found safely", async () => {
  const source = readSource("..", "controllers", "restoration-customer.controller.ts");
  assert.ok(source.includes("getStatus"));
  assert.ok(source.includes("getDownload"));
  assert.ok(source.includes("AppError"));
  assert.ok(source.includes("toErrorMessage"));
});
