// Codex corrections (src/collectors/codex.js), run against the real pinned collector
// on synthetic Codex homes. Each test also pins the upstream behaviour being
// corrected, so a collector upgrade that changes it is noticed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectReport, normalizeCcusageReport, resolveCcusage, runCcusage } from '../../src/collectors/ccusage.js';
import { configuredServiceTier, ownForkSession, sweepStaleTempDirs, tempDir, TEMP_PREFIX, tierChangesCost, writeRecoveredHome } from '../../src/collectors/codex.js';

const found = resolveCcusage();
const skip = !found.ok && found.reason;
const MODEL = 'gpt-5.6-sol';   // has a priority multiplier in the bundled prices

// ─── Synthetic Codex logs ────────────────────────────────────────────────────
const line = (timestamp, type, payload) => JSON.stringify({ timestamp, type, payload });
const usage = (input, cached, output) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output,
  reasoning_output_tokens: 0, total_tokens: input + output });
const tokenCount = (ts, total, last) => line(ts, 'event_msg', { type: 'token_count', info: { total_token_usage: total, last_token_usage: last } });
const settings = (ts, tier) => line(ts, 'event_msg', { type: 'thread_settings_applied', thread_settings: { model: MODEL, service_tier: tier } });
const meta = (ts, id, fork) => line(ts, 'session_meta', { id, timestamp: ts, cwd: '/w', originator: 'codex_cli_rs', cli_version: '0.150.0',
  ...(fork ? { forked_from_id: fork, parent_thread_id: fork, session_id: fork, thread_source: 'subagent', history_mode: 'paginated',
    source: { subagent: { thread_spawn: { parent_thread_id: fork, depth: 1 } } } } : {}) });

/**
 * One turn of 100K input (no cache) + 10K output, optionally after a recorded tier.
 * `hour` keeps sessions apart: the collector merges identical events across files.
 */
function session(id, tier, hour = 10) {
  const at = (s) => `2026-10-20T${String(hour).padStart(2, '0')}:00:${s}.000Z`;
  return [
    meta(at('00'), id),
    ...(tier ? [settings(at('00'), tier)] : []),
    line(at('01'), 'turn_context', { cwd: '/w', model: MODEL }),
    tokenCount(at('10'), usage(100000, 0, 10000), usage(100000, 0, 10000)),
  ];
}

