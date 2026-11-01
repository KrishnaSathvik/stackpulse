// Out-of-memory classification must be confident: a bare SIGKILL (kill -9, process
// managers) is NOT an OOM unless the kernel's OOM-kill counter rose during the run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readOomKillCount } from '../../src/utils/oom.js';
import { runCcusage, resolveCcusage } from '../../src/collectors/ccusage.js';

const linux = process.platform === 'linux';

function fakeTree(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'sp-cg-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

test('cgroup v1: sums oom_kill over our memory cgroup and its ancestors', { skip: !linux && 'Linux only' }, (t) => {
  const root = fakeTree(t, {
    'proc': '4:memory:/docker/abc\n0::/\n',
    'cg/memory/docker/abc/memory.oom_control': 'oom_kill_disable 0\nunder_oom 0\noom_kill 2\n',
    'cg/memory/docker/memory.oom_control': 'oom_kill 1\n',   // limit set on a parent
  });
  assert.equal(readOomKillCount(join(root, 'proc'), join(root, 'cg')), 3);
});

test('cgroup v2: reads memory.events up the hierarchy', { skip: !linux && 'Linux only' }, (t) => {
  const root = fakeTree(t, {
    'proc': '0::/user.slice/app.scope\n',
    'cg/user.slice/app.scope/memory.events': 'low 0\nhigh 0\nmax 4\noom 1\noom_kill 1\n',
    'cg/user.slice/memory.events': 'oom_kill 0\n',
  });
  assert.equal(readOomKillCount(join(root, 'proc'), join(root, 'cg')), 1);
});

test('no readable counter → null (callers must not assume OOM)', { skip: !linux && 'Linux only' }, (t) => {
  const root = fakeTree(t, { 'proc': '4:memory:/x\n' });
  assert.equal(readOomKillCount(join(root, 'proc'), join(root, 'cg')), null);
});

test('a bare SIGKILL is "killed", never out-of-memory', { skip: !linux && 'signals' }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sp-kill-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cli = join(dir, 'cli.mjs');
  writeFileSync(cli, `process.kill(process.pid, 'SIGKILL');`);
  await assert.rejects(runCcusage({ cli }), (e) => e.code === 'killed' && /not identified as out-of-memory/.test(e.message) && e.evidence === null);
});

// Real kernel OOM kill under an AGGREGATE (cgroup) limit — runs where this process may
// create a child memory cgroup (e.g. Linux CI with cgroup v1/v2 delegation).
function makeLimitedCgroup(limitBytes) {
  if (!linux) return null;
  const line = readFileSync('/proc/self/cgroup', 'utf-8').split('\n').find(l => l.split(':')[1]?.split(',').includes('memory'));
  if (!line) return null;
  const dir = join('/sys/fs/cgroup/memory', line.split(':')[2], `sp-test-${process.pid}-${Date.now()}`);
  try {
    mkdirSync(dir);
    writeFileSync(join(dir, 'memory.limit_in_bytes'), String(limitBytes));
    try { writeFileSync(join(dir, 'memory.memsw.limit_in_bytes'), String(limitBytes)); } catch {}
    return dir;
  } catch { return null; }
}

