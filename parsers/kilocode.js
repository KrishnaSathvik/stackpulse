/**
 * parsers/kilocode.js
 * Kilo Code: the Kilo CLI database (via the collector) or, failing that, the VS Code extension.
 * Kilo Code VS Code extension usage from its globalState task history.
 * See vscode-task-history.js for the storage layout and caveats.
 * Data: sessions (tasks), tokens, recorded cost, daily heatmap. No per-model data.
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { parseTaskHistoryTool, vscodeUserDirs } from './vscode-task-history.js';
import { collectorWithFallback } from '../src/collectors/ccusage.js';

const EXTENSION_ID = 'kilocode.kilo-code';

export function detect(opts = {}) {
  const home = opts.home || homedir();
  const kiloCli = [...(process.env.KILO_DATA_DIR || '').split(',').map(x => x.trim()).filter(Boolean), join(home, '.local', 'share', 'kilo')];
  if (kiloCli.some(d => existsSync(join(d, 'kilo.db')))) return true;
  const id = EXTENSION_ID.toLowerCase();
  if (vscodeUserDirs(home).some(d => existsSync(join(d, 'globalStorage', id)))) return true;
  return ['.vscode', '.vscode-insiders', '.cursor', '.windsurf'].some(dir => {
    try { return readdirSync(join(home, dir, 'extensions')).some(e => e.toLowerCase().startsWith(id + '-')); }
    catch { return false; }
  });
}

/**
 * One source per scan: the Kilo CLI database via the collector (tokens, models,
 * recorded cost). Only when it has no Kilo data does the VS Code extension's task
 * history stand in — never both, so usage visible to both can't be double counted.
 */
export async function parse(opts = {}) {
  return collectorWithFallback('kilocode',
    () => parseTaskHistoryTool({ tool: 'kilocode', extensionId: EXTENSION_ID }, opts), opts);
}
