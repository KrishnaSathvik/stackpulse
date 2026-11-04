/**
 * src/cli/card.js
 * Turns scan results and the user's choices into the card data the HTML
 * generator consumes. Pure functions, no I/O and no prompts.
 *
 * This logic was moved verbatim out of the 3.3.x wizard. The report data
 * structure must not change with the CLI redesign: tests compare it against
 * the previous wizard's output for identical selections.
 */

export const AI_TOOLS = [
  { key: 'claude_code', name: 'Claude Code',  icon: '◆', color: '#D97706', source: 'ccusage',          hasTokens: true,  hasCost: true  },
  { key: 'codex',       name: 'Codex',         icon: '⬡', color: '#10A37F', source: 'ccusage/codex',    hasTokens: true,  hasCost: true  },
  { key: 'opencode',    name: 'OpenCode',      icon: '◎', color: '#6366F1', source: 'ccusage/opencode', hasTokens: true,  hasCost: true  },
  { key: 'amp',         name: 'Amp',           icon: '◈', color: '#EC4899', source: 'ccusage/amp',      hasTokens: true,  hasCost: true  },
  { key: 'pi',          name: 'Pi Agent',      icon: '◉', color: '#8B5CF6', source: 'ccusage/pi',       hasTokens: true,  hasCost: true  },
  { key: 'gemini',      name: 'Gemini CLI',    icon: '◑', color: '#4285F4', source: 'jsonl',            hasTokens: true,  hasCost: false },
  { key: 'qwen',        name: 'Qwen Code',     icon: '◐', color: '#7C3AED', source: 'jsonl',            hasTokens: true,  hasCost: true  },
  { key: 'kimi',        name: 'Kimi CLI',      icon: '◒', color: '#0EA5E9', source: 'jsonl',            hasTokens: true,  hasCost: true  },
  { key: 'cursor',      name: 'Cursor',        icon: '⬢', color: '#6E56CF', source: 'sqlite',           hasTokens: false, hasCost: false },
  { key: 'antigravity', name: 'Antigravity',   icon: '◇', color: '#1A73E8', source: 'sqlite',           hasTokens: false, hasCost: false },
  { key: 'roocode',     name: 'Roo Code',      icon: '◁', color: '#00BCD4', source: 'sqlite',           hasTokens: false, hasCost: false },
  { key: 'kilocode',    name: 'Kilo Code',     icon: '▷', color: '#FF6B35', source: 'sqlite',           hasTokens: false, hasCost: false },
  { key: 'aider',       name: 'Aider',         icon: '◈', color: '#16A34A', source: 'git',              hasTokens: false, hasCost: false },
];

export const METRICS = [
  { key: 'sessions',      label: 'Sessions',      unit: '',    icon: '⚡', hint: 'number of sessions / conversations' },
  { key: 'tokens_used',   label: 'Tokens Used',   unit: 'K',   icon: '◈', hint: 'enter in K units (e.g. 1500 = 1.5M)' },
  { key: 'cost_usd',      label: 'Cost',          unit: '$',   icon: '◊', hint: 'USD, e.g. 14.50' },
  { key: 'lines_written', label: 'Lines Written', unit: 'loc', icon: '✦', hint: 'lines of code written by AI' },
  { key: 'commits',       label: 'AI Commits',    unit: '',    icon: '◉', hint: 'git commits attributed to AI' },
  { key: 'hours_saved',   label: 'Hours Saved',   unit: 'h',   icon: '◷', hint: 'estimated hours saved' },
  { key: 'files_edited',  label: 'Files Edited',  unit: '',    icon: '◎', hint: 'number of files edited by AI' },
  { key: 'bugs_fixed',    label: 'Bugs Fixed',    unit: '',    icon: '◆', hint: 'bugs resolved with AI help' },
];

export const THEMES = [
  { value: 'dark',    label: 'Dark',    hint: 'terminal noir' },
  { value: 'light',   label: 'Light',   hint: 'clean minimal' },
  { value: 'cosmic',  label: 'Cosmic',  hint: 'deep space' },
  { value: 'forge',   label: 'Forge',   hint: 'amber heat' },
  { value: 'arctic',  label: 'Arctic',  hint: 'ice blue' },
  { value: 'verdant', label: 'Verdant', hint: 'forest green' },
  { value: 'neon',    label: 'Neon',    hint: 'pink synthwave' },
];
export const THEME_KEYS = THEMES.map(t => t.value);

export const toolMeta = (key) => AI_TOOLS.find(t => t.key === key) || { name: key, key, color: '#64748B', icon: '◆' };

export const defaultTitle = () => 'My AI Coding Stack';
export const defaultTimeframe = (year = new Date().getFullYear()) => `${year} — All Time`;

