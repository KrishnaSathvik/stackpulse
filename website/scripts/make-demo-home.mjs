#!/usr/bin/env node
// Builds a deterministic, entirely fictional HOME directory in each tool's real
// on-disk format, so the real StackPulse CLI can be run against it to produce
// website screenshots. No real usage data is involved.
//
//   node scripts/make-demo-home.mjs <empty-dir>
//
// Tools: Claude Code, Codex, Gemini CLI, Cursor, Aider. 364 days ending 2026-10-31,
// with tools picked up (and Aider dropped) at different points in the year.
// Needs Node 22.5+ (node:sqlite) for the Cursor database, and git for Aider.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const home = process.argv[2];
if (!home) { console.error('usage: make-demo-home.mjs <empty-dir>'); process.exit(2); }
if (existsSync(home) && readdirSync(home).length) { console.error(`${home} is not empty`); process.exit(2); }

// Seeded PRNG (mulberry32) so every run produces identical data.
let seed = 0x5eed1234;
const rand = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (weighted) => { let r = rand() * weighted.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of weighted) { if ((r -= w) <= 0) return v; } return weighted[0][0]; };
const hex = (n) => Array.from({ length: n }, () => int(0, 15).toString(16)).join('');
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
const write = (rel, text) => { const f = join(home, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, text); return f; };
const jsonl = (rows) => rows.map(r => JSON.stringify(r)).join('\n') + '\n';

const END = Date.parse('2026-10-31T00:00:00Z');
const DAYS = 364;
// Day index from which each tool is in use (Aider stops at its `until`).
const SINCE = { claude: 45, codex: 170, gemini: 230, cursor: 0, aider: 0 }, AIDER_UNTIL = 190;
const days = Array.from({ length: DAYS }, (_, i) => new Date(END - (DAYS - 1 - i) * 86_400_000));
// Activity ramps up over the period, quieter weekends, a few days off.
const activity = (d, i) => {
  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
  if (rand() < (weekend ? 0.55 : 0.08)) return 0;
  return (0.45 + 0.75 * (i / DAYS)) * (weekend ? 0.5 : 1);
};
const at = (d, h, m = 0, s = 0) => new Date(d.getTime() + ((h * 60 + m) * 60 + s) * 1000);

let claudeMsgs = 0, codexTurns = 0;

days.forEach((day, i) => {
  const level = activity(day, i);
  if (!level) return;
  const date = day.toISOString().slice(0, 10);

  // ── Claude Code: ~/.claude/projects/<project>/<session>.jsonl ─────────────
  if (i >= SINCE.claude) for (let s = 0, n = Math.max(1, Math.round(level * int(1, 4))); s < n; s++) {
    const sessionId = uuid();
    const project = pick([['-Users-demo-Projects-atlas-api', 3], ['-Users-demo-Projects-web-console', 2], ['-Users-demo-Projects-ml-pipeline', 1]]);
    const model = pick([['claude-sonnet-4-5-20250929', 5], ['claude-opus-4-6', 3], ['claude-haiku-4-5-20251001', 1]]);
    let t = at(day, int(9, 20), int(0, 59));
    const rows = [{ type: 'user', sessionId, timestamp: t.toISOString(), uuid: uuid(), message: { role: 'user', content: 'demo' } }];
    for (let m = 0, k = int(4, 14); m < k; m++) {
      t = new Date(t.getTime() + int(20, 240) * 1000);
      rows.push({ type: 'assistant', sessionId, timestamp: t.toISOString(), uuid: uuid(), requestId: `req_${hex(16)}`,
        message: { id: `msg_${hex(16)}`, role: 'assistant', model, usage: {
          input_tokens: int(40, 900), output_tokens: int(300, 3800),
          cache_creation_input_tokens: int(500, 9000), cache_read_input_tokens: int(15_000, 160_000) } } });
      claudeMsgs++;
    }
    write(`.claude/projects/${project}/${sessionId}.jsonl`, jsonl(rows));
  }

  // ── Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl ────────────────────
  if (i >= SINCE.codex && rand() < 0.7) {
    for (let s = 0, n = Math.max(1, Math.round(level * int(1, 2))); s < n; s++) {
      const id = uuid();
      const start = at(day, int(10, 21), int(0, 59));
      const stamp = start.toISOString().slice(0, 19).replace(/:/g, '-');
      const model = pick([['gpt-5-codex', 3], ['gpt-5.5-codex-max', 2]]);
      const total = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 };
      const rows = [
        { timestamp: start.toISOString(), type: 'session_meta', payload: { id, timestamp: start.toISOString(), cwd: '/Users/demo/Projects/atlas-api', originator: 'codex_cli_rs', cli_version: '0.50.0' } },
        { timestamp: start.toISOString(), type: 'turn_context', payload: { cwd: '/Users/demo/Projects/atlas-api', model } },
      ];
      let t = start;
      for (let k = 0, turns = int(3, 10); k < turns; k++) {
        t = new Date(t.getTime() + int(30, 300) * 1000);
        const input = int(8_000, 60_000), cached = Math.floor(input * (0.5 + rand() * 0.4));
        const output = int(400, 4_000), reasoning = Math.floor(output * rand() * 0.6);
        const last = { input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: reasoning, total_tokens: input + output };
        for (const key of Object.keys(total)) total[key] += last[key];
        rows.push({ timestamp: t.toISOString(), type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { ...total }, last_token_usage: last } } });
        codexTurns++;
      }
      write(`.codex/sessions/${date.replace(/-/g, '/')}/rollout-${stamp}-${id}.jsonl`, jsonl(rows));
    }
  }

  // ── Gemini CLI: ~/.gemini/tmp/<hash>/chats/session-*.json ─────────────────
  if (i >= SINCE.gemini && rand() < 0.35) {
    const start = at(day, int(11, 19), int(0, 59));
    const messages = [];
    let t = start;
    for (let k = 0, turns = int(2, 8); k < turns; k++) {
      t = new Date(t.getTime() + int(20, 200) * 1000);
      messages.push({ id: `u${k}`, timestamp: t.toISOString(), type: 'user', content: 'demo' });
      const input = int(3_000, 30_000), output = int(300, 3_000), cached = Math.floor(input * rand() * 0.6), thoughts = int(0, 800);
      messages.push({ id: `g${k}`, timestamp: new Date(t.getTime() + 4000).toISOString(), type: 'gemini', content: 'ok',
        model: pick([['gemini-2.5-pro', 2], ['gemini-3-flash-preview', 1]]),
        tokens: { input, output, cached, thoughts, tool: 0, total: input + output + thoughts } });
    }
    const stamp = start.toISOString().slice(0, 16).replace(':', '-');
    write(`.gemini/tmp/${hex(12)}/chats/session-${stamp}-${hex(4)}.json`, JSON.stringify({
      sessionId: uuid(), projectHash: hex(12), startTime: start.toISOString(), lastUpdated: t.toISOString(), messages }));
  }
});

