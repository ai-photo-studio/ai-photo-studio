import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../utils/errors";

const config = { storageDryRun: true, restorationDryRun: true, PORT: 3000, R2_PUBLIC_BASE_URL: "http://localhost:3000" } as never;

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft-1",
    ownerUserId: "user-1",
    guestOwnershipTokenHash: null,
    originalStorageKey: "originals/server-owned.png",
    status: "PREVIEW_READY",
    market: "PAKISTAN",
    country: "PK",
    currency: "PKR",
    originalMimeType: "image/png",
    originalWidth: 20,
    originalHeight: 10,
    originalFileSizeBytes: 123,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

test("authorization is verified before persisted key is signed", async () => {
  const { RestorationDraftService } = await import("./restoration-draft.service");
  const { prisma } = await import("../db/prisma");
  const service = new RestorationDraftService(config);
  const storage = (service as unknown as { storage: { getSignedUrl: (key: string) => Promise<string> } }).storage;
  const originalFind = prisma.restorationDraft.findUnique;
  const originalSign = storage.getSignedUrl;
  const signed: string[] = [];
  prisma.restorationDraft.findUnique = (async () => draft()) as unknown as typeof prisma.restorationDraft.findUnique;
  storage.getSignedUrl = async (key) => { signed.push(key); return "https://signed.example/preview"; };
  try {
    await assert.rejects(() => service.getDraft("draft-1", { userId: "attacker" }), (error: unknown) => (error as AppError).code === "NOT_FOUND");
    assert.deepEqual(signed, []);
  } finally {
    prisma.restorationDraft.findUnique = originalFind;
    storage.getSignedUrl = originalSign;
  }
});

test("missing persisted storage key fails closed without signing", async () => {
  const { RestorationDraftService } = await import("./restoration-draft.service");
  const { prisma } = await import("../db/prisma");
  const service = new RestorationDraftService(config);
  const storage = (service as unknown as { storage: { getSignedUrl: (key: string) => Promise<string> } }).storage;
  const originalFind = prisma.restorationDraft.findUnique;
  const originalSign = storage.getSignedUrl;
  let signCalls = 0;
  prisma.restorationDraft.findUnique = (async () => draft({ originalStorageKey: "" })) as unknown as typeof prisma.restorationDraft.findUnique;
  storage.getSignedUrl = async () => { signCalls += 1; return "https://signed.example/preview"; };
  try {
    await assert.rejects(() => service.getDraft("draft-1", { userId: "user-1" }), (error: unknown) => (error as AppError).code === "PREVIEW_UNAVAILABLE");
    assert.equal(signCalls, 0);
  } finally {
    prisma.restorationDraft.findUnique = originalFind;
    storage.getSignedUrl = originalSign;
  }
});

test("each authorized read signs only the persisted key and returns a fresh URL", async () => {
  const { RestorationDraftService } = await import("./restoration-draft.service");
  const { prisma } = await import("../db/prisma");
  const service = new RestorationDraftService(config);
  const storage = (service as unknown as { storage: { getSignedUrl: (key: string) => Promise<string> } }).storage;
  const originalFind = prisma.restorationDraft.findUnique;
  const originalSign = storage.getSignedUrl;
  const keys: string[] = [];
  let n = 0;
  prisma.restorationDraft.findUnique = (async () => draft()) as unknown as typeof prisma.restorationDraft.findUnique;
  storage.getSignedUrl = async (key) => { keys.push(key); n += 1; return `https://signed.example/${n}`; };
  try {
    const first = await service.getDraft("draft-1", { userId: "user-1" });
    const second = await service.getDraft("draft-1", { userId: "user-1" });
    assert.deepEqual(keys, ["originals/server-owned.png", "originals/server-owned.png"]);
    assert.notEqual(first.previewUrl, second.previewUrl);
    assert(!JSON.stringify(first).includes("originalStorageKey"));
  } finally {
    prisma.restorationDraft.findUnique = originalFind;
    storage.getSignedUrl = originalSign;
  }
});
