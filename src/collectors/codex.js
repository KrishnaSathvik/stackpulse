/**
 * src/collectors/codex.js
 * Two corrections to what the pinned collector (ccusage 20.0.46) reports for Codex.
 *
 * 1. Service tier. ccusage prices each Codex event at the tier the session recorded
 *    (`thread_settings_applied`); where none is recorded it falls back to the
 *    `service_tier` in today's ~/.codex/config.toml. Applying today's setting to
 *    older usage presents a guess as a known cost. The collector therefore reads
 *    Codex through a view of the Codex home without config.toml: recorded tiers
 *    are kept, and usage with no recorded tier is costed at the standard rate.
 *    When config.toml sets another tier, a second Codex-only pass measures how
 *    much of the cost depends on that assumption, and the cost carries it.
 *
 * 2. Forked sessions. A forked (subagent) Codex session starts by replaying its
 *    parent's history, written in one burst stamped with the fork's creation time.
 *    ccusage skips that burst as replay. When Codex wrote the whole subagent
 *    thread in one burst, every event shares that timestamp and the session is
 *    dropped with its own usage. Such sessions are recovered here: each event
 *    whose cumulative usage matches the parent's (a replay) is removed, and the
 *    rest is read by the same collector, so pricing and token rules are unchanged.
 *
 * Token aggregation for every other session is untouched.
 */

import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync,
  readdirSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { dirname, join, relative } from 'path';

const SESSION_DIRS = ['sessions', 'archived_sessions'];
// Tiers that cost the same as the standard rate in ccusage.
const STANDARD_TIERS = new Set(['default', 'standard', 'auto']);

/** The Codex home ccusage reads: CODEX_HOME, else ~/.codex. */
export function codexHome(env = process.env) {
  const dir = env.CODEX_HOME || join(env.HOME || env.USERPROFILE || homedir(), '.codex');
  return existsSync(dir) ? dir : null;
}

/** Top-level `service_tier` in config.toml, or null. Tables ([profiles.x]) are ignored. */
export function configuredServiceTier(home) {
  let text;
  try { text = readFileSync(join(home, 'config.toml'), 'utf-8'); } catch { return null; }
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) break;
    const m = line.match(/^\s*service_tier\s*=\s*["']([^"']+)["']/);
    if (m) return m[1].trim();
  }
  return null;
}

/** True when config.toml sets a tier whose price differs from the standard rate. */
export const tierChangesCost = (tier) => tier != null && !STANDARD_TIERS.has(tier.toLowerCase());

// ─── Temporary folders ───────────────────────────────────────────────────────
// Every folder StackPulse creates for the collector starts with this prefix, is
// private to the user (mkdtemp: 0700), and is removed:
//   - when the scan finishes or fails (cleanup() in a finally block),
//   - on exit, Ctrl+C or termination while a scan runs (handlers below),
//   - at the next scan, if a crash left one behind (sweepStaleTempDirs).
// Removal never follows links: the Codex view links to the real session folders,
// and fs.rm removes a link without touching what it points to.
export const TEMP_PREFIX = 'sp-codex-';
const live = new Set();
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const removeAll = () => { for (const d of live) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } } live.clear(); };
const onSignal = (sig) => { removeAll(); unwatch(); process.kill(process.pid, sig); };   // then the default action
const handlers = Object.fromEntries(SIGNALS.map(sig => [sig, () => onSignal(sig)]));
function watch() {
  process.on('exit', removeAll);
  for (const sig of SIGNALS) process.on(sig, handlers[sig]);
}
function unwatch() {
  process.removeListener('exit', removeAll);
  for (const sig of SIGNALS) process.removeListener(sig, handlers[sig]);
}

/** A private temporary directory (0700), removed by cleanup() or on exit or interruption. */
export function tempDir(name) {
  const dir = mkdtempSync(join(tmpdir(), TEMP_PREFIX + name + '-'));
  if (live.size === 0) watch();
  live.add(dir);
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
      live.delete(dir);
      if (live.size === 0) unwatch();
    },
  };
}

/**
 * Remove StackPulse temporary folders left behind by a crash: this user's, older than
 * `maxAgeMs` (so a scan running in another terminal is not disturbed).
 * Returns the names removed.
 */
