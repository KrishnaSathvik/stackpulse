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
  for (const needle of ['<img src=x', '<script>alert', '<svg onload', '<i>', '<b>m</b>', 'javascript:', '<u>']) {
    assert.equal(html.includes(needle), false, `unescaped: ${needle}`);
  }
  // The only images are the embedded StackPulse logo (footer), never anything from input.
  assert.deepEqual([...html.matchAll(/<img [^>]*src="([^"]{0,22})/g)].map(m => m[1]), ['data:image/png;base64,']);
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

test('a cost that depends on an unrecorded service tier is marked and explained', () => {
  const tier = { unrecorded: 'standard', configured: 'priority', configuredUsd: 2911.75, dependentUsd: 725.35 };
  const html = generateHTML(card({ tools: [{ key: 'codex', name: 'Codex', icon: '◇', color: '#10A37F',
    metrics: { sessions: 312, tokens_used: 3150000, cost_usd: 2186.40 }, costInfo: { kind: 'estimated', status: 'complete', tier } }] }));
  assert.ok(html.includes('‡ Codex: usage that recorded no service tier is costed at the standard rate.'));
  assert.ok(html.includes('“priority” tier set in the current Codex config, the estimate would be $2,911.75'));
  assert.equal((html.match(/Depends on an unrecorded service tier/g) || []).length, 2, 'tool cost and total cost are marked');
  const plain = generateHTML(card());
  assert.ok(!plain.includes('service tier'));
});

// ─── Token composition, model IDs, provenance (3.4.0) ────────────────────────
import { buildCardData, tokenParts } from '../../src/cli/card.js';
import { toolDetails } from '../../src/cli/screens.js';

const scannedForComposition = () => ({
  claude_code: { sessions: 3, tokens_used: 4200030, cost_usd: 2.4, cost: { kind: 'estimated', status: 'complete' },
    tokens: { input: 30000, output: 15000000, cacheRead: 4050000000, cacheWrite: 135000000, total: 4200030000 },
    modelBreakdown: [{ model: 'claude-opus-5-5', displayName: 'Opus 5.5', tokens_used: 4200030, cost_usd: 2.4, costStatus: 'complete' }] },
  // Recorded total larger than its typed parts: the remainder is "other", never dropped.
  gemini: { sessions: 2, tokens_used: 3400, cost_usd: 1, cost: { kind: 'estimated', status: 'complete' },
    tokens: { input: 2100000, output: 312400, cacheRead: 932100, cacheWrite: 0, total: 3418400 } },
  kilocode: { sessions: 1, tokens_used: 10, cost_usd: 0.5, cost: { kind: 'recorded', status: 'complete' } },
});
const details = { title: 't', timeframe: 'f', username: '', theme: 'dark' };
const metricsAll = ['sessions', 'tokens_used', 'cost_usd'];

test('token composition: same counts as the collector, other remainder, uncovered tools named', () => {
  const scanned = scannedForComposition();
  const card = buildCardData({ scanned, selectedKeys: ['claude_code', 'gemini', 'kilocode'], selectedMetrics: metricsAll, details });
  const c = card.tokenComposition;
  assert.equal(c.tools.length, 2);
  assert.equal(c.totals.total, 4200030000 + 3418400);
  assert.equal(c.totals.other, 3418400 - (2100000 + 312400 + 932100));
  assert.equal(c.uncovered, 1, 'Kilo reports a total without a breakdown');
  const html = generateHTML(card);
  assert.ok(html.includes('Token composition'));
  assert.ok(html.includes('4.20B tokens'));
  assert.ok(html.includes('Other: tokens a tool counts in its total but does not split by type.'));
  assert.ok(html.includes('1 tool reports a token total without a breakdown by type'));
  assert.ok(html.includes('Cache reads are conversation context'));
});

test('the CLI details view and the report show the same composition for a tool', () => {
  const scanned = scannedForComposition();
  const parts = tokenParts(scanned.gemini.tokens);
  const cli = toolDetails('gemini', scanned.gemini, { max: 100 }).join('\n');
  const html = generateHTML(buildCardData({ scanned, selectedKeys: ['gemini'], selectedMetrics: metricsAll, details }));
  for (const v of ['2.1M', '312.4K', '932.1K', '73.9K', '3.4M']) {
    assert.ok(cli.includes(v), `CLI shows ${v}`);
    assert.ok(html.includes(v), `report shows ${v}`);
  }
  assert.equal(parts.other, 73900);
});

test('no composition when tokens are not selected, or when a token total was entered by hand', () => {
  const scanned = scannedForComposition();
  assert.equal(buildCardData({ scanned, selectedKeys: ['claude_code'], selectedMetrics: ['sessions'], details }).tokenComposition, null);
  const manual = buildCardData({ scanned, manualData: { claude_code: { tokens_used: 99 } }, selectedKeys: ['claude_code'], selectedMetrics: metricsAll, details });
  assert.equal(manual.tokenComposition, null);
  assert.ok(!generateHTML(manual).includes('Token composition'));
});

