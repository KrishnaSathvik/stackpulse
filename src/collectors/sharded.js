/**
 * src/collectors/sharded.js — M3 PROTOTYPE (not wired into the CLI)
 *
 * Memory-bounded, incremental collection for Claude Code history, built only from
 * behaviours measured against ccusage 20.0.46 (docs/design/M3-memory.md):
 *
 *  - Collector memory follows what it ingests (~2.1x log size); date filters don't
 *    reduce it, but pointing CLAUDE_CONFIG_DIR at a subset does.
 *  - The collector de-duplicates messages ACROSS projects. Projects that share any
 *    message id are therefore merged into one shard (union-find), so every message
 *    and its copies are always read in the same run — exactness is preserved.
 *  - It ignores symlinked files and folders, so shards are built from hard links.
 *  - Per-shard collector output is cached under a fingerprint of the shard's files;
 *    unchanged shards are never re-read. Changed, added, deleted or rotated files
 *    change the fingerprint and that shard is recomputed.
 *
 * Non-Claude sources run once in a separate "rest" pass with Claude excluded.
 * The merged report goes through the same normalizeCcusageReport() as a full run.
 */

import { createHash, createHmac, randomBytes } from 'crypto';
import { chmodSync, createReadStream, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { basename, dirname, join, relative } from 'path';
import { runCcusage, CollectorError, CCUSAGE_VERSION } from './ccusage.js';
import { claudeProjectRoots } from '../diagnostics/claude-logs.js';

const MSG_ID = /"message":\{"id":"([^"]+)"/;   // compact form, as Claude Code writes it

function* jsonlFiles(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* jsonlFiles(p);
    else if (e.isFile() && e.name.endsWith('.jsonl')) yield p;
  }
}

/** Every Claude project, possibly present under several roots: name → [{ root, dir, files }]. */
export function discoverProjects(roots = claudeProjectRoots()) {
  const projects = new Map();
  for (const root of roots) {
    let names;
    try { names = readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { continue; }
    for (const name of names) {
      const dir = join(root, name);
      const list = projects.get(name) || [];
      list.push({ root, dir, files: [...jsonlFiles(dir)] });
      projects.set(name, list);
    }
  }
  return projects;
}

/**
 * 64-bit hash of a message id as two uint32 halves (FNV-1a variants), seeded from
 * the per-cache secret so stored id lists can't be matched against guessed ids or
 * correlated between caches. Not cryptographic: grouping only needs consistency,
 * and a collision only over-merges.
 */
function hash64(str, seed = [0, 0]) {
  let a = (0x811c9dc5 ^ seed[0]) >>> 0, b = (0x01000193 ^ seed[1] ^ str.length) >>> 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return [a, (b | 1) >>> 0];   // b never 0, so 0 marks an empty slot
}

/** Sorted, de-duplicated 64-bit ids of one project, as a flat Uint32Array [a, b, a, b, ...]. */
async function projectIdHashes(locs, seed) {
  const pairs = [];
  for (const { files } of locs) {
    for (const f of files) {
      const rl = createInterface({ input: createReadStream(f, { encoding: 'utf-8' }), crlfDelay: Infinity });
      for await (const line of rl) {
        const m = line.match(MSG_ID);
        if (m) pairs.push(hash64(m[1], seed));
      }
    }
  }
  pairs.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  const out = new Uint32Array(pairs.length * 2);
  let n = 0;
  for (const [a, b] of pairs) {
    if (n && out[n - 2] === a && out[n - 1] === b) continue;
    out[n++] = a; out[n++] = b;
  }
  return out.slice(0, n);
}

/**
 * Open-addressing table: 64-bit id hash -> project index, ~12 bytes per message
 * (vs ~100 for a Map of strings). A hash collision can only merge two projects
 * unnecessarily, which costs memory, never accuracy.
 */
class IdTable {
  constructor(capacity) {
    let size = 1024; while (size < capacity * 2) size *= 2;
    this.mask = size - 1; this.keys = new Uint32Array(size * 2); this.vals = new Int32Array(size);
  }
  /** Returns the existing owner, or records `owner` and returns -1. */
  claim(a, b, owner) {
    for (let i = (a ^ Math.imul(b, 0x9e3779b1)) & this.mask; ; i = (i + 1) & this.mask) {
      const ka = this.keys[2 * i], kb = this.keys[2 * i + 1];
      if (kb === 0) { this.keys[2 * i] = a; this.keys[2 * i + 1] = b; this.vals[i] = owner; return -1; }
      if (ka === a && kb === b) return this.vals[i];
    }
  }
}

/**
 * Group projects that share any message id, so cross-project duplicates are
 * de-duplicated inside one collector run. Per-project id lists are cached on disk
 * under the project's fingerprint, so unchanged projects are not re-read.
 */
export async function groupProjects(projects, { cacheDir = null, used = null, context = cacheContext(), secret = null } = {}) {
  const seed = secret ? [secret.readUInt32LE(0), secret.readUInt32LE(4)] : [0, 0];
  const names = [...projects.keys()];
  const lists = [];
  for (const name of names) {
    const file = cacheDir && join(cacheDir, `ids-${fingerprint(projects, [name], context, secret)}.bin`);
    if (file) used?.add(basename(file));
    if (file && existsSync(file)) { const buf = readFileSync(file); lists.push(new Uint32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length))); continue; }
    const ids = await projectIdHashes(projects.get(name), seed);
    if (file) writeAtomic(file, Buffer.from(ids.buffer));
    lists.push(ids);
  }
  const parent = names.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const table = new IdTable(lists.reduce((n, l) => n + l.length / 2, 0));
  lists.forEach((ids, p) => {
    for (let i = 0; i < ids.length; i += 2) {
      const o = table.claim(ids[i], ids[i + 1], p);
      if (o >= 0 && find(o) !== find(p)) parent[find(p)] = find(o);
    }
  });
  const groups = new Map();
  names.forEach((name, i) => { const r = find(i); groups.set(r, [...(groups.get(r) || []), name]); });
  return [...groups.values()].map(g => g.sort());
}

