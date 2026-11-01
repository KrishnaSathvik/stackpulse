/**
 * src/utils/oom.js
 * Evidence that the kernel OOM-killed something in our cgroup (Linux only).
 *
 * A collector killed by the kernel for exceeding a container/cgroup memory limit
 * exits with SIGKILL and no message — indistinguishable from `kill -9`. The kernel
 * does count OOM kills per memory cgroup, so a rise in that counter during a run
 * is positive evidence. Limits are often set on an ancestor cgroup, so every
 * readable level from ours up to the root is summed.
 *
 *   cgroup v1: <memory mount><path>/memory.oom_control   line "oom_kill N"
 *   cgroup v2: /sys/fs/cgroup<path>/memory.events          line "oom_kill N"
 *
 * Returns null where no counter is readable (macOS, Windows, restricted
 * containers): callers must then treat a bare SIGKILL as NOT an OOM.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

function counter(file) {
  try {
    const m = readFileSync(file, 'utf-8').match(/^oom_kill\s+(\d+)/m);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

function levels(path) {
  const parts = path.split('/').filter(Boolean);
  return parts.map((_, i) => '/' + parts.slice(0, parts.length - i).join('/')).concat('/');
}

export function readOomKillCount(procCgroup = '/proc/self/cgroup', root = '/sys/fs/cgroup') {
  if (process.platform !== 'linux') return null;
  let lines;
  try { lines = readFileSync(procCgroup, 'utf-8').split('\n').filter(Boolean); } catch { return null; }
  let total = 0, found = false;
  for (const line of lines) {
    const [, controllers, path] = line.split(':');
    if (path == null) continue;
    const files = controllers.split(',').includes('memory')
      ? levels(path).map(p => join(root, 'memory', p, 'memory.oom_control'))   // v1
      : controllers === ''
        ? levels(path).map(p => join(root, p, 'memory.events'))                  // v2 unified
        : [];
    for (const f of files) {
      const n = counter(f);
      if (n != null) { total += n; found = true; }
    }
  }
  return found ? total : null;
}
