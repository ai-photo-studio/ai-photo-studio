/**
 * R9.2-P4C-LEGACY-APG-RETIREMENT-SCAN
 *
 * Proves the legacy "Alfa APG v1.1" Bank Alfalah protocol (sandbox host,
 * /HS/ endpoints, Store ID/Key1/Key2/HS_* fields) has zero ACTIVE hits
 * anywhere in the repository. Historical evidence docs that carry an
 * explicit "SUPERSEDED_BY_MPGS" banner are allowed to keep the retired
 * identifiers as a historical record; everything else must be clean.
 *
 *   npx tsx --test src/services/p4c-bank-alfalah-legacy-apg-retired.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

const EXCLUDED_DIR_NAMES = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage", ".codex", ".claude"]);
// Lines that mention a retired identifier ONLY to document/forbid it (this
// test file, the gateway service's trust-boundary header comment, etc.) are
// not an active usage. A line is exempt only if it also carries an explicit
// retirement marker.
const RETIREMENT_MARKER = /retired|forbidden|must never|superseded/i;
// This test file itself intentionally names the retired identifiers as
// literal strings; it must not flag itself.
const EXCLUDED_FILES = new Set<string>([relative(REPO_ROOT, __filename).replace(/\\/g, "/")]);
// The evidence directory documents the retirement itself and is expected to
// name the retired identifiers in prose explaining what was removed.
const EXCLUDED_DIR_PREFIXES = ["docs/payments/bank-alfalah-mastercard"];

const LEGACY_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "sandbox.bankalfalah.com", pattern: /sandbox\.bankalfalah\.com/i },
  { label: "payments.bankalfalah.com", pattern: /payments\.bankalfalah\.com/i },
  { label: "/HS/ endpoint path", pattern: /\/HS\//},
  { label: "Store ID field", pattern: /\bStore\s?ID\b/i },
  { label: "Key1 field", pattern: /\bKey1\b/ },
  { label: "Key2 field", pattern: /\bKey2\b/ },
  { label: "HS_ prefixed field", pattern: /\bHS_[A-Z_]+\b/ }
];

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (EXCLUDED_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function isExcluded(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  if (EXCLUDED_FILES.has(normalized)) return true;
  return EXCLUDED_DIR_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function hasSupersededBanner(content: string): boolean {
  return /SUPERSEDED_BY_MPGS/.test(content.slice(0, 4000)) || /SUPERSEDED_BY_MPGS/.test(content);
}

const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".md", ".json", ".env", ".yml", ".yaml", ".sql", ".txt", ""]);

test("legacy Alfa APG v1.1 identifiers have zero active hits outside excluded/superseded locations", () => {
  const hits: Array<{ file: string; label: string }> = [];

  for (const file of walk(REPO_ROOT)) {
    const rel = relative(REPO_ROOT, file);
    if (isExcluded(rel)) continue;
    const dotIdx = file.lastIndexOf(".");
    const ext = dotIdx >= 0 ? file.slice(dotIdx) : "";
    if (!TEXT_EXTENSIONS.has(ext)) continue;

    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (content.length > 2_000_000) continue; // skip huge/binary-ish files

    // Historical docs are allowed to keep the reference ONLY if they carry
    // the SUPERSEDED_BY_MPGS banner.
    if (rel.endsWith(".md") && hasSupersededBanner(content)) continue;

    const lines = content.split(/\r?\n/);
    for (const { label, pattern } of LEGACY_PATTERNS) {
      for (let i = 0; i < lines.length; i++) {
        if (!pattern.test(lines[i])) continue;
        // Exempt only if a retirement marker appears within a small window
        // around the match (documenting/forbidding the identifier, not using it).
        const windowStart = Math.max(0, i - 6);
        const windowEnd = Math.min(lines.length, i + 6);
        const window = lines.slice(windowStart, windowEnd).join("\n");
        if (RETIREMENT_MARKER.test(window)) continue;
        hits.push({ file: rel, label });
      }
    }
  }

  assert.deepEqual(
    hits,
    [],
    `found ${hits.length} active legacy Alfa APG v1.1 reference(s): ${JSON.stringify(hits, null, 2)}`
  );
});
