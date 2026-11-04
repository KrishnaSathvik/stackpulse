/**
 * src/collectors/ccusage.js
 * Pinned, shell-free integration with the ccusage collector.
 *
 * One invocation (`daily --by-agent --sections daily,session`) yields per-agent,
 * per-model, per-day and per-session data. All ccusage-backed adapters share
 * that single result, so a scan spawns one collector process instead of ten,
 * and no agent's events can be counted twice.
 *
 * Token semantics of ccusage's normalized output (verified against 20.0.46):
 *   inputTokens         excludes cache reads (Codex cached input is moved out)
 *   outputTokens        includes reasoning tokens (reasoningOutputTokens is a subset)
 *   cacheReadTokens / cacheCreationTokens are separate, additive categories
 *   total = input + output + cacheRead + cacheCreation
 */

import { execFile } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { queryColumn } from '../utils/sqlite.js';
import { readOomKillCount } from '../utils/oom.js';
import { displayModelName } from '../models/catalog.js';
import { localDate } from '../utils/dates.js';
import { recordCost, roundUsd, summarizeCost } from '../core/cost.js';
import { codexHome, codexOnlyEnv, codexViewWithoutConfig, configuredServiceTier, droppedForks, sweepStaleTempDirs, tempDir,
  tierChangesCost, writeRecoveredHome } from './codex.js';

export const CCUSAGE_VERSION = '20.0.46';
export const CODEX_AUTO_REVIEW_NOTE = 'Auto-review usage has no published price; it is counted and priced as gpt-5.6-luna.';

/** ccusage agent name → StackPulse tool key. Only these are counted from ccusage. */
export const AGENT_TO_TOOL = {
  claude:      'claude_code',
  codex:       'codex',
  opencode:    'opencode',
  amp:         'amp',
  pi:          'pi',
  gemini:      'gemini',
  qwen:        'qwen',
  kimi:        'kimi',
  antigravity: 'antigravity',   // conversation DBs under ~/.gemini/antigravity*
  kilo:        'kilocode',      // Kilo CLI ~/.local/share/kilo/kilo.db
};

export class CollectorError extends Error {
  constructor(code, message, evidence = null) {
    super(message);
    this.code = code;
    this.evidence = evidence;   // e.g. how an out-of-memory failure was identified
  }
}

const DATE_ARG = /^(\d{8}|\d{4}-\d{2}-\d{2})$/;
const DEFAULT_TIMEOUT_MS = 60_000;

/** Locate the pinned ccusage CLI shipped as a dependency. Never downloads. */
export function resolveCcusage() {
  const require = createRequire(import.meta.url);
  let pkgPath;
  try { pkgPath = require.resolve('ccusage/package.json'); }
  catch { return { ok: false, reason: 'ccusage dependency is not installed' }; }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.ccusage;
  if (!bin) return { ok: false, reason: 'ccusage package has no bin entry' };
  return { ok: true, cli: join(dirname(pkgPath), bin), version: pkg.version };
}

// ccusage auto-merges .ccusage/ccusage.json (current directory) and ~/.claude/ccusage.json.
// A user's `since`, project filter or pricing override there would silently change
// StackPulse's numbers, so always pass an explicit empty config. Data-location
// environment variables (CLAUDE_CONFIG_DIR, CODEX_HOME, …) still apply.
const ISOLATED_CONFIG = fileURLToPath(new URL('./ccusage-isolated.json', import.meta.url));

function buildArgs(opts) {
  // opts.configPath: a StackPulse-generated config (sharded collector); never the user's
  const args = ['daily', '--json', '--by-agent', '--offline', '--sections', 'daily,session', '--no-color', '--config', opts.configPath || ISOLATED_CONFIG];
  for (const flag of ['since', 'until']) {
    if (opts[flag] == null) continue;
    if (!DATE_ARG.test(String(opts[flag]))) throw new CollectorError('bad-arg', `invalid --${flag} date: ${opts[flag]}`);
    args.push(`--${flag}`, String(opts[flag]));
  }
  return args;
}

