#!/usr/bin/env node
// Screenshots the real StackPulse HTML cards produced by drive-cli.py and writes
// web-ready crops into src/assets/shots/:
//   card-<theme>      the full report above its footer (themes section)     2× density
//   theme-<theme>     top of the report, for the theme thumbnails           2× density
//   tokens-<l|d>      token composition close-up (docs)                     3× density
//   tokens-m-<l|d>    the same at phone width (400px)                       3× density
// Cards are cropped above their footer (the footer holds the X share button,
// which the website does not advertise).
//
//   PUPPETEER=<path to puppeteer's esm entry> CHROME=<chrome binary> \
//     node scripts/capture.mjs <dir with <theme>/card.html> <out dir>
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [cardsDir, outDir] = process.argv.slice(2);
const { default: puppeteer } = await import(process.env.PUPPETEER);
const THEMES = ['dark', 'light', 'cosmic', 'forge', 'arctic', 'verdant', 'neon'];
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({ executablePath: process.env.CHROME, headless: true });
const webp = (png, name) => execFileSync('cwebp', ['-quiet', '-q', '84', '-m', '6', png, '-o', join(outDir, `${name}.webp`)]);

async function open(theme, scale, width = 1280) {
  const page = await browser.newPage();
  await page.setViewport({ width, height: 1000, deviceScaleFactor: scale, isMobile: width < 720 });
  await page.goto(`file://${join(cardsDir, theme, 'card.html')}`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 2500));   // entry animations
  const box = (sel) => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; });
  const tmp = join(cardsDir, theme, 'shot.png');
  const take = async (clip, name) => { await page.screenshot({ path: tmp, clip, captureBeyondViewport: true }); webp(tmp, name); };
  return { page, box, take };
}

for (const theme of THEMES) {
  const { page, box, take } = await open(theme, 2);
  const card = await box('.card'), footer = await box('.footer');
  await take({ x: card.x, y: card.y, width: card.width, height: Math.min(640, footer.y - card.y) }, `theme-${theme}`);
  await take({ ...card, height: footer.y - card.y }, `card-${theme}`);   // the full report, every theme
  await page.close();

  if (theme === 'dark' || theme === 'light') {
    const z = await open(theme, 3);
    await z.take(await z.box('.tok-section'), `tokens-${theme}`);
    await z.page.close();
  }
  // Phone capture: token composition total, bar and legend at phone width.
  if (theme === 'dark' || theme === 'light') {
    const m = await open(theme, 3, 400);
    const tok = await m.box('.tok-section'), legend = await m.box('.tok-legend');
    await m.take({ x: tok.x, y: tok.y, width: tok.width, height: legend.y + legend.height + 10 - tok.y }, `tokens-m-${theme}`);
    await m.page.close();
  }
  console.log('captured', theme);
}
await browser.close();
