import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.TZ = 'UTC';

import { canBuildDb, makeDb } from '../helpers/sqlite.js';
const skip = !canBuildDb && 'neither node:sqlite nor sqlite3 CLI available to build fixtures';

const { parse: parseRoo, detect: detectRoo } = await import('../../parsers/roocode.js');
const { parse: parseKilo } = await import('../../parsers/kilocode.js');
const { parse: parseCursor } = await import('../../parsers/cursor.js');

const day = (iso) => Date.parse(iso);

// Kilo consults the collector first, which reads HOME like real usage does.
async function asHome(home, fn) {
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  Object.assign(process.env, { HOME: home, USERPROFILE: home });
  try { return await fn(); } finally { for (const [k, v] of Object.entries(saved)) (v == null ? delete process.env[k] : (process.env[k] = v)); }
}

test('Roo Code reads taskHistory from the extension globalState row', { skip }, async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'sp-roo-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const roo = { taskHistory: [
    { id: 't1', ts: day('2026-10-01T10:00:00Z'), tokensIn: 100, tokensOut: 50, cacheReads: 1000, cacheWrites: 200, totalCost: 0.25 },
    { id: 't2', ts: day('2026-10-01T15:00:00Z'), tokensIn: 10, tokensOut: 5, totalCost: 0.01 },
    { id: 't3', ts: day('2026-10-02T09:00:00Z'), tokensIn: 1, tokensOut: 1 },
  ] };
  makeDb(join(home, '.config', 'Code', 'User', 'globalStorage', 'state.vscdb'), { ItemTable: {
    'RooVeterinaryInc.roo-cline': roo,
    'saoudrizwan.claude-dev': { taskHistory: [{ id: 'cline-1', ts: 1, tokensIn: 999999 }] }, // Cline: must be ignored
    'roo.unrelated.taskHistoryCache': [1, 2, 3, 4, 5],                                       // old heuristic bait
  } });
  // Same task synced into Insiders must not double count
  makeDb(join(home, '.config', 'Code - Insiders', 'User', 'globalStorage', 'state.vscdb'), { ItemTable: {
    'rooveterinaryinc.roo-cline': { taskHistory: [roo.taskHistory[0]] },
  } });
  mkdirSync(join(home, '.config', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline'), { recursive: true });

  assert.equal(detectRoo({ home }), true);
  const r = await parseRoo({ home });
  assert.equal(r.sessions, 3);
  assert.equal(r.tokens.total, 1350 + 15 + 2);
  assert.equal(r.tokens_used, 1.4);
  assert.ok(Math.abs(r.cost_usd - 0.26) < 1e-9);
  assert.equal(r.cost.kind, 'recorded');
  assert.equal(r.cost.status, 'partial', 'task t3 has tokens but no recorded cost');
  assert.deepEqual(r.daily.map(d => [d.date, d.sessions]), [['2026-10-01', 2], ['2026-10-02', 1]]);
  assert.equal(await asHome(home, () => parseKilo({ home })), null, 'Kilo has no data in this profile');
});

test('Kilo Code reads its own extension row only', { skip }, async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'sp-kilo-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  makeDb(join(home, '.config', 'Code', 'User', 'globalStorage', 'state.vscdb'), { ItemTable: {
    'kilocode.kilo-code': { taskHistory: [{ id: 'k1', ts: day('2026-09-09T00:00:00Z'), tokensIn: 7, tokensOut: 3 }] },
  } });
  const r = await asHome(home, () => parseKilo({ home }));
  assert.equal(r.sessions, 1);
  assert.equal(r.cost_usd, null, 'no recorded cost means unavailable, not $0');
  assert.equal(r.cost.kind, 'unavailable');
});

test('Cursor counts composer sessions and dates; hostile paths are not executed', { skip }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sp-cursor-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sentinel = join(root, 'PWNED');
  const baseDir = join(root, `User "$(touch ${sentinel})" \`touch ${sentinel}\``);
  makeDb(join(baseDir, 'globalStorage', 'state.vscdb'), {
    cursorDiskKV: {
      'composerData:a': { _v: 3, composerId: 'a', createdAt: day('2026-08-01T12:00:00Z') },
      'composerData:b': '{"_v":3,"composerId":"b","createdAt":"2026-08-02T08:00:00.000Z","text":"multi\nline"}',
      'bubbleId:a:1': '{}', 'bubbleId:a:2': '{}', 'bubbleId:b:1': '{}', 'bubbleId:b:2': '{}',
    },
    ItemTable: {},
  });
  const r = await parseCursor({ baseDir });
  assert.equal(existsSync(sentinel), false, 'shell metacharacters in the path must not run');
  assert.equal(r.sessions, 2);
  assert.equal(r._raw.promptCount, 2);
  assert.deepEqual(r.daily.map(d => d.date), ['2026-08-01', '2026-08-02']);
  assert.equal(r.tokens_used, null, 'Cursor stores no tokens locally: unavailable, not zero');
  assert.equal(r.cost_usd, null);
});

