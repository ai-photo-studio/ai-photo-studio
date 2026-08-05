// R9.2-MPGS-CI-LIVE-PROOF: renders a sanitized text file as a PNG screenshot
// so the live workflow's "gateway sanitized" evidence can be visually
// inspected the same way the other two screenshots are. Uses the already-
// installed Playwright Chromium; makes no network request itself.
//
// Usage: node scripts/render-text-as-png.mjs <input.txt> <output.png>
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("usage: render-text-as-png.mjs <input.txt> <output.png>");
  process.exit(1);
}

const text = readFileSync(inputPath, "utf8");
const escaped = text
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin: 0; background: #0b1220; }
  pre { color: #d7e3ff; font: 14px/1.5 "Courier New", monospace; padding: 24px; white-space: pre-wrap; word-break: break-word; }
</style></head><body><pre>${escaped}</pre></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 10 } });
await page.setContent(html);
await page.screenshot({ path: outputPath, fullPage: true });
await browser.close();
console.log(`wrote ${outputPath}`);
