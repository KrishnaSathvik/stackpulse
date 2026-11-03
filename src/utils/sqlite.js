/**
 * src/utils/sqlite.js
 * Read-only SQLite access for editor state databases (state.vscdb).
 *
 * Prefers Node's built-in `node:sqlite` (Node >= 22.5, no external binary, works
 * on Windows). Falls back to the `sqlite3` CLI via execFile — never a shell, so
 * database paths cannot inject commands. Parameters are bound, not interpolated.
 */

import { execFileSync } from 'child_process';

let DatabaseSync = null;
// STACKPULSE_SQLITE_BACKEND=cli forces the sqlite3 fallback (used to test it on new Node).
if (process.env.STACKPULSE_SQLITE_BACKEND !== 'cli') try {
  // Silence the one-time ExperimentalWarning on Node 22/23.
  const emit = process.emitWarning;
  process.emitWarning = (w, ...rest) => (String(w).includes('SQLite') ? undefined : emit.call(process, w, ...rest));
  ({ DatabaseSync } = await import('node:sqlite'));
  process.emitWarning = emit;
} catch { /* older Node: CLI fallback */ }

export class SqliteUnavailableError extends Error {
  constructor() {
    super('no SQLite reader available (needs Node >= 22.5 or the sqlite3 CLI on PATH)');
    this.code = 'sqlite-unavailable';
  }
}

export class SqliteTimeoutError extends Error {
  constructor(dbPath, ms) {
    super(`sqlite3 timed out after ${Math.round(ms / 1000)}s reading ${dbPath}`);
    this.code = 'sqlite-timeout';
  }
}

export const sqliteBackend = () => (DatabaseSync ? 'node:sqlite' : 'sqlite3-cli');

// Per-query bound for the sqlite3 CLI. Real editor databases reach tens of GB
// (a 34 GB Cursor state.vscdb was measured), so the bound is generous but finite.
// STACKPULSE_SQLITE_TIMEOUT_MS overrides it, clamped to 1 s – 10 min.
const DEFAULT_CLI_TIMEOUT_MS = 120_000;
export function cliTimeoutMs() {
  const v = Number(process.env.STACKPULSE_SQLITE_TIMEOUT_MS);
  return Number.isFinite(v) && v > 0 ? Math.min(Math.max(v, 1_000), 600_000) : DEFAULT_CLI_TIMEOUT_MS;
}

const toText = (v) => (v instanceof Uint8Array ? Buffer.from(v).toString('utf-8') : v == null ? null : String(v));

function quote(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

/**
 * Run a read-only query and return the first column of every row as text.
 * @param {string} dbPath
 * @param {string} sql     use `?` placeholders
 * @param {Array}  params
 */
export function queryColumn(dbPath, sql, params = []) {
  if (DatabaseSync) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      return db.prepare(sql).all(...params).map(row => toText(Object.values(row)[0]));
    } finally { db.close(); }
  }
  let i = 0;
  const inlined = sql.replace(/\?/g, () => quote(params[i++]));
  // Each value travels as one hex line ("X<hex>", or "N" for NULL): newlines and any
  // bytes survive, and it avoids the shell's -json string escaping, which took 70 s
  // for a single 1.5 MB Cursor value (hex: 0.01 s). Queries here select one column.
  const wrapped = `WITH q(v) AS (${inlined}) SELECT CASE WHEN v IS NULL THEN 'N' ELSE 'X' || hex(CAST(v AS TEXT)) END FROM q`;
  const timeout = cliTimeoutMs();
  try {
    const out = execFileSync('sqlite3', ['-readonly', '-batch', '-list', dbPath, wrapped], {
      timeout, maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    }).toString();
    return out.split(/\r?\n/).filter(Boolean)
      .map(line => (line[0] === 'N' ? null : Buffer.from(line.slice(1), 'hex').toString('utf-8')));
  } catch (err) {
    if (err.code === 'ENOENT') throw new SqliteUnavailableError();
    if (err.code === 'ETIMEDOUT') throw new SqliteTimeoutError(dbPath, timeout);
    throw err;
  }
}

export function listTables(dbPath) {
  return queryColumn(dbPath, "SELECT name FROM sqlite_master WHERE type = 'table'");
}

/** ItemTable value for an exact key, parsed as JSON; null when absent or not JSON. */
export function readItemJson(dbPath, key) {
  const [val] = queryColumn(dbPath, 'SELECT CAST(value AS TEXT) FROM ItemTable WHERE key = ? LIMIT 1', [key]);
  if (val == null) return null;
  try { return JSON.parse(val); } catch { return null; }
}
