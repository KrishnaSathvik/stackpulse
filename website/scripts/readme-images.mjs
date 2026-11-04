#!/usr/bin/env node
// README images, from the same fictional demo data as the website:
//   assets/cli-dark.png   the terminal summary and menu (src/data/terminal-capture.json)
//   assets/card-dark.png  the dark report, cropped above its footer
//
//   PUPPETEER=<puppeteer esm entry> node scripts/readme-images.mjs <dir with dark/card.html> <repo assets dir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [cardsDir, assetsDir] = process.argv.slice(2);
const { default: puppeteer } = await import(process.env.PUPPETEER);
const capture = JSON.parse(readFileSync(new URL('../src/data/terminal-capture.json', import.meta.url), 'utf-8'));

// Same palette as the website's terminal panels (styles.css .t-*).
const COLOR = { default: '#e2e8f0', white: '#e2e8f0', green: '#4ade80', cyan: '#22d3ee', magenta: '#f0abfc', red: '#f87171', yellow: '#fbbf24' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const body = capture.menu.map(spans => '<div>' + (spans.length
  ? spans.map(s => `<span style="color:${COLOR[s.c] || COLOR.default};${s.b ? 'font-weight:700' : ''}">${esc(s.t)}</span>`).join('')
  : '&nbsp;') + '</div>').join('');
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:28px;background:transparent;font-family:'JetBrains Mono',ui-monospace,Menlo,monospace}
.t{display:inline-block;background:#0b0f14;border:1px solid #1f2937;border-radius:12px;overflow:hidden}
.bar{display:flex;align-items:center;gap:8px;height:34px;padding:0 14px;background:#111827;border-bottom:1px solid #1f2937;color:#7b8aa0;font-size:12px}
.bar i{width:11px;height:11px;border-radius:50%;background:#ff5f57}.bar i:nth-child(2){background:#febc2e}.bar i:nth-child(3){background:#28c840}.bar span{margin-left:8px}
pre{margin:0;padding:16px 22px 20px;font:13.5px/1.7 inherit;white-space:pre}
.cmd{color:#e2e8f0;margin-bottom:4px}.cmd b{color:#2dd4bf;font-weight:500}
</style><link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<div class="t"><div class="bar"><i></i><i></i><i></i><span>zsh — stackpulse</span></div>
<pre><div class="cmd"><b>~/Projects</b> $ npx stackpulse</div>${body}</pre></div>`;

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 300));
await (await page.$('.t')).screenshot({ path: join(assetsDir, 'cli-dark.png'), omitBackground: true });

const card = await browser.newPage();
await card.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 2 });
await card.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await card.goto(`file://${join(cardsDir, 'dark', 'card.html')}`, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 300));
const box = await (await card.$('.card')).boundingBox();     // page is at scroll 0, so these are page coordinates
const foot = await (await card.$('.footer')).boundingBox();
await card.screenshot({ path: join(assetsDir, 'card-dark.png'), clip: { x: box.x, y: box.y, width: box.width, height: foot.y - box.y }, captureBeyondViewport: true });
await browser.close();
console.log('wrote cli-dark.png and card-dark.png');
