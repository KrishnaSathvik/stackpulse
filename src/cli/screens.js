/**
 * src/cli/screens.js
 * What the CLI prints. Every renderer is pure: it takes data plus a width and
 * returns lines, so layouts can be tested at any terminal size.
 */
import { ui, sym, table, wrap, para, width } from './term.js';
import { AI_TOOLS, TOKEN_PARTS, tokenParts, toolMeta } from './card.js';

// ─── Number formatting ───────────────────────────────────────────────────────
export const fmtInt = (n) => Number(n).toLocaleString('en-US');

/** Sub-cent costs must not print as "$0.00", which reads as free. */
export function fmtUsd(v) {
  if (v > 0 && v < 0.005) return '<$0.01';
  return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Thousands of tokens (the parsers' unit) → "11.7M", "2.10B". */
export function fmtTokensK(k) {
  return k >= 1e6 ? `${(k / 1e6).toFixed(2)}B` : k >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${Math.round(k * 10) / 10}K`;
}

/** Raw token counts → "40.8K", "5.20B". */
export function fmtTokensRaw(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

const NA = sym.dash;
const present = (v) => v != null && Number.isFinite(Number(v));

/**
 * Cost cell. Recorded and estimated costs are labelled; a total that excludes
 * usage with no known price is a lower bound ("≥").
 */
export function costCell(data) {
  if (!present(data?.cost_usd)) return NA;
  const c = data.cost;
  return (c?.status === 'partial' || c?.partial ? '≥' : '') + fmtUsd(data.cost_usd);
}

/** Where a cost came from, shown in its own column so amounts stay aligned. */
export function costKind(data) {
  if (!present(data?.cost_usd) || !data.cost) return '';
  return { recorded: 'rec.', mixed: 'mixed', manual: '' }[data.cost.kind] ?? 'est.';
}

// ─── Opening ─────────────────────────────────────────────────────────────────
/** One heading line; the tagline is dropped when the full line would not fit (it is never wrapped mid-word). */
export function header(version, { max = Infinity } = {}) {
  const full = `  ${ui.brand('StackPulse')} ${version}  ${sym.bullet}  AI coding usage report`;
  return [width(full) <= max ? full : `  ${ui.brand('StackPulse')} ${version}`];
}

// ─── Scan summary ────────────────────────────────────────────────────────────
/**
 * scan: { results: {key → data}, empty: [keys], failed: {key → message}, missing: [keys] }
 *   results  detected and read
 *   empty    detected, readable, no usage yet
 *   failed   detected, but reading failed
 *   missing  not installed
 */
export function scanSummary(scan, { max }) {
  const lines = [];
  const found = Object.keys(scan.results);
  const detected = found.length + scan.empty.length + Object.keys(scan.failed).length;
  const counts = [`${detected} ${detected === 1 ? 'tool' : 'tools'} detected`, `${scan.missing.length} not found`];
  const mark = Object.keys(scan.failed).length ? ui.warn(sym.warn) : ui.ok(sym.ok);
  lines.push(...para(`${mark} Scan complete ${sym.bullet} ${counts.join(` ${sym.bullet} `)}`, max, { hang: '  ' }));

  if (found.length === 0) {
    lines.push('');
    lines.push(...para(detected
      ? 'No usage data was found in the detected tools yet.'
      : `None of the ${AI_TOOLS.length} supported tools were found on this machine.`, max));
    lines.push(...para('You can still build a report by entering numbers yourself: choose "Customize report", or run stackpulse --init to start from a config file.', max));
  } else {
    const anyIncomplete = found.some(k => scan.results[k].coverage?.status === 'partial');
    const columns = [
      { key: 'tool', label: 'Tool' },
      { key: 'sessions', label: 'Sessions', align: 'right' },
      { key: 'tokens', label: 'Tokens', align: 'right' },
      { key: 'cost', label: 'Cost', align: 'right' },
      { key: 'kind', label: '', bare: true, attach: true, gapBefore: 1 },
      ...(anyIncomplete ? [{ key: 'status', label: 'Source', bare: true }] : []),
    ];
    const rows = orderTools(found).map(k => {
      const d = scan.results[k];
      return {
        tool: toolMeta(k).name,
        sessions: present(d.sessions) ? fmtInt(d.sessions) : NA,
        tokens: d.tokens_used ? fmtTokensK(d.tokens_used) : NA,
        cost: costCell(d),
        kind: costKind(d),
        status: d.coverage?.status === 'partial' ? ui.warn('incomplete') : '',
      };
    });
    lines.push('');
    lines.push(...table(columns, rows, { max }));
    const notes = costNotes(orderTools(found).map(k => [k, scan.results[k]]));
    if (notes.length) { lines.push(''); for (const n of notes) lines.push(...para(n, max)); }
  }

  const problems = problemLines(scan, { max });
  if (problems.length) { lines.push(''); lines.push(...problems); }
  return lines;
}

/** Legend for the cost column, only for markers actually shown, plus any tier assumption. */
function costNotes(entries) {
  const datas = entries.map(([, d]) => d);
  const kinds = new Set(datas.filter(d => present(d.cost_usd)).map(d => d.cost?.kind));
  const lower = datas.some(d => present(d.cost_usd) && (d.cost?.status === 'partial' || d.cost?.partial));
  const notes = [];
  if (kinds.has('estimated') || kinds.has('mixed')) notes.push('est. = estimated at API list prices; this is not a bill.');
  if (kinds.has('recorded') || kinds.has('mixed')) notes.push('rec. = cost recorded by the tool itself.');
  if (lower) notes.push('≥ = lower bound: some usage has no known price and is not included.');
  for (const [k, d] of entries) { const n = tierNote(k, d); if (n) notes.push(n); }
  return notes;
}

/**
 * A cost that depends on an unrecorded service tier says so, with the alternative.
 * The shown amount uses the standard rate where no tier was recorded.
 */
export function tierNote(key, data) {
  const tier = data?.cost?.tier;
  if (!tier || !present(data.cost_usd) || !present(tier.configuredUsd)) return null;
  const delta = tier.dependentUsd >= 0 ? `+${fmtUsd(tier.dependentUsd)}` : `−${fmtUsd(-tier.dependentUsd)}`;
  return `${toolMeta(key).name}: usage that recorded no service tier is costed at the standard rate. `
    + `At the "${tier.configured}" tier set in your current ${toolMeta(key).name} config, the estimate would be `
    + `${fmtUsd(tier.configuredUsd)} (${delta}). Sessions that recorded a tier are costed at that tier either way.`;
}

/** Warnings that must stay visible: incomplete sources, collector warnings, failures. */
export function problemLines(scan, { max }) {
  const lines = [];
  const item = (mark, text) => lines.push(...para(`${mark} ${text}`, max, { hang: '  ' }));
  for (const k of orderTools(Object.keys(scan.results))) {
    const d = scan.results[k];
    const name = toolMeta(k).name;
    // Informational notes (e.g. recovered sessions) belong to the details view, not the warnings.
    const msgs = [...new Set([
      ...(d.coverage?.status === 'partial' ? (d.coverage.reasons || []) : []),
      ...(d.diagnostics || []).filter(x => x.level !== 'info').map(x => x.message).filter(Boolean),
    ])];
    if (d.coverage?.status === 'partial' && msgs.length === 0) msgs.push('only partly read; totals are lower bounds.');
    for (const m of msgs) item(ui.warn(sym.warn), `${ui.strong(name)}: ${m}`);
  }
  for (const k of orderTools(Object.keys(scan.failed))) {
    item(ui.error(sym.error), `${ui.strong(toolMeta(k).name)} could not be read: ${scan.failed[k]}`);
  }
  if (scan.empty.length) {
    item(sym.bullet, `Installed, no usage yet: ${orderTools(scan.empty).map(k => toolMeta(k).name).join(', ')}`);
  }
  return lines;
}

const ORDER = AI_TOOLS.map(t => t.key);
export const orderTools = (keys) => [...keys].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

// ─── Details ─────────────────────────────────────────────────────────────────
/** Token composition and per-model usage for one tool. */
export function toolDetails(key, data, { max }) {
  const lines = ['  ' + ui.heading(toolMeta(key).name)];
  const t = data.tokens;
  const parts = tokenParts(t);
  if (parts) {
    // Same categories, order and "other" remainder as the report's token composition.
    const rows = TOKEN_PARTS.filter(p => parts[p.key] > 0)
      .map(p => ({ part: p.label, tokens: fmtTokensRaw(parts[p.key]), share: `${((parts[p.key] / parts.total) * 100).toFixed(1)}%` }));
    rows.push({ part: ui.strong('Total'), tokens: ui.strong(fmtTokensRaw(parts.total)), share: '' });
    lines.push('');
    lines.push(...table([
      { key: 'part', label: 'Token type' }, { key: 'tokens', label: 'Tokens', align: 'right' }, { key: 'share', label: 'Share', align: 'right' },
    ], rows, { max }));
    if (parts.other > 0) {
      lines.push('');
      lines.push(...para(`Other: tokens included in ${toolMeta(key).name}'s recorded total but not split by type.`, max));
    }
    if (parts.cacheRead / parts.total >= 0.5) {
      lines.push('');
      lines.push(...para('Most of these tokens are cache reads: the same conversation context re-read on every turn. They are not newly written text.', max));
    }
  }

  const models = [...(data.modelBreakdown || [])].sort((a, b) => (b.tokens || 0) - (a.tokens || 0));
  if (models.length) {
    lines.push('');
    const rows = models.map(m => ({
      model: m.displayName && m.displayName !== m.model ? `${m.displayName} (${m.model})` : (m.model || m.displayName || '(unknown model)'),
      tokens: present(m.tokens) && m.tokens > 0 ? fmtTokensRaw(m.tokens) : NA,
      cost: present(m.cost_usd) ? (m.costStatus === 'partial' ? '≥' : '') + fmtUsd(m.cost_usd) : NA,
      priced: m.costStatus && m.costStatus !== 'complete' ? ui.warn(m.costStatus === 'partial' ? 'partly priced' : 'no price') : '',
    }));
    const anyUnpriced = rows.some(r => r.priced);
    lines.push(...table([
      { key: 'model', label: 'Model' }, { key: 'tokens', label: 'Tokens', align: 'right' }, { key: 'cost', label: 'Cost', align: 'right' },
      ...(anyUnpriced ? [{ key: 'priced', label: 'Pricing', bare: true }] : []),
    ], rows, { max }));
  }

  if (!parts && t && present(t.total) && t.total > 0) {
    lines.push('');
    lines.push(...para(`${fmtTokensRaw(t.total)} tokens in total; ${toolMeta(key).name} does not split them by type.`, max));
  }
  if (!models.length && !(t && t.total > 0)) {
    lines.push('');
    lines.push(...para(`${toolMeta(key).name} reports sessions only; no token or model data is recorded locally.`, max));
  }

  const notes = [tierNote(key, data), ...(data.cost?.assumptions || []),
    ...(data.diagnostics || []).filter(x => x.level === 'info').map(x => x.message)].filter(Boolean);
  if (notes.length) {
    lines.push('');
    for (const n of notes) lines.push(...para(`${sym.bullet} ${n}`, max, { hang: '  ' }));
  }
  return lines;
}

