/**
 * parsers/opencode.js
 * OpenCode usage via the pinned ccusage collector (see src/collectors/ccusage.js).
 * Data: sessions (counted per session, never inferred from active days),
 *       tokens incl. cache, estimated cost with provenance, model breakdown, daily heatmap.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { collectorWithFallback } from '../src/collectors/ccusage.js';

export function detect() {
  const home = homedir();
  return [
    process.env.OPENCODE_DATA_DIR,
    join(home, '.local', 'share', 'opencode'),
    join(home, '.config', 'opencode'),
  ].filter(Boolean).some(existsSync);
}

export async function parse(opts = {}) {
  // No native fallback: an unreadable opencode.db must surface as an error, not "no data"
  return collectorWithFallback('opencode', async () => null, opts);
}
