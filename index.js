#!/usr/bin/env node
process.removeAllListeners('warning');

import { checkbox, confirm, input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import figlet from 'figlet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { Command } from 'commander';
import { generateHTML } from './generator.js';
import { detect as detectClaudeCode,  parse as parseClaudeCode  } from './parsers/claude-code.js';
import { detect as detectCodex,       parse as parseCodex       } from './parsers/codex.js';
import { detect as detectOpenCode,    parse as parseOpenCode    } from './parsers/opencode.js';
import { detect as detectAmp,         parse as parseAmp         } from './parsers/amp.js';
import { detect as detectPi,          parse as parsePi          } from './parsers/pi.js';
import { detect as detectGemini,      parse as parseGemini      } from './parsers/gemini.js';
import { detect as detectQwen,        parse as parseQwen        } from './parsers/qwen.js';
import { detect as detectKimi,        parse as parseKimi        } from './parsers/kimi.js';
import { detect as detectCursor,      parse as parseCursor      } from './parsers/cursor.js';
import { detect as detectAntigravity, parse as parseAntigravity } from './parsers/antigravity.js';
import { detect as detectRooCode,     parse as parseRooCode     } from './parsers/roocode.js';
import { detect as detectKiloCode,    parse as parseKiloCode    } from './parsers/kilocode.js';
import { detect as detectAider,       parse as parseAider       } from './parsers/aider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8')).version;

// ─── Tool registry ────────────────────────────────────────────────────────────
export const AI_TOOLS = [
  { key: 'claude_code', name: 'Claude Code',  icon: '\u25c6', color: '#D97706', source: 'ccusage',          hasTokens: true,  hasCost: true  },
  { key: 'codex',       name: 'Codex',         icon: '\u2b21', color: '#10A37F', source: 'ccusage/codex',    hasTokens: true,  hasCost: true  },
  { key: 'opencode',    name: 'OpenCode',      icon: '\u25ce', color: '#6366F1', source: 'ccusage/opencode', hasTokens: true,  hasCost: true  },
  { key: 'amp',         name: 'Amp',           icon: '\u25c8', color: '#EC4899', source: 'ccusage/amp',      hasTokens: true,  hasCost: true  },
  { key: 'pi',          name: 'Pi Agent',      icon: '\u25c9', color: '#8B5CF6', source: 'ccusage/pi',       hasTokens: true,  hasCost: true  },
  { key: 'gemini',      name: 'Gemini CLI',    icon: '\u25d1', color: '#4285F4', source: 'jsonl',            hasTokens: true,  hasCost: false },
  { key: 'qwen',        name: 'Qwen Code',     icon: '\u25d0', color: '#7C3AED', source: 'jsonl',            hasTokens: true,  hasCost: true  },
  { key: 'kimi',        name: 'Kimi CLI',      icon: '\u25d2', color: '#0EA5E9', source: 'jsonl',            hasTokens: true,  hasCost: true  },
  { key: 'cursor',      name: 'Cursor',        icon: '\u2b22', color: '#6E56CF', source: 'sqlite',           hasTokens: false, hasCost: false },
  { key: 'antigravity', name: 'Antigravity',   icon: '\u25c7', color: '#1A73E8', source: 'sqlite',           hasTokens: false, hasCost: false },
  { key: 'roocode',     name: 'Roo Code',      icon: '\u25c1', color: '#00BCD4', source: 'sqlite',           hasTokens: false, hasCost: false },
  { key: 'kilocode',    name: 'Kilo Code',     icon: '\u25b7', color: '#FF6B35', source: 'sqlite',           hasTokens: false, hasCost: false },
  { key: 'aider',       name: 'Aider',         icon: '\u25c8', color: '#16A34A', source: 'git',              hasTokens: false, hasCost: false },
];

