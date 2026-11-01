// Runs the collector once and prints how its failure was classified (for cgroup OOM tests).
import { runCcusage } from '../../src/collectors/ccusage.js';
try { await runCcusage(); console.log(JSON.stringify({ code: 'none' })); }
catch (e) { console.log(JSON.stringify({ code: e.code, evidence: e.evidence ?? null, message: e.message })); }