/** Parse collector stdout, tolerating log lines printed before the JSON body. */
export function parseCollectorJson(raw) {
  // A log line like "[info] ..." also starts with "[", so try each candidate line start.
  let lastError = null;
  for (const m of raw.matchAll(/^[\[{]/gm)) {
    try { return JSON.parse(raw.slice(m.index)); }
    catch (e) { lastError = e; }
  }
  throw new CollectorError('invalid-json', lastError
    ? `collector JSON could not be parsed: ${lastError.message}`
    : 'collector produced no JSON output');
}

/** Run the pinned collector once. Rejects with CollectorError. */
export function runCcusage(opts = {}) {
  const found = opts.cli ? { ok: true, cli: opts.cli, version: opts.version ?? null } : resolveCcusage();
  if (!found.ok) return Promise.reject(new CollectorError('not-installed', found.reason));
  const timeout = Number(process.env.STACKPULSE_COLLECTOR_TIMEOUT_MS) || opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  let args;
  try { args = buildArgs(opts); } catch (e) { return Promise.reject(e); }

  const oomBefore = readOomKillCount();
  // opts.env overrides process.env without touching it; an `undefined` value removes a variable
  const env = { ...process.env, ...(opts.env || {}), NO_COLOR: '1', FORCE_COLOR: '0' };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [found.cli, ...args], {
      timeout,
      maxBuffer: 256 * 1024 * 1024,
      windowsHide: true,
      env,
    }, (err, stdout, stderr) => {
      if (err) {
        if (err.killed) return reject(new CollectorError('timeout', `ccusage timed out after ${Math.round(timeout / 1000)}s`));
        // Any non-zero exit is a failure. (No data exits 0 with empty sections, so an
        // empty stdout here means the collector could not run — never "no usage".)
        const text = String(stderr || '');
        // The collector holds the whole history in memory (~2x log size at 1 GB, M2
        // measurement); an allocation failure aborts it. Say so plainly.
        const oomMessage = 'the usage collector ran out of memory reading your AI tool logs '
          + '(it needs roughly twice their size in RAM); close other apps or free memory and retry';
        if (/memory allocation of \d+ bytes failed/i.test(text)) {
          return reject(new CollectorError('out-of-memory', oomMessage, 'allocation-failure'));
        }
        // A kernel OOM kill (container / cgroup limit) arrives as a bare SIGKILL, exactly
        // like `kill -9`. Only call it out-of-memory if the kernel's OOM-kill counter rose.
        if (err.signal === 'SIGKILL' || err.signal === 'SIGABRT') {
          const after = readOomKillCount();
          // The counter is shared by every process in the cgroup (and its ancestors), so a rise
          // shows the kernel OOM-killed *something* during the run, not necessarily the collector.
          if (err.signal === 'SIGKILL' && oomBefore != null && after != null && after > oomBefore) {
            return reject(new CollectorError('out-of-memory', 'the usage collector was stopped by SIGKILL while the system '
              + 'was out of memory (probable memory-related termination; the kernel does not say which process it killed). '
              + 'It needs roughly twice the size of your AI tool logs in RAM; close other apps or free memory and retry',
              'cgroup-oom-kill'));
          }
          return reject(new CollectorError('killed', `the usage collector was stopped by ${err.signal}`
            + (err.signal === 'SIGKILL' ? ' (not identified as out-of-memory)' : '')));
        }
        // Prefer a line that explains the failure over trailing backtrace notes.
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const detail = lines.find(l => /error|failed|missing|denied|not found/i.test(l) && !/RUST_BACKTRACE/.test(l))
          || lines.filter(l => !/^(note:|stack backtrace:|\d+:|at )/.test(l)).pop()
          || err.message || `exit code ${err.code}`;
        const code = /Missing optional native package/i.test(text) ? 'binary-missing' : 'exit';
        return reject(new CollectorError(code, `ccusage failed: ${detail}`));
      }
      // Successful runs can still warn (e.g. "Skipping unreadable Antigravity database");
      // keep those so they surface as diagnostics instead of vanishing with stderr.
      const warnings = String(stderr).split('\n').map(l => l.trim()).filter(l => /^WARN\b/.test(l)).map(l => l.replace(/^WARN\s+/, ''));
      try { resolve({ ...parseCollectorJson(String(stdout)), version: found.version, warnings }); }
      catch (e) { reject(e); }
    });
  });
}

let pending = null;
let pendingKey = null;

/** Memoized: every adapter in one scan shares a single collector run. */
const LOCATION_ENV = ['HOME', 'USERPROFILE', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'OPENCODE_DATA_DIR', 'GEMINI_DATA_DIR',
  'QWEN_DATA_DIR', 'KIMI_DATA_DIR', 'ANTIGRAVITY_DATA_DIR', 'KILO_DATA_DIR', 'PI_AGENT_DIR', 'XDG_DATA_HOME', 'TZ'];

