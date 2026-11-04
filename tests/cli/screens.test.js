// Terminal rendering: layouts at every supported width, warnings that must stay
// visible, and values that must never be mangled (model IDs, unknown costs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import chalk from 'chalk';
import { width, wrap, table, stripAnsi } from '../../src/cli/term.js';
import * as screens from '../../src/cli/screens.js';
import { AI_TOOLS, buildCardData, smartDefaultMetrics } from '../../src/cli/card.js';

const WIDTHS = [40, 60, 80, 100, 120, 160, 220];
// A line may exceed the width only if it is one unbreakable word (a path or model ID).
const fits = (lines, max) => lines.every(l => width(l) <= max || !stripAnsi(l).trim().includes(' '));
const flat = (lines) => lines.map(stripAnsi).join('\n').replace(/[\s\u00a0]+/g, ' ');

const claude = {
  sessions: 48, tokens_used: 4200030, cost_usd: 1834.25,
  tokens: { input: 30000, output: 15000000, cacheRead: 4050000000, cacheWrite: 135000000, total: 4200030000 },
  cost: { status: 'complete', kind: 'estimated' }, coverage: { status: 'complete', reasons: [] }, diagnostics: [],
  modelBreakdown: [
    { model: 'claude-opus-5-5', displayName: 'Opus 5.5', tokens: 4199729700, tokens_used: 4199729.7, cost_usd: 1833.11, costStatus: 'complete' },
    { model: 'claude-zephyr-9-1-experimental-preview-20261101', displayName: 'claude-zephyr-9-1-experimental-preview-20261101', tokens: 300, tokens_used: 0.3, cost_usd: null, costStatus: 'unavailable' },
  ],
};
const cursor = { sessions: 1840, tokens_used: null, cost_usd: null, coverage: { status: 'partial', reasons: ['state.vscdb timed out after 120 s; sessions from it are missing.'] }, diagnostics: [] };
const kilo = { sessions: 4, tokens_used: 900, cost_usd: 0, cost: { status: 'complete', kind: 'recorded' } };
const scanOf = (results, extra = {}) => ({
  results, failed: {}, empty: [],
  missing: AI_TOOLS.map(t => t.key).filter(k => !results[k] && !(extra.failed || {})[k] && !(extra.empty || []).includes(k)),
  ...extra,
});

test('wrap never splits a word: a long model ID or path stays whole and copyable', () => {
  const id = 'claude-zephyr-9-1-experimental-preview-20261101';
  const lines = wrap(`Model ${id} has no price`, 20);
  assert.ok(lines.includes(id), lines.join('|'));
  assert.ok(lines.every(l => l === id || width(l) <= 20));
});

test('width ignores ANSI escapes and counts wide characters as two columns', () => {
  assert.equal(width(chalk.level ? chalk.red('abc') : '\x1b[31mabc\x1b[39m'), 3);
  assert.equal(width('実験'), 4);
});

test('table falls back to a stacked list instead of overflowing', () => {
  const cols = [{ key: 'a', label: 'Model' }, { key: 'b', label: 'Tokens', align: 'right' }, { key: 'c', label: 'State', bare: true }];
  const rows = [{ a: 'x'.repeat(30), b: '1.2B', c: 'no price' }];
  const wide = table(cols, rows, { max: 80 });
  assert.match(stripAnsi(wide[0]), /Model\s+Tokens\s+State/);
  const narrow = table(cols, rows, { max: 30 }).map(l => stripAnsi(l).replace(/\u00a0/g, ' '));
  assert.deepEqual(narrow, ['  ' + 'x'.repeat(30), '    tokens 1.2B · no price']);
});

test('scan summary fits every width and keeps every tool, metric and warning', () => {
  const scan = scanOf({ claude_code: claude, cursor, kilocode: kilo }, { failed: { amp: 'collector ran out of memory' }, empty: ['gemini'] });
  scan.missing = scan.missing.filter(k => k !== 'amp' && k !== 'gemini');
  for (const max of WIDTHS) {
    const lines = screens.scanSummary(scan, { max });
    const text = lines.map(stripAnsi).join('\n');
    assert.ok(fits(lines, max), `overflow at ${max}:\n${text}`);
    for (const s of ['Claude Code', 'Cursor', 'Kilo Code', '1,840', '$1,834.25 est.', '$0.00 rec.', 'incomplete',
      'state.vscdb timed out', 'Amp could not be read: collector ran out of memory', 'Installed, no usage yet: Gemini CLI',
      '5 tools detected', '8 not found', 'not a bill']) {
      assert.ok(flat(lines).includes(s), `missing "${s}" at ${max}:\n${text}`);
    }
  }
});

