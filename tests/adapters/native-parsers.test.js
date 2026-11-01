// Native (non-collector) readers that remain after M2: the Antigravity IDE
// session index (fallback only) and Aider. Gemini, Qwen and Kimi moved to the
// collector — see collector-tools.test.js; their old native tests covered formats
// those tools never wrote (verified against each tool's source).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withHome, jsonl } from '../helpers/home.js';

process.env.TZ = 'UTC';
const antigravity = await import('../../parsers/antigravity.js');
const aider = await import('../../parsers/aider.js');

import { canBuildDb, makeDb } from '../helpers/sqlite.js';


// ── Antigravity ─────────────────────────────────────────────────────────────
test('antigravity fallback: IDE session index counts sessions only; invents no model or cost', { skip: !canBuildDb && 'cannot build SQLite fixture' }, async (t) => {
  const home = withHome(t);
  const { join } = await import('node:path');
  const base = join(home, '.config', 'Antigravity', 'User');
  makeDb(join(base, 'workspaceStorage', 'w1', 'state.vscdb'), { ItemTable: { 'chat.ChatSessionStore.index': { version: 1, entries: { a: {}, b: {} } } } });
  makeDb(join(base, 'workspaceStorage', 'w2', 'state.vscdb'), { ItemTable: { 'chat.ChatSessionStore.index': '{malformed' } });
  makeDb(join(base, 'globalStorage', 'state.vscdb'), { ItemTable: {} });
  const r = await antigravity.parse();
  assert.equal(r.sessions, 2);
  assert.deepEqual(r.models, []);
  assert.equal(r.cost_usd, null);
  assert.equal(r.tokens_used, null);
  assert.equal(r.provenance.adapter, 'antigravity-ide-index');
});

// ── Aider ───────────────────────────────────────────────────────────────────
test('aider: history files counted per session header; empty file still one session; no invented tokens', async (t) => {
  withHome(t, {
    'projects/app/.aider.chat.history.md': '# aider chat started at 2026-10-01\n\n#### fix the bug\n> ok\n\n#### add tests\n> done\n',
    'projects/lib/.aider.chat.history.md': '',
  });
  process.env.PATH = '/nonexistent';
  const r = await aider.parse();
  assert.equal(r.sessions, 3);
  assert.equal(r.tokens_used, null);
  assert.equal(r.cost_usd, null);
  assert.ok(r.daily.every(d => d.totalTokens === undefined), 'no 500-tokens-per-message proxy');
});
