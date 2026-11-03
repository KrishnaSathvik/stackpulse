// Temporary HOME directories for adapter tests. Adapters resolve homedir()
// per call, so swapping HOME/USERPROFILE redirects every path they read.
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function withHome(t, files = {}) {
  const home = mkdtempSync(join(tmpdir(), 'sp-home-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(home, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, APPDATA: process.env.APPDATA, PATH: process.env.PATH };
  Object.assign(process.env, { HOME: home, USERPROFILE: home, APPDATA: join(home, 'AppData', 'Roaming') });
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) (v == null ? delete process.env[k] : (process.env[k] = v));
    rmSync(home, { recursive: true, force: true });
  });
  return home;
}

export const jsonl = (...rows) => rows.map(r => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n') + '\n';
