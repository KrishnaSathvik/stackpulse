// The automatic low-memory retry must be conservative: only confident OOM, once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CollectorError } from '../../src/collectors/ccusage.js';
import { collectWithOomFallback } from '../../src/collectors/sharded.js';

function harness({ fullErr = null, shardedErr = null } = {}) {
  const calls = { full: 0, sharded: 0, notices: [] };
  const run = {
    full: async () => { calls.full++; if (fullErr) throw fullErr; return 'FULL'; },
    sharded: async () => { calls.sharded++; if (shardedErr) throw shardedErr; return 'SHARDED'; },
    notice: (m) => calls.notices.push(m),
  };
  return { calls, run };
}
const err = (code, evidence = null) => new CollectorError(code, `${code} happened`, evidence);

test('success: no retry, no notice', async () => {
  const { calls, run } = harness();
  assert.deepEqual(await collectWithOomFallback(run), { mode: 'full', result: 'FULL' });
  assert.deepEqual([calls.full, calls.sharded, calls.notices.length], [1, 0, 0]);
});

for (const evidence of ['allocation-failure', 'cgroup-oom-kill']) {
  test(`confident OOM (${evidence}): exactly one retry, one explicit notice`, async () => {
    const { calls, run } = harness({ fullErr: err('out-of-memory', evidence) });
    const r = await collectWithOomFallback(run);
    assert.equal(r.mode, 'sharded-after-oom');
    assert.equal(r.result, 'SHARDED');
    assert.deepEqual([calls.full, calls.sharded], [1, 1]);
    assert.equal(calls.notices.length, 1);
    assert.match(calls.notices[0], new RegExp(`ran out of memory \\(${evidence}\\).*Retrying once`));
  });
}

for (const code of ['killed', 'timeout', 'exit', 'invalid-json', 'binary-missing', 'not-installed', 'source-failed', 'bad-arg', 'shard-link']) {
  test(`no retry for "${code}"`, async () => {
    const e = err(code);
    const { calls, run } = harness({ fullErr: e });
    await assert.rejects(collectWithOomFallback(run), (x) => x === e);
    assert.deepEqual([calls.sharded, calls.notices.length], [0, 0]);
  });
}

test('no retry for a plain Error without a classification', async () => {
  const e = new Error('boom');
  const { calls, run } = harness({ fullErr: e });
  await assert.rejects(collectWithOomFallback(run), (x) => x === e);
  assert.equal(calls.sharded, 0);
});

test('retry also fails: one attempt only, both failures reported', async () => {
  const { calls, run } = harness({ fullErr: err('out-of-memory', 'cgroup-oom-kill'), shardedErr: err('out-of-memory', 'allocation-failure') });
  await assert.rejects(collectWithOomFallback(run), (x) => x.code === 'out-of-memory' && /low-memory retry also failed/.test(x.message) && /first failure/.test(x.message));
  assert.deepEqual([calls.full, calls.sharded, calls.notices.length], [1, 1, 1]);
});

test('retry fails for another reason: reported as retry-failed, no further attempts', async () => {
  const { calls, run } = harness({ fullErr: err('out-of-memory', 'allocation-failure'), shardedErr: err('shard-link') });
  await assert.rejects(collectWithOomFallback(run), { code: 'retry-failed' });
  assert.equal(calls.sharded, 1);
});
