#!/usr/bin/env node
// Build the composite "Cornerstone + CODE" wordmark.
//
// Inputs:
//   cornerstoneLogos/Cornerstone Logo - Icon Blk.svg  (icon master — unused at runtime;
//     we embed the polygons inline here so the output SVG is self-contained)
//   cornerstoneLogos/fonts/CormorantGaramond.ttf       (OFL variable serif)
//
// Outputs:
//   cornerstoneLogos/Cornerstone Codemark.svg        — master, black glyphs + gold corner
//   apps/web/public/cornerstone-codemark.svg         — `currentColor` variant for web
//   apps/web/public/cornerstone-codemark-dark.svg    — white-baked variant for favicon slot
//
// Run with:  node scripts/build-cornerstone-codemark.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import opentype from "opentype.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const fontPath = resolve(repoRoot, "cornerstoneLogos/fonts/CormorantGaramond.ttf");

const fontBuffer = await readFile(fontPath);
// opentype.parse() takes an ArrayBuffer.
const font = opentype.parse(
  fontBuffer.buffer.slice(fontBuffer.byteOffset, fontBuffer.byteOffset + fontBuffer.byteLength),
);

// ---------- Canvas geometry ----------
const CANVAS = 1080;

// Icon original bounds (from the master SVG viewBox coordinates):
const ICON_BOUNDS = { x1: 149.46, y1: 147.82, x2: 930.54, y2: 929.38 };
const ICON_W = ICON_BOUNDS.x2 - ICON_BOUNDS.x1;
const ICON_H = ICON_BOUNDS.y2 - ICON_BOUNDS.y1;

// Reserve bottom ~33% for "CODE" text.
const ICON_TOP_PAD = 60;
const ICON_TARGET_H = 620;
const ICON_SCALE = ICON_TARGET_H / ICON_H;
const ICON_TARGET_W = ICON_W * ICON_SCALE;
const ICON_LEFT = (CANVAS - ICON_TARGET_W) / 2;

// translate(tx, ty) scale(s) : (x, y) -> (tx + s*x, ty + s*y)
// Map ICON_BOUNDS top-left -> (ICON_LEFT, ICON_TOP_PAD).
const iconTx = ICON_LEFT - ICON_SCALE * ICON_BOUNDS.x1;
const iconTy = ICON_TOP_PAD - ICON_SCALE * ICON_BOUNDS.y1;

// ---------- "CODE" text outline ----------
const TEXT = "CODE";
// Cap height of Cormorant Garamond ≈ 0.69 × fontSize (units-per-em derived).
// We want cap height around 220px to sit comfortably in the bottom zone.
const FONT_SIZE = 320;
// Slight tracking (letter-spacing) suits all-caps serif display.
const LETTER_SPACING_EM = 0.06;

const textPath = buildTrackedTextPath(font, TEXT, FONT_SIZE, LETTER_SPACING_EM);
const textBbox = textPath.getBoundingBox();
const textW = textBbox.x2 - textBbox.x1;
const textH = textBbox.y2 - textBbox.y1;

// Bottom text zone: y from (ICON_TOP_PAD + ICON_TARGET_H + GAP) to (CANVAS - BOTTOM_PAD)
const TEXT_ZONE_TOP = ICON_TOP_PAD + ICON_TARGET_H + 60;
const TEXT_ZONE_BOTTOM = CANVAS - 80;
const TEXT_ZONE_H = TEXT_ZONE_BOTTOM - TEXT_ZONE_TOP;

const textOffsetX = (CANVAS - textW) / 2 - textBbox.x1;
const textOffsetY = TEXT_ZONE_TOP + (TEXT_ZONE_H - textH) / 2 - textBbox.y1;

for (const cmd of textPath.commands) {
  if ("x" in cmd) cmd.x += textOffsetX;
  if ("y" in cmd) cmd.y += textOffsetY;
  if ("x1" in cmd) cmd.x1 += textOffsetX;
  if ("y1" in cmd) cmd.y1 += textOffsetY;
  if ("x2" in cmd) cmd.x2 += textOffsetX;
  if ("y2" in cmd) cmd.y2 += textOffsetY;
}
const textD = textPath.toPathData(2);

