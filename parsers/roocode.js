/**
 * parsers/roocode.js
 * Roo Code VS Code extension usage from its globalState task history.
 * See vscode-task-history.js for the storage layout and caveats.
 * Data: sessions (tasks), tokens, recorded cost, daily heatmap. No per-model data.
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { parseTaskHistoryTool, vscodeUserDirs } from './vscode-task-history.js';

const EXTENSION_ID = 'RooVeterinaryInc.roo-cline';

export function detect(opts = {}) {
  const home = opts.home || homedir();
  const id = EXTENSION_ID.toLowerCase();
  if (vscodeUserDirs(home).some(d => existsSync(join(d, 'globalStorage', id)))) return true;
  return ['.vscode', '.vscode-insiders', '.cursor', '.windsurf'].some(dir => {
    try { return readdirSync(join(home, dir, 'extensions')).some(e => e.toLowerCase().startsWith(id + '-')); }
    catch { return false; }
  });
}

export async function parse(opts = {}) {
  return parseTaskHistoryTool({ tool: 'roocode', extensionId: EXTENSION_ID }, opts);
}
