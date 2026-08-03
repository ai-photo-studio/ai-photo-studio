import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import sharp from "sharp";
import { AppError } from "../utils/errors";
import { assertOwnership } from "../utils/ownership";
import { hashGuestOwnershipToken } from "../utils/guest-ownership";

const config = {
  storageDryRun: true,
  restorationDryRun: true,
  PORT: 3000,
  R2_PUBLIC_BASE_URL: "http://localhost:3000"
} as never;

async function validBase64(): Promise<string> {
  return (await sharp({ create: { width: 20, height: 10, channels: 3, background: "#123456" } }).png().toBuffer()).toString("base64");
}

test("storage upload failure creates no draft row", async () => {
  const { RestorationDraftService } = await import("./restoration-draft.service");
  const { prisma } = await import("../db/prisma");
  const service = new RestorationDraftService(config);
  const storage = (service as unknown as { storage: { uploadOriginal: () => Promise<never> } }).storage;
  const originalUpload = storage.uploadOriginal;
  const originalCreate = prisma.restorationDraft.create;
  let dbWrites = 0;
  storage.uploadOriginal = async () => { throw new AppError("storage unavailable", 502, "STORAGE_R2_ERROR"); };
  prisma.restorationDraft.create = (async () => { dbWrites += 1; throw new Error("should not create"); }) as unknown as typeof prisma.restorationDraft.create;
  try {
    const bodyBase64 = await validBase64();
    await assert.rejects(() => service.createDraft({ country: "PK", marketConfirmed: true, fileName: "photo.png", bodyBase64 }));
    assert.equal(dbWrites, 0);
  } finally {
    storage.uploadOriginal = originalUpload;
    prisma.restorationDraft.create = originalCreate;
  }
});

test("database failure after upload compensates by deleting exactly the generated object", async () => {
  const { RestorationDraftService } = await import("./restoration-draft.service");
  const { prisma } = await import("../db/prisma");
  const service = new RestorationDraftService(config);
  const storage = (service as unknown as {
    storage: {
      uploadOriginal: () => Promise<{ key: string }>;
      deleteFile: (key: string) => Promise<void>;
    };
  }).storage;
  const originalUpload = storage.uploadOriginal;
  const originalDelete = storage.deleteFile;
  const originalCreate = prisma.restorationDraft.create;
  const generatedKey = "originals/server-generated-uuid-photo.png";
  const deleted: string[] = [];
  storage.uploadOriginal = async () => ({ key: generatedKey }) as never;
  storage.deleteFile = async (key) => { deleted.push(key); };
  prisma.restorationDraft.create = (async () => { throw new Error("database unavailable"); }) as unknown as typeof prisma.restorationDraft.create;
  try {
    const bodyBase64 = await validBase64();
    await assert.rejects(() => service.createDraft({
      country: "PK",
      marketConfirmed: true,
      fileName: "../../attacker.png",
      bodyBase64
    }));
    assert.deepEqual(deleted, [generatedKey]);
  } finally {
    storage.uploadOriginal = originalUpload;
    storage.deleteFile = originalDelete;
    prisma.restorationDraft.create = originalCreate;
  }
});

test("cleanup failure returns a generic error without leaking storage details", async () => {
  const { RestorationDraftService } = await import("./restoration-draft.service");
  const { prisma } = await import("../db/prisma");
  const service = new RestorationDraftService(config);
  const storage = (service as unknown as {
    storage: {
      uploadOriginal: () => Promise<{ key: string }>;
      deleteFile: (key: string) => Promise<void>;
    };
  }).storage;
  const originalUpload = storage.uploadOriginal;
  const originalDelete = storage.deleteFile;
  const originalCreate = prisma.restorationDraft.create;
  const secretKey = "originals/private-secret-key.png";
  storage.uploadOriginal = async () => ({ key: secretKey }) as never;
  storage.deleteFile = async () => { throw new Error("delete failed"); };
  prisma.restorationDraft.create = (async () => { throw new Error("database unavailable"); }) as unknown as typeof prisma.restorationDraft.create;
  try {
    const bodyBase64 = await validBase64();
    await assert.rejects(
      () => service.createDraft({ country: "PK", marketConfirmed: true, fileName: "photo.png", bodyBase64 }),
      (error: unknown) => {
        const appError = error as AppError;
        return appError.code === "STORAGE_CLEANUP_ERROR" && !appError.message.includes(secretKey);
      }
    );
  } finally {
    storage.uploadOriginal = originalUpload;
    storage.deleteFile = originalDelete;
    prisma.restorationDraft.create = originalCreate;
  }
});

test("ownership remains uniform and authenticated records do not accept guest tokens", () => {
  const guestToken = "guest-token";
  const guestRecord = { ownerUserId: null, guestOwnershipTokenHash: hashGuestOwnershipToken(guestToken) };
  assert.equal(assertOwnership(guestRecord, { guestToken }), guestRecord);
  assert.throws(() => assertOwnership(guestRecord, { userId: "user-1", guestToken: "wrong" }), (error: unknown) => (error as AppError).code === "NOT_FOUND");
  const userRecord = { ownerUserId: "user-1", guestOwnershipTokenHash: null };
  assert.equal(assertOwnership(userRecord, { userId: "user-1", guestToken }), userRecord);
  assert.throws(() => assertOwnership(userRecord, { guestToken }), (error: unknown) => (error as AppError).code === "NOT_FOUND");
});

test("guest tokens persist only as hashes", () => {
  const token = "secret-token";
  const hash = hashGuestOwnershipToken(token);
  assert.equal(hash, createHash("sha256").update(token).digest("hex"));
  assert.notEqual(hash, token);
});