/** Content-independent fingerprint: relative path, size, mtime and inode of every file. */
// Bump when the cached aggregate format or normalization inputs change.
export const SHARD_CACHE_VERSION = 3;   // 3: keys and id hashes are keyed with the per-cache secret

/** Everything besides the files that changes what a shard run produces. */
export function cacheContext(runOpts = {}) {
  return JSON.stringify({
    cache: SHARD_CACHE_VERSION,
    collector: CCUSAGE_VERSION,                       // also pins its bundled pricing (--offline)
    tz: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone,   // day grouping
    since: runOpts.since ?? null, until: runOpts.until ?? null,
    config: 'isolated',                               // user ccusage.json never applies
  });
}

/**
 * Cache key. Keyed with the per-cache secret (HMAC-SHA256): the inputs (relative
 * paths, sizes, mtimes, inodes) are guessable, so an unkeyed hash would let anyone
 * holding a copy of the cache confirm a guessed file name offline.
 */
export function fingerprint(projects, names, context = cacheContext(), secret = null) {
  const h = (secret ? createHmac('sha256', secret) : createHash('sha256')).update(context + '\0');
  for (const name of names) {
    for (const { root, files } of projects.get(name)) {
      for (const f of [...files].sort()) {
        const st = statSync(f);
        h.update(`${relative(root, f)}\0${st.size}\0${st.mtimeMs}\0${st.ino}\0`);
      }
    }
  }
  return h.digest('hex');
}

// An explicit CLAUDE_CONFIG_DIR must contain projects/; an empty one excludes Claude.
const emptyDir = (base) => { const d = join(base, 'empty'); mkdirSync(join(d, 'projects'), { recursive: true }); return d; };