test('unknown values show — and a real zero shows $0.00', () => {
  const text = screens.scanSummary(scanOf({ cursor: { ...cursor, coverage: null }, kilocode: kilo }), { max: 100 }).map(stripAnsi).join('\n');
  assert.match(text, /Cursor\s+1,840\s+—\s+—/);
  assert.match(text, /Kilo Code\s+4\s+900K\s+\$0\.00 rec\./);
});

test('a lower-bound cost is marked ≥ and explained', () => {
  const text = screens.scanSummary(scanOf({ claude_code: { ...claude, cost: { status: 'partial', kind: 'estimated' } } }), { max: 100 }).map(stripAnsi).join('\n');
  assert.match(text, /≥\$1,834\.25 est\./);
  assert.match(text, /lower bound/);
});

test('no tools at all: a clear explanation and a way forward', () => {
  const text = screens.scanSummary(scanOf({}), { max: 80 }).map(stripAnsi).join('\n');
  assert.match(text, /0 tools detected · 13 not found/);
  assert.match(text, /None of the 13 supported tools/);
  assert.match(text.replace(/\s+/g, ' '), /Customize report/);
});

test('one row per tool even with every tool present and a huge model history', () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ model: `model-${i}`, displayName: `model-${i}`, tokens: 1000 * (i + 1), tokens_used: i + 1, cost_usd: i, costStatus: 'complete' }));
  const results = Object.fromEntries(AI_TOOLS.map(t => [t.key, { ...claude, modelBreakdown: many }]));
  const lines = screens.scanSummary(scanOf(results), { max: 100 });
  const text = lines.map(stripAnsi).join('\n');
  assert.match(text, /13 tools detected · 0 not found/);
  assert.ok(!text.includes('model-1'), 'models are not printed in the summary');
  assert.ok(lines.length < 30, `summary is ${lines.length} lines`);
  const details = screens.toolDetails('claude_code', results.claude_code, { max: 100 }).map(stripAnsi).join('\n');
  assert.ok(details.includes('model-299') && details.includes('model-0'), 'details list every model');
});

test('details show token composition and full model IDs, never truncated', () => {
  for (const max of WIDTHS) {
    const lines = screens.toolDetails('claude_code', claude, { max });
    const text = lines.map(stripAnsi).join('\n');
    assert.ok(fits(lines, max), `overflow at ${max}:\n${text}`);
    assert.ok(text.includes('claude-zephyr-9-1-experimental-preview-20261101'), text);
    assert.ok(text.includes('claude-opus-5-5'));
    assert.match(text, /Cache reads\s+4\.05B\s+96\.4%/);
    assert.match(text, /no\sprice/);
    assert.match(text, /cache reads/);
  }
});

test('detection details list all 13 tools with a state each', () => {
  const scan = scanOf({ claude_code: claude }, { failed: { cursor: 'locked' } });
  scan.missing = scan.missing.filter(k => k !== 'cursor');
  const text = screens.detectionDetails(scan, { max: 80 }).map(stripAnsi).join('\n');
  for (const t of AI_TOOLS) assert.ok(text.includes(t.name), t.name);
  assert.match(text, /Claude Code\s+✓ data found/);
  assert.match(text, /Cursor\s+✖ could not be read/);
  assert.match(text, /Aider\s+— not found/);
});

test('completion screen: file, theme, tools, coverage warning; no share URL', () => {
  const scanned = { claude_code: claude, cursor };
  const cardData = buildCardData({ scanned, selectedKeys: ['claude_code', 'cursor'], selectedMetrics: smartDefaultMetrics(scanned),
    details: { title: 't', timeframe: 'f', username: '', theme: 'light' } });
  for (const max of WIDTHS) {
    const lines = screens.completion({ htmlPath: '/home/me/stackpulse.html', displayPath: 'stackpulse.html', theme: 'light', cardData, openHint: 'open stackpulse.html' }, { max });
    const text = lines.map(stripAnsi).join('\n');
    assert.ok(fits(lines, max), `overflow at ${max}:\n${text}`);
    assert.match(text, /Report generated/);
    assert.match(text, /File\s+stackpulse\.html/);
    assert.match(text, /Theme\s+light/);
    assert.match(text.replace(/\s+/g, ' '), /2 included \(Claude Code, Cursor\)/);
    assert.match(text.replace(/\s+/g, ' '), /lower bounds: Cursor was only partly read/);
    assert.match(flat(lines), /open stackpulse\.html/);
    assert.doesNotMatch(text, /twitter|intent\/tweet|https?:/);
  }
});

