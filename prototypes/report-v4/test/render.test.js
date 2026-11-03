// Renderer verification: security of the SVG surface, layout (measured, not
// estimated), font loading, and image snapshots.
//
//   npm test                       # verify
//   UPDATE_SNAPSHOTS=1 npm test    # accept intentional visual changes
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Resvg } from '@resvg/resvg-js';
import { buildViewModel } from '../view-model.js';
import { DATASETS, FONT_FILE_NAMES, STYLES, dataset, fallbackFontFiles, fontFiles } from '../render.js';

const PRIMARY = fontFiles();
const FALLBACK = fallbackFontFiles();
const FONTS = [...PRIMARY, ...FALLBACK];
const SNAP = new URL('../snapshots/', import.meta.url);
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';
const W = 1200, H = 630;

const opts = (zoom = 1, fonts = FONTS) => ({ fitTo: { mode: 'zoom', value: zoom }, font: { loadSystemFonts: false, fontFiles: fonts, defaultFontFamily: 'Inter' } });

// Tofu detection: a character with no glyph renders exactly like an unassigned code point.
const glyphPixels = (ch, fonts) => Buffer.from(new Resvg(
  `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="40"><rect width="60" height="40" fill="#fff"/><text x="5" y="28" font-family="Inter" font-size="22">${ch}</text></svg>`,
  opts(1, fonts)).render().pixels);
// A glyph is missing if it renders as the .notdef box OR draws no ink at all
// (e.g. bitmap colour-emoji fonts that resvg loads but cannot paint).
function missingGlyphs(chars, fonts) {
  const notdef = glyphPixels('\u{10FFFD}', fonts);
  const blank = glyphPixels('', fonts);
  return [...chars].filter(c => { const p = glyphPixels(c, fonts); return p.equals(notdef) || p.equals(blank); });
}
const isEmoji = (c) => /\p{Extended_Pictographic}/u.test(c);
const unescape = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#96;/g, '`').replace(/&amp;/g, '&');
const textChars = (svg) => new Set([...texts(svg).map(el => unescape(label(el))).join('')].filter(c => c.codePointAt(0) > 0x7e && c !== '\u2026'));
const svgFor = (data, style) => STYLES[style](buildViewModel({ ...dataset(data), generatedAt: '2026-10-31' }));

// Every <text> element our styles emit is a single line with attributes we control.
function texts(svg) {
  return [...svg.matchAll(/<text\b[^>]*>[^<]*<\/text>/g)].map(m => m[0]);
}

