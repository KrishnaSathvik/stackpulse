// M2: tools moved to the pinned collector, run end to end through their real
// adapters on current-format data (see tests/helpers/m2-home.js).
//
// The first three tests replace the M1 `todo` gaps — they used to document that
// the native parsers read 0 tokens / nothing from these formats.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { withHome } from '../helpers/home.js';
import { buildM2Home, M2_TRUTH } from '../helpers/m2-home.js';
import { canBuildDb, makeDb } from '../helpers/sqlite.js';
import { resolveCcusage, normalizeCcusageReport, AGENT_TO_TOOL } from '../../src/collectors/ccusage.js';

process.env.TZ = 'UTC';
const live = resolveCcusage().ok && canBuildDb ? false : 'needs the installed collector and a SQLite writer';
const adapter = async (k) => import(`../../parsers/${k}.js`);

async function scan(t, extra = {}) {
  const home = withHome(t);
  for (const k of ['GEMINI_DATA_DIR', 'QWEN_DATA_DIR', 'KIMI_DATA_DIR', 'ANTIGRAVITY_DATA_DIR', 'KILO_DATA_DIR']) delete process.env[k];
  buildM2Home(home);
  if (extra.build) extra.build(home);
  return home;
}

test('gemini: current chat format (per-message `tokens`, .json and .jsonl) is read', { skip: live }, async (t) => {
  await scan(t);
  const m = await adapter('gemini');
  assert.equal(m.detect(), true);
  const r = await m.parse();
  assert.equal(r.tokens.total, M2_TRUTH.gemini.total);
  assert.equal(r.sessions, M2_TRUTH.gemini.sessions);
  assert.deepEqual(r.modelBreakdown.map(x => x.model).sort(), ['gemini-2.5-pro', 'gemini-3-flash-preview']);
  assert.equal(r.cost.kind, 'estimated');
});

test('qwen: current projects/*/chats/*.jsonl format is read', { skip: live }, async (t) => {
  await scan(t);
  const r = await (await adapter('qwen')).parse();
  assert.equal(r.tokens.total, M2_TRUTH.qwen.total);
  assert.equal(r.sessions, M2_TRUTH.qwen.sessions);
});

test('kimi: session count is per session (old and new layouts); cumulative session-scope records ignored', { skip: live }, async (t) => {
  await scan(t);
  const r = await (await adapter('kimi')).parse();
  assert.equal(r.sessions, M2_TRUTH.kimi.sessions);
  assert.equal(r.tokens.total, M2_TRUTH.kimi.total, 'session-scoped usage.record must not be added');
  assert.deepEqual(r.modelBreakdown.map(x => x.model).sort(), ['kimi-for-coding', 'kimi-k2']);
});

test('antigravity: conversation databases give tokens; continuation rows inherit the model', { skip: live }, async (t) => {
  await scan(t);
  const r = await (await adapter('antigravity')).parse();
  assert.equal(r.tokens.total, M2_TRUTH.antigravity.total);
  assert.equal(r.sessions, M2_TRUTH.antigravity.sessions);
  assert.equal(r.provenance.adapter, 'ccusage');
  // Antigravity stores display labels/placeholders, not API IDs; the collector maps them
  assert.deepEqual(r.modelBreakdown.map(x => x.model), ['gemini-3-pro']);
});

test('kilo: Kilo CLI database; recorded cost is labelled recorded, not estimated', { skip: live }, async (t) => {
  await scan(t);
  const r = await (await adapter('kilocode')).parse();
  assert.equal(r.tokens.total, M2_TRUTH.kilo.total);
  assert.equal(r.sessions, M2_TRUTH.kilo.sessions);
  assert.ok(Math.abs(r.cost.usd - M2_TRUTH.kilo.recordedCost) < 1e-9);
  assert.equal(r.cost.kind, 'recorded');
  assert.equal(r.cost.status, 'complete');
});

