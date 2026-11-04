#!/usr/bin/env node
process.removeAllListeners('warning');

import { checkbox, confirm, input, select, Separator } from '@inquirer/prompts';
import ora from 'ora';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { Command } from 'commander';
import { generateHTML } from './generator.js';
import { parseEnteredCost } from './src/core/cost.js';
import {
  AI_TOOLS, METRICS, THEMES, THEME_KEYS, toolMeta, defaultTitle, defaultTimeframe,
  smartDefaultMetrics, snapshotScan, mergeData, metricsNeedingInput, applyMetricTotal, buildCardData,
} from './src/cli/card.js';
import { ui, sym, para, contentWidth } from './src/cli/term.js';
import * as screens from './src/cli/screens.js';
import { openFile, openHint } from './src/cli/open.js';
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

export { AI_TOOLS, METRICS };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8')).version;

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

// ─── Output helpers ───────────────────────────────────────────────────────────
const max = () => contentWidth();
const print = (lines = ['']) => { for (const l of [].concat(lines)) console.log(l); };
const gap = () => console.log('');

/**
 * Prompt theme: Inquirer's defaults use a dark-blue "?" and dim gray help text,
 * which disappear on light or dark backgrounds respectively. Keep help in the
 * terminal's own foreground; the cursor (❯) and checkbox shapes carry state.
 */
const promptTheme = {
  prefix: { idle: ui.accent('?'), done: ui.ok(sym.ok) },
  style: {
    help: (t) => t,
    defaultAnswer: (t) => `(${t})`,
    description: (t) => t,
    disabled: (t) => t,
    keysHelpTip: (keys) => keys.map(([key, action]) => `${key} ${action}`).join(` ${sym.bullet} `),
  },
};
const ask = {
  select:   (o) => select({ theme: promptTheme, ...o }),
  checkbox: (o) => checkbox({ theme: promptTheme, ...o }),
  input:    (o) => input({ theme: promptTheme, ...o }),
  confirm:  (o) => confirm({ theme: promptTheme, ...o }),
};

function fail(message) {
  // Not wrapped: scripts match on error text, and the terminal soft-wraps it anyway.
  console.error(`\n  ${ui.error(sym.error)} ${message}\n`);
  process.exit(1);
}

const firstLine = (s) => String(s ?? '').split('\n').map(l => l.trim()).find(Boolean) || '';

// ─── Scan ─────────────────────────────────────────────────────────────────────
async function scanMachine() {
  const results = {}, failed = {}, empty = [], missing = [], detected = [];
  for (const t of AI_TOOLS) {
    let found = false;
    try { found = !!DETECTORS[t.key](); } catch {}
    (found ? detected : missing).push(t.key);
  }

  // ora loops forever clearing lines when a TTY reports 0 columns (some CI/IDE terminals).
  // Dumb terminals and CI cannot redraw a line either; they get one plain status line.
  const spinnerOk = !!process.stderr.isTTY && (process.stderr.columns || 0) > 0
    && process.env.TERM !== 'dumb' && !process.env.CI;
  const label = (done) => `Scanning ${AI_TOOLS.length} supported tools` +
    (detected.length ? ` ${sym.bullet} reading ${done} of ${detected.length} found` : '');
  const spinner = ora({ text: label(0), isEnabled: spinnerOk, discardStdin: false });
  if (spinnerOk) spinner.start(); else print(`  Scanning ${AI_TOOLS.length} supported tools…`);

  let done = 0;
  await Promise.allSettled(detected.map(async (key) => {
    try {
      const data = await PARSERS[key]();
      if (data && (data.sessions || data.tokens_used || data.commits)) results[key] = data;
      else empty.push(key);
    } catch (err) {
      failed[key] = firstLine(err?.message) || 'unknown error';
    } finally {
      spinner.text = label(++done);
    }
  }));
  spinner.stop();
  return { results, failed, empty, missing };
}

// ─── Default report ───────────────────────────────────────────────────────────
function defaultDetails(opts) {
  return {
    title: opts.title || defaultTitle(),
    timeframe: opts.timeframe || defaultTimeframe(),
    username: opts.username || '',
    theme: opts.theme || 'dark',
  };
}

/** The report a user gets by accepting every default: all tools with data, every metric they have. */
function defaultReport(scan, opts) {
  const scanned = { ...scan.results };
  const selectedKeys = screens.orderTools(Object.keys(scanned));
  return {
    cardData: buildCardData({
      scanned, scannedSnapshot: snapshotScan(scanned), manualData: {},
      selectedKeys, selectedMetrics: smartDefaultMetrics(scanned), details: defaultDetails(opts),
    }),
    outputBase: opts.output || 'stackpulse',
  };
}

