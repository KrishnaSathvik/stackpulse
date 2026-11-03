// M3 hardening: privacy, crash/interrupt cleanup, concurrency, changes during a
// scan, link failure and cache-key completeness for the sharded collector.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withHome, jsonl } from '../helpers/home.js';
import { resolveCcusage, runCcusage, normalizeCcusageReport } from '../../src/collectors/ccusage.js';
import { collectSharded, sweepStaleWork } from '../../src/collectors/sharded.js';

process.env.TZ = 'UTC';
const skip = resolveCcusage().ok ? false : 'needs the installed collector';
const CHILD = fileURLToPath(new URL('../helpers/sharded-child.mjs', import.meta.url));
const posix = process.platform !== 'win32';

const SECRET_PROMPT = 'SECRET-PROMPT-do-not-cache';
const SECRET_SID = 'secret-session-7f3a';
const msg = (sid, id, input, ts = '2026-10-20T10:00:00.000Z') => ({ type: 'assistant', sessionId: sid, timestamp: ts, requestId: 'req_' + id, cwd: '/home/u/secret-project',
  message: { id: 'msg_' + id, model: 'claude-opus-4-6', content: [{ type: 'text', text: SECRET_PROMPT }],
    usage: { input_tokens: input, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });

function home3(t) {
  return withHome(t, {
    // The collector names Claude sessions after the FILE stem; plant secrets there and in the project name too
    '.claude/projects/-a/secret-file-session.jsonl': jsonl(msg(SECRET_SID, 'a1', 100), msg(SECRET_SID, 'a2', 50, '2026-10-21T09:00:00.000Z')),
    '.claude/projects/-secret-project-dir/s4.jsonl': jsonl(msg('s4', 'd1', 5)),
    '.claude/projects/-b/s2.jsonl': jsonl(msg('s2', 'b1', 70)),
    '.claude/projects/-c/s3.jsonl': jsonl(msg('s3', 'c1', 30)),
  });
}
const cacheOf = (home) => join(home, '.cache', 'stackpulse');
const full = async () => normalizeCcusageReport(await runCcusage()).tools;
const canon = (tools) => JSON.parse(JSON.stringify(tools, (k, v) => (k === 'provenance' || k === 'diagnostics' ? undefined : v)));
const walk = (dir) => { const out = []; for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); e.isDirectory() ? out.push(...walk(p)) : out.push(p); } return out; };
const child = (home, mode = 'run') => spawnSync(process.execPath, [CHILD, cacheOf(home), mode], { env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: 'utf-8' });

// ── Privacy ─────────────────────────────────────────────────────────────────
test('cache holds aggregates only: no prompts, session ids, project paths or log links', { skip }, async (t) => {
  const home = home3(t);
  for (const strategy of ['auto', 'link']) await collectSharded({ cacheDir: cacheOf(home), strategy });
  const files = walk(cacheOf(home));
  assert.ok(files.some(f => /agg-/.test(f)), 'aggregates were cached');
  for (const f of files) {
    const st = statSync(f);
    assert.equal(st.nlink, 1, `${f} must not be a hard link to a log`);
    assert.ok(!f.endsWith('.jsonl'), `${f}: no raw logs in the cache`);
    const text = readFileSync(f, 'latin1');
    for (const secret of [SECRET_PROMPT, SECRET_SID, 'secret-file-session', 'secret-project', 'msg_a1', 'req_a1']) {
      assert.ok(!text.includes(secret), `${f} contains "${secret}"`);
    }
    if (/agg-/.test(f)) {
      const agg = JSON.parse(text);
      assert.ok(agg.session.every(x => Object.keys(x).join() === 'agent,metadata' && Object.keys(x.metadata).join() === 'lastActivity'),
        'session rows carry only agent + activity time (no session identifier)');
    }
  }
  assert.deepEqual(readdirSync(join(cacheOf(home), 'work')), [], 'no work directory left after a run');
});