test('states never rely on colour alone', () => {
  const level = chalk.level;
  chalk.level = 0;
  try {
    const scan = scanOf({ claude_code: claude, cursor }, { failed: { amp: 'boom' } });
    scan.missing = scan.missing.filter(k => k !== 'amp');
    const lines = screens.scanSummary(scan, { max: 100 });
    const text = lines.join('\n');
    assert.doesNotMatch(text, /\x1b\[/, 'no escape codes without colour');
    assert.match(text, /! Scan complete/);
    assert.match(text, /! Cursor:/);
    assert.match(text, /✖ Amp could not be read/);
  } finally { chalk.level = level; }
});

test('ordinary text is never forced white or dim', () => {
  const level = chalk.level;
  chalk.level = 3;
  try {
    const scan = scanOf({ claude_code: claude, cursor, kilocode: kilo }, { failed: { amp: 'boom' }, empty: ['gemini'] });
    const all = [
      ...screens.header('9.9.9'), ...screens.scanSummary(scan, { max: 100 }),
      ...screens.toolDetails('claude_code', claude, { max: 100 }), ...screens.detectionDetails(scan, { max: 100 }),
    ].join('\n');
    // 2 = dim/faint, 37/97 = white / bright white, 90 = gray, 34 = blue (dark on black), 33 = yellow (pale on white)
    assert.doesNotMatch(all, /\x1b\[(2|37|97|90|34|33)m/);
  } finally { chalk.level = level; }
});

test('NO_COLOR turns colour off even on a colour TTY; FORCE_COLOR still wins', async () => {
  const { colorLevel } = await import('../../src/cli/term.js');
  assert.equal(colorLevel({ NO_COLOR: '1' }, 3), 0);
  assert.equal(colorLevel({ NO_COLOR: '' }, 3), 3, 'empty NO_COLOR is ignored, per no-color.org');
  assert.equal(colorLevel({}, 2), 2);
  assert.equal(colorLevel({ NO_COLOR: '1', FORCE_COLOR: '1' }, 1), 1);
});

// ─── Codex corrections ───────────────────────────────────────────────────────
const codexTier = {
  sessions: 312, tokens_used: 3150000, cost_usd: 2186.40,
  tokens: { input: 98000000, output: 9500000, cacheRead: 3042500000, cacheWrite: 0, total: 3150000000 },
  cost: { status: 'complete', kind: 'estimated', tier: { unrecorded: 'standard', configured: 'priority', configuredUsd: 2911.75, dependentUsd: 725.35 } },
  coverage: { status: 'complete', reasons: [] },
  diagnostics: [{ level: 'info', code: 'codex-forks-recovered', message: '3 forked subagent sessions (6.2M tokens) that the collector skipped are included; history replayed from the parent session is not counted again.' }],
  modelBreakdown: [{ model: 'gpt-5.6-sol', displayName: 'gpt-5.6-sol', tokens: 1700000000, tokens_used: 1700000, cost_usd: 920.15, costStatus: 'complete' }],
};

test('a tier-dependent cost names its assumption and the alternative, at every width', () => {
  for (const max of WIDTHS) {
    const out = screens.scanSummary(scanOf({ codex: codexTier }), { max });
    const text = flat(out);
    assert.match(text, /\$2,186\.40/);
    assert.match(text, /Codex: usage that recorded no service tier is costed at the standard rate/);
    assert.match(text, /"priority" tier .* would be \$2,911\.75 \(\+\$725\.35\)/);
    assert.ok(fits(out, max), `width ${max}`);
  }
});

test('informational collector notes appear in details, not as warnings', () => {
  const summary = flat(screens.scanSummary(scanOf({ codex: codexTier }), { max: 100 }));
  assert.doesNotMatch(summary, /forked subagent sessions/);
  const details = flat(screens.toolDetails('codex', codexTier, { max: 100 }));
  assert.match(details, /· 3 forked subagent sessions \(6\.2M tokens\)/);
  assert.match(details, /would be \$2,911\.75/);
  const warned = { ...codexTier, diagnostics: [{ level: 'warn', message: '2 forked subagent sessions could not be separated' }] };
  assert.match(flat(screens.scanSummary(scanOf({ codex: warned }), { max: 100 })), /! Codex: 2 forked subagent sessions could not be separated/);
});

test('no tier note when the cost does not depend on one', () => {
  assert.equal(screens.tierNote('codex', { ...codexTier, cost: { status: 'complete', kind: 'estimated' } }), null);
  assert.doesNotMatch(flat(screens.scanSummary(scanOf({ claude_code: claude }), { max: 100 })), /service tier/);
});

test('the heading never wraps mid-word: the tagline is dropped when it does not fit', () => {
  const plain = (l) => l.map(stripAnsi);
  assert.deepEqual(plain(screens.header('3.4.0', { max: 100 })), ['  StackPulse 3.4.0  ·  AI coding usage report']);
  assert.deepEqual(plain(screens.header('3.4.0', { max: 40 })), ['  StackPulse 3.4.0']);
});
