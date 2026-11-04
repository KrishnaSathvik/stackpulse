// Non-interactive CLI journeys and the card-building rules the wizard relies on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCardData, applyMetricTotal, mergeData, metricsNeedingInput } from '../../src/cli/card.js';
import { opener, openFile, openHint } from '../../src/cli/open.js';
import { parseEnteredCost } from '../../src/core/cost.js';

const bin = fileURLToPath(new URL('../../index.js', import.meta.url));
const fixture = fileURLToPath(new URL('../fixtures/home-basic', import.meta.url));

// FORCE_COLOR (even empty) overrides NO_COLOR, so drop it to test the real NO_COLOR path.
const { FORCE_COLOR, ...noForce } = process.env;

function runIn(t, args, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sp-flow-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, 'home');
  cpSync(fixture, home, { recursive: true });
  const r = spawnSync(process.execPath, [bin, ...args], {
    cwd: dir, encoding: 'utf-8', input: '',
    env: { ...noForce, HOME: home, USERPROFILE: home, TZ: 'UTC', NO_COLOR: '1', ...env },
  });
  return { ...r, dir };
}

test('non-TTY run scans and writes a default report without prompting', (t) => {
  const r = runIn(t, [], { COLUMNS: '80' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Scan complete · 2 tools detected · 11 not found/);
  assert.match(r.stdout, /Not an interactive terminal/);
  assert.match(r.stdout, /Report generated/);
  assert.doesNotMatch(r.stdout, /twitter\.com|intent\/tweet/, 'no share URL');
  assert.doesNotMatch(r.stdout, /\x1b/, 'NO_COLOR: no escape sequences, and no terminal reset');
  const html = readFileSync(join(r.dir, 'stackpulse.html'), 'utf-8');
  assert.ok(html.includes('Claude Code') && html.includes('Codex'));
});

test('--yes with overrides; --details prints models and detection results', (t) => {
  const r = runIn(t, ['-y', '--details', '--theme', 'light', '--title', 'Scripted', '-o', 'out']);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /Not an interactive terminal/);
  assert.match(r.stdout, /Cache read/);
  assert.match(r.stdout, /claude-zephyr-9-1/);
  assert.match(r.stdout, /Detection results/);
  const html = readFileSync(join(r.dir, 'out.html'), 'utf-8');
  assert.ok(html.includes('Scripted') && html.includes('#F4F4F0'));
});

test('nothing to report: clear failure, exit 1, no file', (t) => {
  const r = runIn(t, [], { HOME: '/nonexistent-sp-home', USERPROFILE: '/nonexistent-sp-home' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /None of the 13 supported tools/);
  assert.match(r.stderr, /No usage data was found/);
  assert.ok(!existsSync(join(r.dir, 'stackpulse.html')));
});

test('unwritable output: clear failure, no stack trace', (t) => {
  const r = runIn(t, ['-y', '-o', join('no', 'such', 'dir', 'x')]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Could not write .*the folder does not exist/);
  assert.doesNotMatch(r.stderr, /\n\s+at /);
});

test('manual cost: blank stays unavailable, explicit zero stays zero', () => {
  assert.equal(parseEnteredCost(''), null);
  const scanned = { claude_code: { sessions: 3, tokens_used: 10, cost_usd: 1, cost: { kind: 'estimated', status: 'complete' } } };
  const details = { title: 't', timeframe: 'f', username: '', theme: 'dark' };
  const card = (manualData) => buildCardData({ scanned, manualData, selectedKeys: ['claude_code', 'cursor', 'opencode'],
    selectedMetrics: ['sessions', 'cost_usd'], details });
  const c = card({ cursor: { sessions: 5 }, opencode: { sessions: 2, cost_usd: 0 } });
  const row = (k) => c.tools.find(x => x.key === k);
  assert.equal(row('cursor').metrics.cost_usd, null);
  assert.equal(row('cursor').costInfo, null);
  assert.equal(row('opencode').metrics.cost_usd, 0);
  assert.equal(row('opencode').costInfo.kind, 'manual');
});

test('a manual metric total lands on the first selected tool with sessions; a blank one is skipped', () => {
  const scanned = { claude_code: { sessions: 3 }, cursor: { sessions: 9 } };
  const manualData = {};
  const allData = mergeData(scanned, manualData);
  assert.deepEqual(metricsNeedingInput(['sessions', 'hours_saved', 'cost_usd'], allData), ['hours_saved', 'cost_usd']);
  const ctx = { scanned, manualData, allData, selectedKeys: ['claude_code', 'cursor'] };
  applyMetricTotal(ctx, 'hours_saved', 12);
  applyMetricTotal(ctx, 'cost_usd', null);
  assert.equal(scanned.claude_code.hours_saved, 12);
  assert.equal(scanned.cursor.hours_saved, undefined);
  assert.equal(scanned.claude_code.cost_usd, undefined);
});

test('opener: one argument, no shell, per platform', () => {
  assert.deepEqual(opener('darwin'), { cmd: 'open', args: [] });
  assert.deepEqual(opener('linux'), { cmd: 'xdg-open', args: [] });
  assert.equal(opener('win32').cmd, 'rundll32');
  assert.equal(opener('aix'), null);
  assert.equal(openHint('stackpulse.html', 'darwin'), 'open stackpulse.html');
  assert.equal(openHint('my report.html', 'linux'), 'xdg-open "my report.html"');
});

test('openFile reports success only when the opener exits cleanly', async () => {
  const fake = (behave) => (cmd, args, o) => {
    const c = new EventEmitter(); c.unref = () => {};
    fake.calls = { cmd, args, o };
    setImmediate(() => behave(c));
    return c;
  };
  assert.deepEqual(await openFile('/r.html', { platform: 'darwin', spawnFn: fake(c => c.emit('exit', 0, null)) }), { ok: true });
  assert.deepEqual(fake.calls.args, ['/r.html']);
  assert.equal(fake.calls.o.shell, undefined);
  const missing = await openFile('/r.html', { platform: 'linux', spawnFn: fake(c => c.emit('error', Object.assign(new Error('x'), { code: 'ENOENT' }))) });
  assert.deepEqual(missing, { ok: false, reason: 'xdg-open is not available' });
  const bad = await openFile('/r.html', { platform: 'linux', spawnFn: fake(c => c.emit('exit', 3, null)) });
  assert.equal(bad.ok, false);
  const hung = await openFile('/r.html', { platform: 'linux', timeoutMs: 20, spawnFn: fake(() => {}) });
  assert.equal(hung.ok, false);
  assert.equal((await openFile('/r.html', { platform: 'aix' })).ok, false);
});
