// Builds a HOME containing current-format data for the tools migrated to the
// collector in M2. Formats follow the tools' own writers and the collector's
// upstream test fixtures (ccusage v20.0.46, commit 5aa9d3fd):
//   Gemini CLI   ~/.gemini/tmp/<hash>/chats/session-*.json|.jsonl   per-message `tokens`
//   Qwen Code    ~/.qwen/projects/<id>/chats/<session>.jsonl        per-line `usageMetadata`
//   Kimi CLI     ~/.kimi/sessions/<group>/<session>/wire.jsonl      StatusUpdate.token_usage
//   Kimi Code    ~/.kimi-code/sessions/<ws>/<session>/agents/<a>/wire.jsonl  usage.record (turn scope)
//   Antigravity  ~/.gemini/antigravity/conversations/*.db           gen_metadata protobuf blobs
//   Kilo CLI     ~/.local/share/kilo/kilo.db                         message(id, session_id, data JSON)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}

// ── minimal protobuf encoding (mirrors the collector's own test support) ─────
const varint = (v, out) => { while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); } out.push(v); };
const fVarint = (n, v, out) => { varint(n * 8, out); varint(v, out); };
const fBytes = (n, bytes, out) => { varint(n * 8 + 2, out); varint(bytes.length, out); out.push(...bytes); };
const utf8 = (s) => [...Buffer.from(s, 'utf-8')];

function usageBlob({ modelId, input = 0, output = 0, cacheWrite = 0, cacheRead = 0, reasoning = 0, messageId }) {
  const out = [];
  if (modelId != null) fVarint(1, modelId, out);   // numeric model ID (no label recorded)
  [[2, input], [3, output], [4, cacheWrite], [5, cacheRead], [9, reasoning]].forEach(([f, v]) => v > 0 && fVarint(f, v, out));
  if (messageId) fBytes(7, utf8(messageId), out);
  return out;
}
function timestampBlob(seconds) { const out = []; fVarint(1, seconds, out); return out; }

/** gen_metadata row: ChatModel{4: usage, 9: GenerationInfo{4: Timestamp}, 19: model} wrapped in field 1. */
export function genMetadata({ model, usage, seconds }) {
  const chat = [];
  if (usage) fBytes(4, usageBlob(usage), chat);
  if (seconds) { const gi = []; fBytes(4, timestampBlob(seconds), gi); fBytes(9, gi, chat); }
  if (model) fBytes(19, utf8(model), chat);
  const meta = [];
  fBytes(1, chat, meta);
  return Uint8Array.from(meta);
}