test('Cursor surfaces unreadable databases instead of reporting no data', { skip }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'sp-cursor-bad-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'globalStorage'), { recursive: true });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(root, 'globalStorage', 'state.vscdb'), 'this is not a database');
  await assert.rejects(parseCursor({ baseDir: root }), /could not read any Cursor database/);
});

test('with no SQLite reader at all, adapters fail with a clear typed error (not "no data")', async () => {
  const { execFileSync } = await import('node:child_process');
  const script = `
    const { queryColumn, sqliteBackend } = await import(${JSON.stringify(new URL('../../src/utils/sqlite.js', import.meta.url).href)});
    try { queryColumn('/nonexistent.db', 'SELECT 1'); console.log('NO-ERROR'); }
    catch (e) { console.log(sqliteBackend() + ' ' + e.code); }`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, STACKPULSE_SQLITE_BACKEND: 'cli', PATH: '/nonexistent' }, encoding: 'utf-8',
  }).trim();
  assert.equal(out, 'sqlite3-cli sqlite-unavailable');
});

test('Roo Code: per-task history files (current Roo) are authoritative; globalState overlap is not double counted', { skip }, async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'sp-roo-files-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const { writeFileSync } = await import('node:fs');
  const taskFile = (id, item) => {
    const dir = join(home, '.config', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'tasks', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'history_item.json'), JSON.stringify(item));
  };
  taskFile('t1', { id: 't1', ts: day('2026-10-01T10:00:00Z'), tokensIn: 100, tokensOut: 50, totalCost: 0.25 });   // newer than globalState copy
  taskFile('t2', { id: 't2', ts: day('2026-10-02T10:00:00Z'), tokensIn: 10, tokensOut: 5, totalCost: 0.01 });
  mkdirSync(join(home, '.config', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'tasks', 'no-history-file'), { recursive: true });

  // Files only (no state.vscdb at all): current Roo with globalState write-through gone
  let r = await parseRoo({ home });
  assert.equal(r.sessions, 2);
  assert.equal(r.tokens.total, 165);

  // Transition period: globalState still holds a stale copy of t1 plus an older task t0
  makeDb(join(home, '.config', 'Code', 'User', 'globalStorage', 'state.vscdb'), { ItemTable: {
    'RooVeterinaryInc.roo-cline': { taskHistory: [
      { id: 't1', ts: day('2026-10-01T10:00:00Z'), tokensIn: 1, tokensOut: 1, totalCost: 0.001 },   // stale
      { id: 't0', ts: day('2026-09-30T10:00:00Z'), tokensIn: 7, tokensOut: 3, totalCost: 0.02 },
    ] },
  } });
  r = await parseRoo({ home });
  assert.equal(r.sessions, 3, 't0 + t1 + t2, with t1 counted once');
  assert.equal(r.tokens.total, 165 + 10, 'the authoritative file copy of t1 wins over the stale globalState copy');
  assert.ok(Math.abs(r.cost_usd - (0.25 + 0.01 + 0.02)) < 1e-9);
});

test('Cursor: a composer listed in several databases counts once (no global + workspace double count)', { skip }, async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'sp-cursor-dup-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  makeDb(join(base, 'globalStorage', 'state.vscdb'), {
    cursorDiskKV: {
      'composerData:c1': { composerId: 'c1', createdAt: day('2026-10-01T12:00:00Z') },
      'composerData:c2': { composerId: 'c2', createdAt: '2026-10-02T08:00:00.000Z' },
    },
    ItemTable: {},
  });
  makeDb(join(base, 'workspaceStorage', 'w1', 'state.vscdb'), { ItemTable: {
    'composer.composerData': { allComposers: [{ composerId: 'c1', createdAt: day('2026-10-01T12:00:00Z') }, { composerId: 'c3', createdAt: day('2026-10-03T09:00:00Z') }] },
    'workbench.panel.aichat.view.aichat.chatdata': { tabs: [{ tabId: 'tab-1' }, { tabId: 'tab-1' }, { tabId: 'tab-2' }] },
  } });
  makeDb(join(base, 'workspaceStorage', 'w2', 'state.vscdb'), { ItemTable: {
    'composer.composerData': { allComposers: [{ composerId: 'c2' }] },   // same composer, no date
  } });
  const r = await parseCursor({ baseDir: base });
  assert.equal(r.sessions, 5, 'c1, c2, c3 + tabs tab-1, tab-2');
  assert.deepEqual(r.daily.map(d => [d.date, d.sessions]), [['2026-10-01', 1], ['2026-10-02', 1], ['2026-10-03', 1]]);
});