function codexHome(t, files, config) {
  const root = mkdtempSync(join(tmpdir(), 'sp-fixture-codex-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const codex = join(root, '.codex');
  const day = join(codex, 'sessions', '2026', '10', '20');
  mkdirSync(day, { recursive: true });
  for (const [name, lines] of Object.entries(files)) writeFileSync(join(day, `rollout-${name}.jsonl`), lines.join('\n') + '\n');
  if (config) writeFileSync(join(codex, 'config.toml'), config);
  return { root, codex };
}

// Read only the synthetic home: every agent location points inside it.
const envFor = ({ root, codex }) => ({ HOME: root, USERPROFILE: root, CODEX_HOME: codex, TZ: 'UTC', CLAUDE_CONFIG_DIR: undefined,
  XDG_DATA_HOME: undefined, XDG_CONFIG_HOME: undefined });
const sessionCosts = (raw) => Object.fromEntries(raw.session.filter(s => s.agent === 'codex').map(s => [s.period.split('-').pop(), s.totalCost]));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);

// ─── Service tier ────────────────────────────────────────────────────────────
test('config.toml service_tier: top-level only, and whether it changes cost', (t) => {
  const { codex } = codexHome(t, {}, 'model = "x"\nservice_tier = "priority"\n[profiles.fast]\nservice_tier = "flex"\n');
  assert.equal(configuredServiceTier(codex), 'priority');
  const { codex: c2 } = codexHome(t, {}, '[profiles.p]\nservice_tier = "priority"\n');
  assert.equal(configuredServiceTier(c2), null);
  assert.equal(tierChangesCost('priority'), true);
  assert.equal(tierChangesCost('default'), false);
  assert.equal(tierChangesCost(null), false);
});

test('recorded tiers are kept; unrecorded usage is costed at the standard rate, not at today\'s config', { skip }, async (t) => {
  const home = codexHome(t, {
    'unrecorded-u': session('u', null, 10), 'recorded-p': session('p', 'priority', 11), 'recorded-d': session('d', 'default', 12),
  }, 'service_tier = "priority"\n');
  const env = envFor(home);

  // Upstream (ccusage auto): the unrecorded session takes today's "priority" from config.toml.
  const upstream = sessionCosts(await runCcusage({ env }));
  near(upstream.u, upstream.p, 'upstream prices the unrecorded session at the configured tier');

  const raw = await collectReport({ env, codexHome: home.codex });
  const c = sessionCosts(raw);
  near(c.u, c.d, 'unrecorded = standard rate');
  near(c.p, upstream.p, 'recorded priority is kept');
  assert.ok(c.p > c.u * 1.5, 'priority costs more than standard');

  const codex = normalizeCcusageReport(raw).tools.codex;
  near(codex.cost_usd, c.u + c.p + c.d, 'tool cost');
  assert.equal(codex.sessions, 3);
  assert.equal(codex.cost.tier.unrecorded, 'standard');
  assert.equal(codex.cost.tier.configured, 'priority');
  near(codex.cost.tier.configuredUsd, upstream.u + upstream.p + upstream.d, 'alternative = upstream figure');
  near(codex.cost.tier.dependentUsd, upstream.u - c.u, 'only the unrecorded session depends on the assumption');
});

test('no tier in config.toml: costs equal the collector\'s and nothing is flagged', { skip }, async (t) => {
  const home = codexHome(t, { 'unrecorded-u': session('u', null, 10), 'recorded-p': session('p', 'priority', 11) }, 'model = "gpt-5.6-sol"\n');
  const env = envFor(home);
  const upstream = normalizeCcusageReport(await runCcusage({ env })).tools.codex;
  const codex = normalizeCcusageReport(await collectReport({ env, codexHome: home.codex })).tools.codex;
  assert.equal(codex.cost_usd, upstream.cost_usd);
  assert.equal(codex.cost.tier, undefined);
});

// ─── Forked sessions ─────────────────────────────────────────────────────────
const P = 'p0000000-0000-0000-0000-000000000001';
const parentLines = [
  meta('2026-10-20T10:00:00.000Z', P),
  line('2026-10-20T10:00:01.000Z', 'turn_context', { cwd: '/w', model: MODEL }),
  tokenCount('2026-10-20T10:00:10.000Z', usage(1000, 0, 100), usage(1000, 0, 100)),
  tokenCount('2026-10-20T10:00:20.000Z', usage(3000, 0, 300), usage(2000, 0, 200)),
  tokenCount('2026-10-20T10:00:30.000Z', usage(6000, 0, 600), usage(3000, 0, 300)),
];
/**
 * A fork replays parent history, then adds its own usage (40K + 4K, then 50K + 5K).
 * `window`: after compaction a paginated fork replays only the parent's recent
 * events, not its start — the case the collector drops (found in real Codex logs).
 */
function forkLines(id, parent, ts, ownTs, { window = false } = {}) {
  const replays = [
    tokenCount(ts, usage(1000, 0, 100), usage(1000, 0, 100)),
    tokenCount(ts, usage(3000, 0, 300), usage(2000, 0, 200)),
    tokenCount(ts, usage(6000, 0, 600), usage(3000, 0, 300)),
  ];
  return [
    meta(ts, id, parent),
    line(ts, 'turn_context', { cwd: '/w', model: MODEL }),
    ...(window ? replays.slice(1) : replays),
    tokenCount(ownTs[0], usage(46000, 0, 4600), usage(40000, 0, 4000)),
    tokenCount(ownTs[0], usage(46000, 0, 4600), usage(40000, 0, 4000)),   // repeated snapshot
    tokenCount(ownTs[1], usage(96000, 0, 9600), usage(50000, 0, 5000)),
  ];
}
const OWN = 44000 + 55000;
const PARENT = 1100 + 2200 + 3300;
const burst = '2026-10-20T11:00:00.000Z';

test('a fork written in one burst after compaction is dropped upstream and recovered once, without its parent\'s history', { skip }, async (t) => {
  const home = codexHome(t, {
    'parent-p': parentLines,
    // Whole thread written at the fork's creation time, replaying a window of the parent: upstream drops it.
    'burst-f': forkLines('f0000000-0000-0000-0000-000000000002', P, burst, [burst, burst], { window: true }),
    // Ordinary fork: replay burst first, own events later. Upstream counts it.
    'normal-g': forkLines('g0000000-0000-0000-0000-000000000003', P, '2026-10-20T12:00:00.000Z',
      ['2026-10-20T12:01:00.000Z', '2026-10-20T12:02:00.000Z']),
  });
  const env = envFor(home);

  const upstream = normalizeCcusageReport(await runCcusage({ env })).tools.codex;
  assert.equal(upstream.sessions, 2, 'upstream drops the burst-written fork');
  assert.equal(upstream.tokens.total, PARENT + OWN, 'upstream counts the parent and the ordinary fork once each');

  const raw = await collectReport({ env, codexHome: home.codex });
  const codex = normalizeCcusageReport(raw).tools.codex;
  assert.equal(codex.sessions, 3);
  assert.equal(codex.tokens.total, PARENT + OWN + OWN, 'the recovered fork adds only its own usage');
  assert.equal(codex.coverage.status, 'complete');
  assert.ok(codex.diagnostics.some(d => d.code === 'codex-forks-recovered' && d.level === 'info'));
  assert.equal(codex.daily.reduce((a, d) => a + d.totalTokens, 0), codex.tokens.total, 'daily rows agree');
  assert.deepEqual(raw.codex.recovered, ['2026/10/20/rollout-burst-f']);
});

test('a dropped fork whose parent is missing is not guessed at: not counted, reported, coverage incomplete', { skip }, async (t) => {
  const home = codexHome(t, {
    'orphan-h': forkLines('h0000000-0000-0000-0000-000000000004', 'missing-parent', burst, [burst, burst]),
    'plain-u': session('u'),
  });
  const codex = normalizeCcusageReport(await collectReport({ env: envFor(home), codexHome: home.codex })).tools.codex;
  assert.equal(codex.sessions, 1);
  assert.equal(codex.coverage.status, 'partial');
  assert.ok(codex.diagnostics.some(d => d.code === 'codex-forks-unverified'));
});

test('fork filter: replays and repeated snapshots removed, fork metadata dropped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sp-fork-unit-'));
  try {
    const f = join(dir, 'f.jsonl');
    writeFileSync(f, forkLines('f1', P, burst, [burst, burst], { window: true }).join('\n') + '\n');
    const parentKeys = new Set(parentLines.slice(2).map(l => JSON.parse(l).payload.info.total_token_usage)
      .map(u => JSON.stringify(Object.keys(u).sort().map(k => [k, u[k]]))));
    const own = ownForkSession(f, parentKeys);
    assert.equal(own.replayed, 2);
    assert.equal(own.tokens, OWN);
    const out = own.text.trim().split('\n').map(l => JSON.parse(l));
    assert.equal(out[0].payload.forked_from_id, undefined);
    assert.equal(out[0].payload.id, 'f1');
    assert.equal(out.filter(o => o.payload?.type === 'token_count').length, 3, 'own events kept, repeated snapshot left for the collector');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ─── Temporary folders: private, usage-only, always removed ─────────────────
// Each test gets its own temp root (TMPDIR), so parallel test files can't interfere.
function privateTmp(t) {
  const root = mkdtempSync(join(tmpdir(), 'sp-test-tmp-'));
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = root;
  t.after(() => { saved == null ? delete process.env.TMPDIR : (process.env.TMPDIR = saved); rmSync(root, { recursive: true, force: true }); });
  return root;
}
const ours = (root) => readdirSync(root).filter(n => n.startsWith(TEMP_PREFIX));

test('temporary views and copies are removed after a scan', { skip }, async (t) => {
  const root = privateTmp(t);
  const home = codexHome(t, { 'parent-p': parentLines, 'burst-f': forkLines('f9', P, burst, [burst, burst], { window: true }) }, 'service_tier = "priority"\n');
  const raw = await collectReport({ env: envFor(home), codexHome: home.codex });
  assert.equal(raw.codex.recovered.length, 1, 'the fork was recovered through a temp copy');
  assert.deepEqual(ours(root), []);
});

test('temporary folders are removed when the collector fails', { skip }, async (t) => {
  const root = privateTmp(t);
  const home = codexHome(t, { 'plain-u': session('u') });
  const cli = join(root, 'fail.mjs');
  writeFileSync(cli, 'process.stderr.write("error: simulated failure\\n"); process.exit(3);');
  await assert.rejects(collectReport({ env: envFor(home), codexHome: home.codex, cli }));
  assert.deepEqual(ours(root), []);
});

test('recovered copies are private (0700 folders, 0600 files) and hold usage only', (t) => {
  if (process.platform === 'win32') return;   // POSIX modes
  privateTmp(t);
  const dir = mkdtempSync(join(tmpdir(), 'sp-fork-'));
  const fork = join(dir, 'f.jsonl');
  const secret = 'PLEASE-DO-NOT-COPY-THIS-MESSAGE';
  const lines = forkLines('f1', P, burst, [burst, burst], { window: true });
  lines.splice(2, 0,
    line(burst, 'response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: secret }] }),
    line(burst, 'compacted', { message: secret, replacement_history: [secret], latest_token_usage_record: { usage: usage(1, 0, 1) } }));
  writeFileSync(fork, lines.join('\n') + '\n');
  const parentKeys = new Set();
  const own = ownForkSession(fork, parentKeys);
  assert.ok(!own.text.includes(secret), 'no conversation text in the copy');
  assert.ok(own.text.includes('"token_count"') && own.text.includes(MODEL), 'usage and model kept');

  const configDir = join(dir, 'cfg'); mkdirSync(configDir);
  writeFileSync(join(configDir, 'config.toml'), 'service_tier = "priority"\n[mcp_servers.x]\nenv = { TOKEN = "' + secret + '" }\n');
  const t2 = tempDir('perm');
  t.after(() => { t2.cleanup(); rmSync(dir, { recursive: true, force: true }); });
  writeRecoveredHome([{ period: '2026/10/20/rollout-f', dir: 'sessions', ...own }], t2.dir, configDir);
  const mode = (p) => statSync(p).mode & 0o777;
  assert.equal(mode(t2.dir), 0o700);
  assert.equal(mode(join(t2.dir, 'sessions', '2026', '10', '20')), 0o700);
  assert.equal(mode(join(t2.dir, 'sessions', '2026', '10', '20', 'rollout-f.jsonl')), 0o600);
  assert.equal(readFileSync(join(t2.dir, 'config.toml'), 'utf-8'), 'service_tier = "priority"\n', 'only the tier, not the rest of the config');
  assert.equal(mode(join(t2.dir, 'config.toml')), 0o600);
});

test('folders left by a crash are swept at the next scan, without following links', (t) => {
  const root = privateTmp(t);
  const target = mkdtempSync(join(tmpdir(), 'sp-real-sessions-'));
  t.after(() => rmSync(target, { recursive: true, force: true }));
  writeFileSync(join(target, 'keep.jsonl'), 'real session\n');
  const stale = join(root, TEMP_PREFIX + 'view-crashed'), fresh = join(root, TEMP_PREFIX + 'view-running');
  for (const d of [stale, fresh]) { mkdirSync(d); symlinkSync(target, join(d, 'sessions'), process.platform === 'win32' ? 'junction' : 'dir'); }
  const old = new Date(Date.now() - 60 * 60_000);
  utimesSync(stale, old, old);
  assert.deepEqual(sweepStaleTempDirs({ root }), [TEMP_PREFIX + 'view-crashed']);
  assert.ok(!existsSync(stale), 'stale folder removed');
  assert.ok(existsSync(fresh), 'a folder another scan may be using is left alone');
  assert.equal(readFileSync(join(target, 'keep.jsonl'), 'utf-8'), 'real session\n', 'the linked real folder is untouched');
});

test('Ctrl+C during a scan removes the temporary folders', { skip: process.platform === 'win32' && 'POSIX signals' }, async (t) => {
  const root = privateTmp(t);
  const mod = new URL('../../src/collectors/codex.js', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    const { tempDir } = await import(${JSON.stringify(mod)});
    const { writeFileSync } = await import('node:fs');
    const t = tempDir('forks'); writeFileSync(t.dir + '/copy.jsonl', 'usage', { mode: 0o600 });
    console.log(t.dir); setInterval(() => {}, 1000);`], { env: { ...process.env, TMPDIR: root }, stdio: ['ignore', 'pipe', 'inherit'] });
  const dir = await new Promise(r => child.stdout.once('data', d => r(String(d).trim())));
  assert.ok(existsSync(dir), 'folder exists while the scan runs');
  const exited = new Promise(r => child.once('exit', (code, signal) => r({ code, signal })));
  child.kill('SIGINT');
  const { signal } = await exited;
  assert.equal(signal, 'SIGINT', 'the process still stops on Ctrl+C');
  assert.ok(!existsSync(dir), 'folder removed');
  assert.deepEqual(ours(root), []);
});