export function getCcusageReport(opts = {}) {
  // Keyed on everything that changes what the collector reads, so a second scan of
  // a different location never reuses the first result.
  const key = JSON.stringify([opts.since ?? null, opts.until ?? null, LOCATION_ENV.map(k => process.env[k] ?? null)]);
  if (!pending || pendingKey !== key) {
    pendingKey = key;
    pending = collectReport(opts).then(normalizeCcusageReport);
  }
  return pending;
}

/**
 * One collector run with the Codex corrections from ./codex.js applied:
 * Codex is read without today's config.toml (recorded tiers kept, unrecorded
 * usage at the standard rate), forked sessions the collector dropped are
 * recovered, and when config.toml sets another tier its effect is measured.
 * Returns a raw collector report, extended with `codex` notes for normalization.
 */
export async function collectReport(opts = {}) {
  const home = opts.codexHome === undefined ? codexHome() : opts.codexHome;
  if (!home) return runCcusage(opts);
  sweepStaleTempDirs();   // folders a crashed scan may have left
  const temps = [];
  const temp = (prefix) => { const t = tempDir(prefix); temps.push(t); return t.dir; };
  try {
    const view = codexViewWithoutConfig(home);
    temps.push(view);
    const report = await runCcusage({ ...opts, env: { ...(opts.env || {}), CODEX_HOME: view.dir } });
    const codex = { recovered: [], unverified: [], tier: null };
    report.codex = codex;

    // Codex-only passes read an empty HOME, so no other agent is counted twice.
    const empty = temp('empty');
    const codexPass = (dir) => runCcusage({ ...opts, env: { ...(opts.env || {}), ...codexOnlyEnv(dir, empty) } });
    const codexRows = (r) => ({
      daily: (r.daily || []).map(row => ({ ...row, agents: (row.agents || []).filter(a => a.agent === 'codex') })),
      session: (r.session || []).filter(s => s.agent === 'codex'),
    });

    const counted = new Set((report.session || []).filter(s => s.agent === 'codex').map(s => s.period));
    const forks = droppedForks(home, counted);
    codex.unverified = forks.unverified;
    let recoveredRows = null;
    if (forks.recovered.length) {
      recoveredRows = codexRows(await codexPass(writeRecoveredHome(forks.recovered, temp('forks'))));
      // Accept a session only when the collector's count matches the independent one,
      // so a replay the filter missed can never be counted twice.
      const own = new Map(forks.recovered.map(f => [f.period, f.tokens]));
      const ok = new Set(recoveredRows.session.filter(s => s.totalTokens === own.get(s.period)).map(s => s.period));
      for (const f of forks.recovered) (ok.has(f.period) ? codex.recovered : codex.unverified).push(f.period);
      if (ok.size === forks.recovered.length) {
        report.daily = [...(report.daily || []), ...recoveredRows.daily];
        report.session = [...(report.session || []), ...recoveredRows.session.filter(s => ok.has(s.period))];
        codex.recoveredTokens = recoveredRows.session.reduce((a, s) => a + num(s.totalTokens), 0);
      } else {
        // Daily rows can't be split per session, so a partial match recovers nothing.
        codex.unverified = [...forks.unverified, ...forks.recovered.map(f => f.period)];
        codex.recovered = [];
      }
    }

    const tier = configuredServiceTier(home);
    if (tierChangesCost(tier)) {
      codex.tier = { configured: tier, configuredUsd: null };
      try {
        const alt = codexRows(await codexPass(home));
        if (codex.recovered.length) {
          const altForks = codexRows(await codexPass(writeRecoveredHome(forks.recovered, temp('forks-cfg'), home)));
          alt.daily.push(...altForks.daily);
          alt.session.push(...altForks.session);
        }
        codex.tier.configuredUsd = normalizeCcusageReport(alt).tools.codex?.cost.usd ?? null;
      } catch (e) {
        codex.tier.error = String(e.message || e).split('\n')[0];
      }
    }
    return report;
  } finally {
    for (const t of temps) t.cleanup();
  }
}

/** For tests: drop the memoized collector result. */
export function resetCcusageCache() { pending = null; pendingKey = null; }

