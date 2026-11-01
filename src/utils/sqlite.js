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

export const sqliteBackend = () => (DatabaseSync ? 'node:sqlite' : 'sqlite3-cli');

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
  try {
    // -json keeps multi-line values intact (plain mode splits rows on newlines)
    const out = execFileSync('sqlite3', ['-readonly', '-batch', '-json', dbPath, inlined], {
      timeout: 15_000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    }).toString().trim();
    return out ? JSON.parse(out).map(row => toText(Object.values(row)[0])) : [];
  } catch (err) {
    if (err.code === 'ENOENT') throw new SqliteUnavailableError();
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
