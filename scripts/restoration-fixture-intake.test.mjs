import { execFileSync } from "node:child_process";
import path from "node:path";
const script = path.join("scripts", "restoration-fixture-intake.mjs");
const original = "docs/archive/benchmark/results/ops113/2026-07-23T11-53-11/01_original.png";
const run = (args) => execFileSync("node", [script, ...args], { encoding: "utf8" });
const output = run(["--id", "synthetic-test", "--category=unclassified", "--original", original, "--synthetic", "true"]);
const fixture = JSON.parse(output);
if (fixture.evidenceType !== "synthetic" || !fixture.intake.originalPath?.checksum || fixture.category !== "unclassified") throw new Error("valid intake failed");
for (const args of [["--id", "bad", "--category", "invented", "--original", original], ["--id", "bad", "--category", "unclassified", "--original", "missing.png"], ["--id", "bad", "--category", "unclassified", "--original"], ["--id", "bad", "--category", "unclassified", "--original", original, "--unknown", "x"], ["--id", "bad", "--id", "again", "--category", "unclassified", "--original", original]]) {
  try { run(args); throw new Error("invalid intake was accepted"); } catch (error) { if (String(error).includes("invalid intake was accepted")) throw error; }
}
console.log("fixture intake tests passed");
