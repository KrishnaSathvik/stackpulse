/**
 * src/cli/open.js
 * Ask the operating system to open a local file in its default application.
 * No shell is involved: the path is passed as a single argument to the
 * platform's opener. Nothing touches the network.
 */
import { spawn } from 'node:child_process';

/** The opener for this platform, or null when there is none we trust. */
export function opener(platform = process.platform) {
  if (platform === 'darwin') return { cmd: 'open', args: [] };
  // rundll32 hands the path to the shell's file association without cmd.exe parsing it.
  if (platform === 'win32') return { cmd: 'rundll32', args: ['url.dll,FileProtocolHandler'] };
  if (['linux', 'freebsd', 'openbsd', 'netbsd', 'sunos'].includes(platform)) return { cmd: 'xdg-open', args: [] };
  return null;
}

/** A command the user can copy to open the file themselves. */
export function openHint(file, platform = process.platform) {
  const q = /^[\w./:@%+=,-]+$/.test(file) ? file : JSON.stringify(file);
  if (platform === 'darwin') return `open ${q}`;
  if (platform === 'win32') return `start "" ${JSON.stringify(file)}`;
  if (opener(platform)) return `xdg-open ${q}`;
  return null;
}

/**
 * Resolve to { ok: true } once the opener exits successfully, or
 * { ok: false, reason } if it is missing, fails, or does not finish in time.
 * A successful opener exit means the request was handed off; it cannot prove
 * a browser window appeared, and callers must word it that way.
 */
export function openFile(file, { platform = process.platform, timeoutMs = 10000, spawnFn = spawn } = {}) {
  const o = opener(platform);
  if (!o) return Promise.resolve({ ok: false, reason: `no known way to open files on ${platform}` });
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
    let child;
    try {
      child = spawnFn(o.cmd, [...o.args, file], { stdio: 'ignore', detached: platform !== 'win32', windowsHide: true });
    } catch (err) {
      return done({ ok: false, reason: err.message });
    }
    const timer = setTimeout(() => { child.unref?.(); done({ ok: false, reason: `${o.cmd} did not respond` }); }, timeoutMs);
    child.on('error', (err) => done({ ok: false, reason: err.code === 'ENOENT' ? `${o.cmd} is not available` : err.message }));
    child.on('exit', (code, signal) => done(code === 0 ? { ok: true }
      : { ok: false, reason: signal ? `${o.cmd} was stopped (${signal})` : `${o.cmd} exited with code ${code}` }));
  });
}
