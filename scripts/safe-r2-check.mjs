import fs from "node:fs";
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const stop = (message, lines = []) => {
  console.error("STOP: R2 GUARD BLOCKED");
  console.error(message);
  for (const line of lines) console.error(line);
  process.exit(1);
};

run("node scripts/verify-project-scope.mjs");

const identity = JSON.parse(fs.readFileSync(".ai-project/PROJECT_IDENTITY.json", "utf8"));
const env = process.env;

const accountId = env.R2_ACCOUNT_ID || "";
const bucketName = env.R2_BUCKET_NAME || "";
const publicBaseUrl = env.R2_PUBLIC_BASE_URL || "";
const provider = env.STORAGE_PROVIDER || "";

console.log(`STORAGE_PROVIDER=${provider || "(unset)"}`);
console.log(`R2_ACCOUNT_ID=${accountId ? "[set]" : "(unset)"}`);
console.log(`R2_BUCKET_NAME=${bucketName ? "[set]" : "(unset)"}`);
console.log(`R2_PUBLIC_BASE_URL=${publicBaseUrl ? "[set]" : "(unset)"}`);

const expectedAccount = identity.expectedCloudflareAccountId;
const expectedBucket = identity.expectedR2BucketName;

if (!accountId) console.log("Warning: R2_ACCOUNT_ID is not set");
if (!bucketName) console.log("Warning: R2_BUCKET_NAME is not set");
if (!publicBaseUrl) console.log("Warning: R2_PUBLIC_BASE_URL is not set");

if (expectedAccount && !expectedAccount.startsWith("REPLACE_WITH_")) {
  if (accountId && accountId !== expectedAccount) {
    stop("R2 account id mismatch", [`expected=${expectedAccount}`, "actual=[set but different]"]);
  }
}

if (expectedBucket && !expectedBucket.startsWith("REPLACE_WITH_")) {
  if (bucketName && bucketName !== expectedBucket) {
    stop("R2 bucket mismatch", [`expected=${expectedBucket}`, "actual=[set but different]"]);
  }
}

if (
  (expectedAccount && expectedAccount.startsWith("REPLACE_WITH_")) ||
  (expectedBucket && expectedBucket.startsWith("REPLACE_WITH_"))
) {
  console.log("Warning: R2 guard placeholders are not configured yet");
}

console.log("R2 scope check passed");