test('model rows show the exact model ID; cost cells say where the cost came from', () => {
  const scanned = scannedForComposition();
  scanned.claude_code.modelBreakdown.push({ model: 'claude-zephyr-9-1-experimental-preview-20261101', displayName: 'claude-zephyr-9-1-experimental-preview-20261101', tokens_used: 1, cost_usd: null, costStatus: 'unavailable' });
  const html = generateHTML(buildCardData({ scanned, selectedKeys: ['claude_code', 'kilocode'], selectedMetrics: metricsAll, details }));
  assert.ok(html.includes('<span class="model-name">Opus 5.5</span><span class="model-id">claude-opus-5-5</span>'));
  assert.ok(html.includes('claude-zephyr-9-1-experimental-preview-20261101'), 'long ID kept whole');
  assert.ok(!html.includes('<span class="model-id">claude-zephyr'), 'no duplicate ID when the name is the ID');
  assert.ok(html.includes('<span class="c-kind">est.</span>') && html.includes('<span class="c-kind">rec.</span>'));
});

test('keyboard and assistive access: focus styles, header scopes, labelled charts and scroll regions', () => {
  const html = generateHTML(buildCardData({ scanned: scannedForComposition(), selectedKeys: ['claude_code', 'gemini'], selectedMetrics: metricsAll, details }));
  assert.ok(html.includes('.ft-btn:focus-visible{outline:2px solid'));
  assert.ok(html.includes('<th scope="col">Tool</th>'));
  assert.ok(/<svg[^>]+role="img" aria-label="[^"]+by tool:/.test(html));
  assert.ok(html.includes('class="tbl-panel" tabindex="0" role="region"'));
  assert.ok(html.includes('class="tok-bar" role="img" aria-label="Cache reads'));
});

test('model IDs and composition tool names from local logs are escaped', () => {
  const evil = '"><img src=x onerror=alert(5)>';
  const scanned = scannedForComposition();
  scanned.claude_code.modelBreakdown = [{ model: evil, displayName: 'Opus', tokens_used: 1, cost_usd: 1, costStatus: 'complete' },
    { model: 'b', displayName: 'b', tokens_used: 1, cost_usd: 1, costStatus: 'complete' }];
  const html = generateHTML(buildCardData({ scanned, selectedKeys: ['claude_code', 'gemini'], selectedMetrics: metricsAll, details }));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&quot;&gt;&lt;img src=x onerror=alert(5)&gt;'));
});

test('the report carries the StackPulse logo, embedded (no external file), as icon and in the footer', () => {
  const html = generateHTML(card());
  assert.ok(html.includes('<link rel="icon" type="image/png" href="data:image/png;base64,'));
  assert.ok(html.includes('<img class="ft-logo" src="data:image/png;base64,'));
  assert.ok(!/src="(?!data:)[^"]*logo/.test(html), 'no external logo reference');
});

test('costs show to the cent with separators, the same figure the CLI prints', () => {
  const html = generateHTML(card({ tools: [
    { key: 'codex', name: 'Codex', icon: '◇', color: '#10A37F', metrics: { sessions: 312, tokens_used: 3150000, cost_usd: 2186.40 }, costInfo: { kind: 'estimated', status: 'complete' } },
    { key: 'claude_code', name: 'Claude Code', icon: '◆', color: '#D97706', metrics: { sessions: 48, tokens_used: 4200030, cost_usd: 12430.28 }, costInfo: { kind: 'estimated', status: 'complete' } },
  ] }));
  for (const v of ['$2,186.40', '$12,430.28', '$14,616.68']) assert.ok(html.includes(v), v);
  assert.ok(!/\$2,186<|\$12\.4k/.test(html), 'no rounded or abbreviated cost');
});

test('the Codex auto-review pricing assumption is stated in the report and in details', async () => {
  const { normalizeCcusageReport, CODEX_AUTO_REVIEW_NOTE } = await import('../../src/collectors/ccusage.js');
  const row = (model, cost) => ({ modelName: model, inputTokens: 1000, outputTokens: 10, cacheReadTokens: 0, cacheCreationTokens: 0, cost });
  const report = { daily: [{ period: '2026-10-01', agents: [{ agent: 'codex', inputTokens: 2000, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0, totalCost: 0.02,
    modelBreakdowns: [row('gpt-6-astra', 0.01), row('gpt-5.6-luna', 0.01)] }] }], session: [] };
  const codex = normalizeCcusageReport(report).tools.codex;
  assert.deepEqual(codex.cost.assumptions, [CODEX_AUTO_REVIEW_NOTE]);
  assert.ok(toolDetails('codex', codex, { max: 120 }).join(' ').includes('priced as gpt-5.6-luna'));
  const html = generateHTML(buildCardData({ scanned: { codex }, selectedKeys: ['codex'], selectedMetrics: metricsAll, details }));
  assert.ok(html.includes('Codex: Auto-review usage has no published price; it is counted and priced as gpt-5.6-luna.'));
  const noLuna = normalizeCcusageReport({ ...report, daily: [{ ...report.daily[0], agents: [{ ...report.daily[0].agents[0], modelBreakdowns: [row('gpt-6-astra', 0.02)] }] }] }).tools.codex;
  assert.equal(noLuna.cost.assumptions, undefined, 'no note when no gpt-5.6-luna row');
});
