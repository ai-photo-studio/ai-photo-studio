#!/usr/bin/env node
import fs from "node:fs";

const wfPath = new URL("../.github/workflows/publish-rp-serverless-handler.yml", import.meta.url);
const wf = fs.readFileSync(wfPath, "utf8");
const verPath = new URL("../.github/workflows/verify-rp-serverless-handler-published.yml", import.meta.url);
const ver = fs.readFileSync(verPath, "utf8");

const APPROVED_SHA = "21e292103979f0450dffafe09844fac3b435031b";
const APPROVED_SUBTREE = "b9402fa975e59ddc245985712b426ae63019761b";
const CLI_BASE = "ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-dev@sha256:049a304b44bec75562a74eac3f5be312feacd6133da80a0dc86d0a136a86a63a";

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// 1) workflow_dispatch only (publication + verification)
for (const [name, text] of [["publish", wf], ["verify", ver]]) {
  const onSection = text.slice(0, text.indexOf("permissions:"));
  assert(/\bworkflow_dispatch\b/.test(onSection), `${name} must be workflow_dispatch`);
  assert(!/push:|schedule:|pull_request:/m.test(onSection), `${name} must be workflow_dispatch only`);
}

// 2) approved source/subtree/base hard-validated in publication
assert(wf.includes(`APPROVED_SHA: ${APPROVED_SHA}`), "approved source SHA must be pinned");
assert(wf.includes(`APPROVED_SUBTREE: ${APPROVED_SUBTREE}`), "approved subtree must be pinned");
assert(wf.includes(CLI_BASE.slice(0, 80)), "immutable CLI base digest must be pinned");
assert(wf.includes("WRONG SOURCE SHA"), "must abort on wrong source SHA");
assert(wf.includes("WRONG WRAPPER SUBTREE"), "must abort on wrong subtree");

// 3) exactly one immutable tag, no floating tags
const tagsLine = (wf.match(/tags:\s*([^\n]+)/) || [])[1] || "";
assert(!tagsLine.includes(","), "exactly one tag, none comma-delimited");
assert(wf.includes("echo \"tag=$APPROVED_SHA\""), "tag output must be the approved source SHA");
assert(!/latest|dev|main|semver/i.test(tagsLine), "no floating tag");

// 4) digest capture + verification
assert(/Capture registry digest/.test(wf), "must capture registry digest");
assert(/Verify tag resolves to captured digest/.test(wf), "must verify tag resolves to digest");

// 5) no weights (dockerignore) and code-only context
const di = fs.readFileSync(new URL("../apps/api/runpod-worker-gpu-serverless-dev/.dockerignore", import.meta.url), "utf8");
assert(/^\*\.pth\s*$/m.test(di) && /^\*\.bin\s*$/m.test(di), "wrapper .dockerignore must exclude weights");
assert(wf.includes("context: apps/api/runpod-worker-gpu-serverless-dev"), "must build the code-only wrapper");

// 6) no RunPod management/API, no deployment/production
assert(!/RUNPOD_API|secrets\.RUNPOD|runpodctl/i.test(wf), "no RunPod secret/CLI in publication");
assert(!/deploy|production|routing|providerPostCount/i.test(wf), "no deploy/production-routing in publication");

// 7) permissions
assert(/packages:\s*write/.test(wf), "packages write required");
assert(/contents:\s*read/.test(wf), "contents read required");
assert(/push:\s*true/.test(wf), "publication must push (immutable tag)");

console.log("runpod handler publication workflow security test passed");