// Kill anything still in the cgroup (a collector whose parent was killed can outlive it
// briefly), then remove it; rmdir fails with EBUSY while any task remains.
function removeCgroup(dir) {
  for (let i = 0; i < 50; i++) {
    try { for (const pid of readFileSync(join(dir, 'tasks'), 'utf-8').split('\n').filter(Boolean)) try { process.kill(Number(pid), 'SIGKILL'); } catch {} } catch {}
    try { rmdirSync(dir); return; } catch (e) { if (e.code === 'ENOENT') return; }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  assert.fail(`could not remove test cgroup ${dir}`);
}

test('real kernel OOM kill under a cgroup limit → out-of-memory with cgroup evidence', async (t) => {
  if (!resolveCcusage().ok) return t.skip('collector not installed');
  // The limit must leave room for the probe's own Node processes (~50 MB each on Node 24+),
  // so that the collector, not the probe, is the largest process when the kernel picks a victim.
  const cg = makeLimitedCgroup(192 * 1024 * 1024);
  if (!cg) return t.skip('cannot create a memory cgroup here');
  t.after(() => removeCgroup(cg));
  // A history large enough to need far more than 192 MB in the collector (~2x its ~140 MB size).
  const home = mkdtempSync(join(tmpdir(), 'sp-oomhome-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const dir = join(home, '.claude', 'projects', '-p');
  mkdirSync(dir, { recursive: true });
  const line = (i) => JSON.stringify({ type: 'assistant', sessionId: 's' + (i % 50), timestamp: '2026-10-20T10:00:00.000Z', requestId: 'r' + i,
    message: { id: 'm' + i, model: 'claude-opus-4-6', content: [{ type: 'text', text: 'x'.repeat(300) }],
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
  for (let f = 0; f < 50; f++) writeFileSync(join(dir, `s${f}.jsonl`), Array.from({ length: 6000 }, (_, i) => line(f * 6000 + i)).join('\n') + '\n');
  // Run the classification inside the limited cgroup (child joins it before spawning the collector).
  const probe = fileURLToPath(new URL('../helpers/oom-probe.mjs', import.meta.url));
  const out = execFileSync('sh', ['-c', `echo $$ > ${cg}/cgroup.procs; exec "${process.execPath}" "${probe}"`],
    { env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: 'utf-8' });
  const r = JSON.parse(out.trim().split('\n').pop());
  assert.deepEqual([r.code, r.evidence], ['out-of-memory', 'cgroup-oom-kill'], JSON.stringify(r));
  assert.match(r.message, /probable memory-related termination/, 'counter evidence is reported as probable, not certain');
});

test('end to end under an aggregate limit: full run OOM-killed → one low-memory retry → exact totals', async (t) => {
  if (!resolveCcusage().ok) return t.skip('collector not installed');
  const cg = makeLimitedCgroup(110 * 1024 * 1024);
  if (!cg) return t.skip('cannot create a memory cgroup here');
  t.after(() => removeCgroup(cg));
  const home = mkdtempSync(join(tmpdir(), 'sp-oomfb-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const PROJECTS = 20, LINES = 3000;   // ~35 MB: too much for one run at 110 MB, fine one project at a time
  for (let p = 0; p < PROJECTS; p++) {
    const dir = join(home, '.claude', 'projects', `-p${p}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `s${p}.jsonl`), Array.from({ length: LINES }, (_, i) => JSON.stringify({ type: 'assistant', sessionId: `s${p}`,
      timestamp: '2026-10-20T10:00:00.000Z', requestId: `r${p}_${i}`, message: { id: `m${p}_${i}`, model: 'claude-opus-4-6',
        content: [{ type: 'text', text: 'x'.repeat(300) }], usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } })).join('\n') + '\n');
  }
  const probe = fileURLToPath(new URL('../helpers/oom-fallback-probe.mjs', import.meta.url));
  const out = execFileSync('sh', ['-c', `echo $$ > ${cg}/cgroup.procs; exec "${process.execPath}" "${probe}"`],
    { env: { ...process.env, HOME: home, USERPROFILE: home, TZ: 'UTC' }, encoding: 'utf-8' });
  const r = JSON.parse(out.trim().split('\n').pop());
  assert.equal(r.mode, 'sharded-after-oom', JSON.stringify(r));
  assert.deepEqual([r.firstError, r.evidence], ['out-of-memory', 'cgroup-oom-kill']);
  assert.equal(r.tokens, PROJECTS * LINES * 2, 'exact tokens after the retry');
  assert.equal(r.sessions, PROJECTS);
  assert.equal(r.notices.length, 1);
});