/** Owner-only directory (best effort on Windows, where mode bits are ignored). */
function privateDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { chmodSync(dir, 0o700); } catch { /* not supported */ }
  return dir;
}

/** Write via a temp file + rename, so readers never see a partial entry. */
function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, data, { mode: 0o600 });
  renameSync(tmp, file);
}

/**
 * Random 32-byte key for this cache (owner-only file). Created once with an
 * exclusive link, so concurrent first runs agree on one key. Deleting it simply
 * invalidates the cache; unreferenced entries are then pruned.
 */
export function cacheSecret(cacheDir) {
  const file = join(cacheDir, 'secret');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const key = readFileSync(file);
      if (key.length === 32) return key;
      unlinkSync(file);                         // truncated or foreign: replace it
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    writeFileSync(tmp, randomBytes(32), { mode: 0o600 });
    try { linkSync(tmp, file); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    finally { rmSync(tmp, { force: true }); }
  }
  return readFileSync(file);
}

const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/**
 * Remove work directories (hard-link trees) left by scans that died — including
 * SIGKILL, which no handler can catch. A run's directory is named run-<pid>-<rand>.
 */
export function sweepStaleWork(workDir, { maxAgeMs = 24 * 3600_000 } = {}) {
  let removed = 0;
  let entries;
  try { entries = readdirSync(workDir); } catch { return 0; }
  for (const name of entries) {
    const m = name.match(/^run-(\d+)-/);
    const full = join(workDir, name);
    let old = false;
    try { old = Date.now() - statSync(full).mtimeMs > maxAgeMs; } catch { continue; }
    if (!m || !pidAlive(Number(m[1])) || old) { rmSync(full, { recursive: true, force: true }); removed++; }
  }
  return removed;
}

/**
 * Keep only what normalization needs: per-day, per-agent, per-model numbers and
 * session activity times. Session ids and anything from the logs themselves are
 * dropped, so the cache holds analytics, not history.
 */
const NUM = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens', 'totalTokens', 'totalCost', 'costUSD', 'reasoningOutputTokens'];
const MODEL_NUM = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens', 'cost', 'storedCost'];
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o?.[k] != null).map(k => [k, o[k]]));
export function toAggregate(report, rewritePath = (s) => s) {
  return {
    daily: (report.daily || []).map(row => ({
      period: row.period || row.date,
      agents: (row.agents || []).map(a => ({
        agent: a.agent, ...pick(a, NUM),
        modelBreakdowns: (a.modelBreakdowns || []).map(mb => ({ modelName: mb.modelName, ...pick(mb, MODEL_NUM), ...(mb.missingPricing ? { missingPricing: true } : {}) })),
      })),
    })),
    session: (report.session || []).map(x => ({ agent: x.agent, metadata: { lastActivity: x.metadata?.lastActivity ?? x.lastActivity ?? null } })),
    warnings: (report.warnings || []).map(rewritePath),
  };
}

let cleanupHooked = new Set();
function cleanupOnExit(dir) {
  const rm = () => { try { rmSync(dir, { recursive: true, force: true }); } catch {} };
  const onSignal = (sig) => { rm(); process.removeListener(sig, onSignal); process.kill(process.pid, sig); };
  process.once('exit', rm);
  for (const sig of ['SIGINT', 'SIGTERM']) if (!cleanupHooked.has(sig)) { cleanupHooked.add(sig); process.once(sig, onSignal); }
  return () => { process.removeListener('exit', rm); rm(); };
}

/**
 * Collect with bounded memory. Returns a merged raw report for normalizeCcusageReport().
 * @param {object} o
 * @param {string} o.cacheDir   persistent cache (must share a filesystem with the logs)
 * @param {number} [o.concurrency=2]
 * @param {'auto'|'link'} [o.strategy='auto']  auto: single-project groups use the collector's
 *   project filter (no links at all); only groups of projects sharing messages are hard-linked
 * @param {object} [o.hooks]    test hooks: link(src, dst), beforeRun(names, mode)
 */
