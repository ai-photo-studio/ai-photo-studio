#!/usr/bin/env node
import fs from "node:fs";

const wfPath = new URL("../.github/workflows/publish-gfpgan-gpu-candidate.yml", import.meta.url);
const wf = fs.readFileSync(wfPath, "utf8");
const dockerignorePath = new URL("../apps/api/runpod-worker-gpu-dev/.dockerignore", import.meta.url);
const di = fs.readFileSync(dockerignorePath, "utf8");

const APPROVED_SHA = "f65088b5f6bb2f5a91b8b877b32f032766c8b5f1";
const APPROVED_SUBTREE = "ea8a583e5d7279c0b67eec66a1906b7523c4ce99";
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// 1) workflow_dispatch only (inspect the `on:` block only, before permissions)
const onSection = wf.slice(0, wf.indexOf("permissions:"));
assert(/workflow_dispatch/.test(onSection), "must have workflow_dispatch");
assert(!/push:|schedule:|pull_request:/m.test(onSection), "no push/schedule/PR trigger");

// 2) approved source SHA + subtree hard-validated
assert(wf.includes(`APPROVED_SHA: ${APPROVED_SHA}`), "approved source SHA must be pinned");
assert(wf.includes(`APPROVED_SUBTREE: ${APPROVED_SUBTREE}`), "approved subtree must be pinned");
assert(wf.includes("WRONG SOURCE SHA"), "must abort on wrong source SHA");
assert(wf.includes("WRONG CANDIDATE SUBTREE"), "must abort on wrong subtree");

// 3) exactly one immutable tag, no floating tags
const tagsLine = (wf.match(/tags:\s*([^\n]+)/) || [])[1] || "";
assert(!tagsLine.includes(","), "exactly one tag, none comma-delimited");
// the meta step pins tag=$APPROVED_SHA (the approved full SHA)
assert(wf.includes("echo \"tag=$APPROVED_SHA\""), "tag output must be the approved full SHA");
assert(!/latest|dev|main|semver/i.test(tagsLine), "no floating tag");

// 4) digest capture + verification
assert(/Capture registry digest/.test(wf), "must capture registry digest");
assert(/Verify tag resolves to captured digest/.test(wf), "must verify tag resolves to digest");

// 5) code-only context; weights excluded
assert(wf.includes("context: apps/api/runpod-worker-gpu-dev"), "build context must be the code-only candidate package");
assert(/^\*\.pth\s*$/m.test(di) && /^\*\.bin\s*$/m.test(di), "candidate .dockerignore must exclude weights");

// 6) no RunPod action/secret/endpoint call, no deployment, no production routing
assert(!/RUNPOD_API|secrets\.RUNPOD/.test(wf), "no RunPod secret");
assert(!/runpodctl|runpod\.io|runpod endpoint|runpod start|runpod stop/i.test(wf), "no RunPod API/CLI/endpoint call");
assert(!/deploy|production|routing|providerPostCount/i.test(wf), "no deployment/production-routing/provider step");

// 7) permissions
assert(/packages:\s*write/.test(wf), "packages write required");
assert(/contents:\s*read/.test(wf), "contents read");

console.log("gfpgan gpu publication workflow security test passed");
