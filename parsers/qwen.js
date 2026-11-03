/**
 * parsers/qwen.js
 * Qwen Code usage via the pinned ccusage collector (see src/collectors/ccusage.js).
 * Reads: ~/.qwen/projects/<project>/chats/<session>.jsonl (`usageMetadata` per line); QWEN_DATA_DIR overrides.
 *
 * The previous native parser targeted a format this tool never wrote (verified
 * against the tool's own source in M2) and reported 0 tokens for real installs.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { parseFromCcusage } from '../src/collectors/ccusage.js';

const envDirs = (name) => (process.env[name] || '').split(',').map(s => s.trim()).filter(Boolean);

export function detect() {
  const home = homedir();
  return [
    ...envDirs('QWEN_DATA_DIR'),
    join(home, '.qwen', 'projects'),
    join(home, '.qwen'),
  ].some(existsSync);
}

export async function parse(opts = {}) {
  return parseFromCcusage('qwen', opts);
}