// ── Cursor: state.vscdb with composerData rows ──────────────────────────────
const cursorDir = process.platform === 'darwin' ? 'Library/Application Support/Cursor/User' : '.config/Cursor/User';
const cursorDb = join(home, cursorDir, 'globalStorage', 'state.vscdb');
mkdirSync(dirname(cursorDb), { recursive: true });
const db = new DatabaseSync(cursorDb);
db.prepare('CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)').run();
db.prepare('CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)').run();
const insert = db.prepare('INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)');
let cursorComposers = 0;
days.forEach((day, i) => {
  if (!activity(day, i) || rand() > (i < 200 ? 0.6 : 0.3)) return;   // Cursor use tapers off
  for (let k = 0, n = int(1, 3); k < n; k++) {
    const id = uuid();
    insert.run(`composerData:${id}`, JSON.stringify({ _v: 3, composerId: id, createdAt: at(day, int(9, 22), int(0, 59)).getTime(), status: 'completed' }));
    for (let b = 0, bubbles = int(4, 20); b < bubbles; b++) insert.run(`bubbleId:${id}:${hex(8)}`, '{}');
    cursorComposers++;
  }
});
db.close();

// ── Aider: ~/Projects/<repo>/.aider.chat.history.md + attributed git commits ─
const repo = join(home, 'Projects', 'atlas-api');
mkdirSync(repo, { recursive: true });
const git = (args, env = {}) => execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore',
  env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...env } });
git(['init', '-q']);
let history = '', commits = 0;
days.forEach((day, i) => {
  if (i >= AIDER_UNTIL || !activity(day, i) || rand() > 0.3) return;
  history += `\n# aider chat started at ${day.toISOString().slice(0, 10)} 10:00:00\n`;
  for (let k = 0, n = int(1, 3); k < n; k++) history += `\n#### refactor module ${k}\n> done\n`;
  writeFileSync(join(repo, `module-${commits}.js`), Array.from({ length: int(10, 80) }, (_, l) => `export const v${l} = ${l};`).join('\n') + '\n');
  git(['add', '.']);
  const when = at(day, 15).toISOString();
  git(['commit', '-qm', `aider: refactor module ${commits}`], { GIT_AUTHOR_NAME: 'Demo (aider)', GIT_AUTHOR_EMAIL: 'demo@example.com',
    GIT_COMMITTER_NAME: 'Demo', GIT_COMMITTER_EMAIL: 'demo@example.com', GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when });
  commits++;
});
writeFileSync(join(repo, '.aider.chat.history.md'), history);

console.log(JSON.stringify({ home, claudeMsgs, codexTurns, cursorComposers, aiderCommits: commits }));
