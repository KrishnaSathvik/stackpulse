/**
 * parsers/antigravity.js
 * Google Antigravity IDE usage via SQLite state.vscdb
 *
 * Verified storage layout (from real Antigravity install):
 *   Table: ItemTable (not cursorDiskKV)
 *   Session key: chat.ChatSessionStore.index
 *   Format: {"version":1,"entries":{"<sessionId>":...}}
 *   Location: workspaceStorage/<hash>/state.vscdb (per-workspace)
 *
 * Storage paths:
 *   macOS: ~/Library/Application Support/Antigravity/User/
 *   Linux: ~/.config/Antigravity/User/
 *   Windows: %APPDATA%\Antigravity\User\
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { readItemJson } from '../src/utils/sqlite.js';
import { collectorWithFallback } from '../src/collectors/ccusage.js';

function getAntigravityDir() {
  const home = homedir();
  const candidates = [
    join(home, 'Library', 'Application Support', 'Antigravity', 'User'),
    join(home, 'Library', 'Application Support', 'Google', 'Antigravity', 'User'),
    join(home, '.config', 'Antigravity', 'User'),
    join(home, '.config', 'google-antigravity', 'User'),
    join(home, 'AppData', 'Roaming', 'Antigravity', 'User'),
  ];
  return candidates.find(existsSync) || null;
}

function findDbs(baseDir) {
  const dbs = [];
  // Global state db
  const global = join(baseDir, 'globalStorage', 'state.vscdb');
  if (existsSync(global)) dbs.push(global);

  // Workspace dbs (this is where sessions actually live)
  const wsDir = join(baseDir, 'workspaceStorage');
  if (existsSync(wsDir)) {
    try {
      for (const hash of readdirSync(wsDir)) {
        const db = join(wsDir, hash, 'state.vscdb');
        if (existsSync(db)) dbs.push(db);
      }
    } catch {}
  }
  return dbs;
}

function readDb(dbPath) {
  let sessions = 0;

  // Verified key: chat.ChatSessionStore.index
  // Format: {"version":1,"entries":{"sessionId1":{...},"sessionId2":{...}}}
  const data = readItemJson(dbPath, 'chat.ChatSessionStore.index');
  if (data?.entries && typeof data.entries === 'object') {
    sessions += Object.keys(data.entries).length;
  }

  return { sessions };
}

/** Conversation roots the collector reads (tokens, models). */
const conversationRoots = () => [
  ...(process.env.ANTIGRAVITY_DATA_DIR || '').split(',').map(x => x.trim()).filter(Boolean),
  ...['antigravity', 'antigravity-cli', 'antigravity-ide', 'antigravity-backup', 'antigravity-acp'].map(d => join(homedir(), '.gemini', d)),
];

export function detect() {
  if (conversationRoots().some(existsSync)) return true;
  return getAntigravityDir() !== null;
}

/**
 * One source per scan: the collector's conversation databases (tokens, models,
 * estimated cost). Only when the collector has no Antigravity data does the IDE
 * session index (session counts only) stand in — the two are never summed.
 * If the collector could not read the conversation databases, the fallback is
 * marked incomplete (or the failure raised) instead of looking like a clean scan.
 */
export async function parse(opts = {}) {
  return collectorWithFallback('antigravity', () => parseIdeIndex(opts), opts);
}

export async function parseIdeIndex(opts = {}) {
  const baseDir = getAntigravityDir();
  if (!baseDir) return null;

  const dbs = findDbs(baseDir);
  if (dbs.length === 0) return null;

  let totalSessions = 0;

  for (const db of dbs) {
    try {
      const { sessions } = readDb(db);
      totalSessions += sessions;
    } catch (err) {
      if (err.code === 'sqlite-unavailable') throw err;
    }
  }

  // Only return data if there are actual sessions
  if (totalSessions === 0) return null;

  return {
    tool:        'antigravity',
    sessions:    totalSessions,
    tokens_used: null,   // not in the session index
    cost_usd:    null,
    models:      [],      // the index does not record models; never guess
    modelBreakdown: [],
    daily:       [],
    cost:        { usd: null, kind: 'unavailable', status: 'unavailable', partial: false, unpricedModels: [] },
    provenance:  { adapter: 'antigravity-ide-index', sourceVersion: null, fallback: true },
    _meta: { dbCount: dbs.length },
  };
}
