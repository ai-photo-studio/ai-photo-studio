import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(__dirname, "restoration.service.ts"), "utf8");
if (!source.includes("originalStorageKey ? await this.storage.getSignedUrl(item.originalStorageKey)")) throw new Error("Before must use originalStorageKey");
if (!source.includes("finalStorageKey ? await this.storage.getSignedUrl(item.finalStorageKey)")) throw new Error("After must use finalStorageKey");
console.log("restoration view source mapping tests passed");
