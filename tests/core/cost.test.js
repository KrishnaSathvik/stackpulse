import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordCost, summarizeCost } from '../../src/core/cost.js';
import { normalizeCcusageReport } from '../../src/collectors/ccusage.js';

test('record status: complete, partial (lower bound), unavailable', () => {
  assert.deepEqual(recordCost({ usd: 1.2 }), { usd: 1.2, status: 'complete' });
  assert.deepEqual(recordCost({ usd: 0, missingPricing: false }), { usd: 0, status: 'complete' }, 'a priced zero is a real zero');
  assert.deepEqual(recordCost({ usd: 0.5, missingPricing: true }), { usd: 0.5, status: 'partial' });
  assert.deepEqual(recordCost({ usd: 0, missingPricing: true }), { usd: null, status: 'unavailable' });
  assert.deepEqual(recordCost({ usd: null }), { usd: null, status: 'unavailable' });
});

test('roll-up: any partial or unavailable record makes a priced total partial', () => {
  const s = summarizeCost([
    { id: 'a', usd: 1, missingPricing: false },
    { id: 'b', usd: 0, missingPricing: true, tokens: 500 },
  ]);
  assert.equal(s.usd, 1);
  assert.equal(s.status, 'partial');
  assert.deepEqual(s.unpricedModels, ['b']);
  assert.equal(s.unpricedTokens, 500);
});

test('roll-up: complete only when every record is complete', () => {
  const s = summarizeCost([{ id: 'a', usd: 1 }, { id: 'b', usd: 0.25 }]);
  assert.equal(s.status, 'complete');
  assert.equal(s.kind, 'estimated');
  assert.deepEqual(s.unpricedModels, []);
});

test('roll-up: nothing priced is unavailable, never $0', () => {
  const s = summarizeCost([{ id: 'x', usd: 0, missingPricing: true }]);
  assert.equal(s.usd, null);
  assert.equal(s.status, 'unavailable');
  assert.deepEqual(summarizeCost([]), { ...summarizeCost([]), usd: null, status: 'unavailable', kind: 'unavailable' });
});

test('roll-up: recorded, estimated and mixed sources', () => {
  assert.equal(summarizeCost([{ usd: 2, recordedUsd: 2 }]).kind, 'recorded');
  assert.equal(summarizeCost([{ usd: 2, recordedUsd: 0.5 }]).kind, 'mixed');
  assert.equal(summarizeCost([{ usd: 2 }]).kind, 'estimated');
});

// Real collector output: claude-zephyr-9-1 has one event with a recorded costUSD (0.5)
// and one with no known price, so ccusage reports missingPricing AND cost 0.5.
test('collector: unpriced model with recorded cost keeps its cost and is marked partial', () => {
  const raw = JSON.parse(readFileSync(new URL('../fixtures/ccusage-20.0.46/home-mixed-cost.by-agent.json', import.meta.url)));
  const { tools, diagnostics } = normalizeCcusageReport(raw);
  const c = tools.claude_code;
  const z = c.modelBreakdown.find(m => m.model === 'claude-zephyr-9-1');
  assert.equal(z.cost_usd, 0.5);
  assert.equal(z.costStatus, 'partial');
  assert.ok(Math.abs(c.cost.usd - 0.5018) < 1e-9, 'tool total equals the sum of its models');
  assert.ok(Math.abs(c.cost_usd - raw.totals.totalCost) < 1e-9);
  assert.equal(c.cost.status, 'partial');
  assert.equal(c.cost.kind, 'mixed');
  assert.ok(Math.abs(c.cost.recordedUsd - 0.5) < 1e-9);
  assert.deepEqual(c.cost.unpricedModels, ['claude-zephyr-9-1']);
  assert.deepEqual(diagnostics, []);
});
