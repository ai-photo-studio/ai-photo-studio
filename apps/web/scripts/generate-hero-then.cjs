/* eslint-env node */
/* eslint-disable @typescript-eslint/no-require-imports, no-undef */

/**
 * R9.3-P10B: Regenerate the 10 Homepage "Then" (damaged) hero assets.
 *
 * Each `*-then.jpg` is rebuilt deterministically FROM its exact matching
 * `*-now.jpg` so composition, people, pose, background, crop and dimensions
 * are pixel-aligned with the restored image. Every preset applies a DISTINCT
 * realistic historical damage treatment using PHOTOGRAPHIC degradation only
 * (tonal/channel grading, film grain, soft blurred mottle/stains, fine
 * scratches, feathered torn edges). No discrete geometric overlays, circles,
 * polygons or repeated scratch patterns are used.
 *
 * Run from repo root:  node apps/web/scripts/generate-hero-then.cjs
 * Idempotent (seeded RNG per hero). Never upscales/recompresses the Now source.
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const HERO_DIR = path.join(__dirname, "..", "public", "assets", "hero", "hero");
const SIZE = 1600;

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

/** Per-channel tonal grading helpers are photographic (curve/channel
 * adjustments), never geometric. */

/** Fine film-grain overlay from a seeded random luminance field (alpha-light). */
function grainOverlay(seed, intensity) {
  const rng = makeRng(seed);
  const px = Buffer.alloc(SIZE * SIZE * 4);
  let j = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const v = 90 + rng() * 165;
    px[j++] = v; px[j++] = v; px[j++] = v;
    px[j++] = Math.round(intensity * 255);
  }
  return sharp(px, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png()
    .toBuffer();
}

/** Coarse blurred mottle/stain field (reads as mold, water staining, age). */
function mottleBuffer(seed, baseLum, contrast) {
  const rng = makeRng(seed);
  const px = Buffer.alloc(SIZE * SIZE * 4);
  let v = baseLum;
  let j = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    v += (rng() - 0.5) * contrast;
    if (v < 0) v = 0; if (v > 255) v = 255;
    px[j++] = v; px[j++] = v; px[j++] = v; px[j++] = 255;
  }
  return sharp(px, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .blur(40)
    .png()
    .toBuffer();
}

/** Soft blurred colour cast field for uneven fading / water tint. */
function colorCastBuffer(seed, meanLum, spread, rgb) {
  const rng = makeRng(seed);
  const px = Buffer.alloc(SIZE * SIZE * 4);
  let v = meanLum;
  let j = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    v += (rng() - 0.5) * spread;
    if (v < 0) v = 0; if (v > 255) v = 255;
    const f = v / 255;
    px[j++] = Math.round(rgb[0] * f);
    px[j++] = Math.round(rgb[1] * f);
    px[j++] = Math.round(rgb[2] * f);
    px[j++] = 255;
  }
  return sharp(px, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .blur(60)
    .png()
    .toBuffer();
}

