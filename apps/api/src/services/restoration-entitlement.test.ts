import { resolveRestorationEntitlement } from "./restoration.service";

const cases: Array<[string, unknown, string]> = [
  ["unpaid", {}, "PREVIEW_ONLY"],
  ["paid", { paymentStatus: "PAID" }, "ALL"],
  ["master", { entitlement: "MASTER" }, "MASTER"],
  ["admin test", { adminTestOrder: true }, "TEST_UNLOCKED"]
];

for (const [name, metadata, expected] of cases) {
  const actual = resolveRestorationEntitlement(metadata);
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, received ${actual}`);
}

console.log("restoration entitlement tests passed");