// Allowlist: every file the cache may ever hold, and the exact shape of each.
test('serialized cache matches an allowlist: names are keyed hashes, contents are aggregates', { skip }, async (t) => {
  const home = home3(t);
  for (const strategy of ['auto', 'link']) await collectSharded({ cacheDir: cacheOf(home), strategy });
  const rel = walk(cacheOf(home)).map(f => f.slice(cacheOf(home).length + 1).split(/[\\/]/).join('/')).sort();
  for (const f of rel) assert.match(f, /^(secret|entries\/agg-[0-9a-f]{64}\.json|entries\/ids-[0-9a-f]{64}\.bin)$/, `unexpected cache file ${f}`);
  assert.equal(readFileSync(join(cacheOf(home), 'secret')).length, 32);
  const ALLOWED = new Set(['daily', 'session', 'warnings', 'period', 'agents', 'agent', 'modelBreakdowns', 'modelName', 'metadata', 'lastActivity',
    'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens', 'totalTokens', 'totalCost', 'costUSD', 'reasoningOutputTokens', 'cost', 'storedCost', 'missingPricing']);
  for (const f of rel.filter(f => f.endsWith('.json'))) {
    const agg = JSON.parse(readFileSync(join(cacheOf(home), f), 'utf-8'));
    assert.deepEqual(agg.warnings, [], `${f}: cached warnings would quote paths`);
    JSON.stringify(agg, (k, v) => {
      if (k && !/^\d+$/.test(k)) assert.ok(ALLOWED.has(k), `${f}: key "${k}" is not allowlisted`);
      if (typeof v === 'string') assert.match(v, /^(\d{4}-\d{2}-\d{2}(T[\d:.]+Z)?|claude|claude-[a-z0-9.-]+)$/, `${f}: string "${v}" is not a date, agent or model`);
      return v;
    });
  }
  for (const f of rel.filter(f => f.endsWith('.bin'))) assert.equal(statSync(join(cacheOf(home), f)).size % 8, 0, `${f}: 64-bit hashes only`);
});

test('cache keys and id hashes are keyed per cache: identical logs give unrelated names in two caches', { skip }, async (t) => {
  const home = home3(t);
  const a = join(home, '.cache', 'a'), b = join(home, '.cache', 'b');
  await collectSharded({ cacheDir: a });
  await collectSharded({ cacheDir: b });
  const names = (d) => readdirSync(join(d, 'entries')).sort();
  assert.ok(names(a).length > 0);
  assert.equal(names(a).filter(n => names(b).includes(n)).length, 0, 'no shared file names (no cross-cache correlation)');
  const bins = (d) => names(d).filter(n => n.endsWith('.bin')).map(n => readFileSync(join(d, 'entries', n)).toString('hex')).filter(Boolean).sort();
  assert.equal(bins(a).filter(x => bins(b).includes(x)).length, 0, 'no shared id-hash lists');
  // A lost or truncated secret just invalidates the cache, results stay exact
  const before = (await collectSharded({ cacheDir: a })).stats;
  assert.equal(before.computed, 0);
  writeFileSync(join(a, 'secret'), 'short');
  const { report, stats } = await collectSharded({ cacheDir: a });
  assert.deepEqual([stats.cached, stats.computed], [0, stats.shards]);
  assert.equal(readFileSync(join(a, 'secret')).length, 32);
  assert.deepEqual(canon(normalizeCcusageReport(report).tools), canon(await full()));
  assert.ok(names(a).every(n => names(b).every(m => m !== n)) && !names(a).some(n => n.endsWith('.tmp')), 'old entries and temp files pruned');
});

test('a shard whose collector run produced warnings (which quote paths) is never cached', { skip }, async (t) => {
  const home = home3(t);
  // Wrapper around the real collector that adds a path-bearing warning, as the collector does for unreadable files
  const wrapper = join(home, 'warn-cli.mjs');
  writeFileSync(wrapper, `import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, [${JSON.stringify(resolveCcusage().cli)}, ...process.argv.slice(2)], { encoding: 'utf-8', env: process.env });
process.stdout.write(r.stdout); process.stderr.write(r.stderr + 'WARN Skipped /home/u/secret-warn-path/x.jsonl\\n'); process.exit(r.status ?? 1);`);
  const runOpts = { cli: wrapper };
  const first = await collectSharded({ cacheDir: cacheOf(home), runOpts });
  const second = await collectSharded({ cacheDir: cacheOf(home), runOpts });
  assert.equal(second.stats.cached, 0, 'nothing cached while warnings occur');
  assert.ok(second.report.warnings.some(w => w.includes('secret-warn-path')), 'warnings still reach the user');
  for (const f of walk(cacheOf(home))) assert.ok(!readFileSync(f, 'latin1').includes('secret-warn-path'), `${f} holds a warning path`);
  assert.equal(first.stats.computed, first.stats.shards);
});

