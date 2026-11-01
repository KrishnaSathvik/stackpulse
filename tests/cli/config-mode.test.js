// Non-interactive CLI paths: --version and --config must work without prompts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