export const METRICS = [
  { key: 'sessions',      label: 'Sessions',      unit: '',    icon: '\u26a1', hint: 'number of sessions / conversations' },
  { key: 'tokens_used',   label: 'Tokens Used',   unit: 'K',   icon: '\u25c8', hint: 'enter in K units (e.g. 1500 = 1.5M)' },
  { key: 'cost_usd',      label: 'Cost',          unit: '$',   icon: '\u25ca', hint: 'USD, e.g. 14.50' },
  { key: 'lines_written', label: 'Lines Written', unit: 'loc', icon: '\u2726', hint: 'lines of code written by AI' },
  { key: 'commits',       label: 'AI Commits',    unit: '',    icon: '\u25c9', hint: 'git commits attributed to AI' },
  { key: 'hours_saved',   label: 'Hours Saved',   unit: 'h',   icon: '\u25f7', hint: 'estimated hours saved' },
  { key: 'files_edited',  label: 'Files Edited',  unit: '',    icon: '\u25ce', hint: 'number of files edited by AI' },
  { key: 'bugs_fixed',    label: 'Bugs Fixed',    unit: '',    icon: '\u25c6', hint: 'bugs resolved with AI help' },
];

const THEME_CHOICES = [
  { name: '\ud83c\udf11  Dark      \u2014 ' + chalk.dim('Terminal noir'),                        value: 'dark'    },
  { name: '\u2600\ufe0f   Light     \u2014 ' + chalk.white('Clean minimal'),                      value: 'light'   },
  { name: '\ud83c\udf0c  Cosmic    \u2014 ' + chalk.blue('Deep space'),                           value: 'cosmic'  },
  { name: '\ud83d\udd25  Forge     \u2014 ' + chalk.hex('#F97316')('Amber heat'),                 value: 'forge'   },
  { name: '\ud83c\udf0a  Arctic    \u2014 ' + chalk.hex('#2563EB')('Ice blue'),                   value: 'arctic'  },
  { name: '\ud83c\udf3f  Verdant   \u2014 ' + chalk.hex('#22C55E')('Forest green'),               value: 'verdant' },
  { name: '\ud83d\udc97  Neon      \u2014 ' + chalk.hex('#E879F9')('Pink synthwave'),             value: 'neon'    },
];

// ─── Parser + detector maps ───────────────────────────────────────────────────
const PARSERS = {
  claude_code: parseClaudeCode, codex: parseCodex, opencode: parseOpenCode,
  amp: parseAmp, pi: parsePi, gemini: parseGemini, qwen: parseQwen, kimi: parseKimi,
  cursor: parseCursor, antigravity: parseAntigravity,
  roocode: parseRooCode, kilocode: parseKiloCode, aider: parseAider,
};
const DETECTORS = {
  claude_code: detectClaudeCode, codex: detectCodex, opencode: detectOpenCode,
  amp: detectAmp, pi: detectPi, gemini: detectGemini, qwen: detectQwen, kimi: detectKimi,
  cursor: detectCursor, antigravity: detectAntigravity,
  roocode: detectRooCode, kilocode: detectKiloCode, aider: detectAider,
};

// ─── UI helpers ───────────────────────────────────────────────────────────────
const W = 60;
function rule(c = '\u2500') { return chalk.dim(c.repeat(W)); }

function stepHeader(n, total, title, hint) {
  console.log('');
  console.log(chalk.bgCyan.black(` STEP ${n}/${total} `) + '  ' + chalk.white.bold(title));
  if (hint) console.log(chalk.dim('         ' + hint));
  console.log(rule() + '\n');
}

// Sub-cent costs must not print as "$0.00", which reads as free.
function fmtUsd(v) {
  return v > 0 && v < 0.005 ? '<$0.01' : `$${Number(v).toFixed(2)}`;
}

