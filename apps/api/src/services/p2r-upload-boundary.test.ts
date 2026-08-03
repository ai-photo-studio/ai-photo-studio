/**
 * R9.2-P2R-UPLOAD-SECURITY-AUDIT-A: service-level ordering/side-effect proof
 * for `RestorationDraftService.createDraft`.
 *
 * Proves that every rejected upload performs ZERO storage writes and ZERO
 * database writes, that a valid upload performs exactly one of each in that
 * order, and that no payment/entitlement/Replicate/RunPod/network call is
 * reachable from this path. Storage and Prisma are replaced with in-process
 * spies, so this test needs no database, no R2 credentials, and no network.
 *
 *   npx tsx src/services/p2r-upload-boundary.test.ts
 */
process.env.DATABASE_URL ||= "postgresql://unused:unused@127.0.0.1:1/unused";
process.env.REDIS_URL ||= "redis://replace_me";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test-verify-token";
process.env.PAYMENT_GATEWAY_NAME ||= "manual";
process.env.ADMIN_JWT_SECRET ||= "test-admin-secret";
process.env.JWT_SECRET ||= "test-jwt-secret";
process.env.STORAGE_PROVIDER = "mock";

import sharp from "sharp";
import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { StorageService } from "./storage.service";
import { RestorationDraftService } from "./restoration-draft.service";

const results: { name: string; ok: boolean; detail?: string }[] = [];

async function record(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message });
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// --- spies ---------------------------------------------------------------
const calls: string[] = [];
let uploadedFileNames: string[] = [];

StorageService.prototype.uploadOriginal = async (params: { fileName: string; body: Buffer | string }) => {
  calls.push("storage.uploadOriginal");
  uploadedFileNames.push(params.fileName);
  return { key: `originals/spy-${uploadedFileNames.length}`, url: "spy://not-a-real-url", expiresAt: new Date() };
};
StorageService.prototype.uploadProcessed = async () => {
  calls.push("storage.uploadProcessed");
  throw new Error("uploadProcessed must never be reachable from the draft upload path");
};
StorageService.prototype.getSignedUrl = async (key: string) => {
  calls.push("storage.getSignedUrl");
  return `spy://signed/${key}`;
};

(prisma as unknown as { restorationDraft: unknown }).restorationDraft = {
  create: async ({ data }: { data: Record<string, unknown> }) => {
    calls.push("db.restorationDraft.create");
    return { id: "draft-spy-1", createdAt: new Date(), updatedAt: new Date(), ...data };
  },
  findUnique: async () => {
    calls.push("db.restorationDraft.findUnique");
    return null;
  }
};

// Any outbound network attempt from this path is a hard failure.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...args: unknown[]) => {
  calls.push(`network.fetch:${String(args[0])}`);
  throw new Error("no network call is permitted from the upload validation path");
}) as typeof fetch;

const config = { storageDryRun: true, PORT: 3000 } as unknown as AppConfig;

async function main() {
  const png = await sharp({ create: { width: 24, height: 16, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .png()
    .toBuffer();
  const pngB64 = png.toString("base64");
  const service = new RestorationDraftService(config);

  const base = { country: "PK", marketConfirmed: true, fileName: "photo.png", contentType: "image/png", bodyBase64: pngB64 };

  const rejected: { name: string; input: Record<string, unknown> }[] = [
    { name: "unconfirmed market", input: { ...base, marketConfirmed: false } },
    { name: "bad country", input: { ...base, country: "NOT-A-COUNTRY" } },
    { name: "missing bodyBase64", input: { ...base, bodyBase64: "" } },
    { name: "malformed base64", input: { ...base, bodyBase64: `${pngB64}!!!***` } },
    { name: "non-image payload", input: { ...base, bodyBase64: Buffer.from("definitely not an image").toString("base64") } },
    { name: "corrupt image", input: { ...base, bodyBase64: png.subarray(0, 24).toString("base64") } },
    { name: "svg payload", input: { ...base, bodyBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64") } },
    { name: "oversized filename", input: { ...base, fileName: `${"a".repeat(4096)}.png` } },
    { name: "traversal/NUL filename", input: { ...base, fileName: "../../../etc/passwd\u0000.png" } }
  ];

  for (const testCase of rejected) {
    await record(`rejected upload performs zero storage/DB writes: ${testCase.name}`, async () => {
      calls.length = 0;
      let thrown: Error | undefined;
      try {
        await service.createDraft(testCase.input as never);
      } catch (error) {
        thrown = error as Error;
      }
      assert(thrown, "expected the upload to be rejected");
      assert(calls.length === 0, `expected zero side effects, observed: ${calls.join(", ")}`);
      const text = `${thrown.message}${JSON.stringify(thrown, Object.getOwnPropertyNames(thrown))}`;
      assert(!text.includes(pngB64.slice(0, 24)), "error leaked the base64 payload");
      assert(!text.toLowerCase().includes("originals/"), "error leaked a storage key");
      assert(!text.includes("a".repeat(64)), "error echoed an unbounded client filename");
    });
  }

  await record("a valid upload performs exactly one storage write then one DB write", async () => {
    calls.length = 0;
    uploadedFileNames = [];
    const { draft, guestOwnershipToken } = await service.createDraft({ ...base, fileName: "  my photo.png  " } as never);
    const sideEffects = calls.filter((c) => c !== "storage.getSignedUrl");
    assert(
      sideEffects.join("|") === "storage.uploadOriginal|db.restorationDraft.create",
      `unexpected side-effect order: ${calls.join(", ")}`
    );
    assert(!calls.some((c) => c.startsWith("network.fetch")), "the upload path must make no network call");
    assert(uploadedFileNames[0] === "my photo.png", `filename must be trimmed/validated, got ${uploadedFileNames[0]}`);
    assert(draft.originalMimeType === "image/png", "server-detected mime must be persisted");
    assert(draft.originalWidth === 24 && draft.originalHeight === 16, "server-decoded dimensions must be persisted");
    assert(draft.originalFileSizeBytes === png.length, "decoded byte length must be persisted");
    assert(typeof guestOwnershipToken === "string" && guestOwnershipToken.length > 0, "guest token expected for anonymous upload");
    assert(!Object.prototype.hasOwnProperty.call(draft, "originalStorageKey"), "the safe view must not expose the storage key");
  });

  await record("a client-claimed contentType cannot override the detected mime", async () => {
    calls.length = 0;
    const { draft } = await service.createDraft({ ...base, contentType: "image/jpeg", fileName: "lie.jpg" } as never);
    assert(draft.originalMimeType === "image/png", `expected image/png, got ${draft.originalMimeType}`);
  });

  globalThis.fetch = realFetch;

  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}: ${r.name}${r.detail ? ` -- ${r.detail}` : ""}`);
  console.log(`${results.length - failed.length}/${results.length} upload boundary tests passed`);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