/** Metrics pre-selected for the card: sessions plus whatever any tool actually has. */
export function smartDefaultMetrics(scanned, manualData = {}) {
  const all  = { ...scanned, ...manualData };
  const has  = key => Object.values(all).some(d => d?.[key] > 0);
  const picks = ['sessions'];
  if (has('tokens_used'))   picks.push('tokens_used');
  if (has('cost_usd'))      picks.push('cost_usd');
  if (has('lines_written')) picks.push('lines_written');
  if (has('commits'))       picks.push('commits');
  return picks;
}

/** Copy of scan results taken before any manual entry, keeping the arrays the heatmap needs. */
export function snapshotScan(scanned) {
  const snap = {};
  for (const [key, val] of Object.entries(scanned)) {
    snap[key] = { ...val };
    if (Array.isArray(val.daily)) snap[key].daily = [...val.daily];
    if (Array.isArray(val.modelBreakdown)) snap[key].modelBreakdown = [...val.modelBreakdown];
  }
  return snap;
}

/** Shallow merge of scanned and manual data, as the metrics step sees it. */
export function mergeData(scanned, manualData) {
  const allData = {};
  for (const key of [...new Set([...Object.keys(scanned), ...Object.keys(manualData)])]) {
    allData[key] = { ...(scanned[key] || {}), ...(manualData[key] || {}) };
  }
  return allData;
}

/** Selected metrics that no tool reports, so the user may enter a total by hand. */
export function metricsNeedingInput(selectedMetrics, allData) {
  return selectedMetrics.filter(mk => !Object.values(allData).some(d => d?.[mk] > 0));
}

/**
 * Apply a manually entered metric total. It is stored on the first selected
 * tool with sessions (or the first selected tool), exactly as 3.3.x did.
 * Mutates `scanned` and `manualData`. `val == null` (a blank cost) is skipped.
 */
export function applyMetricTotal({ scanned, manualData, allData, selectedKeys }, mk, val) {
  if (val == null) return;
  const toolsWithSessions = selectedKeys.filter(k => (allData[k]?.sessions || 0) > 0);
  if (toolsWithSessions.length > 0) {
    const primaryKey = toolsWithSessions[0];
    if (!manualData[primaryKey]) manualData[primaryKey] = {};
    if (!scanned[primaryKey])    scanned[primaryKey]    = { ...allData[primaryKey] };
    scanned[primaryKey][mk] = val;
    if (mk === 'cost_usd') manualData[primaryKey].cost_usd = val;
  } else if (selectedKeys.length > 0) {
    const firstKey = selectedKeys[0];
    if (!scanned[firstKey]) scanned[firstKey] = {};
    if (!manualData[firstKey]) manualData[firstKey] = {};
    scanned[firstKey][mk] = val;
    if (mk === 'cost_usd') manualData[firstKey].cost_usd = val;
  }
}

/**
 * Token composition of one tool, from the collector's normalized counts.
 * Categories are additive; when a tool's recorded total is larger than their sum
 * (some tools count tokens they do not split by type), the remainder is "other".
 * Returns null when the tool has no per-type breakdown.
 */
export const TOKEN_PARTS = [
  { key: 'cacheRead', label: 'Cache reads' },
  { key: 'cacheWrite', label: 'Cache writes' },
  { key: 'output', label: 'Output' },
  { key: 'input', label: 'Uncached input' },
  { key: 'other', label: 'Other' },
];
export function tokenParts(tokens) {
  const n = (v) => (Number.isFinite(v) && v > 0 ? v : 0);
  if (!tokens || !(n(tokens.total) > 0)) return null;
  const parts = { input: n(tokens.input), output: n(tokens.output), cacheRead: n(tokens.cacheRead), cacheWrite: n(tokens.cacheWrite) };
  const typed = parts.input + parts.output + parts.cacheRead + parts.cacheWrite;
  if (typed === 0) return null;
  parts.other = Math.max(0, tokens.total - typed);
  return { ...parts, total: Math.max(tokens.total, typed) };
}

/**
 * Token composition across the selected tools, for the report. Built here so the
 * report shows the same normalized counts as the CLI details view. A tool whose
 * token total was entered by hand has no composition and is counted as uncovered.
 */
export function tokenComposition(allData, selectedKeys, manualData = {}) {
  const tools = [];
  let uncovered = 0;
  for (const key of selectedKeys) {
    const d = allData[key];
    if (!d) continue;
    const manualTokens = manualData[key]?.tokens_used != null;
    const parts = manualTokens ? null : tokenParts(d.tokens);
    if (parts) tools.push({ key, name: toolMeta(key).name, color: toolMeta(key).color, ...parts });
    else if (Number(d.tokens_used) > 0) uncovered++;
  }
  if (!tools.length) return null;
  const sum = (k) => tools.reduce((a, t) => a + t[k], 0);
  return {
    tools,
    totals: Object.fromEntries([...TOKEN_PARTS.map(p => p.key), 'total'].map(k => [k, sum(k)])),
    uncovered,
  };
}