export function sweepStaleTempDirs({ root = tmpdir(), maxAgeMs = 10 * 60_000, now = Date.now() } = {}) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  const removed = [];
  let names;
  try { names = readdirSync(root); } catch { return removed; }
  for (const name of names) {
    if (!name.startsWith(TEMP_PREFIX)) continue;
    const dir = join(root, name);
    try {
      const st = lstatSync(dir);
      if (!st.isDirectory() || (uid != null && st.uid !== uid) || now - st.mtimeMs < maxAgeMs) continue;
      rmSync(dir, { recursive: true, force: true });
      removed.push(name);
    } catch { /* gone already, or not ours to remove */ }
  }
  return removed;
}

/**
 * A view of the Codex home with its session folders linked in and no config.toml.
 * Directory links follow the real folders, so nothing is copied. (Junctions on
 * Windows need no extra privileges.)
 */
export function codexViewWithoutConfig(home) {
  const t = tempDir('view');
  for (const d of SESSION_DIRS) {
    const target = join(home, d);
    if (existsSync(target)) symlinkSync(target, join(t.dir, d), process.platform === 'win32' ? 'junction' : 'dir');
  }
  return t;
}

/**
 * Environment for a pass that reads Codex only: home folders point at an empty
 * folder and other agents' location variables are unset (`undefined` removes a
 * variable; the collector rejects an explicit location that holds no data).
 */
export function codexOnlyEnv(codexDir, emptyDir) {
  const unset = ['CLAUDE_CONFIG_DIR', 'OPENCODE_DATA_DIR', 'GEMINI_DATA_DIR', 'QWEN_DATA_DIR', 'KIMI_DATA_DIR',
    'ANTIGRAVITY_DATA_DIR', 'KILO_DATA_DIR', 'PI_AGENT_DIR'];
  return {
    CODEX_HOME: codexDir, HOME: emptyDir, USERPROFILE: emptyDir, XDG_DATA_HOME: emptyDir, XDG_CONFIG_HOME: emptyDir,
    ...Object.fromEntries(unset.map(k => [k, undefined])),
  };
}

// ─── Session files ───────────────────────────────────────────────────────────

function* jsonlFiles(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* jsonlFiles(p);
    else if (e.isFile() && e.name.endsWith('.jsonl')) yield p;
  }
}

/** First line of a file without reading the rest (session_meta can be large). */
function firstLine(file) {
  const fd = openSync(file, 'r');
  try {
    const chunks = [];
    const buf = Buffer.alloc(65536);
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      const i = buf.subarray(0, n).indexOf(10);
      if (i >= 0) { chunks.push(Buffer.from(buf.subarray(0, i))); break; }
      chunks.push(Buffer.from(buf.subarray(0, n)));
    }
    return Buffer.concat(chunks).toString('utf-8');
  } finally { closeSync(fd); }
}

const parse = (line) => { try { return JSON.parse(line); } catch { return null; } };

/** Every Codex session file: { file, dir, period, meta }. `period` is ccusage's session key. */
export function codexSessions(home) {
  const out = [];
  for (const d of SESSION_DIRS) {
    const root = join(home, d);
    for (const file of jsonlFiles(root)) {
      const head = parse(firstLine(file));
      const meta = head?.type === 'session_meta' && head.payload && typeof head.payload === 'object' ? head.payload : null;
      out.push({ file, dir: d, period: relative(root, file).replace(/\\/g, '/').replace(/\.jsonl$/, ''), meta });
    }
  }
  return out;
}

const isTokenCount = (o) => o?.type === 'event_msg' && o.payload?.type === 'token_count' && o.payload.info && typeof o.payload.info === 'object';
const usageKey = (u) => (u && typeof u === 'object'
  ? JSON.stringify(Object.keys(u).sort().map(k => [k, u[k]])) : null);
const num = (v) => (Number.isFinite(v) ? v : 0);

/** Cumulative-usage snapshots in a session file (the parent's history a fork replays). */
function cumulativeKeys(file) {
  const keys = new Set();
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    if (!line.includes('"token_count"')) continue;
    const o = parse(line);
    if (isTokenCount(o)) { const k = usageKey(o.payload.info.total_token_usage); if (k) keys.add(k); }
  }
  return keys;
}

/**
 * A fork's own usage as a plain session: fork metadata removed, replayed parent
 * events removed. Returns { text, tokens, replayed } — `tokens` is the session's
 * own usage counted independently (repeated snapshots once, replays never), used
 * to check the collector's figure.
 */
