import { createCipheriv, createDecipheriv } from "node:crypto";

export type OrderedApgField = readonly [name: string, value: string];

function validateKeyMaterial(key: string, iv: string): void {
  if (Buffer.byteLength(key, "utf8") !== 16 || Buffer.byteLength(iv, "utf8") !== 16) {
    throw new Error("APG AES key and IV must each be exactly 16 UTF-8 bytes");
  }
}

export function buildApgRequestMap(fields: readonly OrderedApgField[]): string {
  return fields.map(([name, value]) => `${name}=${value}`).join("&");
}

export function encryptApgRequestHash(fields: readonly OrderedApgField[], key: string, iv: string): string {
  validateKeyMaterial(key, iv);
  const cipher = createCipheriv("aes-128-cbc", Buffer.from(key, "utf8"), Buffer.from(iv, "utf8"));
  return Buffer.concat([cipher.update(buildApgRequestMap(fields), "utf8"), cipher.final()]).toString("base64");
}

export function decryptApgRequestHash(hash: string, key: string, iv: string): string {
  validateKeyMaterial(key, iv);
  const decipher = createDecipheriv("aes-128-cbc", Buffer.from(key, "utf8"), Buffer.from(iv, "utf8"));
  return Buffer.concat([decipher.update(Buffer.from(hash, "base64")), decipher.final()]).toString("utf8");
}
