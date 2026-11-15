#!/usr/bin/env node
// Downloads the two photos used by the hero (cloud background + profile
// picture) from the published Lovable site into frontend/assets/.
//
//   node scripts/fetch-assets.mjs           only downloads photos that are missing
//   node scripts/fetch-assets.mjs --force   re-downloads and overwrites both
//
// The deployment workflow runs this automatically for any missing photo and
// commits the result, so you normally never need to run it by hand.
// Needs Node 18 or newer. Until the photos exist the site shows a CSS sky and
// your GitHub avatar instead.

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = (process.env.SOURCE_SITE || "https://amine-mokhtar-portfolio.lovable.app").replace(/\/+$/, "");
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "frontend", "assets");

// File names as published in November 2026; used if they can't be detected.
const TARGETS = [
  { pattern: /\/assets\/hero-clouds-[\w-]+\.(?:jpe?g|png|webp)/, fallback: "/assets/hero-clouds-2ShAhAka.jpg", saveAs: "hero-clouds.jpg" },
  { pattern: /\/assets\/moi-[\w-]+\.(?:jpe?g|png|webp)/, fallback: "/assets/moi-T9k5sziB.jpg", saveAs: "profile.jpg" },
];

async function get(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res;
}

/** The image names carry a build hash, so look them up in the site's JS bundle. */
async function findBundleText() {
  try {
    const html = await (await get(`${SITE}/`)).text();
    const bundle = html.match(/\/assets\/index-[\w-]+\.js/);
    return bundle ? await (await get(`${SITE}${bundle[0]}`)).text() : "";
  } catch {
    return "";
  }
}

const force = process.argv.includes("--force");
const wanted = TARGETS.filter((target) => {
  const exists = existsSync(join(OUT_DIR, target.saveAs));
  if (exists && !force) console.log(`frontend/assets/${target.saveAs} already exists, skipping`);
  return force || !exists;
});
if (!wanted.length) process.exit(0);

const bundleText = await findBundleText();
await mkdir(OUT_DIR, { recursive: true });

let failures = 0;
for (const target of wanted) {
  const found = bundleText.match(target.pattern);
  const url = `${SITE}${found ? found[0] : target.fallback}`;
  try {
    const res = await get(url);
    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) throw new Error(`${url} is not an image (${type})`);
    const data = Buffer.from(await res.arrayBuffer());
    await writeFile(join(OUT_DIR, target.saveAs), data);
    console.log(`saved frontend/assets/${target.saveAs} (${Math.round(data.length / 1024)} KB)`);
  } catch (error) {
    failures += 1;
    console.error(`could not download ${target.saveAs}: ${error.message}`);
  }
}

if (failures) {
  console.error("\nAdd the missing photo(s) to frontend/assets/ by hand, using the file names above.");
  process.exit(1);
}
