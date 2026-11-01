/**
 * parsers/cursor.js
 * Parses Cursor's local SQLite databases to extract chat session counts,
 * prompt counts, and daily activity for heatmap.
 *
 * Storage locations:
 *   macOS:   ~/Library/Application Support/Cursor/User/
 *   Linux:   ~/.config/Cursor/User/
 *   Windows: %APPDATA%\Cursor\User\
 *
 * Two storage formats (both in state.vscdb):
 *   NEW (cursorDiskKV table):
 *     - Sessions stored as individual rows: composerData:<composerId>
 *     - Messages stored as: bubbleId:<composerId>:<bubbleId>
 *     - Each composerData value is JSON with _v, composerId, createdAt, status, etc.
 *
 *   LEGACY (ItemTable):
 *     - composer.composerData → { allComposers: [...] }
 *     - workbench.panel.aichat.view.aichat.chatdata → { tabs: [...] }
 *     - aiService.prompts / aiService.generations → arrays
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { listTables, queryColumn, readItemJson } from '../src/utils/sqlite.js';
import { localDate } from '../src/utils/dates.js';

// ── Cursor data directory detection ──────────────────────────────────────────

function getCursorDataDir() {
  const home = os.homedir();
  const candidates = [
    path.join(home, 'Library', 'Application Support', 'Cursor', 'User'),   // macOS
    path.join(home, '.config', 'Cursor', 'User'),                           // Linux
    path.join(home, 'AppData', 'Roaming', 'Cursor', 'User'),               // Windows
  ];
  return candidates.find(fs.existsSync) || null;
}

// ── Find all state.vscdb files ───────────────────────────────────────────────

function findVscdbFiles(baseDir) {
  const files = [];

  // Global state db (primary location for new format)
  const globalDb = path.join(baseDir, 'globalStorage', 'state.vscdb');
  if (fs.existsSync(globalDb)) files.push({ path: globalDb, type: 'global' });

  // Workspace storage dbs
  const wsDir = path.join(baseDir, 'workspaceStorage');
  if (fs.existsSync(wsDir)) {
    try {
      for (const hash of fs.readdirSync(wsDir)) {
        const dbPath = path.join(wsDir, hash, 'state.vscdb');
        if (fs.existsSync(dbPath)) {
          files.push({ path: dbPath, type: 'workspace', hash });
        }
      }
    } catch {}
  }

  return files;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

const count = (dbPath, sql) => parseInt(queryColumn(dbPath, sql)[0], 10) || 0;

// ── Read a single state.vscdb ────────────────────────────────────────────────

function readVscdb(dbPath) {
  const result = {
    // Sessions keyed by identity so the same composer seen in several databases
    // (global cursorDiskKV + a workspace's legacy allComposers) counts once.
    sessions: new Map(),    // 'composer:<id>' | 'tab:<id>' → YYYY-MM-DD | null
    promptCount: 0,
    generationCount: 0,
  };
  const toDate = (v) => {
    if (v == null) return null;
    const d = typeof v === 'number' ? localDate(new Date(v)) : String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  };
  let anon = 0;   // entries without an id: still counted, never merged
  const addSession = (key, date) => {
    const k = key ?? `anon:${dbPath}:${anon++}`;
    if (!result.sessions.has(k) || (date && !result.sessions.get(k))) result.sessions.set(k, date ?? null);
  };

  {
    // Detect which table(s) exist. Errors propagate so the scan can report them.
    const tables = listTables(dbPath);
    const hasCursorDiskKV = tables.includes('cursorDiskKV');
    const hasItemTable    = tables.includes('ItemTable');

    if (!hasCursorDiskKV && !hasItemTable) return result;

    // ────────────────────────────────────────────────────────────────────────
    // NEW FORMAT: cursorDiskKV — each session is composerData:<uuid>
    // ────────────────────────────────────────────────────────────────────────
    if (hasCursorDiskKV) {
      // One row per composer: key composerData:<id>. Values can be huge (the whole
      // conversation), so only the first 500 chars are read — createdAt lives there.
      const rows = queryColumn(dbPath,
        "SELECT key || char(9) || substr(CAST(value AS TEXT), 1, 500) FROM cursorDiskKV WHERE key LIKE 'composerData:%'");
      for (const row of rows) {
        if (!row) continue;
        const tab = row.indexOf('\t');
        const id = row.slice('composerData:'.length, tab);
        const head = row.slice(tab + 1);
        const iso = head.match(/"createdAt"\s*:\s*"([^"]+)"/);
        const ms = head.match(/"createdAt"\s*:\s*(\d{13})/);
        addSession('composer:' + id, iso ? toDate(iso[1]) : ms ? toDate(Number(ms[1])) : null);
      }

      // Count bubbleId pairs as interaction count
      result.promptCount += Math.floor(count(dbPath,
        "SELECT COUNT(*) FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'") / 2);
    }

    // ────────────────────────────────────────────────────────────────────────
    // LEGACY FORMAT: ItemTable — single blob keys
    // ────────────────────────────────────────────────────────────────────────
    if (hasItemTable) {
      const getVal = (key) => readItemJson(dbPath, key);

      // Composer sessions (legacy single-blob format)
      const composerData = getVal('composer.composerData');
      for (const c of Array.isArray(composerData?.allComposers) ? composerData.allComposers : []) {
        addSession(c?.composerId ? 'composer:' + c.composerId : null, toDate(c?.createdAt));
      }

      // Legacy chat tabs
      const chatData = getVal('workbench.panel.aichat.view.aichat.chatdata');
      for (const tab of Array.isArray(chatData?.tabs) ? chatData.tabs : []) {
        addSession(tab?.tabId ? 'tab:' + tab.tabId : null, null);
      }

      // Prompt history (older builds)
      const prompts = getVal('aiService.prompts');
      if (Array.isArray(prompts)) result.promptCount += prompts.length;

      // Generation count (older builds)
      const generations = getVal('aiService.generations');
      if (Array.isArray(generations)) result.generationCount += generations.length;

      // BubbleId pairs in ItemTable (message-level, only if cursorDiskKV wasn't found)
      if (!hasCursorDiskKV) {
        result.promptCount += Math.floor(count(dbPath,
          "SELECT COUNT(*) FROM ItemTable WHERE key LIKE 'bubbleId:%'") / 2);
      }
    }

  }

  return result;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function detect() {
  return getCursorDataDir() !== null;
}

export async function parse(options = {}) {
  const baseDir = options.baseDir || getCursorDataDir();
  if (!baseDir) return null;

  const dbs = findVscdbFiles(baseDir);
  if (dbs.length === 0) return null;

  const totals = { promptCount: 0, generationCount: 0 };
  const unique = new Map();   // session identity → date, merged across every database
  const errors = [];

  for (const db of dbs) {
    try {
      const data = readVscdb(db.path);
      for (const [k, date] of data.sessions) if (!unique.has(k) || (date && !unique.get(k))) unique.set(k, date);
      totals.promptCount      += data.promptCount;
      totals.generationCount  += data.generationCount;
    } catch (err) {
      if (err.code === 'sqlite-unavailable') throw err;
      errors.push({ db: db.path, message: err.message });
    }
  }
  if (errors.length === dbs.length) throw new Error(`could not read any Cursor database (${errors[0].message})`);

  const sessions = unique.size;
  const interactions = totals.promptCount || totals.generationCount;

  // Build daily heatmap from extracted session createdAt dates
  const dateMap = new Map();
  for (const date of unique.values()) {
    if (date) dateMap.set(date, (dateMap.get(date) || 0) + 1);
  }

  const daily = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, toolKey: 'cursor', sessions: count }));

  // Return null only if nothing was found at all
  if (sessions === 0 && interactions === 0) return null;

  return {
    tool: 'cursor',
    sessions: sessions || interactions,
    tokens_used:   null,   // not stored locally by Cursor
    cost_usd:      null,
    lines_written: null,
    daily,
    _raw: {
      composerSessions: sessions,
      promptCount:      totals.promptCount,
      generationCount:  totals.generationCount,
      dbCount:          dbs.length,
      heatmapDays:      daily.length,
      sessionSource:    sessions > 0 ? 'sqlite' : 'prompts',
      unreadableDbs:    errors.length,
    },
  };
}