/** Full detection results for every supported tool. */
export function detectionDetails(scan, { max }) {
  const rows = AI_TOOLS.map(t => {
    const status = scan.results[t.key] ? `${ui.ok(sym.ok)} data found`
      : scan.failed[t.key] ? `${ui.error(sym.error)} could not be read`
      : scan.empty.includes(t.key) ? `${sym.bullet} installed, no usage yet`
      : `${sym.dash} not found`;
    return { tool: t.name, status };
  });
  return ['  ' + ui.heading('Detection results'), '', ...table([{ key: 'tool', label: 'Tool' }, { key: 'status', label: 'Status' }], rows, { max })];
}

// ─── Completion ──────────────────────────────────────────────────────────────
export function completion({ htmlPath, displayPath, theme, cardData, openHint }, { max }) {
  const top = cardData.tools.filter(t => !t.isModelRow);
  const incomplete = top.filter(t => t.coverage?.status === 'partial');
  const field = (label, value) => wrap(value, Math.max(10, max - 12)).map((l, i) => `  ${(i ? '' : label).padEnd(10)}${l}`);
  const names = top.map(t => t.name).join(', ');
  const lines = [
    `  ${ui.ok(sym.ok)} ${ui.strong('Report generated')}`,
    '',
    ...field('File', ui.accent(displayPath)),
    ...field('Theme', theme),
    ...field('Tools', `${top.length} included${names ? ` (${names})` : ''}`),
  ];
  // A path is never wrapped or split: it must stay copyable. The terminal soft-wraps it if needed.
  if (htmlPath !== displayPath) lines.push(width(htmlPath) <= max - 12 ? `  ${'Full path'.padEnd(10)}${htmlPath}` : `  Full path`, ...(width(htmlPath) <= max - 12 ? [] : [`  ${htmlPath}`]));
  if (incomplete.length) {
    lines.push('');
    lines.push(...para(`${ui.warn(sym.warn)} Totals are lower bounds: ${incomplete.map(t => t.name).join(', ')} ${incomplete.length === 1 ? 'was' : 'were'} only partly read. The report explains why.`, max, { hang: '  ' }));
  }
  if (openHint) {
    lines.push('');
    lines.push(...para(`Open it in a browser: ${openHint}`, max, { hang: '  ' }));
    lines.push(...para('To save a PDF, use your browser’s Print command.', max));
  }
  return lines;
}

export { width };
