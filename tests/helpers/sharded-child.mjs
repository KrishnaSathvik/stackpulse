// Child process for sharded-collector lifecycle tests.
//   node sharded-child.mjs <cacheDir> run    -> prints {stats, tools} JSON
//   node sharded-child.mjs <cacheDir> hang   -> (link strategy) prints LINKED once a shard is hard-linked, then hangs
import { collectSharded } from '../../src/collectors/sharded.js';
import { normalizeCcusageReport } from '../../src/collectors/ccusage.js';

const [cacheDir, mode] = process.argv.slice(2);
const hooks = mode === 'hang'
  ? { beforeRun: async () => { process.stdout.write('LINKED\n'); await new Promise(() => {}); } }
  : {};
const { report, stats } = await collectSharded({ cacheDir, concurrency: 2, hooks, strategy: mode === 'hang' ? 'link' : 'auto' });
process.stdout.write(JSON.stringify({ stats, tools: normalizeCcusageReport(report).tools }) + '\n');
