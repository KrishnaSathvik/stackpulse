/**
 * parsers/vscode-task-history.js
 * Shared reader for Cline-family VS Code extensions (Roo Code, Kilo Code).
 *
 * Two stores, read in this order and de-duplicated by task id:
 *   1. globalStorage/<extension>/tasks/<id>/history_item.json — authoritative in
 *      current Roo Code (TaskHistoryStore)
 *   2. VS Code globalState: ONE ItemTable row in
 * globalStorage/state.vscdb, keyed by the extension ID; the value is a JSON
 * object whose `taskHistory` array holds one entry per task:
 *   { id, ts, tokensIn, tokensOut, cacheWrites?, cacheReads?, totalCost? }
 * The extension records cost itself, so it is reported as `recorded`.
 *
 * Verified against Roo Code source (RooCodeInc/Roo-Code, TaskHistoryStore and the
 * globalState migration in ClineProvider). Kilo Code's current extension stores
 * sessions in the Kilo CLI database instead and migrates this legacy history
 * there, which is why kilocode.js reads the extension only as a fallback.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { queryColumn } from '../src/utils/sqlite.js';
import { localDate } from '../src/utils/dates.js';

export function vscodeUserDirs(home = homedir()) {
  const products = ['Code', 'Code - Insiders', 'VSCodium', 'Cursor', 'Windsurf'];
  const roots = [
    join(home, 'Library', 'Application Support'),
    join(home, '.config'),
    process.env.APPDATA || join(home, 'AppData', 'Roaming'),
  ];
  return roots.flatMap(r => products.map(p => join(r, p, 'User'))).filter(existsSync);
}

const num = (v) => (Number.isFinite(v) ? v : 0);

/** Read task history for one extension from one global state database. */
export function readTaskHistory(dbPath, extensionId) {
  // Keys are case-insensitive in practice (publisher casing varies by version)
  const rows = queryColumn(dbPath,
    'SELECT CAST(value AS TEXT) FROM ItemTable WHERE lower(key) = lower(?)', [extensionId]);
  const tasks = [];
  for (const raw of rows) {
    let state;
    try { state = JSON.parse(raw); } catch { continue; }
    if (Array.isArray(state?.taskHistory)) tasks.push(...state.taskHistory);
  }
  return tasks;
}

/**
 * Current Roo Code keeps one authoritative file per task,
 * globalStorage/<extension>/tasks/<taskId>/history_item.json (TaskHistoryStore,
 * RooCodeInc/Roo-Code). globalState `taskHistory` is now only a debounced
 * write-through kept "for the transition period", so it can lag or disappear.
 */
export function readTaskFiles(userDir, extensionId) {
  const tasksDir = join(userDir, 'globalStorage', extensionId.toLowerCase(), 'tasks');
  let ids;
  try { ids = readdirSync(tasksDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { return []; }
  const items = [];
  for (const id of ids) {
    try {
      const item = JSON.parse(readFileSync(join(tasksDir, id, 'history_item.json'), 'utf-8'));
      if (item && typeof item === 'object') items.push({ id, ...item });
    } catch { /* task without a history file (older versions) or unreadable */ }
  }
  return items;
}

/**
 * @param {object} cfg { tool, extensionId }
 * @param {object} opts { home } for tests
 */
export function parseTaskHistoryTool({ tool, extensionId }, opts = {}) {
  const userDirs = vscodeUserDirs(opts.home);
  const dbs = userDirs.map(d => join(d, 'globalStorage', 'state.vscdb')).filter(existsSync);
  // Per-task files first (authoritative), then globalState for older versions;
  // the same task in both is counted once (first source wins).
  const sources = [
    ...userDirs.map(d => () => readTaskFiles(d, extensionId)),
    ...dbs.map(db => () => readTaskHistory(db, extensionId).map(t => ({ ...t, id: t?.id ?? `${db}:${t?.ts}` }))),
  ];
  if (sources.length === 0) return null;

  const seen = new Set();
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: null, total: 0 };
  let cost = 0, costKnown = false, costMissing = 0;
  const days = new Map();

  for (const load of sources) {
    for (const t of load()) {
      const id = t.id;
      if (seen.has(id)) continue;
      seen.add(id);
      const total = num(t.tokensIn) + num(t.tokensOut) + num(t.cacheReads) + num(t.cacheWrites);
      tokens.input += num(t.tokensIn);
      tokens.output += num(t.tokensOut);
      tokens.cacheRead += num(t.cacheReads);
      tokens.cacheWrite += num(t.cacheWrites);
      tokens.total += total;
      if (Number.isFinite(t.totalCost)) { cost += t.totalCost; costKnown = true; } else if (total > 0) costMissing++;
      const date = Number.isFinite(t.ts) ? localDate(new Date(t.ts)) : null;
      if (date) {
        const d = days.get(date) || { sessions: 0, tokens: 0, cost: 0 };
        d.sessions += 1; d.tokens += total; d.cost += num(t.totalCost);
        days.set(date, d);
      }
    }
  }

  if (seen.size === 0) return null;
  const tokensKnown = tokens.total > 0;
  return {
    tool,
    sessions: seen.size,
    tokens_used: tokensKnown ? Math.round(tokens.total / 100) / 10 : null,
    cost_usd: costKnown ? cost : null,
    models: [],
    modelBreakdown: [],
    daily: [...days.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, toolKey: tool, sessions: d.sessions, totalTokens: d.tokens, totalCost: d.cost })),
    tokens: tokensKnown ? tokens : null,
    cost: {
      usd: costKnown ? cost : null,
      kind: costKnown ? 'recorded' : 'unavailable',
      status: !costKnown ? 'unavailable' : costMissing ? 'partial' : 'complete',
      partial: costKnown && costMissing > 0,
      unpricedModels: [],
      tasksWithoutCost: costMissing,
    },
    provenance: { adapter: 'vscode-task-history', sourceVersion: null, extensionId },
    _meta: { dbCount: dbs.length },
  };
}
