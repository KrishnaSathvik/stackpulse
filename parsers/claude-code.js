/**
 * parsers/claude-code.js
 * Claude Code usage via the pinned ccusage collector (see src/collectors/ccusage.js).
 * Data: sessions (counted per session, never inferred from active days),
 *       tokens incl. cache, estimated cost with provenance, model breakdown, daily heatmap.
 * Also flags logs the collector would silently skip (src/diagnostics/claude-logs.js).
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { CollectorError, parseFromCcusage } from '../src/collectors/ccusage.js';
import { claudeLogFormatDiagnostic } from '../src/diagnostics/claude-logs.js';

export function detect() {
  const home = homedir();
  return [
    ...(process.env.CLAUDE_CONFIG_DIR || '').split(',').filter(Boolean).map(d => join(d.trim(), 'projects')),
    join(home, '.claude', 'projects'),
    join(home, '.config', 'claude', 'projects'),
  ].filter(Boolean).some(existsSync);
}

export async function parse(opts = {}) {
  const result = await parseFromCcusage('claude_code', opts);
  const format = claudeLogFormatDiagnostic();
  if (!format) return result;
  // Everything skipped: report it as a failure, never as "no data yet"
  if (!result) throw new CollectorError(format.code, format.message);
  return {
    ...result,
    coverage: { status: 'partial', reasons: [...(result.coverage?.reasons || []), format.message] },
    diagnostics: [...(result.diagnostics || []), format],
  };
}