export async function collectSharded({ cacheDir, concurrency = 2, roots = claudeProjectRoots(), runOpts = {}, hooks = {}, strategy = 'auto' } = {}) {
  privateDir(cacheDir);
  const entriesDir = privateDir(join(cacheDir, 'entries'));
  const workDir = privateDir(join(cacheDir, 'work'));
  sweepStaleWork(workDir);
  const runDir = mkdtempSync(join(workDir, `run-${process.pid}-`));
  try { chmodSync(runDir, 0o700); } catch {}
  const release = cleanupOnExit(runDir);
  const runStart = Date.now();
  const used = new Set();
  const stats = { shards: 0, cached: 0, computed: 0, changedDuringScan: 0, filtered: 0, linked: 0 };
  const diagnostics = [];
  const link = hooks.link || linkSync;
  const context = cacheContext(runOpts);
  const secret = cacheSecret(cacheDir);
  try {
    const projects = discoverProjects(roots);
    const groups = await groupProjects(projects, { cacheDir: entriesDir, used, context, secret });
    stats.shards = groups.length;
    const empty = emptyDir(runDir);
    const claudeEnv = (dirs) => ({ HOME: empty, USERPROFILE: empty, CLAUDE_CONFIG_DIR: dirs.join(','),
      CODEX_HOME: empty, OPENCODE_DATA_DIR: empty, GEMINI_DATA_DIR: empty, QWEN_DATA_DIR: empty,
      KIMI_DATA_DIR: empty, ANTIGRAVITY_DATA_DIR: empty, KILO_DATA_DIR: empty, XDG_DATA_HOME: empty });

    // Exact, case-sensitive single-project filter, measured on 20.0.46. It scopes BOTH
    // the daily and session sections and bounds ingestion. (An array is silently
    // ignored and a comma list matches nothing, hence one project per run.)
    const runFiltered = async (name) => {
      const cfg = join(runDir, `filter-${Math.random().toString(36).slice(2)}.json`);
      writeAtomic(cfg, JSON.stringify({ claude: { commands: { daily: { project: name } } } }));
      try {
        await hooks.beforeRun?.([name], 'filter');
        const report = await runCcusage({ ...runOpts, configPath: cfg,
          env: claudeEnv(projects.get(name).map(l => l.root)) });
        return toAggregate(report);
      } finally { rmSync(cfg, { force: true }); }
    };

    const runShard = async (names) => {
      if (strategy === 'auto' && names.length === 1) { stats.filtered++; return runFiltered(names[0]); }
      stats.linked++;
      const scratch = mkdtempSync(join(runDir, 'shard-'));
      try {
        const roots = new Map();
        for (const name of names) {
          for (const { root, files } of projects.get(name)) {
            if (!roots.has(root)) roots.set(root, join(scratch, `root${roots.size}`));
            for (const f of files) {
              const target = join(roots.get(root), 'projects', relative(root, f));
              mkdirSync(dirname(target), { recursive: true });
              try { link(f, target); }
              catch (e) { throw new CollectorError('shard-link', `cannot hard-link ${basename(f)} (${e.code}); sharded mode needs its cache on the same filesystem as your logs`); }
            }
          }
        }
        await hooks.beforeRun?.(names, 'link');
        const report = await runCcusage({ ...runOpts, env: claudeEnv([...roots.values()]) });
        // Warnings name scratch paths; point them back at the real files.
        const rewrite = (w) => [...roots].reduce((t, [orig, sh]) => t.split(join(sh, 'projects')).join(orig), w);
        return toAggregate(report, rewrite);
      } finally { rmSync(scratch, { recursive: true, force: true }); }
    };

    const shardAggs = [];
    const queue = [...groups];
    const worker = async () => {
      for (let names; (names = queue.shift());) {
        if (!names.some(n => projects.get(n).some(loc => loc.files.length))) continue;
        let key = fingerprint(projects, names, context, secret);
        const file = (k) => join(entriesDir, `agg-${k}.json`);
        if (existsSync(file(key))) {
          used.add(basename(file(key)));
          shardAggs.push(JSON.parse(readFileSync(file(key), 'utf-8')));
          stats.cached++;
          continue;
        }
        let agg = null;
        for (let attempt = 0; attempt < 2 && !agg; attempt++) {
          const result = await runShard(names);
          const after = fingerprint(rediscover(projects, names), names, context, secret);
          if (after === key) { agg = result; break; }
          // Files changed while the collector read them: don't cache; retry once on the new state.
          stats.changedDuringScan++;
          key = after;
          if (attempt === 1) {
            agg = result;
            diagnostics.push({ level: 'warn', code: 'changed-during-scan', message: `${names.join(', ')}: logs changed while being read; this result was not cached` });
            key = null;
          }
        }
        // Collector warnings quote real file paths: such a shard is recomputed each run instead of cached.
        if (agg.warnings.length) key = null;
        if (key) { writeAtomic(file(key), JSON.stringify(agg)); used.add(basename(file(key))); }
        shardAggs.push(agg);
        stats.computed++;
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

    const rest = await runCcusage({ ...runOpts, env: { CLAUDE_CONFIG_DIR: empty } });

    // Completed run: drop entries this run didn't use (deleted sessions, old keys).
    // Entries newer than this run may belong to a concurrent scan; leave those.
    for (const name of readdirSync(entriesDir)) {
      if (used.has(name)) continue;
      const full = join(entriesDir, name);
      try { if (statSync(full).mtimeMs < runStart) unlinkSync(full); } catch {}
    }

    return {
      report: {
        daily: [...shardAggs.flatMap(r => r.daily), ...(rest.daily || [])],
        session: [...shardAggs.flatMap(r => r.session), ...(rest.session || [])],
        warnings: [...shardAggs.flatMap(r => r.warnings), ...(rest.warnings || [])],
        version: rest.version,
      },
      stats,
      diagnostics,
    };
  } finally {
    release();
  }
}

/** Fresh file lists for a shard's projects (to detect changes made during a scan). */
function rediscover(projects, names) {
  const fresh = new Map();
  for (const name of names) {
    fresh.set(name, projects.get(name).map(({ root, dir }) => ({ root, dir, files: [...jsonlFiles(dir)] })));
  }
  return fresh;
}

/**
 * Conservative fallback (EXPERIMENTAL — not wired into the CLI).
 *
 * Retries ONCE with the sharded collector at concurrency 1, and only when the full
 * run failed with a confidently classified out-of-memory: an allocator failure
 * message, or a SIGKILL accompanied by a rise in the kernel's cgroup OOM-kill
 * counter (see src/utils/oom.js). Every other failure — timeouts, bare SIGKILL,
 * invalid output, missing binary, unreadable sources, collector errors — is
 * rethrown unchanged. If the retry also fails, both failures are reported; there
 * is never a second retry.
 *
 * @param {object} o
 * @param {() => Promise<object>} o.full       full collector run
 * @param {() => Promise<object>} o.sharded    sharded run (called with no args; bind concurrency 1)
 * @param {(msg: string) => void} o.notice     user-visible message (called exactly once on retry)
 */
export async function collectWithOomFallback({ full, sharded, notice }) {
  try {
    return { mode: 'full', result: await full() };
  } catch (err) {
    if (err?.code !== 'out-of-memory') throw err;
    notice(`The usage collector ran out of memory (${err.evidence || 'unclassified'}). `
      + 'Retrying once in low-memory mode, one project at a time — this is slower but reads the same data.');
    try {
      return { mode: 'sharded-after-oom', result: await sharded(), firstError: err };
    } catch (retryErr) {
      throw new CollectorError(retryErr?.code === 'out-of-memory' ? 'out-of-memory' : 'retry-failed',
        `low-memory retry also failed (${retryErr?.message || retryErr}); first failure: ${err.message}`, err.evidence);
    }
  }
}
