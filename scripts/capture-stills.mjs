/**
 * Render the gallery stills from the property itself.
 *
 * The projects page promises that every image on it is a view of this
 * interactive model. This is how that promise is kept: the script drives the
 * real site in a real browser, moves the camera with the same controls a
 * visitor uses, hides the interface, and photographs the canvas. Nothing is
 * composited, retouched or sourced from anywhere else.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npm run capture:stills
 *
 * Writes public/renders/<name>.jpg. Needs a browser with WebGL; software
 * rendering works and is slow, which is why the waits are generous.
 */

import { mkdir, writeFile } from 'node:fs/promises';

// Playwright is not a dependency of the site — it is only needed to take
// these six pictures. Point PLAYWRIGHT_MODULE at a global install if it is
// not resolvable from here.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const OUT = new URL('../public/renders/', import.meta.url);

/** name, the rail button that frames it, and the aspect the tile wants. */
const SHOTS = [
  { name: 'overview', rail: null, w: 1600, h: 900 },
  { name: 'siding', rail: 'Siding', w: 1600, h: 900 },
  { name: 'windows', rail: 'Windows', w: 1200, h: 900 },
  { name: 'doors', rail: 'Doors', w: 900, h: 1200 },
  { name: 'decks', rail: 'Decks', w: 1200, h: 900 },
  { name: 'gutters', rail: 'Gutters', w: 1200, h: 900 },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

await mkdir(OUT, { recursive: true });

for (const shot of SHOTS) {
  const ctx = await browser.newContext({
    viewport: { width: shot.w, height: shot.h },
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  // `stills` pins render quality: the adaptive ladder would otherwise drop
  // the shadow map and the pixel ratio on a machine with no GPU, and these
  // are the one place where slow-and-correct beats fast.
  await page.goto(`${BASE}/?stills=1`, { waitUntil: 'networkidle' });
  await wait(6000);

  if (shot.rail) {
    await page.getByRole('button', { name: shot.rail, exact: true }).click({ force: true });
    await wait(5000);
  }

  // Everything that is interface rather than property.
  await page.evaluate(() => {
    const hide = '.stage__ui,.panel,.hotspots,.demotag,.dragcue,.stage__scrim,.stage__sky,.stage__floor,.header,.protobar,.compare,.transform';
    for (const el of document.querySelectorAll(hide)) el.style.display = 'none';
  });
  await wait(1200);

  const canvas = await page.locator('.stage__canvas canvas').first();
  const buffer = await canvas.screenshot({ type: 'jpeg', quality: 86 });
  await writeFile(new URL(`${shot.name}.jpg`, OUT), buffer);
  console.log(`${shot.name}.jpg  ${shot.w}x${shot.h}  ${(buffer.length / 1024).toFixed(0)} kB`);
  await ctx.close();
}

await browser.close();
