#!/usr/bin/env node
// Cross-platform test entry: `node --test <glob>` needs Node 21+, and shell
// globbing differs on Windows, so collect *.test.js files here and hand them over.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'fixtures') walk(p); }
    else if (e.name.endsWith('.test.js')) files.push(relative(process.cwd(), p));
  }
})(root);

const r = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files.sort()], { stdio: 'inherit' });
process.exit(r.status ?? 1);