test('stale temp files left by a killed writer are pruned on the next complete run', { skip }, async (t) => {
  const home = home3(t);
  await collectSharded({ cacheDir: cacheOf(home) });
  const stale = join(cacheOf(home), 'entries', 'agg-deadbeef.json.12345.abc.tmp');
  writeFileSync(stale, '{"partial":');
  const past = new Date(Date.now() - 60_000); utimesSync(stale, past, past);
  await collectSharded({ cacheDir: cacheOf(home) });
  assert.ok(!existsSync(stale));
});

test('cache directories are owner-only', { skip: skip || (!posix && 'POSIX modes only') }, async (t) => {
  const home = home3(t);
  await collectSharded({ cacheDir: cacheOf(home) });
  for (const d of ['', 'entries', 'work']) assert.equal(statSync(join(cacheOf(home), d)).mode & 0o777, 0o700, d || 'cacheDir');
  for (const f of walk(join(cacheOf(home), 'entries'))) assert.equal(statSync(f).mode & 0o077, 0, `${f} readable by others`);
  assert.equal(statSync(join(cacheOf(home), 'secret')).mode & 0o077, 0, 'secret readable by others');
});

test('deleting a session removes its cached aggregates on the next run', { skip }, async (t) => {
  const home = home3(t);
  await collectSharded({ cacheDir: cacheOf(home) });
  const before = readdirSync(join(cacheOf(home), 'entries'));
  unlinkSync(join(home, '.claude/projects/-a/secret-file-session.jsonl'));
  await new Promise(r => setTimeout(r, 20));   // entries pruned are those older than the run
  const { report } = await collectSharded({ cacheDir: cacheOf(home) });
  const after = readdirSync(join(cacheOf(home), 'entries'));
  assert.ok(after.length < before.length, 'entries for the deleted project were pruned');
  assert.deepEqual(canon(normalizeCcusageReport(report).tools), canon(await full()));
});

// ── Interruption ────────────────────────────────────────────────────────────
function runUntilLinked(home) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [CHILD, cacheOf(home), 'hang'], { env: { ...process.env, HOME: home, USERPROFILE: home } });
    p.stdout.on('data', (d) => { if (String(d).includes('LINKED')) resolve(p); });
    p.on('exit', (code) => reject(new Error('child exited early: ' + code)));
  });
}
const linkedLogsIn = (dir) => (existsSync(dir) ? walk(dir).filter(f => f.endsWith('.jsonl')) : []);

test('SIGKILL mid-scan: leftover hard links are swept by the next run', { skip: skip || (!posix && 'signals differ on Windows') }, async (t) => {
  const home = home3(t);
  const p = await runUntilLinked(home);
  assert.ok(linkedLogsIn(join(cacheOf(home), 'work')).length > 0, 'links exist while the scan runs');
  p.kill('SIGKILL');
  await new Promise(r => p.once('exit', r));
  assert.ok(linkedLogsIn(join(cacheOf(home), 'work')).length > 0, 'SIGKILL cannot clean up');
  const { report } = await collectSharded({ cacheDir: cacheOf(home) });
  assert.deepEqual(linkedLogsIn(join(cacheOf(home), 'work')), [], 'next run swept them');
  assert.deepEqual(canon(normalizeCcusageReport(report).tools), canon(await full()));
});

test('SIGTERM / SIGINT mid-scan: the run removes its own links before exiting', { skip: skip || (!posix && 'signals differ on Windows') }, async (t) => {
  for (const sig of ['SIGTERM', 'SIGINT']) {
    const home = home3(t);
    const p = await runUntilLinked(home);
    p.kill(sig);
    await new Promise(r => p.once('exit', r));
    assert.deepEqual(linkedLogsIn(join(cacheOf(home), 'work')), [], `${sig}: links removed`);
  }
});

test('sweep keeps the work directory of a live concurrent scan', { skip: skip || (!posix && 'POSIX') }, async (t) => {
  const home = home3(t);
  const p = await runUntilLinked(home);
  try {
    sweepStaleWork(join(cacheOf(home), 'work'));
    assert.ok(linkedLogsIn(join(cacheOf(home), 'work')).length > 0, 'live run left alone');
  } finally { p.kill('SIGKILL'); await new Promise(r => p.once('exit', r)); }
});

