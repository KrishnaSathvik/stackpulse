// Aider commit attribution, following the scenarios aider documents in
// aider/repo.py (Aider-AI/aider). The 3.2.3 heuristic (message contains "aider")
// got cases 3, 4 and 6 wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aiderCommitStats, isAiderCommit } from '../../parsers/aider.js';

let hasGit = true;
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { hasGit = false; }

const TRAILER = 'Co-authored-by: aider (anthropic/claude-sonnet-4-5) <aider@aider.chat>';

test('attribution rules match aider\'s documented scenarios', () => {
  assert.equal(isAiderCommit({ author: 'Dev (aider)', body: 'fix parser' }), true, '1: standard AI edit (author attributed)');
  assert.equal(isAiderCommit({ author: 'Dev', body: `fix parser\n\n${TRAILER}` }), true, '2: AI edit with co-authored-by trailer');
  assert.equal(isAiderCommit({ author: 'Dev', body: 'commit my dirty files' }), false, '3: user changes committed by aider (committer-only) are not AI edits');
  assert.equal(isAiderCommit({ author: 'Dev', body: 'bump aider config and docs' }), false, '4: a human commit that merely mentions aider');
  assert.equal(isAiderCommit({ author: 'Dev', body: 'aider: add retry logic' }), true, '5: commit-message attribution prefix');
  assert.equal(isAiderCommit({ author: 'Dev (aider)', body: 'refactor' }), true, '6: old-style author attribution with no mention in the message');
  assert.equal(isAiderCommit({ author: 'Dev', body: 'Co-authored-by: Alice <alice@example.com>' }), false, 'other co-authors do not count');
});

test('aider commit stats from a real repository', { skip: !hasGit && 'git not installed' }, (t) => {
  const repo = mkdtempSync(join(tmpdir(), 'sp-aider-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const commit = (file, lines, msg, author = 'Dev', committer = 'Dev') => {
    writeFileSync(join(repo, file), Array.from({ length: lines }, (_, i) => `l${i}`).join('\n') + '\n');
    execFileSync('git', ['-C', repo, 'add', '.']);
    execFileSync('git', ['-C', repo, 'commit', '-qm', msg], { env: { ...process.env,
      GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: 'd@e', GIT_COMMITTER_NAME: committer, GIT_COMMITTER_EMAIL: 'd@e' } });
  };
  execFileSync('git', ['-C', repo, 'init', '-q']);
  commit('a.txt', 3, 'fix parser', 'Dev (aider)', 'Dev (aider)');           // AI (author)
  commit('b.txt', 4, `add tests\n\n${TRAILER}`);                            // AI (trailer)
  commit('c.txt', 10, 'commit my dirty files', 'Dev', 'Dev (aider)');      // user change via aider: not AI
  commit('d.txt', 7, 'bump aider config');                                  // mentions aider: not AI
  commit('e.txt', 2, 'aider: add retry logic');                             // AI (prefix)
  assert.deepEqual(aiderCommitStats(repo), { commits: 3, lines: 3 + 4 + 2 });
});