// ---------- SVG emission ----------
const ICON_GROUP = `  <g transform="translate(${iconTx.toFixed(2)}, ${iconTy.toFixed(2)}) scale(${ICON_SCALE.toFixed(4)})">
    <polygon points="416.17 662.19 673.36 919.38 773.2 919.38 841 919.38 930.54 919.38 930.54 662.19 416.17 662.19"/>
    <polygon points="158.98 147.82 158.98 405.01 416.17 662.19 416.17 405.01 930.54 405.01 930.54 147.82 158.98 147.82"/>
    <rect class="cs-gold" x="149.46" y="662.19" width="266.71" height="266.71"/>
  </g>`;

// Master: inherits the brand-book palette — black glyphs, gold corner.
const masterSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <style>
      .cs-gold { fill: #d1a35a; }
    </style>
  </defs>
${ICON_GROUP}
  <path d="${textD}"/>
</svg>
`;

// Web variant: glyphs inherit CSS `color` via `currentColor`, gold corner stays gold.
const webSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <g transform="translate(${iconTx.toFixed(2)}, ${iconTy.toFixed(2)}) scale(${ICON_SCALE.toFixed(4)})">
    <polygon fill="currentColor" points="416.17 662.19 673.36 919.38 773.2 919.38 841 919.38 930.54 919.38 930.54 662.19 416.17 662.19"/>
    <polygon fill="currentColor" points="158.98 147.82 158.98 405.01 416.17 662.19 416.17 405.01 930.54 405.01 930.54 147.82 158.98 147.82"/>
    <rect fill="#d1a35a" x="149.46" y="662.19" width="266.71" height="266.71"/>
  </g>
  <path fill="currentColor" d="${textD}"/>
</svg>
`;

// Dark variant: glyphs baked to white — used as the raster source and the
// `<link rel="icon" type="image/svg+xml">` where `currentColor` doesn't resolve.
const darkSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <g transform="translate(${iconTx.toFixed(2)}, ${iconTy.toFixed(2)}) scale(${ICON_SCALE.toFixed(4)})">
    <polygon fill="#ffffff" points="416.17 662.19 673.36 919.38 773.2 919.38 841 919.38 930.54 919.38 930.54 662.19 416.17 662.19"/>
    <polygon fill="#ffffff" points="158.98 147.82 158.98 405.01 416.17 662.19 416.17 405.01 930.54 405.01 930.54 147.82 158.98 147.82"/>
    <rect fill="#d1a35a" x="149.46" y="662.19" width="266.71" height="266.71"/>
  </g>
  <path fill="#ffffff" d="${textD}"/>
</svg>
`;

const masterOut = resolve(repoRoot, "cornerstoneLogos/Cornerstone Codemark.svg");
const webOut = resolve(repoRoot, "apps/web/public/cornerstone-codemark.svg");
const darkOut = resolve(repoRoot, "apps/web/public/cornerstone-codemark-dark.svg");

await writeFile(masterOut, masterSvg);
await writeFile(webOut, webSvg);
await writeFile(darkOut, darkSvg);

console.log(`✓ wrote ${relpath(masterOut)}`);
console.log(`✓ wrote ${relpath(webOut)}`);
console.log(`✓ wrote ${relpath(darkOut)}`);
console.log("\nDone. Regenerate rasters with: bun scripts/build-cornerstone-favicons.mjs");

// ---------- helpers ----------

function relpath(p) {
  return p.replace(repoRoot + "/", "");
}

/**
 * Build a single outlined Path for `text`, applying a fixed tracking
 * (letter-spacing expressed as a fraction of the font's em size).
 *
 * opentype.js's default `font.getPath` uses the font's native advanceWidth
 * between glyphs. For display typography we want extra tracking, so we
 * render each glyph ourselves and advance the cursor by the glyph's
 * native advance plus (trackingEm × fontSize).
 */
function buildTrackedTextPath(font, text, fontSize, trackingEm) {
  const combined = new opentype.Path();
  let cursorX = 0;
  const glyphs = font.stringToGlyphs(text);
  for (let i = 0; i < glyphs.length; i++) {
    const glyph = glyphs[i];
    const glyphPath = glyph.getPath(cursorX, 0, fontSize);
    for (const cmd of glyphPath.commands) {
      combined.commands.push(cmd);
    }
    const scale = fontSize / font.unitsPerEm;
    cursorX += glyph.advanceWidth * scale + trackingEm * fontSize;
  }
  return combined;
}
