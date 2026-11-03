#!/usr/bin/env node
/**
 * render.js — render prototype report cards to SVG and PNG.
 *
 *   node render.js --all
 *   node render.js --data fixture --style pulse
 *
 * Datasets:
 *   sample   illustrative 13-tool data (marked SAMPLE DATA on the card)
 *   fixture  real collector output for tests/fixtures/home-basic, via the M1 normalizer
 *   single   one sessions-only tool (no tokens, no cost)
 *   empty    no data at all
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import { buildViewModel } from './view-model.js';
import { renderPulse } from './styles/pulse.js';
import { renderEditorial } from './styles/editorial.js';
import { normalizeCcusageReport } from '../../src/collectors/ccusage.js';
import { sampleTools } from './data/sample.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES = { pulse: renderPulse, editorial: renderEditorial };

// Explicit font files; no system font lookup, so output is reproducible.
// A shipped build would bundle these (Inter and JetBrains Mono are OFL-licensed).
const FONT_DIRS = [join(HERE, 'fonts'), '/usr/share/fonts/opentype/inter', '/usr/share/fonts/truetype/jetbrains-mono', '/usr/share/fonts/truetype'];
const FONT_FILES = ['Inter-Regular.otf', 'Inter-Medium.otf', 'Inter-SemiBold.otf', 'Inter-Bold.otf',
  'InterDisplay-SemiBold.otf', 'InterDisplay-Bold.otf', 'InterDisplay-ExtraBold.otf',
  'JetBrainsMono-Regular.ttf', 'JetBrainsMono-SemiBold.ttf'];

export const FONT_FILE_NAMES = FONT_FILES;
export { STYLES };

// Glyph fallbacks for scripts/emoji our fonts don't cover (CJK, Arabic, emoji in
// model IDs). Taken from the OS when present — bundling them would add ~17 MB.
const FALLBACK_FONTS = [
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
  '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',
  '/System/Library/Fonts/Hiragino Sans GB.ttc', '/System/Library/Fonts/Apple Color Emoji.ttc',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf', '/System/Library/Fonts/GeezaPro.ttc',
  'C:\\Windows\\Fonts\\msyh.ttc', 'C:\\Windows\\Fonts\\seguiemj.ttf', 'C:\\Windows\\Fonts\\arial.ttf',
];
export const fallbackFontFiles = () => FALLBACK_FONTS.filter(existsSync);

export function fontFiles() {
  const found = [];
  for (const f of FONT_FILES) {
    const hit = FONT_DIRS.map(d => join(d, f)).find(existsSync);
    if (hit) found.push(hit); else console.warn('  font not found:', f);
  }
  return found;
}

const day = (i, base = '2026-10-01') => new Date(Date.parse(base + 'T00:00:00Z') + i * 86_400_000).toISOString().slice(0, 10);

export const DATASETS = ['sample', 'fixture', 'single', 'empty', 'hostile', 'year', 'extremes'];

export function dataset(name) {
  switch (name) {
    case 'sample': return { tools: sampleTools(), end: '2026-10-31', username: 'latentengineer', sample: true };
    case 'fixture': {
      const raw = JSON.parse(readFileSync(join(HERE, '../../tests/fixtures/ccusage-20.0.46/home-basic.by-agent.json'), 'utf-8'));
      return { tools: normalizeCcusageReport(raw).tools, end: '2026-10-31' };
    }
    case 'single': return { tools: { cursor: { sessions: 42, tokens_used: null, cost_usd: null,
      daily: [3, 8, 12, 17, 22].map((d, i) => ({ date: `2026-10-${String(d).padStart(2, '0')}`, toolKey: 'cursor', sessions: [4, 9, 12, 7, 10][i] })) } },
      end: '2026-10-31' };
    case 'empty': return { tools: {}, end: '2026-10-31' };
    case 'hostile': {
      const evil = ['</text><script>alert(1)</script>', '"><image href="https://evil.example/x.png"/>',
        'モデル-超長い名前-'.repeat(6), 'نموذج-عربي-طويل-جدا-للاختبار', '🤖🔥-emoji-model', 'x'.repeat(200)];
      const daily = [{ date: '2026-10-30', sessions: 2, totalTokens: 5000, totalCost: 0.01 }];
      return { username: '<svg onload=alert(1)>', end: '2026-10-31', tools: {
        claude_code: { sessions: 2, tokens_used: 5, cost: { usd: 0.01, kind: 'estimated', status: 'complete' },
          modelBreakdown: evil.map((m, i) => ({ model: m, tokens_used: 5 - i * 0.5 })), daily },
        'evil<tool>"&': { sessions: 1, tokens_used: 1, daily: [{ date: '2026-10-29', sessions: 1, totalTokens: 1000 }] },
      } };
    }
    case 'year': {
      const daily = Array.from({ length: 365 }, (_, i) => ({ date: day(i, '2025-11-01'), sessions: 1 + (i % 5), totalTokens: 50_000 + ((i * 7919) % 400_000) }));
      return { end: '2026-10-31', days: 365, tools: { claude_code: { sessions: 999, tokens_used: 1, daily,
        modelBreakdown: [{ model: 'claude-opus-4-6', tokens_used: 100_000 }] } } };
    }
    case 'extremes': return { end: '2026-10-31', tools: {
      claude_code: { sessions: 123_456_789, tokens_used: 3e9, cost: { usd: 9_876_543.21, kind: 'estimated', status: 'complete' },
        modelBreakdown: [{ model: 'claude-opus-4-6', tokens_used: 3e9 }], daily: [{ date: '2026-10-31', sessions: 123_456_789, totalTokens: 3e12, totalCost: 9_876_543.21 }] },
      codex: { sessions: 1, tokens_used: 0.001, modelBreakdown: [{ model: 'gpt-5-codex', tokens_used: 0.001 }], daily: [{ date: '2026-10-01', sessions: 1, totalTokens: 1 }] },
    } };
    default: throw new Error('unknown dataset ' + name);
  }
}

export function render(data, style, { png = true, outDir = join(HERE, 'out'), fonts = [...fontFiles(), ...fallbackFontFiles()] } = {}) {
  const vm = buildViewModel({ ...dataset(data), generatedAt: '2026-10-31' });
  const svg = STYLES[style](vm);
  mkdirSync(outDir, { recursive: true });
  const base = join(outDir, `${style}-${data}`);
  writeFileSync(base + '.svg', svg);
  if (png) {
    const t0 = Date.now();
    const img = new Resvg(svg, {
      fitTo: { mode: 'zoom', value: 2 },   // 2400×1260 for crisp retina sharing
      font: { loadSystemFonts: false, fontFiles: fonts, defaultFontFamily: 'Inter' },
    }).render();
    writeFileSync(base + '.png', img.asPng());
    return { svg: base + '.svg', png: base + '.png', ms: Date.now() - t0, size: `${img.width}x${img.height}` };
  }
  return { svg: base + '.svg' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > -1 ? process.argv[i + 1] : null; };
  const all = process.argv.includes('--all');
  const datas = all ? DATASETS : [arg('data') || 'sample'];
  const styles = all ? Object.keys(STYLES) : [arg('style') || 'pulse'];
  const fonts = [...fontFiles(), ...fallbackFontFiles()];
  for (const s of styles) for (const d of datas) {
    const r = render(d, s, { fonts });
    console.log(`${s.padEnd(10)} ${d.padEnd(8)} ${r.size}  ${r.ms}ms  ${r.png}`);
  }
}
