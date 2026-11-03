// detect() for every adapter: positive on its own storage, negative on an empty HOME,
// and no cross-detection from another tool's directories.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { withHome } from '../helpers/home.js';

const ADAPTERS = {
  'claude-code': '.claude/projects/x/s.jsonl',
  codex: '.codex/sessions/2026/01/01/r.jsonl',
  opencode: '.local/share/opencode/storage/x',
  amp: '.local/share/amp/threads/t.json',
  pi: '.pi/agent/sessions/s.jsonl',
  gemini: '.gemini/tmp/h/chats/c.json',
  qwen: '.qwen/projects/p/chats/c.jsonl',
  kimi: '.kimi-code/sessions/s/wire.jsonl',
  cursor: '.config/Cursor/User/globalStorage/state.vscdb',
  antigravity: '.config/Antigravity/User/globalStorage/state.vscdb',
  roocode: '.config/Code/User/globalStorage/rooveterinaryinc.roo-cline/x',
  kilocode: '.vscode/extensions/kilocode.kilo-code-4.0.0/package.json',
  aider: 'projects/repo/.aider.chat.history.md',
};

const mods = Object.fromEntries(await Promise.all(Object.keys(ADAPTERS).map(async k => [k, await import(`../../parsers/${k}.js`)])));

test('every adapter detects nothing on an empty home', (t) => {
  const home = withHome(t);
  process.env.PATH = join(home, 'empty-bin');           // no `aider` on PATH
  delete process.env.CLAUDE_CONFIG_DIR; delete process.env.CODEX_HOME; delete process.env.OPENCODE_DATA_DIR;
  for (const [k, m] of Object.entries(mods)) assert.equal(m.detect({ home }), false, k);
});

for (const [key, rel] of Object.entries(ADAPTERS)) {
  test(`${key}: detected from its own storage only`, (t) => {
    const home = withHome(t, { [rel]: '{}' });
    process.env.PATH = join(home, 'empty-bin');
    delete process.env.CLAUDE_CONFIG_DIR; delete process.env.CODEX_HOME; delete process.env.OPENCODE_DATA_DIR;
    assert.equal(mods[key].detect({ home }), true, `${key} should detect ${rel}`);
    // Roo/Kilo legitimately share VS Code dirs with nothing else here; others must not cross-detect.
    const others = Object.entries(mods).filter(([k, m]) => k !== key && m.detect({ home })).map(([k]) => k);
    assert.deepEqual(others, [], `${rel} also detected as ${others}`);
  });
}

test('env overrides: CLAUDE_CONFIG_DIR and CODEX_HOME', (t) => {
  const home = withHome(t);
  mkdirSync(join(home, 'custom-claude', 'projects'), { recursive: true });
  mkdirSync(join(home, 'custom-codex'), { recursive: true });
  process.env.CLAUDE_CONFIG_DIR = join(home, 'custom-claude');
  process.env.CODEX_HOME = join(home, 'custom-codex');
  t.after(() => { delete process.env.CLAUDE_CONFIG_DIR; delete process.env.CODEX_HOME; });
  assert.equal(mods['claude-code'].detect(), true);
  assert.equal(mods.codex.detect(), true);
});
