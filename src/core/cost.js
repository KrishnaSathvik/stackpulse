/**
 * src/core/cost.js
 * Cost provenance, decided per record and rolled up — never inferred from a
 * tool-level flag.
 *
 * A record (one model within one tool) can be:
 *   complete     every event was priced
 *   partial      some events carry a cost (recorded by the tool, or priced), others
 *                have no known rate — the amount is a lower bound
 *   unavailable  nothing could be priced
 *
 * Source is tracked separately: `recorded` (the tool logged the cost),
 * `estimated` (computed from a price table), or `mixed`.
 */

const num = (v) => (Number.isFinite(v) ? v : 0);

/**
 * Round to 1e-10 USD. Summing the same costs in a different order (sharded or cached
 * collection) changes the last float bits; rounding makes results order-independent.
 */
export const roundUsd = (v) => (v == null ? v : Math.round(v * 1e10) / 1e10);

/**
 * Manual cost entry. A blank field is unknown (unavailable), not zero.
 * An explicit 0, including "0.00", is a real zero.
 * @returns {number|null}
 */
export function parseEnteredCost(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {{ usd: number|null|undefined, recordedUsd?: number, missingPricing?: boolean }} r
 * @returns {{ usd: number|null, status: 'complete'|'partial'|'unavailable' }}
 */
export function recordCost(r) {
  const usd = Number.isFinite(r.usd) ? r.usd : null;
  if (!r.missingPricing) return usd == null ? { usd: null, status: 'unavailable' } : { usd, status: 'complete' };
  return usd > 0 ? { usd, status: 'partial' } : { usd: null, status: 'unavailable' };
}

/**
 * Roll up per-record costs.
 * @param {Array<{ id?: string|null, usd: number|null, recordedUsd?: number, missingPricing?: boolean, tokens?: number }>} records
 */
export function summarizeCost(records, { pricingSource = null } = {}) {
  let usd = null, recorded = 0, priced = 0;
  const unpricedModels = [];
  let unpricedTokens = 0;
  const statuses = new Set();

  for (const r of records) {
    const c = recordCost(r);
    statuses.add(c.status);
    if (c.usd != null) {
      usd = (usd ?? 0) + c.usd;
      const rec = Math.min(num(r.recordedUsd), c.usd);
      recorded += rec;
      priced += c.usd - rec;
    }
    if (c.status !== 'complete') {
      unpricedModels.push(r.id ?? '(unknown model)');
      if (c.status === 'unavailable') unpricedTokens += num(r.tokens);
    }
  }

  const status = usd == null ? 'unavailable'
    : statuses.size === 1 && statuses.has('complete') ? 'complete'
    : 'partial';
  const kind = usd == null ? 'unavailable'
    : recorded > 0 && priced > 0 ? 'mixed'
    : recorded > 0 ? 'recorded' : 'estimated';

  return {
    usd: roundUsd(usd), status, kind,
    partial: status === 'partial',            // 3.x-compatible flag
    unpricedModels, unpricedTokens,
    recordedUsd: roundUsd(recorded), estimatedUsd: roundUsd(priced),
    pricingSource,
  };
}