const num = (v) => (Number.isFinite(v) ? v : 0);
const sumTokens = (r) => num(r.inputTokens) + num(r.outputTokens) + num(r.cacheReadTokens) + num(r.cacheCreationTokens);
const toK = (n) => Math.round(n / 100) / 10;

function emptyAgent() {
  return {
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: null, total: 0 },
    costSum: 0,
    models: new Map(),
    days: new Map(),
    sessions: 0,
    sessionDays: new Map(),
  };
}

/**
 * Pure transform: ccusage unified report → StackPulse tool records.
 * Output keeps the 3.x shape (tokens_used in K, cost_usd, modelBreakdown, daily)
 * and adds explicit `tokens`, `cost` provenance and `sessions: null` when unknown.
 */
export function normalizeCcusageReport(report) {
  const agents = new Map();
  const otherAgents = new Set();
  const diagnostics = [];
  const get = (name) => {
    if (!AGENT_TO_TOOL[name]) { otherAgents.add(name); return null; }
    if (!agents.has(name)) agents.set(name, emptyAgent());
    return agents.get(name);
  };

  const list = (v) => (Array.isArray(v) ? v : []);
  for (const row of list(report?.daily)) {
    if (!row || typeof row !== 'object') continue;
    const date = row.period || row.date;
    const perAgent = Array.isArray(row.agents)
      ? row.agents
      : (row.agent && row.agent !== 'all' ? [row] : []);
    if (!Array.isArray(row.agents) && row.agent === 'all') {
      diagnostics.push({ level: 'warn', code: 'no-agent-breakdown', message: `daily row ${date} has no per-agent breakdown; skipped` });
    }
    for (const a of perAgent) {
      if (!a?.agent) continue;
      const acc = get(a.agent);
      if (!acc) continue;
      const total = Number.isFinite(a.totalTokens) ? a.totalTokens : sumTokens(a);
      acc.tokens.input += num(a.inputTokens);
      acc.tokens.output += num(a.outputTokens);
      acc.tokens.cacheRead += num(a.cacheReadTokens);
      acc.tokens.cacheWrite += num(a.cacheCreationTokens);
      acc.tokens.total += total;
      if (Number.isFinite(a.reasoningOutputTokens)) acc.tokens.reasoning = (acc.tokens.reasoning || 0) + a.reasoningOutputTokens;
      const dayCost = num(a.totalCost ?? a.costUSD);
      acc.costSum += dayCost;
      const d = acc.days.get(date) || { tokens: 0, cost: 0 };
      d.tokens += total; d.cost += dayCost;
      acc.days.set(date, d);

      for (const m of list(a.modelBreakdowns)) {
        const id = m.modelName || m.model || null;
        const key = id || '(unknown)';
        const mm = acc.models.get(key) || { id, tokens: 0, cost: 0, recordedUsd: 0, missingPricing: false };
        mm.tokens += sumTokens(m);
        mm.cost += num(m.cost);
        mm.recordedUsd += num(m.storedCost);   // cost the tool itself logged
        if (m.missingPricing) mm.missingPricing = true;
        acc.models.set(key, mm);
      }
    }
  }

  const sessionField = report?.session ?? report?.sessions;
  const sessionRows = Array.isArray(sessionField) ? sessionField : null;
  const sessionsKnown = Array.isArray(sessionRows);
  if (!sessionsKnown) {
    diagnostics.push({ level: 'warn', code: 'no-session-section', message: 'collector returned no session data; session counts unavailable' });
  }
  for (const s of sessionRows || []) {
    if (!s || typeof s !== 'object') continue;
    const acc = get(s.agent);
    if (!acc) continue;
    acc.sessions += 1;
    const last = s.metadata?.lastActivity || s.lastActivity;
    const day = last ? localDate(new Date(last)) : null;
    if (day) acc.sessionDays.set(day, (acc.sessionDays.get(day) || 0) + 1);
  }

  const tools = {};
  for (const [agent, acc] of agents) {
    const toolKey = AGENT_TO_TOOL[agent];
    const models = [...acc.models.values()].sort((a, b) => b.tokens - a.tokens);
    const cost = summarizeCost(
      models.map(m => ({ id: m.id, usd: m.cost, recordedUsd: m.recordedUsd, missingPricing: m.missingPricing, tokens: m.tokens })),
      { pricingSource: `ccusage ${report?.version ?? CCUSAGE_VERSION} bundled prices` });
    // Model costs and day costs come from the same rows; flag drift instead of hiding it.
    const toolDiagnostics = [];
    if (cost.usd != null && Math.abs(cost.usd - acc.costSum) > 1e-6 * Math.max(1, acc.costSum)) {
      toolDiagnostics.push({ level: 'warn', code: 'cost-mismatch',
        message: `${toolKey}: model costs sum to ${cost.usd} but daily costs sum to ${acc.costSum}` });
    }
    diagnostics.push(...toolDiagnostics);
    const costUsd = cost.usd;

    tools[toolKey] = {
      tool: toolKey,
      sessions: sessionsKnown ? acc.sessions : null,
      tokens_used: toK(acc.tokens.total),
      cost_usd: costUsd,
      models: models.map(m => displayModelName(m.id)),
      modelBreakdown: models.map(m => ({
        model: m.id,
        displayName: displayModelName(m.id),
        tokens_used: toK(m.tokens),
        tokens: m.tokens,                     // exact count; tokens_used is rounded for display
        cost_usd: roundUsd(recordCost({ usd: m.cost, missingPricing: m.missingPricing }).usd),
        costStatus: recordCost({ usd: m.cost, missingPricing: m.missingPricing }).status,
        missingPricing: m.missingPricing,
      })),
      daily: [...acc.days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({
        date, toolKey, totalTokens: d.tokens, totalCost: roundUsd(d.cost), sessions: acc.sessionDays.get(date) || 0,
      })),
      tokens: acc.tokens,
      cost,
      provenance: { adapter: 'ccusage', sourceVersion: report?.version ?? null, pricing: 'ccusage-bundled' },
      diagnostics: toolDiagnostics,
    };
  }

  // Collector warnings name their source ("…Antigravity database…"); attach them to that tool.
  const warnedTools = new Map();   // toolKey → warnings
  for (const w of Array.isArray(report?.warnings) ? report.warnings : []) {
    const d = { level: 'warn', code: 'collector-warning', message: w };
    diagnostics.push(d);
    // Match the source named in the prose, not in quoted paths ("…Antigravity database
    // '/home/u/.gemini/antigravity/…'" must not be read as Gemini); longest name wins.
    const prose = w.replace(/'[^']*'|"[^"]*"/g, ' ');
    const agent = Object.keys(AGENT_TO_TOOL)
      .filter(a => new RegExp(`\\b${a}\\b`, 'i').test(prose))
      .sort((x, y) => y.length - x.length)[0];
    if (!agent) continue;
    const key = AGENT_TO_TOOL[agent];
    warnedTools.set(key, [...(warnedTools.get(key) || []), d]);
    if (tools[key]) tools[key].diagnostics.push(d);
  }

  // Pricing assumption made by the collector: Codex auto-review usage has no published
  // price, so it is counted and priced as gpt-5.6-luna (measured on 20.0.46). Say so
  // wherever a gpt-5.6-luna row appears, since the two cannot be told apart in its output.
  if (tools.codex?.modelBreakdown.some(m => m.model === 'gpt-5.6-luna')) {
    tools.codex.cost = { ...tools.codex.cost, assumptions: [...(tools.codex.cost.assumptions || []), CODEX_AUTO_REVIEW_NOTE] };
  }

  // Codex corrections (collectReport): recovered forks, forks that could not be
  // verified (a known undercount, so coverage is partial), and tier dependence.
  const cx = report?.codex;
  if (cx && tools.codex) {
    const t = tools.codex;
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    if (cx.recovered?.length) {
      t.diagnostics.push({ level: 'info', code: 'codex-forks-recovered',
        message: `${plural(cx.recovered.length, 'forked subagent session')} (${(num(cx.recoveredTokens) / 1e6).toFixed(1)}M tokens) `
          + 'that the collector skipped are included; history replayed from the parent session is not counted again.' });
    }
    if (cx.unverified?.length) {
      const d = { level: 'warn', code: 'codex-forks-unverified',
        message: `${plural(cx.unverified.length, 'forked subagent session')} could not be separated from history replayed `
          + 'from the parent session and are not counted.' };
      diagnostics.push(d); t.diagnostics.push(d);
      warnedTools.set('codex', [...(warnedTools.get('codex') || []), d]);
    }
    if (cx.tier?.configuredUsd != null && t.cost.usd != null && Math.abs(cx.tier.configuredUsd - t.cost.usd) >= 0.005) {
      t.cost = { ...t.cost, tier: {
        unrecorded: 'standard', configured: cx.tier.configured,
        configuredUsd: roundUsd(cx.tier.configuredUsd), dependentUsd: roundUsd(cx.tier.configuredUsd - t.cost.usd) } };
    } else if (cx.tier?.error) {
      t.diagnostics.push({ level: 'warn', code: 'codex-tier-unchecked',
        message: `could not check how the "${cx.tier.configured}" service tier in your Codex config affects cost (${cx.tier.error}); `
          + 'usage with no recorded tier is costed at the standard rate.' });
    }
  }

  // Per-source outcome, so callers never confuse "nothing there" with "couldn't read it":
  //   complete — data, no warnings      partial — data, but something was skipped
  //   failed   — warnings, no data      absent  — no data, no warnings
  const sources = {};
  for (const key of Object.values(AGENT_TO_TOOL)) {
    const warned = warnedTools.get(key) || [];
    const status = tools[key] ? (warned.length ? 'partial' : 'complete') : (warned.length ? 'failed' : 'absent');
    sources[key] = { status, diagnostics: warned };
    if (tools[key]) tools[key].coverage = { status, reasons: warned.map(d => d.message) };
  }
  return { tools, sources, otherAgents: [...otherAgents].sort(), diagnostics };
}

