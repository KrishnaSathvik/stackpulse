import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateHTML } from '../../generator.js';
import { localDate } from '../../src/utils/dates.js';

const METRICS = [
  { key: 'sessions', label: 'Sessions', icon: '⚡' },
  { key: 'tokens_used', label: 'Tokens Used', icon: '◈' },
  { key: 'cost_usd', label: 'Cost', icon: '◊' },
];

const card = (over = {}) => ({
  title: 'My AI Coding Stack', timeframe: '2026', username: 'me', theme: 'dark', metrics: METRICS, heatmapData: [],
  tools: [{ key: 'claude_code', name: 'Claude Code', icon: '◆', color: '#D97706', metrics: { sessions: 3, tokens_used: 14.7, cost_usd: 0.04 } }],
  ...over,
});

test('every user-controlled string is escaped', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const html = generateHTML(card({
    title: evil, timeframe: '"><script>alert(2)</script>', username: '@"><svg onload=alert(3)>',
    tools: [{ key: 'x', name: evil, icon: '<i>', color: 'red;background:url(javascript:alert(4))',
      metrics: { sessions: 1, tokens_used: 1, cost_usd: 1 }, costInfo: { kind: 'estimated', unpricedModels: ['<b>m</b>'] } }],
    metrics: METRICS.map(m => ({ ...m, label: m.label + '<u>' })),
  }));
  for (const needle of ['<img', '<script>alert', '<svg onload', '<i>', '<b>m</b>', 'javascript:', '<u>']) {
    assert.equal(html.includes(needle), false, `unescaped: ${needle}`);
  }
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('unavailable metrics render as a dash; real zeros render as zero', () => {
  const html = generateHTML(card({ tools: [
    { key: 'cursor', name: 'Cursor', color: '#6E56CF', metrics: { sessions: 0, tokens_used: null, cost_usd: null } },
    { key: 'gemini', name: 'Gemini CLI', color: '#4285F4', metrics: { sessions: 2, tokens_used: 5, cost_usd: 0 } },
  ] }));
  const cells = [...html.matchAll(/<span class="bar-val"([^>]*)>([^<]*)<\/span>/g)].map(m => [m[2], /Not available/.test(m[1])]);
  assert.deepEqual(cells, [['0', false], ['—', true], ['—', true], ['2', false], ['5K', false], ['$0.00', false]]);
  assert.match(html, /1 of 2 tools/, 'stat strip states coverage when some tools lack a metric');
});

test('a sub-cent cost is shown as <$0.01, never as a free-looking $0.00', () => {
  const html = generateHTML(card({ tools: [{ key: 'qwen', name: 'Qwen Code', color: '#7C3AED', metrics: { sessions: 1, tokens_used: 1.8, cost_usd: 0.00297 } }] }));
  assert.match(html, /&lt;\$0\.01/);
  assert.doesNotMatch(html, /\$0\.00/, 'no $0.00 anywhere: cells, header, meta tags');
  assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ''), /<\$/, 'the "<" is escaped in markup');
  const share = decodeURIComponent(html.match(/tweet\?text=([^"]+)/)[1].replace(/&amp;/g, '&'));
  assert.match(share, /<\$0\.01/, 'share text is plain, not HTML-escaped');
});

test('a partial cost is marked as a lower bound on the total and on the tool row', () => {
  const html = generateHTML(card({ tools: [{ key: 'claude_code', name: 'Claude Code', color: '#D97706',
    metrics: { sessions: 3, tokens_used: 14.7, cost_usd: 0.5018 },
    costInfo: { kind: 'mixed', status: 'partial', unpricedModels: ['claude-zephyr-9-1'], pricingSource: 'ccusage 20.0.46 bundled prices' } }] }));
  assert.match(html, /Cost \(est\.\)/);
  assert.match(html, /not a subscription bill/);
  assert.match(html, /ccusage 20\.0\.46 bundled prices/);
  assert.match(html, /Lower bound: some usage has no known price \(claude-zephyr-9-1\)/);
  assert.equal((html.match(/class="s-flag">\*</g) || []).length, 2, 'stat total and tool cell both starred');
});

test('a complete cost is not starred; unpriced models in unavailable tools are named, not called a lower bound', () => {
  const html = generateHTML(card({ tools: [
    { key: 'codex', name: 'Codex', color: '#10A37F', metrics: { sessions: 1, tokens_used: 9.5, cost_usd: 0.03 },
      costInfo: { kind: 'estimated', status: 'complete', unpricedModels: [] } },
    { key: 'amp', name: 'Amp', color: '#EC4899', metrics: { sessions: 1, tokens_used: 1, cost_usd: null },
      costInfo: { kind: 'unavailable', status: 'unavailable', unpricedModels: ['mystery-1'] } },
  ] }));
  assert.equal(/class="s-flag"/.test(html), false);
  assert.doesNotMatch(html, /Lower bound/);
  assert.match(html, /No known price for: mystery-1/);
  assert.match(html, /1 of 2 tools/);
});

test('recorded-only cost is not labelled as an estimate', () => {
  const html = generateHTML(card({ tools: [{ key: 'roocode', name: 'Roo Code', color: '#00BCD4',
    metrics: { sessions: 2, tokens_used: 1, cost_usd: 0.26 }, costInfo: { kind: 'recorded', status: 'complete', unpricedModels: [] } }] }));
  assert.doesNotMatch(html, /\(est\.\)/);
});

test('heatmap uses local calendar dates (no UTC shift)', () => {
  for (const tz of ['Asia/Kolkata', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    process.env.TZ = tz;
    const today = localDate(new Date());
    const html = generateHTML(card({ heatmapData: [{ toolKey: 'claude_code', date: today, sessions: 4 }] }));
    assert.ok(html.includes(`title="${today}: 4 sessions"`), `today's cell present in ${tz}`);
  }
  process.env.TZ = 'UTC';
});

test('share link is built from raw text, not HTML entities', () => {
  const html = generateHTML(card({ title: 'Me & AI' }));
  const href = html.match(/href="(https:\/\/twitter\.com[^"]+)"/)[1];
  const text = decodeURIComponent(href.split('text=')[1].replace(/&amp;/g, '&'));
  assert.ok(text.startsWith('Me & AI\n'));
});

test('incomplete coverage is marked on the tool and explained, never shown as complete', () => {
  const html = generateHTML(card({ tools: [{ key: 'antigravity', name: 'Antigravity', color: '#1A73E8',
    metrics: { sessions: 2, tokens_used: null, cost_usd: null },
    coverage: { status: 'partial', reasons: ["Skipping unreadable Antigravity database '/x/<a>.db'"] } }] }));
  assert.match(html, /<span class="t-name">Antigravity<\/span><sup class="s-flag"[^>]*>†<\/sup>/);
  assert.match(html, /† Incomplete: Antigravity — Skipping unreadable Antigravity database &#39;\/x\/&lt;a&gt;\.db&#39;\. Its figures are lower bounds\./);
});

test('any incomplete source flags the TOTALS too, not only its row', () => {
  const html = generateHTML(card({ tools: [
    { key: 'claude_code', name: 'Claude Code', color: '#D97706', metrics: { sessions: 3, tokens_used: 14.7, cost_usd: 0.04 } },
    { key: 'antigravity', name: 'Antigravity', color: '#1A73E8', metrics: { sessions: 2, tokens_used: 1, cost_usd: 0.01 },
      coverage: { status: 'partial', reasons: ['Skipping unreadable Antigravity database'] } },
  ] }));
  const stats = [...html.matchAll(/<div class="s-val">([\s\S]*?)<\/div>/g)].map(m => m[1]);
  assert.equal(stats.length, 3);
  assert.ok(stats.every(s => s.includes('†')), 'every total carries the incomplete mark');
  assert.match(html, /<div class="hdr-sub">[^<]*incomplete data<\/div>/);
  assert.match(html, /og:description" content="[^"]*incomplete data/);
  assert.match(html, /† Totals are incomplete: 1 source was only partly readable, so every total is a lower bound\./);
});

test('complete sources: no incomplete marks anywhere', () => {
  const html = generateHTML(card());
  assert.doesNotMatch(html, /†|incomplete/i);
});

test('billions of tokens read as B, not thousands of M', () => {
  const html = generateHTML(card({ tools: [
    { key: 'codex', name: 'Codex', color: '#10A37F', metrics: { sessions: 488, tokens_used: 6_731_846.161, cost_usd: 6985.52 } },
    { key: 'cursor', name: 'Cursor', color: '#6E56CF', metrics: { sessions: 2, tokens_used: 999.9, cost_usd: null } },
  ] }));
  assert.ok(html.includes('>6.73B<'), 'row value');
  assert.ok(html.includes('999.9K'), 'below 1M stays in K');
  assert.doesNotMatch(html, /\d{4,}\.\dM/, 'no "6731.8M"-style values anywhere, header included');
});

test('heatmap summary does not show a session total that disagrees with the card; 1 session is singular', () => {
  const html = generateHTML(card({
    tools: [{ key: 'codex', name: 'Codex', color: '#10A37F', isParentHeader: true, metrics: { sessions: 1, tokens_used: 5, cost_usd: 1 } }],
    heatmapData: [-1, -2].map(n => { const d = new Date(); d.setDate(d.getDate() + n); return { toolKey: 'codex', date: localDate(d), sessions: 1, tokens: 5, cost: 1 }; }),
  }));
  assert.match(html, /class="hm-summary">2 active days</);
  assert.ok(html.includes('>1 session<'));
});

test('active days count distinct dates: one day used in two tools is one active day', () => {
  const today = localDate(new Date());
  const html = generateHTML(card({
    tools: [
      { key: 'codex', name: 'Codex', color: '#10A37F', metrics: { sessions: 2, tokens_used: 5, cost_usd: 1 } },
      { key: 'cursor', name: 'Cursor', color: '#6E56CF', metrics: { sessions: 3, tokens_used: null, cost_usd: null } },
    ],
    heatmapData: [{ toolKey: 'codex', date: today, sessions: 2, tokens: 5, cost: 1 }, { toolKey: 'cursor', date: today, sessions: 3, tokens: 0, cost: 0 }],
  }));
  assert.match(html, /class="hm-summary">1 active day</);
});
