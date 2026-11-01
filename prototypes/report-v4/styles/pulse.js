/**
 * styles/pulse.js — "Pulse": dark graphite, restrained cyan, one dominant number.
 * Canvas: wide 1200×630 (link previews / social).
 */

import { text, rect, line, columnBar, segmentedBar, svgDoc, fit, textWidth } from '../svg.js';
import { fmtCompact, fmtInt, fmtCount, fmtUsd, fmtPct, fmtDate } from '../view-model.js';

export const tokens = {
  bg: '#0e0f11', panel: '#16181b', rule: '#262a2f',
  ink: '#f0efec', ink2: '#b4b8bf', ink3: '#7b818a',
  accent: '#3fc6d9',             // single-series hue for activity
  accentDim: '#1f5d66',
  // validated dark categorical slots (dataviz reference order), "Others" neutral
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
  other: '#5b6068',
};

export function renderPulse(vm, { width = 1200, height = 630 } = {}) {
  const T = tokens, P = 56, W = width, out = [];
  const colW = W - P * 2;

  // ── Header ────────────────────────────────────────────────────────────────
  out.push(text(P, P + 4, '◆ STACKPULSE', { size: 13, family: 'mono', weight: 600, fill: T.ink, tracking: 2 }));
  out.push(text(P + 150, P + 4, vm.period.label + ' · ' + vm.period.days + ' days', { size: 13, family: 'mono', fill: T.ink3 }));
  if (vm.username) out.push(text(W - P, P + 4, '@' + vm.username, { size: 13, family: 'mono', fill: T.ink2, anchor: 'end', maxWidth: 260 }));
  if (vm.sample) out.push(text(W - P, P + 24, 'SAMPLE DATA', { size: 10, family: 'mono', weight: 600, fill: T.accent, anchor: 'end', tracking: 1.5 }));

  if (vm.empty) {
    out.push(text(P, 250, 'No AI coding activity found', { size: 52, family: 'display', weight: 700, fill: T.ink }));
    out.push(text(P, 296, 'StackPulse checked local data for every supported tool in this period.', { size: 18, fill: T.ink2 }));
    out.push(text(P, 326, 'Run `stackpulse doctor` to see which tools were detected and why none reported usage.', { size: 15, family: 'mono', fill: T.ink3 }));
    footer();
    return svgDoc(W, height, out.join(''), { title: 'StackPulse report — no activity', bg: T.bg });
  }

  // ── Hero ────────────────────────────────────────────────────────────────
  const heroIsTokens = vm.totals.tokens != null;
  const heroLabel = heroIsTokens ? 'TOKENS' : 'SESSIONS';
  const heroValue = heroIsTokens ? fmtCompact(vm.totals.tokens) : fmtInt(vm.totals.sessions);
  out.push(text(P, 124, heroLabel, { size: 12, family: 'mono', weight: 600, fill: T.ink3, tracking: 2 }));
  out.push(text(P - 4, 226, heroValue, { size: 108, family: 'display', weight: 700, fill: T.ink, tracking: -3 }));
  const sub = [
    heroIsTokens && vm.totals.sessions != null ? fmtCount(vm.totals.sessions) + ' sessions' : null,
    vm.totals.cost != null ? (vm.totals.cost >= 1e6 ? '$' + fmtCompact(vm.totals.cost) : fmtUsd(vm.totals.cost)) + (vm.totals.costEstimated ? ' est.' : '') : null,
    vm.totals.tools + (vm.totals.tools === 1 ? ' tool' : ' tools'),
  ].filter(Boolean).join('  ·  ');
  out.push(text(P, 262, sub, { size: 17, fill: T.ink2, maxWidth: 520 }));

  // ── Activity (30-day rhythm, single hue) ───────────────────────────────
  const ax = 640, aw = W - P - ax, ay = 104, ah = 132, base = ay + ah;
  out.push(text(ax, ay - 6, vm.barUnit + ' ' + vm.activityMetric.toUpperCase(), { size: 11, family: 'mono', weight: 600, fill: T.ink3, tracking: 1.5 }));
  out.push(text(ax + aw, ay - 6, `${vm.activeDays}/${vm.period.days} active days`, { size: 11, family: 'mono', fill: T.ink3, anchor: 'end' }));
  const n = vm.bars.length, gap = 3, bw = (aw - gap * (n - 1)) / n;
  const max = Math.max(...vm.bars.map(d => d.value), 1);
  vm.bars.forEach((d, i) => {
    const x = ax + i * (bw + gap);
    if (d.value > 0) {
      const h = Math.max(3, Math.sqrt(d.value / max) * (ah - 16));   // sqrt keeps quiet days visible
      out.push(columnBar(x, base, bw, h, d === vm.bars.reduce((b, e) => (e.value > b.value ? e : b)) ? T.accent : T.accentDim, 2));
    } else if (d.active) {
      out.push(rect(x, base - 3, bw, 3, T.accentDim, 1));             // sessions-only day
    } else {
      out.push(rect(x + bw / 2 - 1, base - 2, 2, 2, T.rule, 1));       // idle tick
    }
  });
  out.push(line(ax, base + 0.5, ax + aw, base + 0.5, T.rule));
  out.push(text(ax, base + 20, fmtDate(vm.period.start), { size: 11, family: 'mono', fill: T.ink3 }));
  out.push(text(ax + aw, base + 20, fmtDate(vm.period.end), { size: 11, family: 'mono', fill: T.ink3, anchor: 'end' }));

  // ── Tool share (segmented bar + legend) ──────────────────────────────────
  const sy = 312;
  out.push(text(P, sy, 'TOOL SHARE · TOKENS', { size: 11, family: 'mono', weight: 600, fill: T.ink3, tracking: 1.5 }));
  const segFill = s => (s.slot == null ? T.other : T.series[s.slot]);
  if (vm.share.length) {
    out.push(segmentedBar(P, sy + 12, colW, 20, vm.share.map(s => ({ pct: s.pct, fill: segFill(s) })), { id: 'pulse-share' }));
    let lx = P;
    for (const s of vm.share) {
      const label = s.name, pct = fmtPct(s.pct);
      out.push(rect(lx, sy + 50, 10, 10, segFill(s), 2));
      out.push(text(lx + 16, sy + 59, label, { size: 13, fill: T.ink, weight: 500 }));
      const lw = 16 + textWidth(label, 13, 'sans', 500) + 8;
      out.push(text(lx + lw, sy + 59, pct, { size: 13, fill: T.ink3, family: 'mono' }));
      lx += lw + textWidth(pct, 13, 'mono') + 28;
    }
  } else {
    out.push(text(P, sy + 30, 'No tool reported token counts in this period.', { size: 14, fill: T.ink3 }));
  }

  // ── Top models ───────────────────────────────────────────────────────────
  const my = 414, mw = 540;
  out.push(text(P, my, 'TOP MODELS', { size: 11, family: 'mono', weight: 600, fill: T.ink3, tracking: 1.5 }));
  if (vm.moreModels) out.push(text(P + mw, my, `+${vm.moreModels} more`, { size: 11, family: 'mono', fill: T.ink3, anchor: 'end' }));
  vm.models.forEach((m, i) => {
    const y = my + 30 + i * 30;
    out.push(text(P, y, String(i + 1).padStart(2, '0'), { size: 12, family: 'mono', fill: T.ink3 }));
    out.push(text(P + 30, y, m.name, { size: 15, weight: 500, fill: T.ink, maxWidth: 240 }));
    out.push(text(P + 280, y, m.tool, { size: 12, fill: T.ink3, maxWidth: 110 }));
    out.push(rect(P + 400, y - 8, 80, 4, T.rule, 2));
    out.push(rect(P + 400, y - 8, Math.max(3, 80 * m.tokens / vm.models[0].tokens), 4, T.ink2, 2));
    out.push(text(P + mw, y, fmtCompact(m.tokens) + (m.unpriced ? '*' : ''), { size: 13, family: 'mono', fill: T.ink2, anchor: 'end' }));
  });
  if (!vm.models.length) out.push(text(P, my + 30, 'No model data recorded.', { size: 14, fill: T.ink3 }));

  // ── Insights ───────────────────────────────────────────────────────────
  const ix = 660, iw = W - P - ix;
  out.push(text(ix, my, 'HIGHLIGHTS', { size: 11, family: 'mono', weight: 600, fill: T.ink3, tracking: 1.5 }));
  vm.insights.slice(0, 4).forEach((ins, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = ix + col * (iw / 2), y = my + 22 + row * 72;
    out.push(rect(x, y, iw / 2 - 12, 60, T.panel, 8));
    out.push(text(x + 14, y + 21, ins.label.toUpperCase(), { size: 10, family: 'mono', fill: T.ink3, tracking: 1 }));
    out.push(text(x + 14, y + 45, ins.value, { size: 19, family: 'display', weight: 600, fill: T.ink, maxWidth: iw / 2 - 40 }));
  });

  footer();
  return svgDoc(W, height, out.join(''), { title: `StackPulse report — ${heroValue} ${heroLabel.toLowerCase()}`, bg: T.bg });

  function footer() {
    const fy = height - 30;
    out.push(line(P, fy - 22, W - P, fy - 22, T.rule));
    const cov = vm.empty ? 'no tools reported data' : `tokens from ${vm.totals.coverage.tokens} tools · cost from ${vm.totals.coverage.cost}`;
    out.push(text(P, fy, cov + (vm.notes[0] ? ' · ' + vm.notes[0] : ''), { size: 11, family: 'mono', fill: T.ink3, maxWidth: W - P * 2 - 260 }));
    out.push(text(W - P, fy, 'stackpulse · ' + vm.generatedAt, { size: 11, family: 'mono', fill: T.ink3, anchor: 'end' }));
  }
}

export { fit };
