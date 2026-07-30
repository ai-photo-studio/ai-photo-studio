import { resolveRestorationEntitlement } from "./restoration.service";

const cases: Array<[string, unknown, string]> = [
  ["unpaid", {}, "PREVIEW_ONLY"],
  ["legacy paid without tier", { paymentStatus: "PAID" }, "PREVIEW_ONLY"],
  ["legacy paid master", { paymentStatus: "PAID", purchasedTier: "MASTER" }, "MASTER"],
  ["legacy paid 2hd", { paymentStatus: "PAID", purchasedTier: "HD_2" }, "HD_2"],
  ["master", { entitlement: "MASTER" }, "MASTER"],
  ["admin test", { adminTestOrder: true }, "TEST_UNLOCKED"]
];

for (const [name, metadata, expected] of cases) {
  const actual = resolveRestorationEntitlement(metadata);
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, received ${actual}`);
}

console.log("restoration entitlement tests passed");
