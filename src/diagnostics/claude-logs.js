/**
 * src/diagnostics/claude-logs.js
 * Detects Claude Code logs the pinned collector would silently skip.
 *
 * ccusage 20.0.46 admits a Claude line only if it contains the exact bytes
 * `"usage":{` (rust/adapters/claude/src/lib.rs:510, daily.rs:303 at v20.0.46).
 * Valid JSON written with whitespace — `"usage": {` — never reaches its parser,
 * so a reformatted or re-exported log contributes nothing, without any warning.
 * Claude Code itself writes compact JSON; this guards everything else.
 *
 * Best-effort by design: it reads only the head of each file within a total byte
 * budget, so a file that turns spaced only after its first 64 KB, or files beyond
 * the budget, are not checked. A clean result is not proof that nothing was skipped.
 */

import { closeSync, existsSync, openSync, readSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const USAGE_ANY = /"usage"\s*:\s*\{/g;       // what JSON allows
const USAGE_COMPACT = '"usage":{';           // what the collector requires

export function claudeProjectRoots(home = homedir()) {
  const fromEnv = (process.env.CLAUDE_CONFIG_DIR || '').split(',').map(s => s.trim()).filter(Boolean).map(d => join(d, 'projects'));
  return [...fromEnv, join(home, '.claude', 'projects'), join(home, '.config', 'claude', 'projects')].filter(existsSync);
}

function* jsonlFiles(dir, depth = 0) {
  if (depth > 4) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* jsonlFiles(p, depth + 1);
    else if (e.name.endsWith('.jsonl')) yield p;
  }
}

function readHead(file, bytes) {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const n = readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n).toString('utf-8');
  } finally { closeSync(fd); }
}

/**
 * @returns {{ filesChecked: number, affectedFiles: string[], skippedLinesSampled: number, truncated: boolean }}
 */
export function checkClaudeLogFormat({ roots = claudeProjectRoots(), headBytes = 64 * 1024, budgetBytes = 32 * 1024 * 1024 } = {}) {
  let filesChecked = 0, skippedLinesSampled = 0, used = 0, truncated = false;
  const affectedFiles = [];
  for (const root of roots) {
    for (const file of jsonlFiles(root)) {
      if (used >= budgetBytes) { truncated = true; break; }
      let head;
      try { head = readHead(file, headBytes); } catch { continue; }
      used += head.length;
      filesChecked++;
      let skipped = 0;
      for (const line of head.split('\n')) {
        USAGE_ANY.lastIndex = 0;
        if (USAGE_ANY.test(line) && !line.includes(USAGE_COMPACT)) skipped++;
      }
      if (skipped) { affectedFiles.push(file); skippedLinesSampled += skipped; }
    }
  }
  return { filesChecked, affectedFiles, skippedLinesSampled, truncated };
}

/** Diagnostic entry for a tool record, or null when nothing is wrong. */
export function claudeLogFormatDiagnostic(opts) {
  const r = checkClaudeLogFormat(opts);
  if (!r.affectedFiles.length) return null;
  return {
    level: 'warn',
    code: 'claude-log-not-compact',
    message: `${r.affectedFiles.length} Claude log file(s) use spaced JSON ("usage": {); `
      + `the collector skips those records, so Claude totals are too low `
      + `(best-effort check: samples the start of each file${r.truncated ? ', read budget reached' : ''})`,
    files: r.affectedFiles.slice(0, 20),
  };
}
