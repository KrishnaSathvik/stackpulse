// One case per upstream ccusage fix between 20.0.35 and 20.0.46 that changes a
// number StackPulse reports. Expected values come from the upstream tests that
// shipped with each fix (ccusage commit in brackets).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { genMetadata, sqliteDb, sec } from './m2-home.js';

export const RELEASE_CASES = {
  // [0861e7f, 20.0.37] Claude: a requestless `resp_` message logged twice counts once
  claudeRespDedup: { tool: 'claude_code', tokens: 125 },
  // [2a84385, 20.0.45] Codex: repeated first-response snapshot (upstream fixture issue_1970) counts once
  codexSnapshotDedup: { tool: 'codex', session: 'child', tokens: 1010 },
  // [8cb2532, 20.0.46] Codex: recorded Ultrafast requests priced at published Ultrafast rates
  codexUltrafast: { tool: 'codex', model: 'gpt-6.1-sol', cost: 0.01512 },
  // [baeb991, 20.0.38+] Antigravity: numeric model ID 1402 resolves to claude-opus-5-5
  antigravityModelId: { tool: 'antigravity', model: 'claude-opus-5-5' },
  // [65c5837, 20.0.46] Antigravity: an unreadable database is skipped; readable ones still count
  antigravityUnreadable: { tool: 'antigravity', tokens: 1000 + 200 },
};

export function buildReleaseHome(home) {
  const w = (rel, content) => { const p = join(home, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
  const line = (o) => JSON.stringify(o);

  w('.claude/projects/p/resp-session.jsonl', [
    line({ timestamp: '2026-05-22T02:34:40.000Z', sessionId: 'resp-session', message: { id: 'resp_0123456789abcdef', model: 'gpt-5.5', usage: { input_tokens: 100, output_tokens: 25 } } }),
    line({ timestamp: '2026-05-22T02:34:40.500Z', sessionId: 'resp-session', message: { id: 'resp_0123456789abcdef', model: 'gpt-5.5', usage: { input_tokens: 100, output_tokens: 25 } } }),
  ].join('\n') + '\n');

  w('.codex/sessions/2026/01/05/child.jsonl', readFileSync(new URL('../fixtures/upstream-ccusage-issue-1970.jsonl', import.meta.url), 'utf-8'));

  w('.codex/sessions/2026/02/01/rollout-2026-02-01T10-00-00-ultra.jsonl', [
    line({ timestamp: '2026-02-01T10:00:00.000Z', type: 'session_meta', payload: { id: 'ultra', cwd: '/w' } }),
    line({ timestamp: '2026-02-01T10:00:00.500Z', type: 'event_msg', payload: { type: 'thread_settings_applied', thread_settings: { service_tier: 'ultrafast' } } }),
    line({ timestamp: '2026-02-01T10:00:01.000Z', type: 'turn_context', payload: { model: 'gpt-6.1-sol' } }),
    line({ timestamp: '2026-02-01T10:00:02.000Z', type: 'event_msg', payload: { type: 'token_count', info: {
      last_token_usage: { input_tokens: 1200, cached_input_tokens: 200, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 1250 },
      total_token_usage: { input_tokens: 1200, cached_input_tokens: 200, output_tokens: 50, reasoning_output_tokens: 0, total_tokens: 1250 } } } }),
  ].join('\n') + '\n');

  const conv = (file, rows) => sqliteDb(join(home, '.gemini/antigravity/conversations', file),
    ['CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB NOT NULL)'],
    rows.map((r, i) => ['INSERT INTO gen_metadata (idx, data) VALUES (?, ?)', [i + 1, genMetadata(r)]]));
  conv('model-id.db', [{ seconds: sec('2026-10-20T10:00:00Z'), usage: { modelId: 1402, input: 1000, output: 200, messageId: 'mid-1' } }]);
  w('.gemini/antigravity/conversations/corrupt.db', 'this is not a sqlite database');
  return home;
}
