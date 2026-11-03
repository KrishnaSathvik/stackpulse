/**
 * view-model.js
 * Normalized StackPulse tool records → report view-model.
 *
 * Every style renders from this object, so composition and data accuracy are
 * decided once. Rules carried over from the M1 data contract:
 *   - null means "not reported by this tool", never zero
 *   - cost is labelled estimated / partial / unavailable, never silently $0
 *   - shares are computed only over tools that report the metric
 */

import { AI_TOOLS } from '../../parsers/index.js';
import { displayModelName } from '../../src/models/catalog.js';

const MAX_NAMED_TOOLS = 5;   // validated categorical slots; the rest fold into "Others"
const MAX_MODELS = 5;

const DAY_MS = 86_400_000;
const iso = (d) => d.toISOString().slice(0, 10);
const parseDay = (s) => new Date(s + 'T00:00:00Z');

/**
 * @param {object} input
 * @param {object} input.tools      { [toolKey]: normalized record }
 * @param {string} input.end        YYYY-MM-DD, last day of the period (inclusive)
 * @param {number} [input.days=30]
 * @param {string} [input.username]
 * @param {string} [input.generatedAt] YYYY-MM-DD
 */
export function buildViewModel({ tools, end, days = 30, username = '', generatedAt = end, sample = false }) {
  const endDay = parseDay(end);
  const startDay = new Date(endDay.getTime() - (days - 1) * DAY_MS);
  const inPeriod = (date) => date >= iso(startDay) && date <= end;

  // Registry order fixes each tool's colour slot: colour follows the entity, not its rank.
  const registry = AI_TOOLS.map(t => t.key);
  const rows = Object.entries(tools)
    .filter(([, r]) => r && (r.sessions || r.tokens_used || r.daily?.length))
    .map(([key, r]) => {
      const meta = AI_TOOLS.find(t => t.key === key) || { name: key };
      const daily = (r.daily || []).filter(d => d.date && inPeriod(d.date));
      const tokens = daily.reduce((s, d) => s + (d.totalTokens || 0), 0);
      const reportsTokens = r.tokens_used != null;
      return {
        key, name: meta.name, order: registry.indexOf(key) === -1 ? 99 : registry.indexOf(key),
        sessions: r.sessions == null ? null : daily.reduce((s, d) => s + (d.sessions || 0), 0),
        tokens: reportsTokens ? tokens : null,
        cost: r.cost?.usd == null ? null : daily.reduce((s, d) => s + (d.totalCost || 0), 0),
        costKind: r.cost?.kind ?? (r.cost_usd == null ? 'unavailable' : 'estimated'),
        costPartial: !!r.cost?.partial,
        breakdown: r.tokens && reportsTokens ? r.tokens : null,
        models: r.modelBreakdown || [],
        daily,
      };
    })
    .filter(t => t.daily.length > 0 || t.tokens);

  // ── Tool share: by tokens across token-reporting tools ────────────────────
  const tokenTools = rows.filter(t => t.tokens > 0).sort((a, b) => b.tokens - a.tokens);
  const tokenTotal = tokenTools.reduce((s, t) => s + t.tokens, 0);
  const named = tokenTools.slice(0, MAX_NAMED_TOOLS).sort((a, b) => a.order - b.order);
  const slotOf = new Map(named.map((t, i) => [t.key, i]));
  const others = tokenTools.slice(MAX_NAMED_TOOLS);
  const share = [
    ...named.map(t => ({ key: t.key, name: t.name, value: t.tokens, pct: t.tokens / tokenTotal, slot: slotOf.get(t.key) })),
    ...(others.length ? [{ key: '_others', name: `${others.length} more`, value: others.reduce((s, t) => s + t.tokens, 0), slot: null }] : []),
  ].map(s => ({ ...s, pct: s.value / tokenTotal }))
   .sort((a, b) => (a.slot == null) - (b.slot == null) || b.value - a.value);   // "Others" always last
  const sessionsOnly = rows.filter(t => t.tokens == null && t.sessions > 0)
    .map(t => ({ name: t.name, sessions: t.sessions }));

  // ── Models: ranked across tools, raw IDs preserved ────────────────────────
  // Model breakdowns are all-time in 3.x data; flagged until per-day model data lands.
  const allModels = rows.flatMap(t => t.models.map(m => ({
    id: m.model, name: m.displayName || displayModelName(m.model), tool: t.name, toolKey: t.key,
    tokens: (m.tokens_used ?? 0) * 1000, unpriced: !!m.missingPricing,
  }))).filter(m => m.tokens > 0).sort((a, b) => b.tokens - a.tokens);
  const modelTotal = allModels.reduce((s, m) => s + m.tokens, 0);
  const models = allModels.slice(0, MAX_MODELS).map(m => ({ ...m, pct: m.tokens / modelTotal }));

  // ── Activity: one bar per day, tokens; sessions-only days still count as active
  const activity = [];
  for (let i = 0; i < days; i++) {
    const date = iso(new Date(startDay.getTime() + i * DAY_MS));
    let tokens = 0, active = false, sessions = 0;
    for (const t of rows) {
      const d = t.daily.find(x => x.date === date);
      if (!d) continue;
      tokens += d.totalTokens || 0;
      sessions += d.sessions || 0;
      active = active || (d.totalTokens || 0) > 0 || (d.sessions || 0) > 0;
    }
    activity.push({ date, tokens, sessions, active });
  }
  // Chart tokens when any tool reports them; otherwise sessions, so sessions-only reports still show rhythm.
  const activityMetric = activity.some(d => d.tokens > 0) ? 'tokens' : 'sessions';
  for (const d of activity) d.value = d[activityMetric];
  const activeDays = activity.filter(d => d.active).length;

  // Bars: one per day up to ~2 months, otherwise weekly buckets so bars stay legible.
  const bucket = days > 62 ? 7 : 1;
  const bars = [];
  for (let i = 0; i < activity.length; i += bucket) {
    const slice = activity.slice(i, i + bucket);
    bars.push({ date: slice[0].date, value: slice.reduce((s, d) => s + d.value, 0), active: slice.some(d => d.active) });
  }
  const barUnit = bucket === 1 ? 'DAILY' : 'WEEKLY';
  let streak = 0, run = 0;
  for (const d of activity) { run = d.active ? run + 1 : 0; streak = Math.max(streak, run); }
  const busiest = activity.reduce((b, d) => (d.tokens > (b?.tokens ?? 0) ? d : b), null);

  // ── Totals with coverage ─────────────────────────────────────────────────
  const known = (k) => rows.filter(t => t[k] != null);
  const sum = (k) => known(k).reduce((s, t) => s + t[k], 0);
  const costRows = known('cost');
  const totals = {
    tokens: known('tokens').length ? sum('tokens') : null,
    sessions: known('sessions').length ? sum('sessions') : null,
    cost: costRows.length ? sum('cost') : null,
    costEstimated: costRows.some(t => t.costKind === 'estimated'),
    costPartial: costRows.some(t => t.costPartial) || costRows.length < rows.length,
    tools: rows.length,
    coverage: {
      tokens: `${known('tokens').length} of ${rows.length}`,
      sessions: `${known('sessions').length} of ${rows.length}`,
      cost: `${costRows.length} of ${rows.length}`,
    },
  };

  // ── Token composition, only from tools that separate the categories ───────
  const comp = rows.filter(t => t.breakdown).reduce((c, t) => {
    c.input += t.breakdown.input; c.output += t.breakdown.output;
    c.cacheRead += t.breakdown.cacheRead; c.cacheWrite += t.breakdown.cacheWrite;
    return c;
  }, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  const compTotal = comp.input + comp.output + comp.cacheRead + comp.cacheWrite;

  // ── Deterministic insights ───────────────────────────────────────────────
  const insights = [];
  if (busiest?.tokens > 0) insights.push({ label: 'Busiest day', value: fmtDate(busiest.date), detail: fmtCompact(busiest.tokens) + ' tokens' });
  if (activeDays) insights.push({ label: 'Active days', value: `${activeDays} / ${days}`, detail: `longest streak ${streak}d` });
  if (compTotal > 0) insights.push({ label: 'Cache reads', value: fmtPct(comp.cacheRead / compTotal), detail: 'of all tokens' });
  if (models[0]) insights.push({ label: 'Top model', value: models[0].name, detail: fmtPct(models[0].pct) + ' of model tokens' });

  const notes = [];
  if (totals.cost != null && totals.costEstimated) notes.push('Cost is an API-list-price estimate, not a subscription bill');
  if (totals.costPartial && totals.cost != null) notes.push('Cost excludes unpriced models and tools without cost data');
  if (allModels.length) notes.push('Model ranking covers all recorded history');

  return {
    sample,
    username: username.replace(/^@/, ''),
    period: { start: iso(startDay), end, days, label: `${fmtDate(iso(startDay))} – ${fmtDate(end, true)}` },
    generatedAt,
    empty: rows.length === 0,
    totals, share, sessionsOnly, models, moreModels: Math.max(0, allModels.length - MAX_MODELS),
    activity, activityMetric, activeDays, streak, bars, barUnit,
    composition: compTotal > 0 ? { ...comp, total: compTotal } : null,
    insights, notes,
  };
}

// ── Formatting (shared by all styles) ─────────────────────────────────────────
export function fmtCompact(n) {
  if (n == null) return '—';
  const abs = Math.abs(n);
  const [div, suf] = abs >= 1e12 ? [1e12, 'T'] : abs >= 1e9 ? [1e9, 'B'] : abs >= 1e6 ? [1e6, 'M'] : abs >= 1e3 ? [1e3, 'K'] : [1, ''];
  const v = n / div;
  return (div === 1 ? String(Math.round(v)) : v.toFixed(v >= 100 ? 0 : 1).replace(/\.0$/, '')) + suf;
}
export const fmtInt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));
/** Exact below a million, compact above (keeps sublines from truncating). */
export const fmtCount = (n) => (n == null ? '—' : Math.abs(n) >= 1e6 ? fmtCompact(n) : fmtInt(n));
export const fmtUsd = (n) => (n == null ? '—' : n >= 1000 ? '$' + Math.round(n).toLocaleString('en-US') : '$' + n.toFixed(2));
export const fmtPct = (p) => (p >= 0.995 ? '100%' : p < 0.01 ? '<1%' : Math.round(p * 100) + '%');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(s, withYear = false) {
  const [y, m, d] = s.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}${withYear ? ', ' + y : ''}`;
}