test('one source per tool: Antigravity IDE index is ignored when conversation data exists', { skip: live }, async (t) => {
  await scan(t, { build: (home) => makeDb(join(home, '.config', 'Antigravity', 'User', 'globalStorage', 'state.vscdb'),
    { ItemTable: { 'chat.ChatSessionStore.index': { version: 1, entries: { a: {}, b: {}, c: {}, d: {}, e: {} } } } }) });
  const r = await (await adapter('antigravity')).parse();
  assert.equal(r.sessions, 1, 'collector sessions only; the 5 IDE index entries are not added');
  assert.equal(r.provenance.adapter, 'ccusage');
});

test('one source per tool: Kilo extension history is ignored when the Kilo CLI has data', { skip: live }, async (t) => {
  await scan(t, { build: (home) => makeDb(join(home, '.config', 'Code', 'User', 'globalStorage', 'state.vscdb'),
    { ItemTable: { 'kilocode.kilo-code': { taskHistory: [{ id: 'x', ts: Date.parse('2026-10-20T00:00:00Z'), tokensIn: 999999, tokensOut: 1, totalCost: 50 }] } } }) });
  const r = await (await adapter('kilocode')).parse();
  assert.equal(r.tokens.total, M2_TRUTH.kilo.total);
  assert.equal(r.provenance.adapter, 'ccusage');
});

test('fallbacks: IDE-only Antigravity and extension-only Kilo still report', { skip: live }, async (t) => {
  const home = withHome(t);
  makeDb(join(home, '.config', 'Antigravity', 'User', 'globalStorage', 'state.vscdb'),
    { ItemTable: { 'chat.ChatSessionStore.index': { version: 1, entries: { a: {}, b: {} } } } });
  makeDb(join(home, '.config', 'Code', 'User', 'globalStorage', 'state.vscdb'),
    { ItemTable: { 'kilocode.kilo-code': { taskHistory: [{ id: 'k', ts: Date.parse('2026-10-20T00:00:00Z'), tokensIn: 10, tokensOut: 5, totalCost: 0.01 }] } } });
  const ag = await (await adapter('antigravity')).parse();
  const kilo = await (await adapter('kilocode')).parse();
  assert.equal(ag.sessions, 2);
  assert.equal(ag.provenance.adapter, 'antigravity-ide-index');
  assert.equal(kilo.tokens.total, 15);
  assert.equal(kilo.provenance.adapter, 'vscode-task-history');
});

test('captured collector output maps all ten owned agents (offline)', () => {
  const raw = JSON.parse(readFileSync(new URL('../fixtures/ccusage-20.0.46/home-m2.by-agent.json', import.meta.url)));
  const { tools, otherAgents } = normalizeCcusageReport(raw);
  assert.deepEqual(otherAgents, []);
  for (const [agent, tool] of Object.entries({ gemini: 'gemini', qwen: 'qwen', kimi: 'kimi', antigravity: 'antigravity', kilo: 'kilocode' })) {
    assert.equal(AGENT_TO_TOOL[agent], tool);
    assert.equal(tools[tool].tokens.total, M2_TRUTH[agent].total, agent);
    assert.equal(tools[tool].sessions, M2_TRUTH[agent].sessions, agent);
  }
});

// ── Source status: absent vs failed vs partial (M3 review) ──────────────────
import { mkdirSync as _mkdir, writeFileSync as _write } from 'node:fs';

test('antigravity: all conversation DBs unreadable → IDE fallback is marked incomplete, not shown as a clean scan', { skip: live }, async (t) => {
  const home = withHome(t);
  _mkdir(join(home, '.gemini/antigravity/conversations'), { recursive: true });
  _write(join(home, '.gemini/antigravity/conversations/a.db'), 'corrupt');
  _write(join(home, '.gemini/antigravity/conversations/b.db'), 'also corrupt');
  makeDb(join(home, '.config/Antigravity/User/globalStorage/state.vscdb'),
    { ItemTable: { 'chat.ChatSessionStore.index': { version: 1, entries: { x: {}, y: {} } } } });
  const r = await (await adapter('antigravity')).parse();
  assert.equal(r.sessions, 2, 'fallback data still shown');
  assert.equal(r.coverage.status, 'partial');
  assert.match(r.coverage.reasons[0], /unreadable Antigravity database/i);
  assert.ok(r.diagnostics.some(d => d.code === 'fallback-after-failure'));
});