/**
 * The usage-only form of one session record, or null to drop it. The copy the collector
 * reads keeps ids, timestamps, models, the service tier and token counts — never the
 * conversation (messages, tool calls, instructions, compacted history, paths).
 */
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj?.[k] !== undefined).map(k => [k, obj[k]]));
export function usageOnly(o) {
  const p = o?.payload && typeof o.payload === 'object' ? o.payload : null;
  if (!o || !p) return null;
  const at = { timestamp: o.timestamp, type: o.type };
  switch (o.type) {
    case 'session_meta': return { ...at, payload: { ...pick(p, ['id', 'timestamp', 'originator', 'cli_version', 'model_provider']), source: 'subagent' } };
    case 'turn_context': return { ...at, payload: pick(p, ['model', 'service_tier']) };
    case 'compacted': return { ...at, payload: pick(p, ['compaction_response_id', 'latest_token_usage_record']) };
    case 'token_usage_record': return { ...at, payload: pick(p, ['thread_id', 'turn_id', 'session_id', 'response_id', 'usage', 'turn_token_usage', 'thread_token_usage']) };
    case 'event_msg':
      if (p.type === 'token_count') return { ...at, payload: { type: p.type, info: pick(p.info, ['total_token_usage', 'last_token_usage', 'model_context_window']) } };
      if (p.type === 'thread_settings_applied') return { ...at, payload: { type: p.type, thread_settings: pick(p.thread_settings, ['model', 'service_tier']) } };
      return null;
    default: return null;
  }
}

export function ownForkSession(forkFile, parentKeys) {
  const out = [];
  let tokens = 0, replayed = 0, prev = null;
  readFileSync(forkFile, 'utf-8').split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    const o = parse(line);
    // Fork metadata is dropped (the copy reads as a plain session) along with everything but usage.
    if (i === 0 && o?.type === 'session_meta') { out.push(JSON.stringify(usageOnly(o))); return; }
    if (isTokenCount(o)) {
      const key = usageKey(o.payload.info.total_token_usage);
      if (key && parentKeys.has(key)) { replayed++; return; }
      if (key !== prev) {
        const last = o.payload.info.last_token_usage || {};
        tokens += num(last.input_tokens) + num(last.output_tokens);
      }
      prev = key;
    }
    const kept = usageOnly(o);
    if (kept) out.push(JSON.stringify(kept));
  });
  return { text: out.join('\n') + '\n', tokens, replayed };
}

/**
 * Forked sessions the collector reported nothing for, prepared for a second read.
 * counted: Set of session periods the collector did report.
 * Returns { recovered: [{ period, dir, text, tokens, replayed }], unverified: [period] }.
 * A fork whose parent file is missing cannot be separated from replayed history,
 * so it is not counted and is reported instead.
 */
export function droppedForks(home, counted) {
  const sessions = codexSessions(home);
  const byId = new Map(sessions.filter(s => s.meta?.id).map(s => [s.meta.id, s]));
  const recovered = [], unverified = [];
  const parentKeys = new Map();
  for (const s of sessions) {
    const parentId = s.meta?.forked_from_id;
    if (!parentId || counted.has(s.period)) continue;
    if (!readFileSync(s.file, 'utf-8').includes('"token_count"')) continue;   // no usage: nothing dropped
    const parent = byId.get(parentId);
    if (!parent) { unverified.push(s.period); continue; }
    if (!parentKeys.has(parent.file)) parentKeys.set(parent.file, cumulativeKeys(parent.file));
    const own = ownForkSession(s.file, parentKeys.get(parent.file));
    if (own.tokens > 0) recovered.push({ period: s.period, dir: s.dir, ...own });
  }
  return { recovered, unverified };
}

/** Write recovered sessions as a Codex home for the collector to read; optionally with a config. */
export function writeRecoveredHome(recovered, root, configFrom = null) {
  for (const r of recovered) {
    const file = join(root, r.dir, r.period + '.jsonl');
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, r.text, { mode: 0o600 });
  }
  // Only the service tier, never the rest of the user's Codex config.
  const tier = configFrom ? configuredServiceTier(configFrom) : null;
  if (tier) writeFileSync(join(root, 'config.toml'), `service_tier = ${JSON.stringify(tier)}\n`, { mode: 0o600 });
  return root;
}
