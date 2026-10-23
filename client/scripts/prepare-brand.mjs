/**
 * Builds `public/brand/` and the app icons from the master brand files.
 *
 * Run once, or again whenever a master file changes:
 *   npm run brand
 *
 * The masters live outside this repository (they are shared design assets,
 * not application code) and are read-only. Nothing here writes to them.
 *
 * Outputs:
 *   public/brand/kit-logo.png            600px wide wordmark, for the sidebar
 *                                        and the sign-in lockup
 *   public/brand/kit-logo@2x.png         1200px, for high-density screens
 *   public/brand/kit-mark.png            128px square, the "<" bracket, for
 *                                        the collapsed sidebar
 *   public/brand/starnova-logo-dark.svg  dark wordmark, for the light theme
 *   public/brand/starnova-logo-light.svg white wordmark, for the dark theme
 *   public/brand/starnova-mark.svg       square logomark
 *   app/icon.png                         512px favicon / PWA icon
 *   app/apple-icon.png                   180px Apple touch icon
 */
import { mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(here, "..");
const BRAND_OUT = path.join(CLIENT_ROOT, "public", "brand");
const APP_DIR = path.join(CLIENT_ROOT, "src", "app");

// Masters, outside the repository. Read-only.
const KIT_BRANDING = path.resolve(
  CLIENT_ROOT,
  "..",
  "..",
  "Branding"
);
const STARNOVA_BRANDING = path.resolve(
  CLIENT_ROOT,
  "..",
  "..",
  "..",
  "Branding",
  "new-logo",
  "svg"
);

const KIT_LOGO = path.join(KIT_BRANDING, "kids logo.png");

/**
 * Padding around the square mark, as a fraction of the square.
 *
 * The mark is the whole logotype letterboxed into a transparent square, not a
 * crop. An earlier version cropped the opening "<" bracket, on the reasoning
 * that a 2.1:1 wordmark goes muddy in a 36px slot — but a lone chevron in a
 * dark tile does not read as Kids In Tech at all, which is worse than small.
 */
const MARK_PADDING = 0.08;

async function buildKitLogo() {
  // `trim` removes the master's transparent margin so the rendered logo is
  // optically the size the layout asks for, rather than mostly padding.
  const trimmed = await sharp(KIT_LOGO).trim({ threshold: 10 }).toBuffer();

  for (const [name, width] of [
    ["kit-logo.png", 600],
    ["kit-logo@2x.png", 1200],
  ]) {
    await sharp(trimmed)
      .resize({ width, withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toFile(path.join(BRAND_OUT, name));
  }

  const meta = await sharp(path.join(BRAND_OUT, "kit-logo.png")).metadata();
  console.log(`  kit-logo.png        ${meta.width}x${meta.height}`);
}

/** The square mark — the full logotype, letterboxed, at any size. */
async function markBuffer(size) {
  const trimmed = await sharp(KIT_LOGO).trim({ threshold: 10 }).toBuffer();
  const pad = Math.round(size * MARK_PADDING);

  return sharp(trimmed)
    .resize(size - pad * 2, size - pad * 2, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function buildKitMark() {
  // 256, not 128: the collapsed sidebar renders it at 36px on a 2x or 3x
  // screen, and a letterboxed wordmark has far less margin for softness than
  // a single glyph did.
  await writeFile(path.join(BRAND_OUT, "kit-mark.png"), await markBuffer(256));
  console.log("  kit-mark.png        256x256");
}

async function buildAppIcons() {
  // Next.js serves app/icon.png as the favicon and app/apple-icon.png as the
  // touch icon, by file convention. A transparent icon disappears against a
  // dark browser tab strip, so these get the navy brand background.
  const NAVY = { r: 11, g: 18, b: 32, alpha: 1 };

  for (const [name, size] of [
    ["icon.png", 512],
    ["apple-icon.png", 180],
  ]) {
    const mark = await markBuffer(size);
    await sharp({
      create: { width: size, height: size, channels: 4, background: NAVY },
    })
      .composite([{ input: mark }])
      .png({ compressionLevel: 9 })
      .toFile(path.join(APP_DIR, name));
    console.log(`  app/${name.padEnd(15)} ${size}x${size}`);
  }

  // The old Next.js starter favicon would otherwise win over app/icon.png.
  const oldFavicon = path.join(APP_DIR, "favicon.ico");
  await rm(oldFavicon, { force: true });
}

/**
 * Copies a StarNova SVG, stripping the fixed width/height.
 *
 * The masters are 390x54 and 253x253 with hard-coded attributes; without
 * removing them the browser ignores the CSS height and the wordmark renders
 * at 54px tall in a 16px slot. The viewBox is kept, so it scales cleanly.
 */
async function copyStarNovaSvg(from, to) {
  const svg = await readFile(path.join(STARNOVA_BRANDING, from), "utf8");
  const scalable = svg.replace(
    /<svg([^>]*?)\s+width="[^"]*"\s+height="[^"]*"/,
    "<svg$1"
  );
  await writeFile(path.join(BRAND_OUT, to), scalable, "utf8");
  console.log(`  ${to.padEnd(26)} from ${from}`);
}

/**
 * PNG renders of the StarNova wordmarks, for the certificate PDF.
 *
 * @react-pdf/renderer's <Image> takes raster formats only — it will not load
 * an .svg file — and the certificate footer needs the wordmark. Rendered at
 * 4x the printed size so it stays sharp on paper.
 */
async function buildStarNovaRasters() {
  for (const [from, to] of [
    ["StarNova-1.svg", "starnova-logo-dark.png"],
    ["StarNova.svg", "starnova-logo-light.png"],
  ]) {
    const svg = await readFile(path.join(STARNOVA_BRANDING, from));
    await sharp(svg, { density: 600 })
      .resize({ width: 780 })
      .png({ compressionLevel: 9 })
      .toFile(path.join(BRAND_OUT, to));
    console.log(`  ${to.padEnd(26)} 780x108`);
  }
}

async function main() {
  await mkdir(BRAND_OUT, { recursive: true });

  console.log("Building brand assets…\n");

  await buildKitLogo();
  await buildKitMark();

  // StarNova-1 is the dark wordmark (#0A0D12) and belongs on the light
  // theme; StarNova is the white one, for the dark theme. The file names say
  // which *ink* they carry, not which theme they are for, so they are
  // deliberately crossed here.
  await copyStarNovaSvg("StarNova-1.svg", "starnova-logo-dark.svg");
  await copyStarNovaSvg("StarNova.svg", "starnova-logo-light.svg");
  await copyStarNovaSvg("logomark.svg", "starnova-mark.svg");
  await buildStarNovaRasters();

  await buildAppIcons();

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nCould not build the brand assets:");
  console.error(err.message);
  console.error(
    "\nThe master files live outside this repository. Expected:\n" +
      `  ${KIT_LOGO}\n  ${STARNOVA_BRANDING}`
  );
  process.exit(1);
});