/**
 * Build the card data passed to generateHTML().
 * @param {object} p
 * @param {object} p.scanned          tool key → parser result (after any manual totals)
 * @param {object} p.scannedSnapshot  snapshotScan() taken before manual entry
 * @param {object} p.manualData       tool key → manually entered values
 * @param {string[]} p.selectedKeys
 * @param {string[]} p.selectedMetrics
 * @param {{title, timeframe, username, theme}} p.details
 */
export function buildCardData({ scanned, scannedSnapshot = snapshotScan(scanned), manualData = {}, selectedKeys, selectedMetrics, details }) {
  // Deep merge: manual entries patch scanned data, preserving daily[] and other parser fields
  const finalAllData = { ...scanned };
  for (const [key, manual] of Object.entries(manualData)) {
    finalAllData[key] = { ...(scanned[key] || {}), ...manual };
  }
  const toolData       = [];
  const wantsBreakdown = selectedMetrics.some(mk => mk === 'tokens_used' || mk === 'cost_usd');

  for (const key of selectedKeys) {
    const meta      = toolMeta(key);
    const merged    = { ...(finalAllData[key] || {}) };
    const breakdown = wantsBreakdown
      ? (merged.modelBreakdown || []).filter(mb => (mb.tokens_used || 0) + (mb.cost_usd || 0) > 0)
      : [];
    // Cost provenance from the adapter; a manually entered cost replaces it.
    const costInfo = manualData[key]?.cost_usd != null
      ? { kind: 'manual', status: 'complete', unpricedModels: [] }
      : (merged.cost || null);

    if (breakdown.length > 1) {
      toolData.push({
        ...meta, isParentHeader: true, costInfo, coverage: merged.coverage || null,
        metrics: selectedMetrics.reduce((a, mk) => { a[mk] = merged[mk] ?? null; return a; }, {}),
      });
      breakdown.forEach((mb, i) => toolData.push({
        ...meta, name: mb.displayName, modelId: mb.model || null, parentName: meta.name,
        isModelRow: true, costInfo: mb.costStatus ? { status: mb.costStatus } : null, isLast: i === breakdown.length - 1,
        metrics: selectedMetrics.reduce((a, mk) => {
          a[mk] = mk === 'tokens_used' ? (mb.tokens_used ?? null)
                : mk === 'cost_usd'    ? (mb.cost_usd    ?? null)
                : null;
          return a;
        }, {}),
      }));
    } else {
      toolData.push({
        ...meta, costInfo, coverage: merged.coverage || null,
        metrics: selectedMetrics.reduce((a, mk) => { a[mk] = merged[mk] ?? null; return a; }, {}),
      });
    }
  }

  // Per-tool heatmap entries (toolKey preserved for per-row colouring).
  // daily[] can be lost in merges, so fall back to scanned, then to the pristine snapshot.
  const heatmapData = [];
  for (const key of selectedKeys) {
    let toolResult = finalAllData[key];
    if (!toolResult || !Array.isArray(toolResult.daily) || toolResult.daily.length === 0) {
      if (scanned[key] && Array.isArray(scanned[key].daily) && scanned[key].daily.length > 0) {
        toolResult = scanned[key];
      } else if (scannedSnapshot[key] && Array.isArray(scannedSnapshot[key].daily) && scannedSnapshot[key].daily.length > 0) {
        toolResult = scannedSnapshot[key];
      }
    }
    if (!toolResult || !Array.isArray(toolResult.daily) || toolResult.daily.length === 0) continue;
    for (const entry of toolResult.daily) {
      if (!entry.date) continue;
      const tokens  = entry.tokens_used || entry.totalTokens || 0;
      const cost    = entry.cost_usd || entry.totalCost || 0;
      const sessions = entry.sessions || (tokens > 0 ? 1 : 0) || (cost > 0 ? 1 : 0) || 0;
      if (sessions === 0 && tokens === 0) continue; // skip truly empty days
      heatmapData.push({ toolKey: key, date: entry.date, sessions, tokens, cost });
    }
  }

  return {
    title: details.title, timeframe: details.timeframe, username: details.username, theme: details.theme,
    tools: toolData,
    metrics: selectedMetrics.map(k => METRICS.find(m => m.key === k)).filter(Boolean),
    heatmapData,
    tokenComposition: selectedMetrics.includes('tokens_used') ? tokenComposition(finalAllData, selectedKeys, manualData) : null,
  };
}
