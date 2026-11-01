// Build SQLite fixtures on any Node: node:sqlite when present, else the sqlite3 CLI.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let DatabaseSync = null;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}
let hasCli = true;
try { execFileSync('sqlite3', ['-version'], { stdio: 'ignore' }); } catch { hasCli = false; }

export const canBuildDb = !!DatabaseSync || hasCli;

const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";

/** tables: { name: { key: value } } with (key TEXT, value BLOB); value objects are JSON-encoded. */
export function makeDb(file, tables) {
  mkdirSync(dirname(file), { recursive: true });
  const stmts = [];
  for (const [table, rows] of Object.entries(tables)) {
    stmts.push(`CREATE TABLE ${table} (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);`);
    for (const [k, v] of Object.entries(rows)) stmts.push(`INSERT INTO ${table} (key, value) VALUES (${q(k)}, ${q(typeof v === 'string' ? v : JSON.stringify(v))});`);
  }
  if (DatabaseSync) {
    const db = new DatabaseSync(file);
    db.exec(stmts.join('\n'));
    db.close();
  } else {
    execFileSync('sqlite3', [file], { input: stmts.join('\n') });
  }
}
