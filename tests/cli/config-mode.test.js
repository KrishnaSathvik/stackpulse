// Non-interactive CLI paths: --version and --config must work without prompts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../../index.js', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));

test('--version reports the package version', () => {
  const out = execFileSync(process.execPath, [bin, '--version'], { encoding: 'utf-8' });
  assert.match(out, new RegExp(pkg.version.replace(/\./g, '\\.')));
});

test('--config renders an escaped card and keeps omitted metrics unavailable', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sp-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cfg = join(dir, 'card.json');
  writeFileSync(cfg, JSON.stringify({
    title: 'Ship <it>', theme: 'light', metrics: ['sessions', 'cost_usd'],
    tools: { claude_code: { sessions: 12, cost_usd: 3.5 }, cursor: { sessions: 40 } },
  }));
  execFileSync(process.execPath, [bin, '--config', cfg, '--output', join(dir, 'out')], { encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1' } });
  const html = readFileSync(join(dir, 'out.html'), 'utf-8');
  assert.ok(html.includes('Ship &lt;it&gt;'));
  assert.ok(!html.includes('Ship <it>'));
  assert.match(html, /1 of 2 tools/, "Cursor's cost was not given, so it is unavailable rather than $0");
});

const runCli = (args) => {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf-8', env: { ...process.env, NO_COLOR: '1' } });
};

test('--theme / --title / --username override the config file, as --help documents', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sp-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cfg = join(dir, 'card.yaml');
  writeFileSync(cfg, 'title: From file\ntheme: dark\nusername: filehandle\ntools:\n  claude_code: {sessions: 3}\n');
  const r = runCli(['--config', cfg, '--theme', 'light', '--title', 'From flag', '--username', 'flaghandle', '-o', join(dir, 'out')]);
  assert.equal(r.status, 0, r.stderr);
  const html = readFileSync(join(dir, 'out.html'), 'utf-8');
  assert.ok(html.includes('From flag') && !html.includes('From file'));
  assert.ok(html.includes('flaghandle') && !html.includes('filehandle'));
  assert.ok(html.includes('#F4F4F0') && !html.includes('#0A0A0B'), 'light theme applied, not dark');
});

test('unknown themes and unreadable or malformed configs fail with a clear message, not a stack trace', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'sp-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cases = [
    [['--theme', 'nope', '--init', join(dir, 'x.yaml')], /unknown theme 'nope'/],
    [['--config', join(dir, 'missing.yaml')], /Cannot read config file .*file not found/],
    [['--config', (writeFileSync(join(dir, 'bad.yaml'), 'title: [x\n'), join(dir, 'bad.yaml'))], /not valid YAML/],
    [['--config', (writeFileSync(join(dir, 'bad.json'), '{"title": '), join(dir, 'bad.json'))], /not valid JSON/],
    [['--config', (writeFileSync(join(dir, 'list.yaml'), '- a\n'), join(dir, 'list.yaml'))], /must contain a mapping/],
    [['--config', (writeFileSync(join(dir, 'th.yaml'), 'theme: nope\n'), join(dir, 'th.yaml'))], /Unknown theme "nope"/],
  ];
  for (const [args, rx] of cases) {
    const r = runCli(args);
    assert.equal(r.status, 1, args.join(' '));
    assert.match(r.stderr, rx);
    assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
  }
});