/** Real ink box of one text element, rendered alone with the same fonts. */
function measure(textEl) {
  const r = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${textEl}</svg>`, opts());
  const b = r.getBBox();
  return b && b.width > 0 ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
}

// Texts sharing a line need a visible gap: touching ink ("Amp4%") reads as one word.
const MIN_GAP = 3;
const pad = (b) => ({ x: b.x - MIN_GAP / 2, y: b.y, w: b.w + MIN_GAP, h: b.h });
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const label = (el) => el.match(/>([^<]*)</)?.[1] ?? '';

test('collision check catches touching labels (regression: legend "Amp4%")', () => {
  const amp = measure('<text x="100" y="300" font-family="Inter" font-size="13" font-weight="500">Amp</text>');
  const pct = measure(`<text x="${100 + 3 * 13 * 0.56 + 6}" y="300" font-family="'JetBrains Mono'" font-size="13">4%</text>`);
  assert.ok(overlap(pad(amp), pad(pct)) > 0, 'old 0.56em spacing must be flagged');
});

test('bundled fonts alone cannot draw CJK/Arabic/emoji (documents the fallback dependency)', () => {
  assert.deepEqual(missingGlyphs('A·—', PRIMARY), [], 'Latin and punctuation are covered by bundled fonts');
  assert.ok(missingGlyphs('モ超ن🤖', PRIMARY).length === 4);
});

test('emoji in model IDs render visibly in PNG', { todo: 'resvg cannot paint bitmap colour-emoji fonts (CBDT); needs an outline/SVG emoji font or a visible placeholder — 4.0 decision' }, () => {
  assert.deepEqual(missingGlyphs('🤖🔥', FONTS), []);
});

test('glyph detector flags both tofu and invisible glyphs', () => {
  assert.ok(missingGlyphs('\u{10FFFD}', FONTS).length === 1, 'notdef');
  assert.deepEqual(missingGlyphs('Aモن', FONTS), [], 'covered characters pass');
});

// ── Fonts ───────────────────────────────────────────────────────────────────
test('every bundled font file resolves (no silent substitution)', () => {
  assert.equal(PRIMARY.length, FONT_FILE_NAMES.length, `missing fonts: ${FONT_FILE_NAMES.filter(f => !PRIMARY.some(p => p.endsWith(f)))}`);
});

test('each font family used by the styles is the real face, not a fallback', () => {
  const width = (txt, family, weight = 400) => measure(`<text x="10" y="40" font-family="${family}" font-size="20" font-weight="${weight}">${txt}</text>`).w;
  // Monospace: narrow and wide glyphs have equal advance only if JetBrains Mono loaded
  assert.ok(Math.abs(width('iiiiiiii', "'JetBrains Mono'") - width('MMMMMMMM', "'JetBrains Mono'")) < 1, 'JetBrains Mono missing');
  // Inter Display has different metrics from Inter text; equal widths would mean fallback
  assert.notEqual(width('Tokens 38.4M', "'Inter Display'", 700).toFixed(1), width('Tokens 38.4M', 'Inter', 700).toFixed(1), 'Inter Display missing');
  // A family we don't ship must fall back (sanity check that the probe works)
  assert.equal(width('iiiiiiii', 'NoSuchFont').toFixed(1), width('iiiiiiii', 'Inter').toFixed(1));
});

for (const style of Object.keys(STYLES)) {
  for (const data of DATASETS) {
    const name = `${style}-${data}`;

    test(`${name}: SVG surface is inert (no script, handlers, external refs)`, () => {
      const svg = svgFor(data, style);
      assert.doesNotThrow(() => new Resvg(svg, opts()), 'well-formed SVG');
      // Check real markup only: escaped text content (e.g. "&lt;svg onload=…") is inert.
      const tags = [...svg.matchAll(/<\/?([a-zA-Z][\w:-]*)([^>]*)>/g)];
      const allowed = new Set(['svg', 'title', 'text', 'rect', 'line', 'path', 'g', 'clipPath']);
      for (const [, tag] of tags) assert.ok(allowed.has(tag), `unexpected element <${tag}>`);
      for (const [whole, , attrs] of tags) {
        const a = attrs.replace(/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/, '');
        assert.doesNotMatch(a, /\son[a-z]+\s*=/i, `event handler in ${whole.slice(0, 80)}`);
        assert.doesNotMatch(a, /href\s*=|javascript:|data:|https?:\/\//i, `reference in ${whole.slice(0, 80)}`);
        for (const m of a.matchAll(/url\(([^)]*)\)/g)) assert.match(m[1], /^#[\w-]+$/, `non-local url(): ${m[0]}`);
      }
      for (const el of texts(svg)) assert.doesNotMatch(label(el), /[<>]/, 'text content escaped');
    });

    test(`${name}: every text is inside the canvas and no two texts collide`, () => {
      const els = texts(svgFor(data, style));
      const boxes = els.map(el => ({ el, b: measure(el) })).filter(x => x.b);
      for (const { el, b } of boxes) {
        assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H,
          `"${label(el)}" outside canvas: ${JSON.stringify(b)}`);
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const area = overlap(pad(boxes[i].b), pad(boxes[j].b));
        assert.ok(area <= 0, `"${label(boxes[i].el)}" collides with "${label(boxes[j].el)}" (closer than ${MIN_GAP}px)`);
      }
    });

    test(`${name}: every character has a real glyph (no tofu boxes)`, { skip: FALLBACK.length === 0 && 'no OS fallback fonts found' }, () => {
      const missing = missingGlyphs(textChars(svgFor(data, style)), FONTS).filter(c => !isEmoji(c));
      assert.deepEqual(missing.map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()), []);
    });

    test(`${name}: renders at 2x share size`, () => {
      const img = new Resvg(svgFor(data, style), opts(2)).render();
      assert.equal(`${img.width}x${img.height}`, '2400x1260');
    });

    test(`${name}: matches visual snapshot`, () => {
      const svg = svgFor(data, style);
      const img = new Resvg(svg, opts(0.5)).render();
      const px = img.pixels;
      const file = new URL(`${name}.rgba.gz`, SNAP);
      const meta = new URL(`${name}.json`, SNAP);
      const svgHash = createHash('sha256').update(svg).digest('hex');
      if (UPDATE || !existsSync(file)) {
        mkdirSync(SNAP, { recursive: true });
        writeFileSync(file, gzipSync(px, { level: 9 }));
        writeFileSync(meta, JSON.stringify({ width: img.width, height: img.height, svgSha256: svgHash }, null, 2) + '\n');
        if (!UPDATE) assert.fail(`no snapshot existed for ${name}; wrote one — review it and rerun`);
        return;
      }
      const base = gunzipSync(readFileSync(file));
      const m = JSON.parse(readFileSync(meta, 'utf-8'));
      assert.equal(`${img.width}x${img.height}`, `${m.width}x${m.height}`);
      // Tolerate anti-aliasing differences across platforms; flag real layout changes.
      let diff = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (Math.abs(px[i] - base[i]) > 24 || Math.abs(px[i + 1] - base[i + 1]) > 24 || Math.abs(px[i + 2] - base[i + 2]) > 24) diff++;
      }
      const ratio = diff / (px.length / 4);
      assert.ok(ratio < 0.005, `${(ratio * 100).toFixed(2)}% of pixels changed (svg ${svgHash === m.svgSha256 ? 'unchanged' : 'changed'})`);
    });
  }
}
