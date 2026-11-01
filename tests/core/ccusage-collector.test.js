// Runs the real pinned collector against the fixture HOME. Offline: the
// dependency is installed locally and --offline uses bundled pricing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CCUSAGE_VERSION, resolveCcusage, runCcusage, normalizeCcusageReport } from '../../src/collectors/ccusage.js';

const fixtureHome = fileURLToPath(new URL('../fixtures/home-basic', import.meta.url));
const found = resolveCcusage();

test('installed collector matches the pinned version', { skip: !found.ok && found.reason }, () => {
  assert.equal(found.version, CCUSAGE_VERSION);
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
  assert.equal(pkg.dependencies.ccusage, CCUSAGE_VERSION, 'package.json must pin the exact version');
});

test('live collector output matches the captured fixture', { skip: !found.ok && found.reason }, async (t) => {
  // Work on a copy: anything the collector writes under HOME must not pollute fixtures.
  const home = mkdtempSync(join(tmpdir(), 'sp-collector-'));
  cpSync(fixtureHome, home, { recursive: true });
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const before = readdirSync(fixtureHome, { recursive: true }).sort();
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, TZ: process.env.TZ };
  Object.assign(process.env, { HOME: home, USERPROFILE: home, TZ: 'UTC' });
  delete process.env.CLAUDE_CONFIG_DIR; delete process.env.CODEX_HOME;
  try {
    const live = normalizeCcusageReport(await runCcusage());
    const captured = normalizeCcusageReport(JSON.parse(readFileSync(new URL('../fixtures/ccusage-20.0.46/home-basic.by-agent.json', import.meta.url))));
    for (const k of ['claude_code', 'codex']) {
      assert.equal(live.tools[k].sessions, captured.tools[k].sessions, k + ' sessions');
      assert.deepEqual(live.tools[k].tokens, captured.tools[k].tokens, k + ' tokens');
      assert.deepEqual(live.tools[k].modelBreakdown, captured.tools[k].modelBreakdown, k + ' models');
    }
  } finally {
    for (const [k, v] of Object.entries(saved)) (v == null ? delete process.env[k] : (process.env[k] = v));
  }
  assert.deepEqual(readdirSync(fixtureHome, { recursive: true }).sort(), before, 'fixture directory unchanged');
});

test('invalid date arguments are rejected before spawning', async () => {
  await assert.rejects(runCcusage({ since: '2026-01-01; rm -rf /' }), { code: 'bad-arg' });
});

// Stand-in collectors exercise the process-handling paths without the real binary.
async function fakeCli(t, body) {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'sp-fakecli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cli = join(dir, 'cli.mjs');
  writeFileSync(cli, body);
  return cli;
}

test('missing native binary is a typed failure, never reported as "no usage"', async (t) => {
  const cli = await fakeCli(t, `process.stderr.write('Missing optional native package "@ccusage/ccusage-linux-x64@20.0.46" for linux-x64.\\n'); process.exit(1);`);
  await assert.rejects(runCcusage({ cli }), (e) => e.code === 'binary-missing' && /Missing optional native package/.test(e.message));
});

test('non-zero exit with empty output is a failure', async (t) => {
  const cli = await fakeCli(t, `process.exit(3);`);
  await assert.rejects(runCcusage({ cli }), { code: 'exit' });
});

test('exit 0 with empty sections is genuinely no usage', async (t) => {
  const cli = await fakeCli(t, `console.log(JSON.stringify({ daily: [], session: [], totals: {} }));`);
  const r = normalizeCcusageReport(await runCcusage({ cli }));
  assert.deepEqual(r.tools, {});
});

test('a hung collector is killed at the timeout', async (t) => {
  const cli = await fakeCli(t, `setTimeout(() => {}, 60_000);`);
  await assert.rejects(runCcusage({ cli, timeoutMs: 300 }), { code: 'timeout' });
});

test('garbage output is rejected as invalid JSON', async (t) => {
  const cli = await fakeCli(t, `console.log('<html>proxy error</html>');`);
  await assert.rejects(runCcusage({ cli }), { code: 'invalid-json' });
});

test("a user's ccusage config files cannot change StackPulse's numbers", { skip: !found.ok && found.reason }, async (t) => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const home = mkdtempSync(join(tmpdir(), 'sp-cfg-'));
  const project = mkdtempSync(join(tmpdir(), 'sp-proj-'));
  cpSync(fixtureHome, home, { recursive: true });
  t.after(() => { rmSync(home, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); });
  // Measured: with this user config, an unisolated run reports 200 tokens instead of 24,200
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', 'ccusage.json'), JSON.stringify({ defaults: { since: '20261021' } }));
  mkdirSync(join(project, '.ccusage'), { recursive: true });
  writeFileSync(join(project, '.ccusage', 'ccusage.json'), JSON.stringify({ claude: { commands: { daily: { project: 'nope' } } } }));
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, TZ: process.env.TZ }, cwd = process.cwd();
  Object.assign(process.env, { HOME: home, USERPROFILE: home, TZ: 'UTC' });
  process.chdir(project);
  try {
    const r = normalizeCcusageReport(await runCcusage());
    assert.equal(r.tools.claude_code.tokens.total, 14_700);
    assert.equal(r.tools.codex.tokens.total, 9_500);
  } finally {
    process.chdir(cwd);
    for (const [k, v] of Object.entries(saved)) (v == null ? delete process.env[k] : (process.env[k] = v));
  }
});

test('collector out-of-memory abort becomes a clear, typed error', async (t) => {
  const cli = await fakeCli(t, `process.stderr.write('memory allocation of 102760464 bytes failed\\nstack backtrace:\\nnote: Some details are omitted, run with \`RUST_BACKTRACE=full\` for a verbose backtrace.\\n'); process.exit(134);`);
  await assert.rejects(runCcusage({ cli }), (e) => e.code === 'out-of-memory' && /ran out of memory/.test(e.message) && !/RUST_BACKTRACE/.test(e.message));
});

test('failure detail skips backtrace noise', async (t) => {
  const cli = await fakeCli(t, `process.stderr.write('Error: CliError("Failed to inspect database")\\nstack backtrace:\\nnote: run with \`RUST_BACKTRACE=full\`\\n'); process.exit(1);`);
  await assert.rejects(runCcusage({ cli }), (e) => e.code === 'exit' && /Failed to inspect database/.test(e.message));
});
