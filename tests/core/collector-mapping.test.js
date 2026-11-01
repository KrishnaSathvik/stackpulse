// Multi-agent invariants for the collector normalizer: every owned agent maps to
// exactly one tool, and no section contributes the same tokens twice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_TO_TOOL, normalizeCcusageReport } from '../../src/collectors/ccusage.js';

const row = (agent, tokens, cost, models = []) => ({
  agent, inputTokens: tokens * 0.5, outputTokens: tokens * 0.2, cacheReadTokens: tokens * 0.3, cacheCreationTokens: 0,
  totalTokens: tokens, totalCost: cost, modelBreakdowns: models,
});
const model = (id, tokens, cost, extra = {}) => ({ modelName: id, inputTokens: tokens * 0.5, outputTokens: tokens * 0.2, cacheReadTokens: tokens * 0.3, cacheCreationTokens: 0, cost, ...extra });

// Five owned agents, one agent StackPulse does not track (goose), and deliberately
// misleading aggregate fields that must be ignored.
const report = {
  daily: [
    { period: '2026-10-01', agent: 'all', totalTokens: 999_999_999, totalCost: 999, agents: [
      row('claude', 1000, 1, [model('claude-opus-4-6', 1000, 1)]),
      row('codex', 2000, 2, [model('gpt-5-codex', 1500, 1.5), model('gpt-5.5-codex-max', 500, 0.5)]),
      row('opencode', 3000, 3, [model('anthropic/claude-sonnet-4-5', 3000, 3)]),
      row('amp', 4000, 4, [model('claude-sonnet-4-5', 4000, 4)]),
      row('pi', 5000, 5, [model('gpt-5-mini', 5000, 5)]),
      row('goose', 6000, 6, [model('gemini-2.5-pro', 6000, 6)]),
    ] },
    { period: '2026-10-02', agent: 'all', agents: [row('claude', 10, 0.01, [model('claude-opus-4-6', 10, 0.01)])] },
  ],
  session: [
    // session rows repeat token totals; they must only ever count sessions
    { agent: 'claude', totalTokens: 1_000_000, metadata: { lastActivity: '2026-10-01T05:00:00Z' } },
    { agent: 'claude', totalTokens: 1_000_000, metadata: { lastActivity: '2026-10-02T05:00:00Z' } },
    { agent: 'codex', totalTokens: 1_000_000, metadata: { lastActivity: '2026-10-01T06:00:00Z' } },
    { agent: 'opencode', metadata: {} },
    { agent: 'amp', metadata: { lastActivity: 'not a date' } },
    { agent: 'pi', metadata: { lastActivity: '2026-10-01T07:00:00Z' } },
    { agent: 'goose', metadata: { lastActivity: '2026-10-01T08:00:00Z' } },
  ],
  totals: { totalTokens: 123 },
};

process.env.TZ = 'UTC';
const { tools, otherAgents, diagnostics } = normalizeCcusageReport(report);

test('each owned agent maps to exactly one tool', () => {
  assert.deepEqual(Object.keys(tools).sort(), ['amp', 'claude_code', 'codex', 'opencode', 'pi']);
  assert.deepEqual(otherAgents, ['goose'], 'agents StackPulse does not track are reported, never counted');
  assert.equal(new Set(Object.values(AGENT_TO_TOOL)).size, Object.keys(AGENT_TO_TOOL).length, 'no two agents share a tool');
});

test('tokens come only from per-agent daily rows (not session rows or aggregate fields)', () => {
  const expected = { claude_code: 1010, codex: 2000, opencode: 3000, amp: 4000, pi: 5000 };
  for (const [k, v] of Object.entries(expected)) assert.equal(tools[k].tokens.total, v, k);
  const sum = Object.values(tools).reduce((s, t) => s + t.tokens.total, 0);
  assert.equal(sum, 15_010);
});

test('per-model tokens sum to the tool total; day totals sum to the tool total', () => {
  for (const t of Object.values(tools)) {
    const models = t.modelBreakdown.reduce((s, m) => s + m.tokens, 0);
    const days = t.daily.reduce((s, d) => s + d.totalTokens, 0);
    assert.equal(models, t.tokens.total, `${t.tool} model tokens`);
    assert.equal(days, t.tokens.total, t.tool);
  }
});

test('cost: model sums agree with daily sums (no mismatch diagnostics)', () => {
  assert.deepEqual(diagnostics, []);
  assert.ok(Math.abs(tools.codex.cost.usd - 2) < 1e-9);
});

test('sessions counted per row; undated sessions still count but add no heatmap day', () => {
  assert.equal(tools.claude_code.sessions, 2);
  assert.equal(tools.opencode.sessions, 1);
  assert.equal(tools.amp.sessions, 1);
  assert.equal(tools.amp.daily[0].sessions, 0, 'invalid lastActivity is not placed on a day');
  assert.deepEqual(tools.claude_code.daily.map(d => [d.date, d.sessions]), [['2026-10-01', 1], ['2026-10-02', 1]]);
});

test('a cost mismatch between model and daily rows is surfaced, not hidden', () => {
  const bad = { daily: [{ period: '2026-10-01', agents: [row('pi', 100, 9, [model('gpt-5-mini', 100, 1)])] }], session: [] };
  const r = normalizeCcusageReport(bad);
  assert.equal(r.diagnostics[0].code, 'cost-mismatch');
});

test('empty and malformed reports produce no tools and do not throw', () => {
  for (const input of [null, {}, { daily: [] }, { daily: [{}] }, { daily: [{ agents: [{}] }] }, { daily: 'x', session: 5 }]) {
    const r = normalizeCcusageReport(input);
    assert.deepEqual(Object.keys(r.tools), [], JSON.stringify(input));
  }
});
