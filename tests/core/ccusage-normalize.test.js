import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCcusageReport, parseCollectorJson } from '../../src/collectors/ccusage.js';

process.env.TZ = 'UTC';

// Captured from the real pinned collector:
//   HOME=tests/fixtures/home-basic ccusage@20.0.46 daily --json --by-agent --offline --sections daily,session
const fixture = JSON.parse(readFileSync(new URL('../fixtures/ccusage-20.0.46/home-basic.by-agent.json', import.meta.url)));

// Ground truth for tests/fixtures/home-basic, computed by hand from the JSONL files:
//   Claude: 3 sessions on 2 days; msg_1 is logged twice and must count once.
//     tokens = (1000+500+2000+10000) + (200+100) + (300+300) + (100+100) + (50+50) = 14,700
//   Codex: 1 session that switches model mid-session.
//     gpt-5-codex: 1000 new input + 4000 cached + 1000 output (600 reasoning inside) = 6,000
//     gpt-5.5-codex-max: delta 1000 + 2000 cached + 500 output = 3,500
const { tools, otherAgents, diagnostics } = normalizeCcusageReport(fixture);

test('each agent is attributed only its own usage (no cross-agent double count)', () => {
  assert.equal(tools.claude_code.tokens.total, 14_700);
  assert.equal(tools.codex.tokens.total, 9_500);
  assert.equal(tools.claude_code.tokens.total + tools.codex.tokens.total, fixture.totals.totalTokens);
  assert.ok(!tools.claude_code.modelBreakdown.some(m => m.model.startsWith('gpt-')));
  assert.deepEqual(otherAgents, []);
  assert.deepEqual(diagnostics, []);
});

test('sessions are counted per session, not per active day', () => {
  assert.equal(tools.claude_code.sessions, 3);
  assert.equal(tools.claude_code.daily.length, 2, 'two active days');
  assert.equal(tools.codex.sessions, 1);
});

test('token categories are additive and reasoning is not added twice', () => {
  const t = tools.codex.tokens;
  assert.equal(t.input + t.output + t.cacheRead + t.cacheWrite, t.total);
  assert.equal(t.cacheRead, 6_000);
  const t5 = tools.codex.modelBreakdown.find(m => m.model === 'gpt-5-codex');
  assert.equal(t5.tokens_used, 6, '6.0K, not 6.6K (reasoning is inside output)');
});

test('model switches inside one session are attributed per model', () => {
  const byId = Object.fromEntries(tools.codex.modelBreakdown.map(m => [m.model, m]));
  assert.equal(byId['gpt-5-codex'].tokens_used, 6);
  assert.equal(byId['gpt-5.5-codex-max'].tokens_used, 3.5);
  assert.equal(byId['gpt-5.5-codex-max'].displayName, 'GPT-5.5 Codex Max');
});

test('unknown future model IDs are kept and never priced at $0', () => {
  const z = tools.claude_code.modelBreakdown.find(m => m.model === 'claude-zephyr-9-1');
  assert.ok(z, 'unseen model ID is preserved');
  assert.equal(z.cost_usd, null);
  assert.equal(z.costStatus, 'unavailable');
  assert.equal(tools.claude_code.cost.status, 'partial');
  assert.equal(z.missingPricing, true);
  assert.equal(tools.claude_code.cost.kind, 'estimated');
  assert.equal(tools.claude_code.cost.partial, true);
  assert.deepEqual(tools.claude_code.cost.unpricedModels, ['claude-zephyr-9-1']);
});

test('daily rows carry ISO dates and per-day session counts', () => {
  assert.deepEqual(tools.claude_code.daily.map(d => [d.date, d.sessions, d.totalTokens]),
    [['2026-10-20', 2, 14_500], ['2026-10-21', 1, 200]]);
  assert.ok(tools.codex.daily.every(d => d.toolKey === 'codex'));
});

test('legacy 3.x fields stay populated for the existing CLI and generator', () => {
  const c = tools.claude_code;
  assert.equal(c.tokens_used, 14.7);
  assert.ok(Math.abs(c.cost_usd - 0.0425) < 1e-9);
  assert.deepEqual(c.models.slice(0, 2), ['Opus 4.6', 'Sonnet 4.5']);
  assert.equal(c.provenance.sourceVersion, null, 'version is added by runCcusage, not the raw JSON');
});

test('missing session section yields unknown sessions (null), not a day count', () => {
  const { session, ...noSessions } = fixture;
  const r = normalizeCcusageReport(noSessions);
  assert.equal(r.tools.claude_code.sessions, null);
  assert.equal(r.diagnostics[0].code, 'no-session-section');
});

test('all-unpriced usage reports cost as unavailable', () => {
  const report = {
    daily: [{ period: '2026-01-01', agents: [{ agent: 'amp', inputTokens: 10, outputTokens: 5, totalTokens: 15, totalCost: 0,
      modelBreakdowns: [{ modelName: 'mystery-1', inputTokens: 10, outputTokens: 5, cost: 0, missingPricing: true }] }] }],
    session: [{ agent: 'amp', metadata: { lastActivity: '2026-01-01T03:00:00Z' } }],
  };
  const { tools: t } = normalizeCcusageReport(report);
  assert.equal(t.amp.cost_usd, null);
  assert.equal(t.amp.cost.kind, 'unavailable');
});

test('agents StackPulse does not track are reported, not counted', () => {
  const report = { daily: [{ period: '2026-01-01', agents: [{ agent: 'goose', totalTokens: 100 }] }], session: [{ agent: 'goose' }] };
  const r = normalizeCcusageReport(report);
  assert.deepEqual(r.tools, {});
  assert.deepEqual(r.otherAgents, ['goose']);
});

test('rows without a per-agent breakdown are skipped with a diagnostic', () => {
  const r = normalizeCcusageReport({ daily: [{ period: '2026-01-01', agent: 'all', totalTokens: 9 }], session: [] });
  assert.deepEqual(r.tools, {});
  assert.equal(r.diagnostics[0].code, 'no-agent-breakdown');
});

test('collector JSON parsing tolerates leading log lines and rejects garbage', () => {
  assert.deepEqual(parseCollectorJson('[info] loading\n{"daily":[]}'), { daily: [] });
  assert.throws(() => parseCollectorJson('no json here'), { code: 'invalid-json' });
});
