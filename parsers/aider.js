/**
 * parsers/aider.js
 * Aider usage via .aider.chat.history.md files + git log
 * Data: sessions (history file count), commits, lines written.
 * No tokens/cost stored by aider.
 *
 * Hardened: reduced scan depth, timeout caps, limited repo count
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'fs';
import { delimiter, join } from 'path';
import { homedir } from 'os';
import { execFileSync } from 'child_process';
import { localDate } from '../src/utils/dates.js';

// Only scan common dev directories — NOT home root (too slow on large machines)
const SCAN_DIRS = [
  'Code', 'code', 'Projects', 'projects',
  'Dev', 'dev', 'Development', 'Work', 'work',
  'src', 'repos', 'git',
];

/**
 * Filesystem identity of a path (follows symlinks). On case-insensitive
 * filesystems (macOS, Windows) `~/Projects` and `~/projects` are one directory;
 * on case-sensitive ones (Linux) they may be two. Device + inode tells them apart
 * correctly on both; the native realpath is the fallback where inodes are not
 * reported (ino 0).
 */
function fsIdentity(p) {
  try {
    const st = statSync(p, { bigint: true });
    if (st.ino !== 0n) return `${st.dev}:${st.ino}`;
  } catch { return null; }
  try { return realpathSync.native(p); } catch { return p; }
}

/** Keep the first path for each filesystem identity. */
function uniqueByIdentity(paths) {
  const seen = new Set();
  return paths.filter(p => {
    const id = fsIdentity(p);
    if (id == null || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function getSearchRoots() {
  const home = homedir();
  return uniqueByIdentity(SCAN_DIRS
    .map(d => join(home, d))
    .filter(d => { try { return statSync(d).isDirectory(); } catch { return false; } }));
}

function findAiderFiles(roots, maxDepth = 2) {
  const found = [];
  const startTime = Date.now();
  const TIMEOUT_MS = 5000; // 5 second cap for file discovery

  function scan(dir, depth) {
    if (depth > maxDepth || found.length >= 50 || Date.now() - startTime > TIMEOUT_MS) return;
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git' ||
            entry.name === '.venv' || entry.name === '__pycache__') continue;
        const full = join(dir, entry.name);
        try {
          if (entry.isDirectory()) {
            scan(full, depth + 1);
          } else if (entry.name === '.aider.chat.history.md' || entry.name === 'aider.chat.history.md') {
            found.push(full);
          }
        } catch {}
        if (Date.now() - startTime > TIMEOUT_MS) return;
      }
    } catch {}
  }
  for (const root of roots) {
    scan(root, 0);
    if (Date.now() - startTime > TIMEOUT_MS) break;
  }
  // A directory reachable from two roots (e.g. ~/src symlinked into ~/Projects) is one history.
  return uniqueByIdentity(found);
}

function parseHistoryFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const sessions = (content.match(/^#### /mg) || []).length;
    const userMessages = (content.match(/^> /mg) || []).length;
    return { sessions: Math.max(sessions, 1), messages: userMessages };
  } catch { return { sessions: 1, messages: 0 }; }
}

/** Git repos at most two levels below each root (replaces `find | head`). */
function findGitRepos(roots, limit) {
  const repos = [];
  const seen = new Set();   // filesystem identities: a repo reachable twice is counted once
  const visit = (dir, depth) => {
    if (repos.length >= limit || depth > 2) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some(e => e.name === '.git')) {
      const id = fsIdentity(dir);
      if (id != null && !seen.has(id)) { seen.add(id); repos.push(dir); }
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') visit(join(dir, e.name), depth + 1);
      if (repos.length >= limit) return;
    }
  };
  for (const root of roots) visit(root, 0);
  return repos;
}

/**
 * Is this commit an AI edit by aider? Follows aider's own attribution rules
 * (aider/repo.py, Aider-AI/aider): an AI edit carries ANY of
 *   - author name "<name> (aider)"                       (older default, or --attribute-author)
 *   - trailer "Co-authored-by: aider (<model>) <aider@aider.chat>"   (current default)
 *   - subject prefix "aider: "                           (--attribute-commit-message-*)
 * A committer of "<name> (aider)" alone marks the user's own changes that aider
 * committed, so it is deliberately NOT counted.
 */
export function isAiderCommit({ author = '', body = '' }) {
  return /\(aider\)\s*$/.test(author)
    || /^Co-authored-by:\s*aider\b.*<aider@aider\.chat>\s*$/mi.test(body)
    || /^aider:\s/i.test(body);
}

/** One git call per repo; parsed in JS instead of `wc` / `awk` pipelines. */
export function aiderCommitStats(repo) {
  // Record separator before each commit; unit separators between fields.
  const out = execFileSync('git', ['-C', repo, 'log', '--format=%x1e%an%x1f%B%x1f', '--shortstat'], {
    encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
  let commits = 0, lines = 0;
  for (const rec of out.split('\x1e').slice(1)) {
    const [author, body = '', stat = ''] = rec.split('\x1f');
    if (!isAiderCommit({ author, body: body.trim() })) continue;
    commits++;
    const m = stat.match(/(\d+) insertions?\(\+\)/);
    if (m) lines += Number(m[1]);
  }
  return { commits, lines };
}

function countGitCommits(roots) {
  let totalCommits = 0, totalLines = 0;
  for (const repo of findGitRepos(roots, 10)) {
    try {
      const { commits, lines } = aiderCommitStats(repo);
      totalCommits += commits;
      totalLines += lines;
    } catch { /* not a readable repo, or git missing */ }
  }
  return { commits: totalCommits, linesAdded: totalLines };
}

/** Cross-platform `which aider`. */
function aiderOnPath() {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  return (process.env.PATH || '').split(delimiter).filter(Boolean)
    .some(dir => exts.some(ext => existsSync(join(dir, 'aider' + ext))));
}

export function detect() {
  const roots = getSearchRoots();
  if (roots.length > 0 && findAiderFiles(roots, 1).length > 0) return true; // shallow scan for detect
  return aiderOnPath();
}

export async function parse(opts = {}) {
  const roots = getSearchRoots();
  const historyFiles = findAiderFiles(roots);
  const gitData = countGitCommits(roots);

  if (historyFiles.length === 0 && gitData.commits === 0) return null;

  let totalSessions = 0, totalMessages = 0;
  const dailyMap = {};

  for (const file of historyFiles) {
    try {
      const { sessions, messages } = parseHistoryFile(file);
      totalSessions += sessions;
      totalMessages += messages;

      // Use file mtime as proxy date
      // File mtime is only a proxy for activity date; heatmap counts sessions, not invented tokens
      const date = localDate(statSync(file).mtime);
      dailyMap[date] = (dailyMap[date] || 0) + sessions;
    } catch {}
  }

  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sessions]) => ({ date, toolKey: 'aider', sessions }));

  return {
    tool:          'aider',
    sessions:      totalSessions || historyFiles.length,
    commits:       gitData.commits,
    lines_written: gitData.linesAdded,
    tokens_used:   null,   // aider does not persist token counts in history files
    cost_usd:      null,
    models:        [],
    modelBreakdown: [],
    daily,
    _meta: {
      historyFiles:  historyFiles.length,
      totalMessages: totalMessages,
      gitCommits:    gitData.commits,
    },
  };
}
