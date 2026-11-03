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

// Aider scans ~/Projects AND ~/projects (and Code/code, …). On case-insensitive
// filesystems (macOS, Windows defaults) those are one directory and used to be
// scanned twice; on case-sensitive ones (Linux) they can be two real directories.
const HISTORY_2 = '#### one\n> a\n\n#### two\n> b\n';
const HISTORY_1 = '#### only\n> c\n';

test('aider: case aliases of one directory are scanned once; distinct case-sensitive directories both count', async (t) => {
  const { existsSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const home = withHome(t, { 'Projects/app/.aider.chat.history.md': HISTORY_2 });
  process.env.PATH = '/nonexistent';
  const caseInsensitive = existsSync(join(home, 'projects', 'app'));
  if (!caseInsensitive) {   // e.g. Linux: a genuinely different folder must still be counted
    mkdirSync(join(home, 'projects', 'lib'), { recursive: true });
    writeFileSync(join(home, 'projects', 'lib', '.aider.chat.history.md'), HISTORY_1);
  }
  const r = await aider.parse();
  assert.equal(r.sessions, caseInsensitive ? 2 : 3);
  assert.equal(r._meta.historyFiles, caseInsensitive ? 1 : 2);
});

test('aider: symlinked roots and repositories do not double count sessions, commits or lines', async (t) => {
  const { execFileSync } = await import('node:child_process');
  const { mkdirSync, symlinkSync, writeFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  let hasGit = true;
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { hasGit = false; }
  const home = withHome(t, { 'Projects/app/.aider.chat.history.md': HISTORY_2 });
  const repo = join(home, 'Projects', 'app');
  try {
    symlinkSync(join(home, 'Projects'), join(home, 'work'), 'dir');      // whole root aliased
    symlinkSync(repo, join(home, 'src'), 'dir');                          // one repo aliased as a root
  } catch (e) { return t.skip(`cannot create symlinks here (${e.code})`); }
  if (hasGit) {
    execFileSync('git', ['-C', repo, 'init', '-q']);
    writeFileSync(join(repo, 'a.txt'), 'x\ny\nz\n');
    execFileSync('git', ['-C', repo, 'add', 'a.txt']);
    execFileSync('git', ['-C', repo, 'commit', '-qm', 'aider: add a'], { env: { ...process.env,
      GIT_AUTHOR_NAME: 'Dev', GIT_AUTHOR_EMAIL: 'd@e', GIT_COMMITTER_NAME: 'Dev', GIT_COMMITTER_EMAIL: 'd@e' } });
  } else {
    process.env.PATH = '/nonexistent';
  }
  const r = await aider.parse();
  assert.equal(r.sessions, 2, 'one history file, reachable three ways, counted once');
  assert.equal(r._meta.historyFiles, 1);
  if (hasGit) {
    assert.equal(r.commits, 1, 'one repository, reachable three ways, counted once');
    assert.equal(r.lines_written, 3);
  }
});
