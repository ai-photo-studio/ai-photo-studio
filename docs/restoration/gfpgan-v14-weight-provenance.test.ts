import fs from "node:fs";
import path from "node:path";

const provenancePath = path.join(__dirname, "gfpgan-v14-weight-provenance.json");
const p = JSON.parse(fs.readFileSync(provenancePath, "utf8")) as Record<string, unknown>;

const expectedSha256 = "e2cd4703ab14f4d01fd1383a8a8b266f9a5833dacee8e6a79d3bf21a1b6be5ad";
const expectedUrl = "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth";
const expectedSize = 348632874;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

// Official URL must be present and must match the official repository path.
assert(typeof p.officialAssetUrl === "string" && p.officialAssetUrl.length > 0, "official URL is required");
assert(String(p.officialAssetUrl).startsWith("https://github.com/TencentARC/GFPGAN/"), "asset URL must be from the official repository");

// Checksum must be present and well-formed.
assert(typeof p.sha256 === "string", "checksum is required");
assert(/^[a-f0-9]{64}$/i.test(String(p.sha256)), "checksum is malformed");
assert(String(p.sha256).toLowerCase() === expectedSha256, "checksum does not match verified value");

// Verification must be true and the checksum source must be known.
assert(p.checksumVerified === true, "checksumVerified must be true");
assert(typeof p.checksumSource === "string" && ["github-api", "independently-calculated"].includes(String(p.checksumSource)), "checksum source is invalid");
assert(p.checksumSource === "independently-calculated", "publisher API digest is absent; must be independently calculated");

// Size must match verified metadata.
assert(Number(p.expectedSize) === expectedSize, "size does not match official metadata");

// Runtime download must be prohibited.
assert(p.runtimeDownloadAllowed === false, "runtime download must be disabled");

// Bundled mode requires explicit redistribution approval.
assert(p.bundledWeightAllowed === false, "bundling weights requires explicit redistribution approval");
assert(p.redistributionApproved === false, "redistribution approval must remain false without explicit evidence");
assert(p.recommendedPackagingMode === "externally-mounted-weight", "mode must be externally mounted weight");

// Production routing must remain disabled.
assert(p.productionRoutingAllowed === false, "production routing must be disabled");

console.log("gfpgan v14 weight provenance validator passed");