// ─── Customize ────────────────────────────────────────────────────────────────
const numberOrBlank = (v) => v.trim() === '' || /^\d+(\.\d+)?$/.test(v.trim().replace(/,/g, '')) || 'Enter a number, or leave it blank if unknown.';
const toNumber = (raw, float = false) => {
  const s = String(raw).trim().replace(/,/g, '');
  if (s === '') return null;
  return float ? Number(s) : parseInt(s, 10);
};

async function customize(scan, opts) {
  const scanned = { ...scan.results };
  const scannedSnapshot = snapshotScan(scanned);
  const withData = screens.orderTools(Object.keys(scanned));
  const installed = screens.orderTools([...scan.empty, ...Object.keys(scan.failed)]);
  const others = AI_TOOLS.filter(t => !withData.includes(t.key) && !installed.includes(t.key));

  // ── Tools ──
  const choices = [
    ...withData.map(k => ({ name: toolMeta(k).name, value: k, checked: true, description: 'Data found on this machine' })),
    ...installed.map(k => ({ name: `${toolMeta(k).name} (enter numbers)`, value: k, checked: false,
      description: scan.failed[k] ? `Could not be read: ${scan.failed[k]}` : 'Installed, but no usage was found' })),
    ...(others.length ? [new Separator(`${sym.dash} Not detected: add and enter numbers yourself`)] : []),
    ...others.map(t => ({ name: t.name, value: t.key, checked: false, description: 'Not found on this machine' })),
  ];
  gap();
  const selectedKeys = await ask.checkbox({
    message: 'Tools to include',
    choices, pageSize: Math.min(choices.length, 16), loop: false,
    validate: v => v.length > 0 || 'Select at least one tool.',
  });

  // ── Numbers for tools without local data ──
  const manualData = {};
  for (const key of selectedKeys.filter(k => !scanned[k])) {
    const tool = toolMeta(key);
    gap();
    print(para(`${ui.strong(tool.name)}: enter what you know. Leave a field blank if unknown.`, max(), { indent: '' }));
    const entry = {};
    const sessions = toNumber(await ask.input({ message: 'Sessions', validate: numberOrBlank }));
    if (sessions != null) entry.sessions = sessions;
    if (tool.hasTokens) {
      const tokens = toNumber(await ask.input({ message: 'Tokens used, in thousands (1500 = 1.5M)', validate: numberOrBlank }));
      if (tokens != null) entry.tokens_used = tokens;
    }
    if (tool.hasCost) {
      const cost = parseEnteredCost(String(await ask.input({ message: 'Cost in USD (0 is free; blank is unknown)', validate: numberOrBlank })).replace(/,/g, ''));
      if (cost != null) entry.cost_usd = cost;
    }
    if (key === 'aider') {
      const commits = toNumber(await ask.input({ message: 'Git commits', validate: numberOrBlank }));
      if (commits != null) entry.commits = commits;
    }
    if (Object.keys(entry).length) manualData[key] = entry;
  }

  // ── Metrics ──
  const allData = mergeData(scanned, manualData);
  const defaults = smartDefaultMetrics(scanned, manualData);
  gap();
  const selectedMetrics = await ask.checkbox({
    message: 'Metrics to show',
    choices: METRICS.map(m => {
      const hasData = Object.values(allData).some(d => d?.[m.key] > 0);
      return { name: hasData ? m.label : `${m.label} (enter a total)`, value: m.key, checked: defaults.includes(m.key),
        description: hasData ? 'Available from your data' : `No tool reports this; you can enter a total (${m.hint})` };
    }),
    pageSize: METRICS.length, loop: false,
    validate: v => v.length > 0 || 'Pick at least one metric.',
  });

  const needInput = metricsNeedingInput(selectedMetrics, allData);
  if (needInput.length) {
    gap();
    print(para('Totals for metrics no tool reports. Leave blank if unknown.', max(), { indent: '' }));
    for (const mk of needInput) {
      const m = METRICS.find(x => x.key === mk);
      const raw = await ask.input({ message: `${m.label} (${m.hint})`, validate: numberOrBlank });
      const val = mk === 'cost_usd' ? parseEnteredCost(String(raw).replace(/,/g, '')) : toNumber(raw);
      applyMetricTotal({ scanned, manualData, allData, selectedKeys }, mk, val);
    }
  }

  // ── Report details ──
  const base = defaultDetails(opts);
  gap();
  const theme = await ask.select({
    message: 'Theme', default: base.theme, pageSize: THEMES.length, loop: false,
    choices: THEMES.map(t => ({ name: `${t.label.padEnd(8)} ${t.hint}`, short: t.label, value: t.value })),
  });
  const title     = await ask.input({ message: 'Title', default: base.title });
  const timeframe = await ask.input({ message: 'Timeframe label', default: base.timeframe });
  const username  = await ask.input({ message: 'Handle (optional, e.g. @you)', default: base.username });
  const outputBase = (await ask.input({
    message: 'Output file name', default: opts.output || 'stackpulse',
    validate: v => v.trim() !== '' || 'Enter a file name.',
  })).trim().replace(/\.(html?)$/i, '');
  const open = opts.open || await ask.confirm({ message: 'Open the report in your browser when it is ready?', default: false });

  return {
    cardData: buildCardData({ scanned, scannedSnapshot, manualData, selectedKeys, selectedMetrics,
      details: { title, timeframe, username, theme } }),
    outputBase, open,
  };
}