export function sqliteDb(file, ddl, rows) {
  mkdirSync(dirname(file), { recursive: true });
  if (DatabaseSync) {
    const db = new DatabaseSync(file);
    for (const s of ddl) db.exec(s);
    for (const [sql, params] of rows) db.prepare(sql).run(...params);
    db.close();
    return;
  }
  const lit = (v) => (v instanceof Uint8Array ? `X'${Buffer.from(v).toString('hex')}'` : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
  const end = (sql) => (sql.trim().endsWith(';') ? sql : sql + ';');   // sqlite3 needs terminated statements
  const script = [...ddl.map(end), ...rows.map(([sql, params]) => { let i = 0; return end(sql.replace(/\?/g, () => lit(params[i++]))); })].join('\n');
  execFileSync('sqlite3', [file], { input: script });
}

const line = (o) => JSON.stringify(o);
export const sec = (iso) => Math.floor(Date.parse(iso) / 1000);

/**
 * Expected values (hand-computed) for the data written below. Token totals use the
 * collector's semantics: input excludes cache reads; reasoning sits inside output/total.
 */
export const M2_TRUTH = {
  gemini:      { sessions: 2, total: 2500 + 1600 },
  qwen:        { sessions: 1, total: 1750 },
  kimi:        { sessions: 2, total: (1000 + 100 + 200 + 0) + (3064 + 76 + 14848 + 0) },
  antigravity: { sessions: 1, total: (900 + 300 + 0 + 100) + (400 + 50) },
  // Kilo records reasoning separately from output, so it adds to the total
  kilo:        { sessions: 2, total: (100 + 50 + 5 + 10 + 20) + (200 + 30 + 0 + 0 + 0), recordedCost: 0.02 + 0.05 },
};

export function buildM2Home(home) {
  const w = (rel, content) => { const p = join(home, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };

  // Gemini CLI: one .json session and one newer .jsonl session
  w('.gemini/tmp/def456/chats/session-2026-10-23T10-00-abcd.json', JSON.stringify({
    sessionId: 'g-1', projectHash: 'def456', startTime: '2026-10-23T10:00:00.000Z', lastUpdated: '2026-10-23T10:05:00.000Z',
    messages: [
      { id: 'm1', timestamp: '2026-10-23T10:00:00.000Z', type: 'user', content: 'hi' },
      { id: 'm2', timestamp: '2026-10-23T10:00:04.000Z', type: 'gemini', content: 'ok', model: 'gemini-2.5-pro',
        tokens: { input: 2000, output: 400, cached: 500, thoughts: 100, tool: 0, total: 2500 } },
    ] }));
  w('.gemini/tmp/def456/chats/session-2026-10-24T09-00-efgh.jsonl', [
    line({ sessionId: 'g-2', projectHash: 'def456', startTime: '2026-10-24T09:00:00.000Z' }),
    line({ id: 'n1', timestamp: '2026-10-24T09:00:03.000Z', type: 'gemini', model: 'gemini-3-flash-preview',
      tokens: { input: 1200, output: 300, cached: 200, thoughts: 100, tool: 0, total: 1600 } }),
  ].join('\n') + '\n');

  // Qwen Code
  w('.qwen/projects/abc123/chats/sess-1.jsonl', [
    line({ uuid: 'q1', sessionId: 'sess-1', timestamp: '2026-10-22T09:00:00.000Z', type: 'user', message: { role: 'user', parts: [{ text: 'hi' }] } }),
    line({ uuid: 'q2', sessionId: 'sess-1', timestamp: '2026-10-22T09:00:05.000Z', type: 'assistant', model: 'qwen3-coder-plus',
      message: { role: 'model', parts: [{ text: 'ok' }] },
      usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, thoughtsTokenCount: 50, cachedContentTokenCount: 200, totalTokenCount: 1550 } }),
  ].join('\n') + '\n');

  // Kimi CLI (old layout): model from config.json; StatusUpdate with token_usage
  w('.kimi/config.json', JSON.stringify({ model: 'kimi-k2' }));
  w('.kimi/sessions/group-a/session-a/wire.jsonl', [
    line({ timestamp: sec('2026-10-25T08:00:00Z'), message: { type: 'StatusUpdate', payload: { token_usage: { input_other: 1000, output: 100, input_cache_read: 200, input_cache_creation: 0, total: 1300 } } } }),
    line({ timestamp: sec('2026-10-25T08:00:01Z'), message: { type: 'StatusUpdate', payload: { token_usage: { total: 0 } } } }),   // zero: ignored
  ].join('\n') + '\n');
  // Kimi Code (new layout): only turn-scoped usage.record counts; session scope is cumulative
  w('.kimi-code/sessions/ws-1/session-b/agents/agent-1/wire.jsonl', [
    line({ type: 'usage.record', model: 'kimi-code/kimi-for-coding', usage: { inputOther: 3064, output: 76, inputCacheRead: 14848, inputCacheCreation: 0 }, usageScope: 'turn', time: Date.parse('2026-10-26T10:00:00Z') }),
    line({ type: 'usage.record', model: 'kimi-code/kimi-for-coding', usage: { inputOther: 5000, output: 200, inputCacheRead: 20000, inputCacheCreation: 100 }, usageScope: 'session', time: Date.parse('2026-10-26T10:00:05Z') }),
  ].join('\n') + '\n');

  // Antigravity: two generations in one conversation; the second inherits the model
  sqliteDb(join(home, '.gemini/antigravity/conversations/conv-1.db'),
    ['CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB NOT NULL)'],
    [
      ['INSERT INTO gen_metadata (idx, data) VALUES (?, ?)', [1, genMetadata({ model: 'gemini-3-pro-high', seconds: sec('2026-10-27T12:00:00Z'),
        usage: { input: 900, output: 300, cacheRead: 100, messageId: 'ag-1' } })]],
      ['INSERT INTO gen_metadata (idx, data) VALUES (?, ?)', [2, genMetadata({ seconds: sec('2026-10-27T12:01:00Z'),
        usage: { input: 400, output: 50, messageId: 'ag-2' } })]],
    ]);

  // Kilo CLI: assistant messages carry model, tokens and a recorded cost
  const kilo = (id, session, created, model, tokens, cost) => ['INSERT INTO message (id, session_id, data) VALUES (?, ?, ?)',
    [id, session, JSON.stringify({ id, role: 'assistant', providerID: 'anthropic', modelID: model, time: { created }, tokens, cost, agent: 'build' })]];
  sqliteDb(join(home, '.local/share/kilo/kilo.db'),
    ['CREATE TABLE message (id TEXT, session_id TEXT, data TEXT)'],
    [
      kilo('k-1', 'ks-1', Date.parse('2026-10-28T09:00:00Z'), 'claude-sonnet-4-20250514', { input: 100, output: 50, reasoning: 5, cache: { read: 10, write: 20 } }, 0.02),
      kilo('k-2', 'ks-2', Date.parse('2026-10-29T09:00:00Z'), 'claude-sonnet-4-20250514', { input: 200, output: 30, reasoning: 0, cache: { read: 0, write: 0 } }, 0.05),
      ['INSERT INTO message (id, session_id, data) VALUES (?, ?, ?)', ['u-1', 'ks-1', JSON.stringify({ id: 'u-1', role: 'user', time: { created: Date.parse('2026-10-28T08:59:00Z') } })]],
    ]);
  return home;
}
