// M3 prototype gate: sharded + cached collection must produce exactly the same
// normalized result as one full collector run — including cross-project duplicate
// messages, cache reuse, appends, deletions and rotated files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, cpSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withHome, jsonl } from '../helpers/home.js';
import { buildM2Home } from '../helpers/m2-home.js';
import { canBuildDb } from '../helpers/sqlite.js';
import { resolveCcusage, runCcusage, normalizeCcusageReport } from '../../src/collectors/ccusage.js';
import { collectSharded, discoverProjects, groupProjects } from '../../src/collectors/sharded.js';

process.env.TZ = 'UTC';
const skip = resolveCcusage().ok && canBuildDb ? false : 'needs the installed collector and a SQLite writer';

// Canonical view: tie order of equal-token models is not meaningful.
const canon = (tools) => JSON.parse(JSON.stringify(tools, (k, v) => {
  if (k === 'provenance' || k === 'diagnostics') return undefined;
  if (k === 'modelBreakdown' && Array.isArray(v)) return [...v].sort((a, b) => String(a.model).localeCompare(String(b.model)));
  if (k === 'models' && Array.isArray(v)) return [...v].sort();
  return v;
}));

async function compare(t) {
  const cacheDir = join(process.env.HOME, '.cache', 'stackpulse');   // same filesystem as the logs
  const full = normalizeCcusageReport(await runCcusage()).tools;
  const { report, stats } = await collectSharded({ cacheDir, concurrency: 3 });
  assert.deepEqual(canon(normalizeCcusageReport(report).tools), canon(full));
  return { stats, cacheDir };
}

const msg = (sid, id, input, ts = '2026-10-20T10:00:00.000Z') => ({ type: 'assistant', sessionId: sid, timestamp: ts, requestId: 'req_' + id,
  message: { id: 'msg_' + id, model: 'claude-opus-4-6', usage: { input_tokens: input, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });

test('mixed tools: sharded result equals a full run', { skip }, async (t) => {
  const home = withHome(t);
  cpSync(fileURLToPath(new URL('../fixtures/home-basic', import.meta.url)), home, { recursive: true });
  buildM2Home(home);
  const { stats } = await compare(t);
  assert.equal(stats.computed, stats.shards);
});

test('cross-project duplicate messages: projects sharing ids are read together (no double count)', { skip }, async (t) => {
  withHome(t, {
    '.claude/projects/-a/s1.jsonl': jsonl(msg('s1', 'dup', 1000), msg('s1', 'a2', 10)),
    '.claude/projects/-a/s2-resumed.jsonl': jsonl(msg('s2', 'dup', 1000)),
    '.claude/projects/-b/s3.jsonl': jsonl(msg('s3', 'dup', 1000), msg('s3', 'b2', 20)),
    '.claude/projects/-c/s4.jsonl': jsonl(msg('s4', 'c1', 30)),
  });
  const groups = await groupProjects(discoverProjects());
  assert.deepEqual(groups.map(g => g.join('+')).sort(), ['-a+-b', '-c']);
  await compare(t);
});

test('same project under two Claude roots (config migration) is one shard', { skip }, async (t) => {
  const home = withHome(t, {
    '.claude/projects/-p/s1.jsonl': jsonl(msg('s1', 'm1', 100)),
    '.config/claude/projects/-p/s1.jsonl': jsonl(msg('s1', 'm1', 100)),   // copied history
  });
  const groups = await groupProjects(discoverProjects());
  assert.deepEqual(groups, [['-p']]);
  await compare(t);
});

test('incremental: cache reuse, append, delete and rotate all stay exact', { skip }, async (t) => {
  const home = withHome(t, Object.fromEntries(Array.from({ length: 6 }, (_, i) => [
    `.claude/projects/-p${i}/s${i}.jsonl`, jsonl(msg(`s${i}`, `m${i}a`, 100 + i), msg(`s${i}`, `m${i}b`, 200 + i, '2026-10-21T10:00:00.000Z'))])));
  let r = await compare(t);
  assert.equal(r.stats.computed, 6);

  r = await compare(t);                                   // nothing changed
  assert.deepEqual([r.stats.cached, r.stats.computed], [6, 0]);

  const f = join(home, '.claude/projects/-p2/s2.jsonl');  // append to one session
  appendFileSync(f, jsonl(msg('s2', 'm2c', 999, '2026-10-22T10:00:00.000Z')));
  r = await compare(t);
  assert.deepEqual([r.stats.cached, r.stats.computed], [5, 1]);

  unlinkSync(join(home, '.claude/projects/-p4/s4.jsonl')); // delete a session
  r = await compare(t);
  assert.deepEqual([r.stats.cached, r.stats.computed], [5, 0], 'empty project contributes nothing; others reused');

  renameSync(join(home, '.claude/projects/-p1/s1.jsonl'), join(home, '.claude/projects/-p1/s1-rotated.jsonl'));
  r = await compare(t);
  assert.deepEqual([r.stats.cached, r.stats.computed], [4, 1], 'rename changes the fingerprint');

  // A rewrite that keeps the size but changes content must still be caught (mtime)
  const g = join(home, '.claude/projects/-p3/s3.jsonl');
  const { readFileSync, utimesSync } = await import('node:fs');
  writeFileSync(g, readFileSync(g, 'utf-8').replace('"input_tokens":103', '"input_tokens":301'));
  utimesSync(g, new Date(), new Date(Date.now() + 5000));
  r = await compare(t);
  assert.equal(r.stats.computed, 1);
});

// Session attribution of duplicated (resumed) messages follows the collector's file
// order — measured: a copy-only resume file counts as a session only if read first.
// Sharding must reproduce that order exactly, including across two Claude roots.
test('resumed sessions: same session count and tokens as a full run (same project, other project, two roots)', { skip }, async (t) => {
  withHome(t, {
    '.claude/projects/-p/orig.jsonl': jsonl(msg('orig', 'r1', 100), msg('orig', 'r2', 100, '2026-10-20T10:05:00.000Z')),
    '.claude/projects/-p/copy-only.jsonl': jsonl(msg('copy', 'r1', 100)),
    '.claude/projects/-p/resumed.jsonl': jsonl(msg('res', 'r1', 100), msg('res', 'r2', 100, '2026-10-20T10:05:00.000Z'), msg('res', 'r3', 50, '2026-10-21T09:00:00.000Z')),
    '.claude/projects/-q/resumed-elsewhere.jsonl': jsonl(msg('res2', 'r2', 100, '2026-10-20T10:05:00.000Z'), msg('res2', 'q1', 7, '2026-10-22T09:00:00.000Z')),
    '.config/claude/projects/-p/aaa-copy-in-old-root.jsonl': jsonl(msg('old', 'r1', 100)),
  });
  const full = normalizeCcusageReport(await runCcusage()).tools.claude_code;
  const { report } = await collectSharded({ cacheDir: join(process.env.HOME, '.cache', 'stackpulse') });
  const sharded = normalizeCcusageReport(report).tools.claude_code;
  assert.equal(sharded.tokens.total, full.tokens.total);
  assert.equal(sharded.tokens.total, (100 + 1) + (100 + 1) + (50 + 1) + (7 + 1), 'every message once (msg() adds 1 output token)');
  assert.equal(sharded.sessions, full.sessions, `sessions: sharded ${sharded.sessions} vs full ${full.sessions}`);
  t.diagnostic(`sessions full=${full.sessions} sharded=${sharded.sessions}; 5 files, duplicates credited by read order`);
  assert.deepEqual(sharded.daily, full.daily);
});
