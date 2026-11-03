// Full run with the conservative low-memory fallback; prints mode + Claude totals.
import { join } from 'node:path';
import { runCcusage, normalizeCcusageReport } from '../../src/collectors/ccusage.js';
import { collectSharded, collectWithOomFallback } from '../../src/collectors/sharded.js';
const notices = [];
try {
  const r = await collectWithOomFallback({
    full: async () => runCcusage(),
    sharded: async () => (await collectSharded({ cacheDir: join(process.env.HOME, '.cache', 'stackpulse'), concurrency: 1 })).report,
    notice: (m) => notices.push(m),
  });
  const c = normalizeCcusageReport(r.result).tools.claude_code;
  console.log(JSON.stringify({ mode: r.mode, firstError: r.firstError?.code ?? null, evidence: r.firstError?.evidence ?? null, tokens: c?.tokens.total, sessions: c?.sessions, notices }));
} catch (e) { console.log(JSON.stringify({ error: e.code, message: e.message.slice(0, 200), notices })); }
