import { execFileSync } from "node:child_process";
import fs from "node:fs";
execFileSync("node", ["scripts/restoration-review-queue.mjs"], { stdio: "inherit" });
const queue = JSON.parse(fs.readFileSync("test/reports/restoration-review-queue.json", "utf8"));
if (queue.candidates.length !== 1 || queue.candidates[0].groupingConfidence !== "verified" || !queue.ungrouped.length) throw new Error("review queue evidence grouping failed");
console.log("review queue tests passed");