// ── Concurrency and restart ─────────────────────────────────────────────────
test('two concurrent scans on one cache both stay exact; a later process reuses the cache', { skip }, async (t) => {
  const home = home3(t);
  const truth = canon(await full());
  const run = () => new Promise((resolve) => {
    const p = spawn(process.execPath, [CHILD, cacheOf(home), 'run'], { env: { ...process.env, HOME: home, USERPROFILE: home } });
    let out = ''; p.stdout.on('data', d => (out += d)); p.on('exit', () => resolve(JSON.parse(out.trim().split('\n').pop())));
  });
  const [a, b] = await Promise.all([run(), run()]);
  assert.deepEqual(canon(a.tools), truth);
  assert.deepEqual(canon(b.tools), truth);
  const c = JSON.parse(child(home).stdout.trim().split('\n').pop());   // new process = restart
  assert.deepEqual([c.stats.cached, c.stats.computed], [4, 0]);
  assert.deepEqual(canon(c.tools), truth);
});

// ── Changes during a scan ───────────────────────────────────────────────────
test('a log appended to while it is being read is re-read and not cached stale', { skip }, async (t) => {
  const home = home3(t);
  let once = false;
  const hooks = { beforeRun: (names) => {
    if (!once && names.includes('-b')) { once = true; appendFileSync(join(home, '.claude/projects/-b/s2.jsonl'), jsonl(msg('s2', 'b2', 500, '2026-10-22T10:00:00.000Z'))); }
  } };
  const { report, stats } = await collectSharded({ cacheDir: cacheOf(home), hooks });
  assert.equal(stats.changedDuringScan, 1);
  assert.deepEqual(canon(normalizeCcusageReport(report).tools), canon(await full()), 'result reflects the final file');
  const next = await collectSharded({ cacheDir: cacheOf(home) });
  assert.equal(next.stats.computed, 0, 'the re-read result was cached under the new fingerprint');
  assert.deepEqual(canon(normalizeCcusageReport(next.report).tools), canon(await full()));
});

// ── Link failure ────────────────────────────────────────────────────────────
test('hard-link failure (other volume) is a typed error and leaves nothing behind', { skip }, async (t) => {
  const home = home3(t);
  const hooks = { link: () => { const e = new Error('cross-device link'); e.code = 'EXDEV'; throw e; } };
  await assert.rejects(collectSharded({ cacheDir: cacheOf(home), hooks, strategy: 'link' }), (e) => e.code === 'shard-link' && /same filesystem/.test(e.message));
  assert.deepEqual(readdirSync(join(cacheOf(home), 'work')), []);
});

// ── Cache key completeness ──────────────────────────────────────────────────
test('changing timezone or date range invalidates cached shards', { skip }, async (t) => {
  const home = home3(t);
  await collectSharded({ cacheDir: cacheOf(home) });
  let r = await collectSharded({ cacheDir: cacheOf(home) });
  assert.equal(r.stats.computed, 0);
  process.env.TZ = 'Pacific/Kiritimati';
  try {
    r = await collectSharded({ cacheDir: cacheOf(home) });
    assert.equal(r.stats.computed, 4, 'timezone changes day grouping, so nothing is reused');
    assert.deepEqual(canon(normalizeCcusageReport(r.report).tools), canon(await full()));
  } finally { process.env.TZ = 'UTC'; }
  r = await collectSharded({ cacheDir: cacheOf(home), runOpts: { since: '20261021' } });
  assert.equal(r.stats.computed, 4, 'a different date range is a different result');
});

test('auto strategy: single-project groups create no hard links at all; only shared-message groups do', { skip }, async (t) => {
  const home = withHome(t, {
    '.claude/projects/-solo/a.jsonl': jsonl(msg('a', 'x1', 10)),
    '.claude/projects/-pair1/b.jsonl': jsonl(msg('b', 'shared', 10)),
    '.claude/projects/-pair2/c.jsonl': jsonl(msg('c', 'shared', 10), msg('c', 'y1', 5)),
  });
  const modes = [];
  let linksSeen = 0;
  const hooks = { beforeRun: (names, mode) => {
    modes.push(names.join('+') + ':' + mode);
    linksSeen += linkedLogsIn(join(cacheOf(home), 'work')).length;
  } };
  // Sequential, so each hook only sees links created for its own run
  const { report, stats } = await collectSharded({ cacheDir: cacheOf(home), hooks, concurrency: 1 });
  assert.deepEqual(modes.sort(), ['-pair1+-pair2:link', '-solo:filter']);
  assert.deepEqual([stats.filtered, stats.linked], [1, 1]);
  assert.equal(linksSeen, 2, 'only the shared-message pair was linked, temporarily');
  assert.deepEqual(canon(normalizeCcusageReport(report).tools), canon(await full()));
});