test('antigravity: all DBs unreadable and no fallback → error, never "no data"', { skip: live }, async (t) => {
  const home = withHome(t);
  _mkdir(join(home, '.gemini/antigravity/conversations'), { recursive: true });
  _write(join(home, '.gemini/antigravity/conversations/a.db'), 'corrupt');
  await assert.rejects((await adapter('antigravity')).parse(), { code: 'source-failed' });
});

test('antigravity: one DB unreadable beside a good one → data kept, coverage partial', { skip: live }, async (t) => {
  await scan(t, { build: (home) => _write(join(home, '.gemini/antigravity/conversations/corrupt.db'), 'corrupt') });
  const r = await (await adapter('antigravity')).parse();
  assert.equal(r.tokens.total, M2_TRUTH.antigravity.total);
  assert.equal(r.coverage.status, 'partial');
});

test('a clean source reports complete coverage', { skip: live }, async (t) => {
  await scan(t);
  for (const k of ['gemini', 'qwen', 'kimi', 'antigravity', 'kilocode']) {
    assert.equal((await (await adapter(k)).parse()).coverage.status, 'complete', k);
  }
});

// The collector skips a corrupt kilo.db / opencode.db silently (exit 0, no warning).
test('kilo: corrupt kilo.db with extension data → fallback marked incomplete', { skip: live }, async (t) => {
  const home = withHome(t);
  _mkdir(join(home, '.local/share/kilo'), { recursive: true });
  _write(join(home, '.local/share/kilo/kilo.db'), 'corrupt');
  makeDb(join(home, '.config/Code/User/globalStorage/state.vscdb'),
    { ItemTable: { 'kilocode.kilo-code': { taskHistory: [{ id: 'k', ts: Date.parse('2026-10-20T00:00:00Z'), tokensIn: 10, tokensOut: 5, totalCost: 0.01 }] } } });
  const r = await (await adapter('kilocode')).parse();
  assert.equal(r.provenance.adapter, 'vscode-task-history');
  assert.equal(r.coverage.status, 'partial');
  assert.match(r.coverage.reasons[0], /kilo\.db exists but could not be read/);
});

test('kilo: corrupt kilo.db and no fallback → error', { skip: live }, async (t) => {
  const home = withHome(t);
  _mkdir(join(home, '.local/share/kilo'), { recursive: true });
  _write(join(home, '.local/share/kilo/kilo.db'), 'corrupt');
  await assert.rejects((await adapter('kilocode')).parse(), { code: 'source-failed' });
});

test('kilo: a valid but empty kilo.db is genuinely absent (fallback stays complete)', { skip: live }, async (t) => {
  const home = withHome(t);
  const { sqliteDb } = await import('../helpers/m2-home.js');
  sqliteDb(join(home, '.local/share/kilo/kilo.db'), ['CREATE TABLE message (id TEXT, session_id TEXT, data TEXT)'], []);
  makeDb(join(home, '.config/Code/User/globalStorage/state.vscdb'),
    { ItemTable: { 'kilocode.kilo-code': { taskHistory: [{ id: 'k', ts: Date.parse('2026-10-20T00:00:00Z'), tokensIn: 10, tokensOut: 5, totalCost: 0.01 }] } } });
  const r = await (await adapter('kilocode')).parse();
  assert.equal(r.coverage, undefined, 'plain fallback, no failure recorded');
  assert.equal(r.tokens.total, 15);
});

test('opencode: corrupt opencode.db → error, never "not used"', { skip: live }, async (t) => {
  const home = withHome(t);
  _mkdir(join(home, '.local/share/opencode'), { recursive: true });
  _write(join(home, '.local/share/opencode/opencode.db'), 'corrupt');
  await assert.rejects((await adapter('opencode')).parse(), { code: 'source-failed' });
});
