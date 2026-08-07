/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports, no-undef */

/**
 * R9.3-P10: Regenerate the 10 Homepage "Then" (damaged) hero assets.
 *
 * Each `*-then.jpg` is rebuilt deterministically FROM its exact matching
 * `*-now.jpg` so composition, people, pose, background, crop and dimensions
 * are pixel-aligned with the restored image. Every preset applies a DISTINCT
 * realistic historical damage treatment (no shared generic scratch overlay).
 *
 * Requires: npm i -D sharp (present at repo root: sharp@0.34.5)
 * Run from repo root:  node apps/web/scripts/generate-hero-then.js
 *
 * The generator is idempotent: running it again reproduces the same outputs
 * (seeded RNG per hero). It never upscales or recompresses the canonical Now
 * source; it only degrades it in place at the same 1600x1600 dimensions.
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const HERO_DIR = path.join(__dirname, "..", "public", "assets", "hero", "hero");

// Deterministic PRNG (mulberry32) so regeneration is reproducible.
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function svgOverlay(w, h, draw) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
       <defs>
         <filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
       </defs>
       ${draw}
     </svg>`
  );
}

// --- Damage primitives (drawn as translucent SVG overlays) -----------------

function scratchLines({ rng, count, maxLen, opacity, color }) {
  let s = "";
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * 1600);
    const y = Math.floor(rng() * 1600);
    const len = 20 + rng() * maxLen;
    const ang = rng() * Math.PI * 2;
    const dx = Math.cos(ang) * len;
    const dy = Math.sin(ang) * len;
    const w = 1 + rng() * 2.4;
    s += `<line x1="${x}" y1="${y}" x2="${x + dx}" y2="${y + dy}" stroke="${color}" stroke-width="${w}" stroke-opacity="${(opacity * (0.5 + rng() * 0.5)).toFixed(3)}" filter="url(#b)"/>`;
  }
  return s;
}

function stainBlobs({ rng, count, maxR, opacity, color }) {
  let s = "";
  for (let i = 0; i < count; i++) {
    const x = rng() * 1600;
    const y = rng() * 1600;
    const r = 20 + rng() * maxR;
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" fill-opacity="${(opacity * (0.3 + rng() * 0.7)).toFixed(3)}" filter="url(#b)"/>`;
  }
  return s;
}

function dustSpeckles({ rng, count, maxR, opacity }) {
  let s = "";
  for (let i = 0; i < count; i++) {
    const x = rng() * 1600;
    const y = rng() * 1600;
    const r = 1 + rng() * maxR;
    const c = rng() > 0.5 ? "#8a8478" : "#e6e0d2";
    s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" fill-opacity="${(opacity * (0.4 + rng() * 0.6)).toFixed(3)}"/>`;
  }
  return s;
}

function foldLines({ rng, count, opacity }) {
  let s = "";
  for (let i = 0; i < count; i++) {
    const y = 100 + rng() * 1400;
    const x = 100 + rng() * 600;
    s += `<path d="M0 ${y} C 300 ${y + (rng() > 0.5 ? 20 : -20)}, 1300 ${y - (rng() > 0.5 ? 20 : -20)}, 1600 ${y}" fill="none" stroke="#6b5b43" stroke-width="${1 + rng() * 2}" stroke-opacity="${opacity.toFixed(3)}" filter="url(#b)"/>`;
    s += `<path d="M${x} 0 L${x + (rng() > 0.5 ? 120 : -120)} 1600" fill="none" stroke="#6b5b43" stroke-width="1" stroke-opacity="${(opacity * 0.6).toFixed(3)}" filter="url(#b)"/>`;
  }
  return s;
}

function tornEdge({ rng, edges = ["top", "left"] }) {
  // Torn/irregular paper edge along one or more borders.
  let s = "";
  for (const edge of edges) {
    const n = 1600;
    let d = "M0 0 ";
    const step = 40 + rng() * 60;
    let pos = 0;
    while (pos < n) {
      const depth = 10 + rng() * 46;
      const nx = pos + step;
      if (edge === "top") d += `L${nx} ${depth} `;
      else d += `L${depth} ${nx} `;
      pos = nx;
    }
    if (edge === "top") d += `L1600 0 Z`;
    else d += `L0 1600 Z`;
    s += `<path d="${d}" fill="#e8e2d4" fill-opacity="0.9"/>`;
    s += `<path d="${d}" transform="translate(0 6)" fill="#f4efe5" fill-opacity="0.95"/>`;
  }
  return s;
}

function missingCorner({ rng, corner }) {
  const frac = 180 + rng() * 160;
  const pts = {
    tl: `0 0 ${frac} 0 0 ${frac}`,
    tr: `1600 0 1600 ${frac} ${1600 - frac} 0`,
    bl: `0 1600 0 ${1600 - frac} ${frac} 1600`,
    br: `1600 1600 ${1600 - frac} 1600 1600 ${1600 - frac}`
  };
  return `<polygon points="${pts[corner]}" fill="#e6dfcf" fill-opacity="0.95"/>`;
}

function crackLines({ rng, count, opacity }) {
  let s = "";
  for (let i = 0; i < count; i++) {
    let x = rng() * 1600;
    let y = rng() * 1600;
    let d = `M${x.toFixed(1)} ${y.toFixed(1)} `;
    const segs = 4 + Math.floor(rng() * 4);
    for (let j = 0; j < segs; j++) {
      x += (rng() - 0.5) * 120;
      y += (rng() - 0.5) * 120;
      d += `L${x.toFixed(1)} ${y.toFixed(1)} `;
    }
    s += `<path d="${d}" fill="none" stroke="#3c342a" stroke-width="${1 + rng() * 1.8}" stroke-opacity="${(opacity * (0.35 + rng() * 0.5)).toFixed(3)}"/>`;
  }
  return s;
}

// --- Per-hero recipes ------------------------------------------------------

const RECIPES = {
  "hero-01": {
    label: "Old Parents — faded sepia + weak contrast + light cracks",
    fn: (img) => img.modulate({ saturation: 0.4, brightness: 0.96 }).linear(0.86, 22)
       .tint({ r: 216, g: 190, b: 148 })
       .composite([{ input: svgOverlay(1600, 1600, crackLines({ rng: makeRng(101), count: 26, opacity: 0.5 })), blend: "over" }])
  },
  "hero-02": {
    label: "Grandparents — black & white + dim exposure + paper aging",
    fn: (img) => img.greyscale().modulate({ brightness: 0.78 })
       .composite([
         { input: svgOverlay(1600, 1600, stainBlobs({ rng: makeRng(202), count: 26, maxR: 260, opacity: 0.16, color: "#b29a6d" })), blend: "multiply" },
         { input: svgOverlay(1600, 1600, dustSpeckles({ rng: makeRng(203), count: 400, maxR: 5, opacity: 0.28 })), blend: "over" }
       ])
  },
  "hero-03": {
    label: "Wedding — torn corners + fold lines + stains + moderate scratches",
    fn: (img) => img.modulate({ saturation: 0.62, brightness: 0.9 })
       .composite([
         { input: svgOverlay(1600, 1600, tornEdge({ rng: makeRng(301), edges: ["top"] })), blend: "over" },
         { input: svgOverlay(1600, 1600, missingCorner({ rng: makeRng(302), corner: "br" })), blend: "over" },
         { input: svgOverlay(1600, 1600, foldLines({ rng: makeRng(303), count: 3, opacity: 0.45 })), blend: "soft-light" },
         { input: svgOverlay(1600, 1600, stainBlobs({ rng: makeRng(304), count: 12, maxR: 200, opacity: 0.22, color: "#8a6a3a" })), blend: "multiply" },
         { input: svgOverlay(1600, 1600, scratchLines({ rng: makeRng(305), count: 30, maxLen: 320, opacity: 0.3, color: "#bdb4a2" })), blend: "over" }
       ])
  },
  "hero-04": {
    label: "Childhood Siblings — faded color + water damage + color shift",
    fn: (img) => img.modulate({ saturation: 0.72, hue: 14, brightness: 0.92 })
       .composite([
         { input: svgOverlay(1600, 1600, stainBlobs({ rng: makeRng(404), count: 20, maxR: 240, opacity: 0.3, color: "#7ba4b0" })), blend: "multiply" },
         { input: svgOverlay(1600, 1600, stainBlobs({ rng: makeRng(405), count: 12, maxR: 120, opacity: 0.22, color: "#5c7a86" })), blend: "over" }
       ])
  },
  "hero-05": {
    label: "Large Family — very low contrast + dust + uneven fading + yellowing",
    fn: (img) => img.modulate({ saturation: 0.5, brightness: 0.98 }).linear(0.62, 46).tint({ r: 226, g: 206, b: 160 })
       .composite([
         { input: svgOverlay(1600, 1600, dustSpeckles({ rng: makeRng(505), count: 900, maxR: 8, opacity: 0.4 })), blend: "over" },
         { input: svgOverlay(1600, 1600, stainBlobs({ rng: makeRng(506), count: 10, maxR: 420, opacity: 0.14, color: "#d8c69a" })), blend: "multiply" }
       ])
  },
  "hero-06": {
    label: "Army Officer — black & white + strong scratches + cracked emulsion",
    fn: (img) => img.greyscale().modulate({ brightness: 0.92 })
       .composite([
         { input: svgOverlay(1600, 1600, scratchLines({ rng: makeRng(606), count: 70, maxLen: 520, opacity: 0.38, color: "#d9d2c4" })), blend: "over" },
         { input: svgOverlay(1600, 1600, scratchLines({ rng: makeRng(607), count: 30, maxLen: 300, opacity: 0.34, color: "#241d14" })), blend: "over" },
         { input: svgOverlay(1600, 1600, crackLines({ rng: makeRng(608), count: 40, opacity: 0.6 })), blend: "over" }
       ])
  },
  "hero-07": {
    label: "Village Family — heavy torn edges + dust + faded sepia + missing corner",
    fn: (img) => img.modulate({ saturation: 0.38, brightness: 0.95 }).tint({ r: 208, g: 180, b: 138 }).linear(0.84, 26)
       .composite([
         { input: svgOverlay(1600, 1600, tornEdge({ rng: makeRng(707), edges: ["top", "left"] })), blend: "over" },
         { input: svgOverlay(1600, 1600, missingCorner({ rng: makeRng(708), corner: "tl" })), blend: "over" },
         { input: svgOverlay(1600, 1600, dustSpeckles({ rng: makeRng(709), count: 600, maxR: 6, opacity: 0.34 })), blend: "over" }
       ])
  },
  "hero-08": {
    label: "Old City/Bazaar — aged B&W + grain + scratches + dark exposure",
    fn: (img) => img.greyscale().modulate({ brightness: 0.72 }).linear(0.9, 8)
       .composite([
         { input: svgOverlay(1600, 1600, dustSpeckles({ rng: makeRng(808), count: 1600, maxR: 6, opacity: 0.16 })), blend: "over" },
         { input: svgOverlay(1600, 1600, scratchLines({ rng: makeRng(809), count: 50, maxLen: 460, opacity: 0.32, color: "#cfc6b4" })), blend: "over" },
         { input: svgOverlay(1600, 1600, stainBlobs({ rng: makeRng(810), count: 10, maxR: 200, opacity: 0.18, color: "#6f6255" })), blend: "multiply" }
       ])
  },
  "hero-09": {
    label: "Migration/Railway — severe aging + multiple tears + stains + faded details",
    fn: (img) => img.modulate({ saturation: 0.5, brightness: 0.9 }).tint({ r: 205, g: 185, b: 150 }).linear(0.8, 34)
       .composite([
         { input: svgOverlay(1600, 1600, scratchLines({ rng: makeRng(909), count: 60, maxLen: 700, opacity: 0.28, color: "#d9d0bd" })), blend: "over" },
         { input: svgOverlay(1600, 1600, tornEdge({ rng: makeRng(910), edges: ["right"] })), blend: "over" },
         { input: svgOverlay(1600, 1600, stainBlobs({ rng: makeRng(911), count: 16, maxR: 300, opacity: 0.24, color: "#7a6b4a" })), blend: "multiply" }
       ])
  },
  "hero-10": {
    label: "Loved One Memorial — dim portrait + damaged emulsion + scratches + partial fading",
    fn: (img) => img.modulate({ saturation: 0.55, brightness: 0.7 }).linear(0.94, 14)
       .composite([
         { input: svgOverlay(1600, 1600, stainBlobs({ rng: makeRng(1001), count: 18, maxR: 300, opacity: 0.2, color: "#8a8272" })), blend: "multiply" },
         { input: svgOverlay(1600, 1600, scratchLines({ rng: makeRng(1002), count: 44, maxLen: 360, opacity: 0.3, color: "#e0d8c8" })), blend: "over" },
         { input: svgOverlay(1600, 1600, stainBlobs({ rng: makeRng(1003), count: 8, maxR: 420, opacity: 0.22, color: "#b6ab93" })), blend: "soft-light" }
       ])
  }
};

// --- Run -------------------------------------------------------------------

const HEROES = Object.keys(RECIPES);

async function main() {
  if (!fs.existsSync(HERO_DIR)) {
    throw new Error(`Hero dir not found: ${HERO_DIR}`);
  }
  for (const id of HEROES) {
    const files = fs.readdirSync(HERO_DIR);
    const nowFile = files.find((f) => f.indexOf(`${id}-`) === 0 && f.endsWith("-now.jpg"));
    if (!nowFile) {
      console.warn(`SKIP ${id}: no -now.jpg`);
      continue;
    }
    const thenFile = nowFile.replace("-now.jpg", "-then.jpg");
    const input = path.join(HERO_DIR, nowFile);
    const output = path.join(HERO_DIR, thenFile);

    const start = Date.now();
    const rec = RECIPES[id];
    let pipeline = sharp(input);
    pipeline = rec.fn(pipeline);
    await pipeline.jpeg({ quality: 88, mozjpeg: true }).toFile(output);
    const bytes = fs.statSync(output).size;
    console.log(`${rec.label}: wrote ${thenFile} (${(bytes / 1024).toFixed(0)} KB, ${Date.now() - start}ms)`);
  }
  console.log("\nDone. 10 Then assets regenerated deterministically from their exact Now sources.");
}

main().catch((e) => {
  console.error("GENERATOR ERROR:", e);
  process.exit(1);
});