/** Adapter helper used by the ccusage-backed parsers. */
export async function parseFromCcusage(toolKey, opts = {}) {
  const { tools } = await getCcusageReport(opts);
  return tools[toolKey] ?? null;
}

// SQLite-backed sources the collector skips SILENTLY when unreadable (measured on
// 20.0.46: a corrupt kilo.db or opencode.db exits 0 with no warning). For these,
// "absent" is double-checked against the database itself.
const envList = (name) => (process.env[name] || '').split(',').map(x => x.trim()).filter(Boolean);
const PROBED_DATABASES = {
  kilocode: () => [...envList('KILO_DATA_DIR'), join(homedir(), '.local', 'share', 'kilo')].map(d => join(d, 'kilo.db')),
  opencode: () => [...envList('OPENCODE_DATA_DIR'), join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'opencode')]
    .map(d => join(d, 'opencode.db')),
};

function probeAbsentSource(toolKey) {
  for (const db of (PROBED_DATABASES[toolKey]?.() ?? []).filter(existsSync)) {
    let rows;
    try { rows = Number(queryColumn(db, 'SELECT count(*) FROM message')[0]) || 0; }
    catch (e) {
      if (e.code === 'sqlite-unavailable') continue;   // can't verify; don't guess
      return { level: 'warn', code: 'source-unreadable', message: `${db} exists but could not be read (${String(e.message).split('\n')[0]})` };
    }
    if (rows > 0) return { level: 'warn', code: 'source-not-counted', message: `${db} has ${rows} messages but the collector reported no usage from it` };
  }
  return null;
}