function fmtTokens(k) {
  return k >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${k}K`;
}

function buildStatParts(metrics) {
  const parts = [];
  if (metrics.sessions)      parts.push(chalk.white(`${metrics.sessions} sessions`));
  if (metrics.tokens_used)   parts.push(chalk.cyan(fmtTokens(metrics.tokens_used) + ' tokens'));
  if (metrics.cost_usd)      parts.push(chalk.yellow(fmtUsd(metrics.cost_usd)));
  if (metrics.commits)       parts.push(chalk.green(`${metrics.commits} commits`));
  if (metrics.lines_written) parts.push(chalk.dim(`${Number(metrics.lines_written).toLocaleString()} lines`));
  return parts.join(chalk.dim('  \u00b7  ')) || chalk.dim('\u2014');
}

// ─── Live scanner ─────────────────────────────────────────────────────────────
async function scanMachineWithFeedback() {
  console.log(chalk.bold.cyan('\n  Scanning for AI tools\u2026\n'));
  console.log(chalk.dim('  ' + '\u2500'.repeat(W - 4)));

  const results = {};
  const WIDTH = 16;

  await Promise.allSettled(
    Object.entries(PARSERS).map(async ([key, parseFn]) => {
      const tool = AI_TOOLS.find(t => t.key === key);
      const name = (tool?.name || key).padEnd(WIDTH);

      let detected = false;
      try { detected = DETECTORS[key](); } catch {}

      if (!detected) {
        console.log(`  ${chalk.dim('\u25a1')}  ${chalk.dim(name)} ${chalk.dim('not installed')}`);
        return;
      }

      process.stdout.write(`  ${chalk.cyan('\u25cc')}  ${chalk.cyan(name)} ${chalk.dim('reading data\u2026')}\r`);

      try {
        const data = await parseFn();
        if (data && (data.sessions || data.tokens_used || data.commits)) {
          results[key] = data;
          const parts = [
            data.sessions    ? `${data.sessions} sessions`            : null,
            data.tokens_used ? fmtTokens(data.tokens_used) + ' tokens' : null,
            data.cost_usd    ? fmtUsd(data.cost_usd)                  : null,
            data.commits     ? `${data.commits} commits`              : null,
          ].filter(Boolean).join('  \u00b7  ');
          const incomplete = data.coverage?.status === 'partial' ? chalk.yellow('  (incomplete)') : '';
          console.log(`  ${chalk.green('\u25cf')}  ${chalk.white.bold(name)} ${chalk.green(parts)}${incomplete}                    `);
          for (const d of data.diagnostics || []) {
            console.log(`     ${chalk.yellow('\u26a0')}  ${chalk.yellow(d.message)}`);
          }
        } else {
          console.log(`  ${chalk.yellow('\u25cb')}  ${chalk.dim(name)} ${chalk.dim('installed \u2014 no data yet')}    `);
        }
      } catch (err) {
        const why = err?.message ? ` (${String(err.message).split('\n')[0].slice(0, 80)})` : '';
        console.log(`  ${chalk.red('\u00d7')}  ${chalk.dim(name)} ${chalk.dim('could not read data' + why)}    `);
      }
    })
  );

  console.log(chalk.dim('  ' + '\u2500'.repeat(W - 4)) + '\n');
  return results;
}

function detectInstalled() {
  const found = [];
  for (const [key, fn] of Object.entries(DETECTORS)) {
    try { if (fn()) found.push(key); } catch {}
  }
  return found;
}

function smartDefaultMetrics(scanned, manualData = {}) {
  const all  = { ...scanned, ...manualData };
  const has  = key => Object.values(all).some(d => d?.[key] > 0);
  const picks = ['sessions'];
  if (has('tokens_used'))   picks.push('tokens_used');
  if (has('cost_usd'))      picks.push('cost_usd');
  if (has('lines_written')) picks.push('lines_written');
  if (has('commits'))       picks.push('commits');
  return picks;
}

function buildShareLink(cardData) {
  // Include both parent headers and plain tools (not model sub-rows)
  const allTools = cardData.tools.filter(t => !t.isModelRow);
  const toolLines = allTools.slice(0, 5).map(t => {
    const parts = [];
    if (t.metrics.sessions)    parts.push(Number(t.metrics.sessions).toLocaleString() + ' sessions');
    if (t.metrics.tokens_used) parts.push(fmtTokens(t.metrics.tokens_used) + ' tokens');
    if (t.metrics.cost_usd)    parts.push(fmtUsd(t.metrics.cost_usd));
    return (t.icon || '\u25c6') + ' ' + t.name + (parts.length ? ': ' + parts.join(' \u00b7 ') : '');
  }).join('\n');

  const totalSessions = allTools.reduce((s, t2) => s + (t2.metrics.sessions || 0), 0);
  const totalTokens   = allTools.reduce((s, t2) => s + (t2.metrics.tokens_used || 0), 0);
  const totalCost     = allTools.reduce((s, t2) => s + (t2.metrics.cost_usd || 0), 0);
  const summaryParts  = [];
  if (totalSessions) summaryParts.push(totalSessions.toLocaleString() + ' sessions');
  if (totalTokens)   summaryParts.push(fmtTokens(totalTokens) + ' tokens');
  if (totalCost)     summaryParts.push(fmtUsd(totalCost));

  const text = [
    cardData.title || 'My AI Coding Stack',
    '',
    toolLines,
    '',
    summaryParts.join(' \u00b7 '),
    '',
    'Generated with stackpulse',
    'github.com/KrishnaSathvik/stackpulse',
  ].join('\n');
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
}

function printBanner() {
  process.stdout.write('\x1Bc'); // reset terminal cleanly
  console.log(chalk.cyan(figlet.textSync('stackpulse', { font: 'Slant' })));
  console.log(chalk.dim('  stackpulse v' + PKG_VERSION + '  \u00b7  Shareable card for your AI coding stack'));
  console.log(chalk.dim('  ' + AI_TOOLS.length + ' tools supported  \u00b7  github.com/KrishnaSathvik/stackpulse\n'));
}

function loadConfig(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return path.extname(filePath).toLowerCase().startsWith('.y') ? yaml.load(content) : JSON.parse(content);
}

function runFromConfig(configPath, opts) {
  const cfg  = loadConfig(configPath);
  const keys = Object.keys(cfg.tools || {});
  const mets = cfg.metrics || ['sessions', 'tokens_used', 'cost_usd'];
  const toolData = keys.map(key => {
    const meta = AI_TOOLS.find(t => t.key === key) || { name: key, key, color: '#64748B', icon: '\u25c6' };
    const src  = cfg.tools[key];
    return { ...meta, name: src.name || meta.name, color: src.color || meta.color,
      metrics: mets.reduce((a, mk) => { a[mk] = src[mk] ?? null; return a; }, {}) };
  });
  return {
    cardData: {
      title:     cfg.title     || 'My AI Coding Stack',
      timeframe: cfg.timeframe || `${new Date().getFullYear()} \u2014 All Time`,
      username:  cfg.username  || '',
      theme:     cfg.theme     || 'dark',
      tools:     toolData,
      metrics:   mets.map(k => METRICS.find(m => m.key === k)).filter(Boolean),
    },
    outputBase: opts.output || 'stackpulse',
  };
}

function scaffoldConfig(outPath) {
  const tmpl = {
    title: 'My AI Coding Stack', timeframe: `${new Date().getFullYear()} \u2014 All Time`,
    username: 'yourhandle', theme: 'dark',
    metrics: ['sessions', 'tokens_used', 'cost_usd', 'commits'],
    tools: {
      claude_code: { sessions: 312, tokens_used: 23500, cost_usd: 180, commits: 42 },
      codex:       { sessions: 88,  tokens_used: 605400, cost_usd: 0  },
      cursor:      { sessions: 540, cost_usd: 240 },
      gemini:      { sessions: 200, tokens_used: 8400 },
      aider:       { sessions: 55,  commits: 88, lines_written: 9400 },
    },
  };
  const ext = path.extname(outPath).toLowerCase();
  fs.writeFileSync(outPath, ext.startsWith('.y') ? yaml.dump(tmpl, { indent: 2 }) : JSON.stringify(tmpl, null, 2), 'utf-8');
  console.log(chalk.green(`\n  \u2726 Scaffold created \u2192 ${outPath}`));
  console.log(chalk.dim(`  Edit values then run: stackpulse --config ${outPath}\n`));
}

async function writeOutputs({ cardData, outputBase }) {
  const htmlPath = path.resolve(`${outputBase}.html`);

  // ora loops forever clearing lines when a TTY reports 0 columns (some CI/IDE terminals)
  const spinnerOk = !!process.stdout.isTTY && (process.stdout.columns || 0) > 0;
  const spinner = ora({ text: 'Rendering card\u2026', color: 'cyan', isEnabled: spinnerOk }).start();
  fs.writeFileSync(htmlPath, generateHTML(cardData), 'utf-8');
  spinner.succeed(chalk.green('Card ready!'));

  // Result summary
  console.log('');
  console.log(chalk.bold.white('\u2500'.repeat(W)));
  console.log(chalk.bold('  \ud83d\udcca  Your AI Card'));
  console.log(chalk.dim('\u2500'.repeat(W)));

  const parentTools = cardData.tools.filter(t => !t.isModelRow);
  for (const tool of parentTools) {
    if (tool.isParentHeader) {
      console.log(`\n  ${tool.icon}  ${chalk.bold.white(tool.name)}`);
      const models = cardData.tools.filter(t => t.isModelRow && t.parentName === tool.name);
      models.forEach((m, i) => {
        const branch = i === models.length - 1 ? '\u2570' : '\u251c';
        console.log(`     ${chalk.dim(branch + '\u2500')} ${chalk.white(m.name.padEnd(16))} ${buildStatParts(m.metrics)}`);
      });
    } else {
      console.log(`  ${tool.icon}  ${chalk.white.bold(tool.name.padEnd(16))} ${buildStatParts(tool.metrics)}`);
    }
  }

  const incomplete = parentTools.filter(t => t.coverage?.status === 'partial');
  if (incomplete.length) {
    console.log('');
    console.log(chalk.yellow(`  \u26a0  Totals are incomplete \u2014 only partly read: ${incomplete.map(t => t.name).join(', ')}.`));
    console.log(chalk.yellow('     These figures are lower bounds; see the notes on the card.'));
  }

  console.log('');
  console.log(chalk.dim('\u2500'.repeat(W)));
  console.log(chalk.green('  HTML  ') + chalk.underline(htmlPath));
  console.log(chalk.dim('\u2500'.repeat(W)));
  console.log('');
  console.log('  ' + chalk.bold('Share \u2192') + ' ' + chalk.blue.underline(buildShareLink(cardData)));
  console.log('');
}

// ─── 3-STEP WIZARD ────────────────────────────────────────────────────────────
async function runWizard(opts = {}) {

  // ── Scan phase ────────────────────────────────────────────────────────────
  const scanned     = await scanMachineWithFeedback();
  const installed   = detectInstalled();
  const scannedKeys = Object.keys(scanned);
  const allFoundKeys = [...new Set([...scannedKeys, ...installed])];

  // Snapshot original scanned data BEFORE any mutations (Steps 1-2 may mutate scanned).
  // This preserves daily[] arrays for heatmap even if merges clobber them later.
  const scannedSnapshot = {};
  for (const [key, val] of Object.entries(scanned)) {
    scannedSnapshot[key] = { ...val };
    // Deep-copy arrays that heatmap needs
    if (Array.isArray(val.daily)) scannedSnapshot[key].daily = [...val.daily];
    if (Array.isArray(val.modelBreakdown)) scannedSnapshot[key].modelBreakdown = [...val.modelBreakdown];
  }
  // ══════════════════════════════════════════════════════════════════════════
  //  STEP 1 — TOOLS
  // ══════════════════════════════════════════════════════════════════════════
  stepHeader(1, 3, 'Select Your AI Tools',
    'Space = toggle  \u00b7  \u2191\u2193 = navigate  \u00b7  Enter = confirm');

  // Show all detected/installed tools — user toggles which to include
  let selectedKeys = [];
  if (allFoundKeys.length > 0) {
    selectedKeys = await checkbox({
      message: 'Select tools to include on your card:',
      choices: allFoundKeys.map(key => ({
        name: (AI_TOOLS.find(t => t.key === key)?.name || key) +
              (scanned[key]
                ? chalk.green('  \u2713 data found')
                : chalk.yellow('  \u25cb installed, no data')),
        value:   key,
        checked: !!scanned[key],  // pre-check tools with data
      })),
      pageSize: 20,
      validate: v => v.length > 0 || 'Select at least one tool.',
    });
  }

  // Add tools not on machine (optional second list)
  const notFound = AI_TOOLS.filter(t => !allFoundKeys.includes(t.key));
  if (notFound.length > 0) {
    console.log('');
    console.log(chalk.dim('  Other tools (not detected on this machine):'));
    console.log(chalk.dim('  Space = toggle  \u00b7  Enter = done\n'));
    const srcLabel = {
      ccusage: 'full data', 'ccusage/codex': 'full data', 'ccusage/opencode': 'full data',
      'ccusage/amp': 'full data', 'ccusage/pi': 'full data',
      jsonl: 'tokens', sqlite: 'sessions', git: 'commits',
    };
    const extra = await checkbox({
      message: 'Add any tools you use manually?',
      choices: notFound.map(t => ({
        name:    `${t.icon}  ${t.name.padEnd(16)} ${chalk.dim(srcLabel[t.source] || '')}`,
        value:   t.key,
        checked: false,
      })),
      pageSize: 15,
    });
    selectedKeys = [...selectedKeys, ...extra];
  }

  if (selectedKeys.length === 0) {
    console.log(chalk.red('\n  No tools selected.\n'));
    process.exit(0);
  }

  // Manual entry for tools without local data
  const manualData = {};
  const needManual = selectedKeys.filter(k => !scanned[k]);
  if (needManual.length > 0) {
    console.log(chalk.dim('\n  \u2500\u2500 Enter stats for tools without local data \u2500\u2500\n'));
    for (const key of needManual) {
      const tool = AI_TOOLS.find(t => t.key === key);
      if (!tool) continue;
      console.log(chalk.bold(`\n  ${tool.icon}  ${tool.name}`));
      if (!(await confirm({ message: `  Enter ${tool.name} stats?`, default: true }))) continue;
      const entry = { sessions: parseInt(await input({ message: '    Sessions:', default: '0' })) || 0 };
      if (tool.hasTokens) entry.tokens_used = parseInt(await input({ message: '    Tokens used (K):', default: '0' })) || 0;
      if (tool.hasCost)   entry.cost_usd    = parseFloat(await input({ message: '    Cost USD:', default: '0' })) || 0;
      if (key === 'aider') entry.commits    = parseInt(await input({ message: '    Git commits:', default: '0' })) || 0;
      manualData[key] = entry;
    }
  }

  // ── Confirm before proceeding to Step 2 ──────────────────────────────────
  console.log('');
  const toolSummary = selectedKeys
    .map(k => {
      const meta = AI_TOOLS.find(t => t.key === k);
      return chalk.cyan(meta?.name || k);
    })
    .join(chalk.dim(', '));
  console.log(`  ${chalk.bold('Tools selected:')} ${toolSummary}`);
  console.log('');
  await confirm({
    message: chalk.bold('Ready to choose metrics? \u2192 Press Enter to continue'),
    default: true,
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  STEP 2 — METRICS
  // ══════════════════════════════════════════════════════════════════════════
  stepHeader(2, 3, 'Choose Metrics to Display',
    'Space = toggle  \u00b7  \u2191\u2193 = navigate  \u00b7  Enter = confirm');

  // Deep merge: manual entries patch scanned data, preserving daily[] and modelBreakdown[]
  const allData = {};
  for (const key of [...new Set([...Object.keys(scanned), ...Object.keys(manualData)])]) {
    allData[key] = { ...(scanned[key] || {}), ...(manualData[key] || {}) };
  }
  const defaultMetrics = smartDefaultMetrics(scanned, manualData);

  const selectedMetrics = await checkbox({
    message: 'Which metrics to show on your card?',
    choices: METRICS.map(m => {
      const hasData = Object.values(allData).some(d => d?.[m.key] > 0);
      return {
        name:    `${m.icon}  ${m.label.padEnd(16)}` +
                 (hasData ? chalk.green(' \u2713 has data') : chalk.dim(' \u2014 enter manually')),
        value:   m.key,
        checked: defaultMetrics.includes(m.key),
      };
    }),
    pageSize: 10,
    validate: v => v.length > 0 || 'Pick at least one metric.',
  });

  // For metrics with no auto-detected data, let the user enter totals manually
  const metricsNeedingInput = selectedMetrics.filter(mk => {
    // skip if any tool already has this data
    return !Object.values(allData).some(d => d?.[mk] > 0);
  });

  if (metricsNeedingInput.length > 0) {
    console.log('');
    console.log(chalk.dim('  \u2500\u2500 Enter totals for metrics without auto-detected data \u2500\u2500'));
    console.log(chalk.dim('  These will be shown as aggregate totals on your card.\n'));

    for (const mk of metricsNeedingInput) {
      const metaDef = METRICS.find(m => m.key === mk);
      const hint    = metaDef?.hint ? chalk.dim(` (${metaDef.hint})`) : '';
      const raw     = await input({
        message: `  ${metaDef?.icon || ''} ${metaDef?.label || mk}${hint}:`,
        default: '0',
      });
      const val = mk === 'cost_usd' ? parseFloat(raw) || 0 : parseInt(raw) || 0;

      // Spread the value evenly across selected tools that have sessions but 0 for this metric
      // Or just store on first tool with sessions
      const toolsWithSessions = selectedKeys.filter(k => (allData[k]?.sessions || 0) > 0);
      if (toolsWithSessions.length > 0) {
        const primaryKey = toolsWithSessions[0];
        if (!manualData[primaryKey]) manualData[primaryKey] = {};
        if (!scanned[primaryKey])    scanned[primaryKey]    = { ...allData[primaryKey] };
        scanned[primaryKey][mk] = val;
      } else if (selectedKeys.length > 0) {
        const firstKey = selectedKeys[0];
        if (!scanned[firstKey]) scanned[firstKey] = {};
        scanned[firstKey][mk] = val;
      }
    }
  }

  // Show summary of what will appear on the card
  console.log('');
  const metSummary = selectedMetrics
    .map(k => {
      const m = METRICS.find(x => x.key === k);
      return chalk.cyan(m?.label || k);
    })
    .join(chalk.dim(', '));
  console.log(`  ${chalk.bold('Metrics selected:')} ${metSummary}`);
  console.log('');

  // ── Confirm before proceeding to Step 3 ──────────────────────────────────
  await confirm({
    message: chalk.bold('Ready to customise card details? \u2192 Press Enter to continue'),
    default: true,
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  STEP 3 — CARD DETAILS
  // ══════════════════════════════════════════════════════════════════════════
  stepHeader(3, 3, 'Card Details & Output',
    'Customise title, theme, handle, and filename');

  const year        = new Date().getFullYear();
  const cardTitle   = await input({ message: 'Card title:', default: opts.title     || 'My AI Coding Stack' });
  const timeframe   = await input({ message: 'Timeframe:',  default: opts.timeframe || `${year} \u2014 All Time` });
  const username    = await input({ message: 'Your handle (e.g. @latentengineer_):', default: opts.username || '' });
  console.log('');
  const theme       = await select({ message: 'Visual theme:', choices: THEME_CHOICES, default: opts.theme || 'dark', pageSize: 10 });
  console.log('');
  const outputBase  = (await input({
    message: 'Output filename (no extension):',
    default: opts.output || 'stackpulse',
  })).replace(/\.(html?)$/i, '');

  // ── Generate ──────────────────────────────────────────────────────────────
  console.log(chalk.green('\n  \u2714  All done \u2014 generating your card\u2026\n'));

  // Build tool rows for the card
  // Deep merge: manual entries patch scanned data, preserving daily[] and other parser fields
  const finalAllData = { ...scanned };
  for (const [key, manual] of Object.entries(manualData)) {
    finalAllData[key] = { ...(scanned[key] || {}), ...manual };
  }
  const toolData       = [];
  const wantsBreakdown = selectedMetrics.some(mk => mk === 'tokens_used' || mk === 'cost_usd');

  for (const key of selectedKeys) {
    const meta      = AI_TOOLS.find(t => t.key === key) || { name: key, key, color: '#64748B', icon: '\u25c6' };
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
        ...meta, name: mb.displayName, parentName: meta.name,
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

  // ── Merge daily data from all tools for heatmap
  // Build per-tool heatmap entries (toolKey preserved for per-row coloring)
  // Check both finalAllData AND original scanned — daily[] can get lost in merges
  const heatmapData = [];
  for (const key of selectedKeys) {
    // Try finalAllData first, fall back to scanned, then to pristine snapshot
    let toolResult = finalAllData[key];
    let source = 'finalAllData';
    if (!toolResult || !Array.isArray(toolResult.daily) || toolResult.daily.length === 0) {
      if (scanned[key] && Array.isArray(scanned[key].daily) && scanned[key].daily.length > 0) {
        toolResult = scanned[key];
        source = 'scanned (fallback)';
      } else if (scannedSnapshot[key] && Array.isArray(scannedSnapshot[key].daily) && scannedSnapshot[key].daily.length > 0) {
        toolResult = scannedSnapshot[key];
        source = 'snapshot (fallback)';
      }
    }

    if (!toolResult || !Array.isArray(toolResult.daily) || toolResult.daily.length === 0) {
      continue;
    }
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
    cardData: {
      title: cardTitle, timeframe, username, theme, tools: toolData,
      metrics: selectedMetrics.map(k => METRICS.find(m => m.key === k)).filter(Boolean),
      heatmapData,
    },
    outputBase,
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
const program = new Command();
program
  .name('stackpulse')
  .description('Generate a shareable card for your AI coding tool stack')
  .version(PKG_VERSION)
  .option('-c, --config <file>', 'Load from YAML or JSON config file')
  .option('-o, --output <n>',    'Output base filename (no extension)', 'stackpulse')
  .option('--theme <theme>',     'Override theme')
  .option('--title <title>',     'Override card title')
  .option('--timeframe <range>', 'Override timeframe')
  .option('--username <handle>', 'Override handle')
  .option('--init [file]',       'Scaffold a starter YAML config')
  .parse(process.argv);

const opts = program.opts();

(async () => {
  printBanner();
  if (opts.init !== undefined) {
    scaffoldConfig(typeof opts.init === 'string' ? opts.init : 'ai-usage.yaml');
    process.exit(0);
  }
  const result = opts.config
    ? (console.log(chalk.dim(`  Loading config: ${opts.config}\n`)), runFromConfig(opts.config, opts))
    : await runWizard({ title: opts.title, timeframe: opts.timeframe, username: opts.username,
        theme: opts.theme, output: opts.output });
  await writeOutputs(result);
})();