// ─── Details view ─────────────────────────────────────────────────────────────
function printAllDetails(scan) {
  for (const k of screens.orderTools(Object.keys(scan.results))) { gap(); print(screens.toolDetails(k, scan.results[k], { max: max() })); }
  gap(); print(screens.detectionDetails(scan, { max: max() }));
}

async function detailsMenu(scan) {
  const keys = screens.orderTools(Object.keys(scan.results));
  for (;;) {
    gap();
    const pick = await ask.select({
      message: 'Show details for',
      loop: false, pageSize: keys.length + 3,
      choices: [
        ...keys.map(k => {
          const n = scan.results[k].modelBreakdown?.length || 0;
          return { name: toolMeta(k).name, value: k, description: n ? `Token types and ${n} ${n === 1 ? 'model' : 'models'}` : 'Sessions only' };
        }),
        { name: `Detection results (all ${AI_TOOLS.length} tools)`, value: '#detect' },
        { name: 'Back', value: '#back' },
      ],
    });
    if (pick === '#back') return;
    gap();
    print(pick === '#detect' ? screens.detectionDetails(scan, { max: max() }) : screens.toolDetails(pick, scan.results[pick], { max: max() }));
  }
}

// ─── Main flow ────────────────────────────────────────────────────────────────
async function runInteractive(scan, opts) {
  const hasData = Object.keys(scan.results).length > 0;
  const file = `${opts.output || 'stackpulse'}.html`;
  for (;;) {
    gap();
    const action = await ask.select({
      message: 'What would you like to do?',
      loop: false,
      choices: [
        ...(hasData ? [
          { name: 'Generate report', value: 'generate', description: `${defaultDetails(opts).theme} theme, all detected tools ${sym.bullet} saves ${file}` },
          { name: 'Generate and open in browser', value: 'generate-open', description: `Same report, then opens ${file}` },
        ] : []),
        { name: 'Customize report', value: 'customize', description: 'Choose tools, metrics, theme, title, handle and file name' },
        ...(hasData ? [{ name: 'View details', value: 'details', description: 'Token types, models and detection results' }] : []),
        { name: 'Exit', value: 'exit', description: 'Leave without writing a report' },
      ],
    });
    if (action === 'exit') { gap(); print('  No report was written.'); gap(); return null; }
    if (action === 'details') { await detailsMenu(scan); continue; }
    if (action === 'customize') return customize(scan, opts);
    return { ...defaultReport(scan, opts), open: opts.open || action === 'generate-open' };
  }
}

async function writeReport({ cardData, outputBase, open }) {
  const htmlPath = path.resolve(`${outputBase}.html`);
  try {
    fs.writeFileSync(htmlPath, generateHTML(cardData), 'utf-8');
  } catch (err) {
    fail(`Could not write ${htmlPath}: ${err.code === 'ENOENT' ? 'the folder does not exist' : err.code === 'EACCES' ? 'permission denied' : firstLine(err.message)}`);
  }
  const rel = path.relative(process.cwd(), htmlPath);
  const displayPath = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : htmlPath;

  gap();
  print(screens.completion({ htmlPath, displayPath, theme: cardData.theme, cardData, openHint: open ? null : openHint(displayPath) }, { max: max() }));
  if (open) {
    const r = await openFile(htmlPath);
    gap();
    print(r.ok
      ? para(`${ui.ok(sym.ok)} Sent to your default browser.`, max())
      : para(`${ui.warn(sym.warn)} Could not open the report (${r.reason}). Open ${displayPath} yourself.`, max(), { hang: '  ' }));
  }
  gap();
}

// ─── Config file mode ─────────────────────────────────────────────────────────
function loadConfig(filePath) {
  const kind = path.extname(filePath).toLowerCase().startsWith('.y') ? 'YAML' : 'JSON';
  let content, cfg;
  try { content = fs.readFileSync(filePath, 'utf-8'); }
  catch (err) { fail(`Cannot read config file ${filePath}: ${err.code === 'ENOENT' ? 'file not found' : err.message}`); }
  try { cfg = kind === 'YAML' ? yaml.load(content) : JSON.parse(content); }
  catch (err) { fail(`Config file ${filePath} is not valid ${kind}: ${String(err.message).split('\n')[0]}`); }
  if (cfg == null || typeof cfg !== 'object' || Array.isArray(cfg)) fail(`Config file ${filePath} must contain a mapping of settings (title, theme, metrics, tools).`);
  return cfg;
}

