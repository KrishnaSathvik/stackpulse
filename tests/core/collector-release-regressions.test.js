// Pin guard: behaviours fixed upstream between ccusage 20.0.35 and 20.0.46 that
// change numbers StackPulse reports. Any future pin change must keep these passing.
// Measured on 20.0.35 (for the record): 250 / 0 / $0.00252 / model_placeholder_m402,
// and the whole run failed when one Antigravity database was corrupt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withHome } from '../helpers/home.js';
import { canBuildDb } from '../helpers/sqlite.js';
import { buildReleaseHome, RELEASE_CASES as C } from '../helpers/release-home.js';
import { resolveCcusage, runCcusage, normalizeCcusageReport } from '../../src/collectors/ccusage.js';

process.env.TZ = 'UTC';
const skip = resolveCcusage().ok && canBuildDb ? false : 'needs the installed collector and a SQLite writer';

let cached;
async function run(t) {
  withHome(t);
  buildReleaseHome(process.env.HOME);
  const raw = await runCcusage();
  return { raw, ...normalizeCcusageReport(raw) };
}

test('pinned collector passes every post-20.0.35 accuracy fix', { skip }, async (t) => {
  const { raw, tools, diagnostics } = await run(t);

  assert.equal(tools.claude_code.tokens.total, C.claudeRespDedup.tokens, 'Claude: requestless resp_ message counted once');

  const child = raw.session.filter(s => s.agent === 'codex' && String(s.period).endsWith(C.codexSnapshotDedup.session));
  assert.equal(child.reduce((a, s) => a + s.totalTokens, 0), C.codexSnapshotDedup.tokens, 'Codex: repeated first-response snapshot counted once');

  const ultra = tools.codex.modelBreakdown.find(m => m.model === C.codexUltrafast.model);
  assert.ok(Math.abs(ultra.cost_usd - C.codexUltrafast.cost) < 1e-9, `Codex Ultrafast priced at published rate (${ultra.cost_usd})`);

  assert.deepEqual(tools.antigravity.modelBreakdown.map(m => m.model), [C.antigravityModelId.model], 'Antigravity numeric model ID resolved');
  assert.equal(tools.antigravity.tokens.total, C.antigravityUnreadable.tokens, 'readable Antigravity DB still counted beside a corrupt one');

  const warn = diagnostics.find(d => d.code === 'collector-warning');
  assert.ok(warn && /unreadable Antigravity database/i.test(warn.message), 'skipped database is reported, not silent');
});
