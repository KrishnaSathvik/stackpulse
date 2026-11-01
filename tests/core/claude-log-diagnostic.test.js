import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withHome, jsonl } from '../helpers/home.js';
import { checkClaudeLogFormat } from '../../src/diagnostics/claude-logs.js';
import { normalizeCcusageReport, resolveCcusage } from '../../src/collectors/ccusage.js';

process.env.TZ = 'UTC';
const live = resolveCcusage().ok ? false : 'needs the installed collector';

const record = (sid, id, input) => ({ type: 'assistant', sessionId: sid, timestamp: '2026-10-20T10:00:00.000Z', requestId: 'r-' + id,
  message: { id: 'm-' + id, model: 'claude-opus-4-6', usage: { input_tokens: input, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } });
// Same records, re-serialized the way a pretty-printer or Python's json.dumps would
const spaced = (o) => JSON.stringify(o).replace(/":/g, '": ').replace(/,"/g, ', "');

test('flags spaced-JSON Claude logs and leaves compact ones alone', (t) => {
  withHome(t, {
    '.claude/projects/p/compact.jsonl': jsonl(record('a', 1, 100)),
    '.claude/projects/p/spaced.jsonl': spaced(record('b', 2, 50)) + '\n' + spaced(record('b', 3, 50)) + '\n',
    '.claude/projects/p/no-usage.jsonl': jsonl({ type: 'user', message: { content: 'hi' } }),
  });
  const r = checkClaudeLogFormat();
  assert.equal(r.filesChecked, 3);
  assert.deepEqual(r.affectedFiles.map(f => f.split(/[\\/]/).pop()), ['spaced.jsonl']);
  assert.equal(r.skippedLinesSampled, 2);
});

test('respects its read budget', (t) => {
  withHome(t, Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`.claude/projects/p/s${i}.jsonl`, jsonl(record('s' + i, i, 1))])));
  const r = checkClaudeLogFormat({ budgetBytes: 1 });
  assert.equal(r.truncated, true);
  assert.ok(r.filesChecked <= 1);
});

test('live: the collector skips the spaced file; StackPulse reports the gap instead of hiding it', { skip: live }, async (t) => {
  withHome(t, {
    '.claude/projects/p/compact.jsonl': jsonl(record('a', 1, 100)),
    '.claude/projects/p/spaced.jsonl': spaced(record('b', 2, 50)) + '\n',
  });
  const { parse } = await import('../../parsers/claude-code.js');
  const r = await parse();
  assert.equal(r.tokens.total, 100, 'collector counted only the compact file (upstream behaviour)');
  const d = r.diagnostics.find(x => x.code === 'claude-log-not-compact');
  assert.ok(d, 'gap is reported');
  assert.match(d.message, /1 Claude log file/);
});

test('live: when every Claude log is skipped, the scan reports an error, not "no data"', { skip: live }, async (t) => {
  withHome(t, { '.claude/projects/p/spaced.jsonl': spaced(record('b', 2, 50)) + '\n' });
  const { parse } = await import('../../parsers/claude-code.js');
  await assert.rejects(parse(), { code: 'claude-log-not-compact' });
});

test('collector warnings are attached to the tool they name', () => {
  const r = normalizeCcusageReport({
    daily: [{ period: '2026-10-01', agents: [{ agent: 'antigravity', totalTokens: 10 }, { agent: 'codex', totalTokens: 5 }] }],
    // Real collector wording: the path contains ".gemini" — must still attach to Antigravity
    session: [], warnings: ["Skipping unreadable Antigravity database '/home/u/.gemini/antigravity/conversations/a.db': Failed to inspect Antigravity database: file is not a database (code 26)"],
  });
  assert.equal(r.tools.antigravity.diagnostics[0].code, 'collector-warning');
  assert.deepEqual(r.tools.codex.diagnostics, []);
  assert.equal(r.sources.antigravity.status, 'partial');
  assert.equal(r.sources.gemini.status, 'absent', 'not blamed on Gemini because of the path');
  assert.equal(r.diagnostics.length, 1);
});
