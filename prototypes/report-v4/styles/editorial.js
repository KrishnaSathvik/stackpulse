/**
 * styles/editorial.js — "Editorial": off-white, ink typography, precise grid,
 * one accent. Reads like a page from an annual report.
 * Canvas: wide 1200×630.
 *
 * The light categorical slots sit below 3:1 on this surface (validator WARN),
 * so every coloured mark carries a visible text label and value (relief rule).
 */

import { text, rect, line, columnBar, svgDoc } from '../svg.js';
import { fmtCompact, fmtInt, fmtCount, fmtUsd, fmtPct, fmtDate } from '../view-model.js';

export const tokens = {
  bg: '#f6f4ef', ink: '#141414', ink2: '#4a4946', ink3: '#86847e', rule: '#d9d6cd', faint: '#e8e5dd',
  accent: '#2a78d6',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  other: '#a8a59c',
};

export function renderEditorial(vm, { width = 1200, height = 630 } = {}) {
  const T = tokens, P = 64, W = width, out = [];

  // ── Masthead ─────────────────────────────────────────────────────────────
  out.push(rect(P, 44, W - P * 2, 3, T.ink));
  out.push(text(P, 72, 'STACKPULSE  —  AI CODING REPORT', { size: 12, weight: 700, fill: T.ink, tracking: 2.4 }));
  out.push(text(W - P, 72, vm.period.label.toUpperCase(), { size: 12, weight: 600, fill: T.ink2, anchor: 'end', tracking: 1.6 }));
  if (vm.sample) out.push(text(W - P, 92, 'SAMPLE DATA', { size: 10, weight: 700, fill: T.accent, anchor: 'end', tracking: 1.6 }));

  if (vm.empty) {
    out.push(text(P, 250, 'A quiet month.', { size: 88, family: 'display', weight: 800, fill: T.ink, tracking: -2.5 }));
    out.push(text(P, 300, 'No local AI coding activity was found for this period.', { size: 22, fill: T.ink2 }));
    footer();
    return svgDoc(W, height, out.join(''), { title: 'StackPulse report — no activity', bg: T.bg });
  }

  // ── Headline ─────────────────────────────────────────────────────────────
  const heroIsTokens = vm.totals.tokens != null;
  const hero = heroIsTokens ? fmtCompact(vm.totals.tokens) : fmtInt(vm.totals.sessions);
  out.push(text(P - 6, 214, hero, { size: 132, family: 'display', weight: 800, fill: T.ink, tracking: -5 }));
  const heroW = hero.length * 132 * 0.6;
  const hx = P + heroW + 28;
  out.push(text(hx, 150, heroIsTokens ? 'tokens of AI-assisted' : 'sessions of AI-assisted', { size: 26, family: 'display', weight: 600, fill: T.ink }));
  out.push(text(hx, 182, `coding across ${vm.totals.tools} ${vm.totals.tools === 1 ? 'tool' : 'tools'}.`, { size: 26, family: 'display', weight: 600, fill: T.ink }));
  const facts = [
    heroIsTokens && vm.totals.sessions != null ? `${fmtCount(vm.totals.sessions)} sessions` : null,
    `${vm.activeDays} of ${vm.period.days} days active`,
    vm.totals.cost != null ? `${vm.totals.cost >= 1e6 ? '$' + fmtCompact(vm.totals.cost) : fmtUsd(vm.totals.cost)} est. API value` : null,
  ].filter(Boolean).join('   ·   ');
  out.push(text(hx, 212, facts, { size: 15, fill: T.ink2, maxWidth: W - P - hx }));

  // ── Three-column grid ────────────────────────────────────────────────────
  const gy = 262, gap = 40, cw = (W - P * 2 - gap * 2) / 3;
  const cols = [P, P + cw + gap, P + (cw + gap) * 2];
  cols.forEach(x => out.push(rect(x, gy, cw, 1.5, T.ink)));
  const head = (x, label) => out.push(text(x, gy + 26, label, { size: 11, weight: 700, fill: T.ink, tracking: 2 }));

  // Column 1 — tools, ranked horizontal bars with labels
  head(cols[0], 'TOOLS  ·  SHARE OF TOKENS');
  vm.share.slice(0, 6).forEach((s, i) => {
    const y = gy + 58 + i * 38;
    const fill = s.slot == null ? T.other : T.series[s.slot];
    out.push(text(cols[0], y, s.name, { size: 15, weight: 600, fill: T.ink, maxWidth: cw - 60 }));
    out.push(text(cols[0] + cw, y, fmtPct(s.pct), { size: 15, weight: 600, fill: T.ink, anchor: 'end' }));
    out.push(rect(cols[0], y + 8, cw, 6, T.faint, 3));
    out.push(rect(cols[0], y + 8, Math.max(4, cw * s.pct), 6, fill, 3));
  });
  if (!vm.share.length) out.push(text(cols[0], gy + 58, 'No token counts reported.', { size: 14, fill: T.ink3 }));
  if (vm.sessionsOnly.length) {
    const y = gy + 58 + Math.max(1, Math.min(vm.share.length, 6)) * 38 - 4;
    out.push(text(cols[0], y, 'NO TOKEN DATA  \u00b7  SESSIONS ONLY', { size: 10, weight: 700, fill: T.ink3, tracking: 1.4 }));
    out.push(text(cols[0], y + 18, vm.sessionsOnly.map(s => `${s.name} ${fmtInt(s.sessions)}`).join('  \u00b7  '),
      { size: 12, fill: T.ink2, maxWidth: cw }));
  }

  // Column 2 — models
  head(cols[1], 'MODELS  ·  RANKED');
  vm.models.forEach((m, i) => {
    const y = gy + 58 + i * 38;
    out.push(text(cols[1], y, String(i + 1), { size: 15, family: 'display', weight: 800, fill: T.accent }));
    out.push(text(cols[1] + 24, y, m.name, { size: 15, weight: 600, fill: T.ink, maxWidth: cw - 100 }));
    out.push(text(cols[1] + cw, y, fmtCompact(m.tokens) + (m.unpriced ? '*' : ''), { size: 15, fill: T.ink2, anchor: 'end' }));
    out.push(text(cols[1] + 24, y + 17, m.tool, { size: 11, fill: T.ink3, maxWidth: cw - 100 }));
  });
  if (vm.moreModels) out.push(text(cols[1] + 24, gy + 58 + vm.models.length * 38, `+ ${vm.moreModels} more in the full report`, { size: 12, fill: T.ink3 }));
  if (!vm.models.length) out.push(text(cols[1], gy + 58, 'No model data recorded.', { size: 14, fill: T.ink3 }));

  // Column 3 — rhythm + composition
  head(cols[2], 'RHYTHM  \u00b7  ' + vm.barUnit + ' ' + vm.activityMetric.toUpperCase());
  const ax = cols[2], aw = cw, base = gy + 150, ah = 96;
  const n = vm.bars.length, bgap = 2, bw = (aw - bgap * (n - 1)) / n;
  const max = Math.max(...vm.bars.map(d => d.value), 1);
  const peak = vm.bars.reduce((b, d) => (d.value > b.value ? d : b));
  vm.bars.forEach((d, i) => {
    const x = ax + i * (bw + bgap);
    if (d.value > 0) out.push(columnBar(x, base, bw, Math.max(3, Math.sqrt(d.value / max) * ah), d === peak ? T.accent : T.ink, 2));
    else if (d.active) out.push(rect(x, base - 3, bw, 3, T.ink3, 1));
  });
  out.push(line(ax, base + 0.5, ax + aw, base + 0.5, T.ink));
  out.push(text(ax, base + 18, fmtDate(vm.period.start), { size: 11, fill: T.ink3 }));
  out.push(text(ax + aw, base + 18, fmtDate(vm.period.end), { size: 11, fill: T.ink3, anchor: 'end' }));
  if (peak.value > 0) {
    out.push(text(ax, base + 44, `Peak ${vm.barUnit === 'WEEKLY' ? 'week of ' : ''}${fmtDate(peak.date)} \u00b7 ${fmtCompact(peak.value)}`, { size: 12, fill: T.ink2, maxWidth: aw - 96 }));
    out.push(text(ax + aw, base + 44, `${vm.streak}d streak`, { size: 12, fill: T.ink3, anchor: 'end' }));
  }

  if (vm.composition) {
    const c = vm.composition, cy = base + 70;
    const parts = [['Cache read', c.cacheRead, T.ink], ['Input', c.input, T.accent], ['Output', c.output, T.ink3], ['Cache write', c.cacheWrite, T.rule]]
      .filter(p => p[1] > 0);
    let x = ax;
    const usable = aw - 2 * (parts.length - 1);
    for (const [, v, fill] of parts) { const w = Math.max(2, usable * v / c.total); out.push(rect(x, cy, w, 8, fill)); x += w + 2; }
    out.push(text(ax, cy + 26, parts.slice(0, 3).map(([l, v]) => `${l} ${fmtPct(v / c.total)}`).join('  ·  '), { size: 11, fill: T.ink2, maxWidth: aw }));
  }

  footer();
  return svgDoc(W, height, out.join(''), { title: `StackPulse report — ${hero}`, bg: T.bg });

  function footer() {
    const fy = height - 34;
    out.push(rect(P, fy - 20, W - P * 2, 1, T.rule));
    const note = vm.empty ? 'Checked all supported tools.' : vm.notes.slice(0, 2).join('. ') + (vm.notes.length ? '.' : '');
    out.push(text(P, fy, note, { size: 11, fill: T.ink3, maxWidth: W - P * 2 - 220 }));
    out.push(text(W - P, fy, `stackpulse${vm.username ? ' · @' + vm.username : ''} · ${vm.generatedAt}`, { size: 11, fill: T.ink3, anchor: 'end' }));
  }
}
