import fs from "node:fs";
import path from "node:path";

const p = path.join(__dirname, "runpod-handler-gate2-readiness.json");
const m = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
const assert = (c: unknown, msg: string) => { if (!c) throw new Error(msg); };

const expectedSource = "21e292103979f0450dffafe09844fac3b435031b";
const expectedSubtree = "b9402fa975e59ddc245985712b426ae63019761b";
const expectedCliBase = "sha256:049a304b44bec75562a74eac3f5be312feacd6133da80a0dc86d0a136a86a63a";

assert(m.approved === false, "approval must be false");
assert(m.publicationAllowed === false, "publication must be disabled");
assert(m.imageRepository === "" && m.immutableTag === "" && m.expectedDigest === "", "no publication fields while unapproved");
assert(String(m.sourceCommit) === expectedSource, "sourceCommit mismatch");
assert(String(m.sourceSubtree) === expectedSubtree, "sourceSubtree mismatch");
assert(m.floatingTagAllowed === false, "floating tags prohibited");
assert(m.weightBundled === false, "no bundled weights");
assert(m.runtimeDownloadAllowed === false, "no runtime download");
assert(String(m.immutableCliBaseDigest) === expectedCliBase, "immutable CLI base digest mismatch");
assert(m.sdkVersion === "runpod==1.11.0", "runpod SDK must be pinned");
assert(m.gate3ExecutionAllowed === false, "Gate 3 disabled");
assert(m.productionRoutingAllowed === false, "production routing disabled");

console.log("runpod handler gate2 readiness manifest passed");