/** Record plus source status ('complete' | 'partial' | 'failed' | 'absent') for fallback decisions. */
export async function getCollectorSource(toolKey, opts = {}) {
  const { tools, sources } = await getCcusageReport(opts);
  const src = { record: tools[toolKey] ?? null, ...(sources[toolKey] ?? { status: 'absent', diagnostics: [] }) };
  if (src.status === 'absent') {
    const problem = probeAbsentSource(toolKey);
    if (problem) return { ...src, status: 'failed', diagnostics: [...src.diagnostics, problem] };
  }
  return src;
}

/**
 * Apply the one-source rule for tools with a native fallback. The fallback runs only
 * when the collector has no data; if that is because the collector FAILED to read the
 * source, the fallback is marked incomplete (or the failure is raised when there is
 * no fallback data), never presented as a clean, complete scan.
 */
export async function collectorWithFallback(toolKey, fallback, opts = {}) {
  const src = await getCollectorSource(toolKey, opts);
  if (src.record) return src.record;
  const native = await fallback();
  if (src.status !== 'failed') return native;
  const reasons = src.diagnostics.map(d => d.message);
  if (!native) throw new CollectorError('source-failed', reasons[0] || `${toolKey}: collector could not read this source`);
  return {
    ...native,
    coverage: { status: 'partial', reasons },
    diagnostics: [...(native.diagnostics || []), ...src.diagnostics,
      { level: 'warn', code: 'fallback-after-failure', message: 'primary source unreadable; showing fallback data only' }],
  };
}
