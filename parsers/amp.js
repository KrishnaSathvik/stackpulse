/**
 * parsers/amp.js
 * Amp usage via the pinned ccusage collector (see src/collectors/ccusage.js).
 * Data: sessions (counted per session, never inferred from active days),
 *       tokens incl. cache, estimated cost with provenance, model breakdown, daily heatmap.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { parseFromCcusage } from '../src/collectors/ccusage.js';

export function detect() {
  const home = homedir();
  return [
    join(home, '.local', 'share', 'amp'),
    join(home, '.config', 'amp'),
    join(home, '.amp'),
  ].filter(Boolean).some(existsSync);
}

export async function parse(opts = {}) {
  return parseFromCcusage('amp', opts);
}
