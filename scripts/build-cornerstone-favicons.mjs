#!/usr/bin/env node
// Generate raster favicon + desktop icon derivatives from the Cornerstone SVG masters.
//
// Two SVG sources are used:
//   1. apps/web/public/cornerstone-icon-dark.svg      — plain icon (no text).
//      Used for small favicons where "CODE" below the glyph would be unreadable.
//   2. apps/web/public/cornerstone-codemark-dark.svg  — composite "icon + CODE" wordmark.
//      Used for large desktop/PWA icons (macOS dock, Windows taskbar, etc.).
//
// The small-icon cutoff is 128 px. Below that, we fall back to the plain icon
// because "CODE" becomes unreadable at favicon sizes (16, 32, 48).
//
// Outputs:
//   apps/web/public/{favicon-16x16,favicon-32x32,apple-touch-icon}.png, favicon.ico
//   assets/{dev,nightly,prod}/cornerstone-web-* + cornerstone-*-1024.png + cornerstone-*.ico
//
// Regenerate the composite source first if the master or font changed:
//   node scripts/build-cornerstone-codemark.mjs
//
// Then run:
//   bun scripts/build-cornerstone-favicons.mjs
//
// Requires dev dependencies: `sharp` and `png-to-ico` (in the `scripts` workspace).

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";

import sharp from "sharp";
import pngToIco from "png-to-ico";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const publicDir = resolve(repoRoot, "apps/web/public");

// Load both SVG sources up front. The codemark variant has room for the "CODE"
// wordmark below the icon; use it at sizes where that text can still be read.
const plainIconSvg = await readFile(resolve(publicDir, "cornerstone-icon-dark.svg"));
const codemarkSvg = await readFile(resolve(publicDir, "cornerstone-codemark-dark.svg"));

const COMPOSITE_MIN_SIZE = 128;

/**
 * Render one of the two SVG sources to a PNG at `size × size`.
 * The SVG viewBox is 1080×1080; sharp rasterizes at (density / 72) × viewBox px,
 * so we pick a density that oversamples by ~2× without exceeding sharp's pixel
 * limit: density = ceil((size * 144) / 1080).
 */
const SVG_VIEWBOX = 1080;

async function renderPng(size) {
  const source = size >= COMPOSITE_MIN_SIZE ? codemarkSvg : plainIconSvg;
  const density = Math.max(72, Math.ceil((size * 144) / SVG_VIEWBOX));
  return sharp(source, { density })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function writePng(size, absolutePath) {
  const buffer = await renderPng(size);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);
  const which = size >= COMPOSITE_MIN_SIZE ? "codemark" : "icon";
  console.log(`✓ wrote ${absolutePath.replace(repoRoot + "/", "")} (${size}x${size}, ${which})`);
}

async function writeIco(sizes, absolutePath) {
  const buffers = await Promise.all(sizes.map((size) => renderPng(size)));
  const ico = await pngToIco(buffers);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, ico);
  console.log(`✓ wrote ${absolutePath.replace(repoRoot + "/", "")} (${sizes.join(", ")})`);
}

// ---------- apps/web/public favicons ----------
// Small sizes: plain icon.  Apple touch icon (180): composite (large enough to read CODE).
await writePng(16, resolve(publicDir, "favicon-16x16.png"));
await writePng(32, resolve(publicDir, "favicon-32x32.png"));
await writePng(180, resolve(publicDir, "apple-touch-icon.png"));
await writeIco([16, 32, 48], resolve(publicDir, "favicon.ico"));

// ---------- assets/{dev,nightly,prod} staged icons ----------
// These are consumed by the electron-builder + desktop artifact pipeline via
// scripts/lib/brand-assets.ts. Filenames follow the `cornerstone-*` convention.
const stages = ["dev", "nightly", "prod"];
for (const stage of stages) {
  const stageDir = resolve(repoRoot, "assets", stage);
  // 1024px desktop icons (dock, installer, etc.) use the composite.
  await writePng(1024, resolve(stageDir, "cornerstone-macos-1024.png"));
  await writePng(1024, resolve(stageDir, "cornerstone-universal-1024.png"));
  await writePng(1024, resolve(stageDir, "cornerstone-ios-1024.png"));
  // Small web favicons stay icon-only (text would be illegible).
  await writePng(16, resolve(stageDir, "cornerstone-web-favicon-16x16.png"));
  await writePng(32, resolve(stageDir, "cornerstone-web-favicon-32x32.png"));
  // Apple touch icon is 180px — composite.
  await writePng(180, resolve(stageDir, "cornerstone-web-apple-touch-180.png"));
  await writeIco([16, 32, 48], resolve(stageDir, "cornerstone-web-favicon.ico"));
  // Windows taskbar ICO includes a 256 slot (composite) alongside 16/32/48 (icon).
  await writeIco([16, 32, 48, 256], resolve(stageDir, "cornerstone-windows.ico"));
}

console.log("\nDone. Regenerate composite SVGs with: node scripts/build-cornerstone-codemark.mjs");
console.log("Regenerate rasters with:              bun scripts/build-cornerstone-favicons.mjs");