function runFromConfig(configPath, opts) {
  const cfg  = loadConfig(configPath);
  // Command-line flags override the file, as --help documents.
  for (const k of ['title', 'timeframe', 'username', 'theme']) if (opts[k] !== undefined) cfg[k] = opts[k];
  if (cfg.theme !== undefined && !THEME_KEYS.includes(cfg.theme)) fail(`Unknown theme "${cfg.theme}" in ${configPath}. Choose one of: ${THEME_KEYS.join(', ')}.`);
  const keys = Object.keys(cfg.tools || {});
  const mets = cfg.metrics || ['sessions', 'tokens_used', 'cost_usd'];
  const toolData = keys.map(key => {
    const meta = toolMeta(key);
    const src  = cfg.tools[key];
    return { ...meta, name: src.name || meta.name, color: src.color || meta.color,
      metrics: mets.reduce((a, mk) => { a[mk] = src[mk] ?? null; return a; }, {}) };
  });
  return {
    cardData: {
      title:     cfg.title     || defaultTitle(),
      timeframe: cfg.timeframe || defaultTimeframe(),
      username:  cfg.username  || '',
      theme:     cfg.theme     || 'dark',
      tools:     toolData,
      metrics:   mets.map(k => METRICS.find(m => m.key === k)).filter(Boolean),
    },
    outputBase: opts.output || 'stackpulse',
    open: !!opts.open,
  };
}

function scaffoldConfig(outPath) {
  const tmpl = {
    title: defaultTitle(), timeframe: defaultTimeframe(),
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
  try {
    fs.writeFileSync(outPath, ext.startsWith('.y') ? yaml.dump(tmpl, { indent: 2 }) : JSON.stringify(tmpl, null, 2), 'utf-8');
  } catch (err) {
    fail(`Could not write ${outPath}: ${firstLine(err.message)}`);
  }
  gap();
  print([`${ui.ok(sym.ok)} Created ${ui.accent(outPath)}`, '', ...para(`Edit the values, then run: stackpulse --config ${outPath}`, max())]);
  gap();
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
const program = new Command();
program
  .name('stackpulse')
  .description('Generate an HTML report of your AI coding tool usage')
  .version(PKG_VERSION)
  .option('-c, --config <file>', 'Load from YAML or JSON config file')
  .option('-o, --output <n>',    'Output base filename (no extension)', 'stackpulse')
  .option('--theme <theme>',     `Override theme (${THEME_KEYS.join(', ')})`)
  .option('--title <title>',     'Override card title')
  .option('--timeframe <range>', 'Override timeframe')
  .option('--username <handle>', 'Override handle')
  .option('--init [file]',       'Scaffold a starter YAML config')
  .option('-y, --yes',           'Generate with defaults, without prompts')
  .option('--open',              'Open the report in your browser when done')
  .option('--details',           'Print token types, models and detection results after the scan')
  .parse(process.argv);

const opts = program.opts();
if (opts.theme !== undefined && !THEME_KEYS.includes(opts.theme)) {
  console.error(`error: unknown theme '${opts.theme}'. Choose one of: ${THEME_KEYS.join(', ')}`);
  process.exit(1);
}

const isCancel = (err) => err?.name === 'ExitPromptError' || err?.name === 'AbortPromptError';

(async () => {
  gap();
  print(screens.header(PKG_VERSION, { max: max() }));
  if (opts.init !== undefined) {
    scaffoldConfig(typeof opts.init === 'string' ? opts.init : 'ai-usage.yaml');
    return;
  }
  if (opts.config) {
    gap();
    print(`  Loading config: ${opts.config}`);
    await writeReport(runFromConfig(opts.config, opts));
    return;
  }

  gap();
  const scan = await scanMachine();
  print(screens.scanSummary(scan, { max: max() }));
  if (opts.details) printAllDetails(scan);

  const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY && !opts.yes;
  let result;
  if (interactive) {
    result = await runInteractive(scan, opts);
    if (!result) return;
  } else {
    if (!Object.keys(scan.results).length) {
      fail('No usage data was found, so there is nothing to report. Run stackpulse in a terminal to enter numbers, or use --init and --config.');
    }
    gap();
    if (!opts.yes) print(para('Not an interactive terminal: generating the report with defaults. Use --config for full control.', max()));
    result = { ...defaultReport(scan, opts), open: !!opts.open };
  }
  await writeReport(result);
})().catch((err) => {
  if (isCancel(err)) {
    console.log(`\n\n  Cancelled. No report was written.\n`);
    process.exit(130);
  }
  fail(firstLine(err?.message) || String(err));
});
