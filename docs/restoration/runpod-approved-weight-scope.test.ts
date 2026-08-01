import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../..");
const candidateDir = path.join(repoRoot, "apps/api/runpod-worker-gpu-serverless-volume-dev");
const files = [
  path.join(candidateDir, "Dockerfile"),
  path.join(candidateDir, "README.md"),
  path.join(candidateDir, "test_mount_contract.py"),
  path.join(__dirname, "runpod-volume-handler-gate2-readiness.json"),
  path.join(__dirname, "gfpgan-offline-external-weight-evidence.json"),
];
const approvedWeights = ["GFPGANv1.4.pth", "detection_Resnet50_Final.pth", "parsing_parsenet.pth"];
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const source = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
for (const weight of approvedWeights) {
  assert(source.includes(weight), `approved weight missing from runtime scope: ${weight}`);
}
assert(!/codeformer/i.test(source), "CodeFormer must not appear in the approved worker runtime scope");

console.log("approved RunPod weight runtime scope validator passed");