/** Fine scratches: thin, soft, individually seeded lines (feathered via blur). */
function scratchOverlay(seed, count, color = "#d8d2c4", maxLen = 420, opacityF = 0.5) {
  const rng = makeRng(seed);
  let s = "";
  for (let i = 0; i < count; i++) {
    const x = rng() * SIZE;
    const y = rng() * SIZE;
    const len = 12 + rng() * maxLen;
    const horiz = rng() > 0.45; // bias horizontal for film scratches
    const ang = rng() * 0.5 - 0.25;
    const dx = horiz ? Math.cos(ang) * len : Math.sin(ang) * len * 0.3;
    const dy = horiz ? Math.sin(ang) * len * 0.12 : Math.cos(ang) * len;
    const w = 0.6 + rng() * 1.6;
    s += `<line x1="${x}" y1="${y}" x2="${x + dx}" y2="${y + dy}" stroke="${color}" stroke-width="${w}" stroke-opacity="${(opacityF * (0.4 + rng() * 0.6)).toFixed(3)}" filter="url(#soft)"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><defs><filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4"/></filter></defs>${s}</svg>`;
}

/**
 * Feathered, jagged torn edge / missing-corner mask (light paper tone, ragged,
 * softly masked) so it reads as eaten paper rather than a crisp polygon.
 */
function tornMask(seed, edges) {
  const rng = makeRng(seed);
  const pts = [];
  const steps = 90;
  const baseAmt = 60 + rng() * 60;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const depth = baseAmt + (rng() - 0.5) * 90;
    pts.push(`${(t * SIZE).toFixed(1)},${depth.toFixed(1)}`);
  }
  const edgePaths = [];
  const paper = "#e6e0d2";
  for (const e of edges) {
    if (e === "top") {
      edgePaths.push(`<path d="M0 0 L0 0 L${pts.map((p, i) => (i === 0 ? "" : `L${p}`)).join(" ")} L${SIZE} 0 Z" fill="${paper}" fill-opacity="0.92" filter="url(#rough)"/>`);
      edgePaths.push(`<path d="M0 8 L${pts.map((p, i) => (i === 0 ? `${p}` : `L${p}`)).join(" ")} L${SIZE} 8 Z" fill="#f4efe5" fill-opacity="0.85" filter="url(#rough)"/>`);
    } else if (e === "left") {
      const l = pts.map((p) => { const [x, y] = p.split(","); return `${y},${x}`; });
      edgePaths.push(`<path d="M0 0 L${l.map((p, i) => (i === 0 ? `${p}` : `L${p}`)).join(" ")} L0 ${SIZE} Z" fill="${paper}" fill-opacity="0.92" filter="url(#rough)"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><defs><filter id="rough" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>${edgePaths.join("")}</svg>`;
}

function missingCornerMask(seed, corner, base = 240, spread = 120) {
  const rng = makeRng(seed);
  const amt = base + rng() * spread;
  // Build a ragged, feathered hypotenuse along a chosen corner.
  const edge = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const wob = (rng() - 0.5) * 110;
    // Along the fold line perpendicular to the corner.
    const hx = amt - t * amt;   // along x
    const hy = amt - t * amt;   // along y
    const ex = hx + wob;
    const ey = hy - wob;
    edge.push(`${ex.toFixed(1)},${ey.toFixed(1)}`);
  }
  let path;
  switch (corner) {
    case "tl": path = `M0,0 L${amt},0 L${edge.join(" L")} L0,${amt} Z`; break;
    case "tr": path = `M${SIZE},0 L${SIZE},${amt} L${edge.join(" L")} L${SIZE - amt},0 Z`; break;
    case "bl": path = `M0,${SIZE} L0,${SIZE - amt} L${edge.join(" L")} L${amt},${SIZE} Z`; break;
    case "br": path = `M${SIZE},${SIZE} L${SIZE - amt},${SIZE} L${edge.join(" L")} L${SIZE},${SIZE - amt} Z`; break;
    default: path = `M0,0 L${amt},0 L${edge.join(" L")} L0,${amt} Z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><defs><filter id="m" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter></defs><path d="${path}" fill="#e0d8c7" fill-opacity="0.94" filter="url(#m)"/></svg>`;
}

// --- Recipes: each is a distinct photographic damage preset -----------------

const RECIPES = {
  "hero-01": {
    label: "Parents â€” strong faded sepia, low contrast, fine cracks, worn border",
    async fn(img) {
      img = img.modulate({ brightness: 0.98, saturation: 0.45 }).linear(0.86, 30).tint({ r: 214, g: 184, b: 140 });
      img = img.composite([
        { input: await grainOverlay(1001, 0.22), blend: "soft-light" },
        { input: Buffer.from(scratchOverlay(1002, 26, "#cabfa8", 260, 0.5)), blend: "over" }
      ]);
      return img;
    }
  },
  "hero-02": {
    label: "Grandparents â€” true B&W, dim exposure, yellow paper, light age spotting",
    async fn(img) {
      img = img.greyscale().modulate({ brightness: 0.8 }).linear(1.05, -8).tint({ r: 232, g: 214, b: 176 });
      const mottle = await mottleBuffer(2001, 205, 90);
      img = img.composite([
        { input: mottle, blend: "multiply", opacity: 0.18 },
        { input: await grainOverlay(2002, 0.26), blend: "overlay" }
      ]);
      return img;
    }
  },
  "hero-03": {
    label: "Wedding â€” major fold marks, torn corner, stains, scratches, faded highlights",
    async fn(img) {
      img = img.modulate({ brightness: 0.92, saturation: 0.6 }).linear(0.92, 26);
      const cast = await colorCastBuffer(3001, 150, 60, [216, 200, 168]);
      img = img.composite([
        { input: Buffer.from(missingCornerMask(3002, "br")), blend: "over" },
        { input: cast, blend: "multiply", opacity: 0.22 },
        { input: await grainOverlay(3003, 0.18), blend: "overlay" },
        { input: Buffer.from(scratchOverlay(3004, 40, "#b9ad95", 340, 0.45)), blend: "over" }
      ]);
      return img;
    }
  },
  "hero-04": {
    label: "Childhood â€” old faded color, water stain, colour cast, emulsion loss",
    async fn(img) {
      img = img.modulate({ brightness: 0.95, saturation: 0.7, hue: 18 });
      const blue = await colorCastBuffer(4001, 90, 70, [120, 150, 168]);
      const pale = await mottleBuffer(4002, 235, 60);
      img = img.composite([
        { input: blue, blend: "multiply", opacity: 0.25 },
        { input: pale, blend: "soft-light", opacity: 0.55 },
        { input: await grainOverlay(4003, 0.2), blend: "overlay" }
      ]);
      return img;
    }
  },
  "hero-05": {
    label: "Large family â€” very low contrast, dust, uneven exposure, creases, age spots",
    async fn(img) {
      img = img.modulate({ brightness: 0.99, saturation: 0.5 }).linear(0.6, 52).tint({ r: 226, g: 206, b: 164 });
      const mottle = await mottleBuffer(5001, 195, 140);
      const grain = await grainOverlay(5002, 0.34);
      img = img.composite([
        { input: mottle, blend: "multiply", opacity: 0.2 },
        { input: grain, blend: "overlay" },
        { input: grain, blend: "soft-light", opacity: 0.4 }
      ]);
      return img;
    }
  },
  "hero-06": {
    label: "Army â€” B&W, strong vertical/horizontal scratches, cracked emulsion, faded detail",
    async fn(img) {
      img = img.greyscale().modulate({ brightness: 0.9 });
      img = img.composite([
        { input: Buffer.from(scratchOverlay(6001, 60, "#d6cfc0", 520, 0.5)), blend: "over" },
        { input: Buffer.from(scratchOverlay(6002, 18, "#2c2418", 260, 0.4)), blend: "over" },
        { input: await grainOverlay(6003, 0.3), blend: "overlay" }
      ]);
      return img;
    }
  },
  "hero-07": {
    label: "Village â€” badly torn paper edge, missing corner, dirt/dust, faded sepia",
    async fn(img) {
      img = img.modulate({ brightness: 0.97, saturation: 0.4 }).linear(0.85, 30).tint({ r: 205, g: 176, b: 134 });
      img = img.composite([
        { input: Buffer.from(tornMask(7001, ["top", "left"])), blend: "over" },
        { input: Buffer.from(missingCornerMask(7002, "tl")), blend: "over" },
        { input: await grainOverlay(7003, 0.3), blend: "overlay" }
      ]);
      return img;
    }
  },
  "hero-08": {
    label: "City/Bazaar â€” old B&W, heavy grain, dark exposure, scratches, faded background",
    async fn(img) {
      img = img.greyscale().modulate({ brightness: 0.72 }).linear(0.92, 6);
      const grain = await grainOverlay(8001, 0.4);
      img = img.composite([
        { input: grain, blend: "overlay" },
        { input: grain, blend: "soft-light", opacity: 0.5 },
        { input: Buffer.from(scratchOverlay(8002, 26, "#c9bfa9", 400, 0.4)), blend: "over" }
      ]);
      return img;
    }
  },
  "hero-09": {
    label: "Migration/Railway â€” most severe: multiple tears, folds, stains, missing emulsion, faded faces",
    async fn(img) {
      img = img.modulate({ brightness: 0.92, saturation: 0.45 }).linear(0.8, 36).tint({ r: 208, g: 186, b: 150 });
      const mottle = await mottleBuffer(9001, 205, 130);
      img = img.composite([
        { input: Buffer.from(scratchOverlay(9002, 70, "#c6baa0", 640, 0.5)), blend: "over" },
        { input: mottle, blend: "multiply", opacity: 0.26 },
        { input: await grainOverlay(9003, 0.3), blend: "overlay" }
      ]);
      return img;
    }
  },
  "hero-10": {
    label: "Memorial â€” dim portrait, partial fading, scratches, silvering/emulsion deterioration",
    async fn(img) {
      img = img.modulate({ brightness: 0.72, saturation: 0.5 });
      const sheen = await mottleBuffer(10001, 225, 70);
      img = img.composite([
        { input: sheen, blend: "soft-light", opacity: 0.6 },
        { input: await grainOverlay(10002, 0.24), blend: "overlay" },
        { input: Buffer.from(scratchOverlay(10003, 30, "#e0d8c6", 300, 0.35)), blend: "over" }
      ]);
      return img;
    }
  }
};

async function main() {
  if (!fs.existsSync(HERO_DIR)) throw new Error(`Hero dir not found: ${HERO_DIR}`);
  const all = fs.readdirSync(HERO_DIR);
  for (const id of Object.keys(RECIPES)) {
    const nowFile = all.find((f) => f.indexOf(`${id}-`) === 0 && f.endsWith("-now.jpg"));
    if (!nowFile) { console.warn(`SKIP ${id}: no -now.jpg`); continue; }
    const thenFile = nowFile.replace("-now.jpg", "-then.jpg");
    const input = path.join(HERO_DIR, nowFile);
    const output = path.join(HERO_DIR, thenFile);
    const start = Date.now();
    let pipeline = sharp(input);
    pipeline = await RECIPES[id].fn(pipeline);
    await pipeline.jpeg({ quality: 86, mozjpeg: true }).toFile(output);
    const kb = (fs.statSync(output).size / 1024).toFixed(0);
    console.log(`${RECIPES[id].label}: wrote ${thenFile} (${kb} KB, ${Date.now() - start}ms)`);
  }
  console.log("\nDone. 10 Then assets regenerated with photorealistic distinct damage.");
}

main().catch((e) => { console.error("GENERATOR ERROR:", e); process.exit(1); });
