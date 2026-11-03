// Every product claim on the site lives here, checked against the current CLI
// (index.js AI_TOOLS, parsers/, src/collectors/ccusage.js, README).
// Keep it honest: what a tool reports depends on what that tool records locally.

import claudeCode from './assets/tools/claude-code.svg';
import codex from './assets/tools/codex.png';
import cursor from './assets/tools/cursor.svg';
import cursorDark from './assets/tools/cursor-dark.svg';
import geminiCli from './assets/tools/gemini-cli.png';
import opencode from './assets/tools/opencode.svg';
import opencodeDark from './assets/tools/opencode-dark.svg';
import amp from './assets/tools/amp.svg';
import pi from './assets/tools/pi.svg';
import qwen from './assets/tools/qwen-code.svg';
import kimi from './assets/tools/kimi.png';
import antigravity from './assets/tools/antigravity.svg';
import rooCode from './assets/tools/roo-code.png';
import kiloCode from './assets/tools/kilo-code.svg';
import aider from './assets/tools/aider.png';

export const COMMAND = 'npx stackpulse';
export const NPM_URL = 'https://www.npmjs.com/package/stackpulse';
export const GITHUB_URL = 'https://github.com/KrishnaSathvik/stackpulse';

// Header links. The landing page already shows the sections, so the header only links to docs.
export const NAV = [
  { label: 'Docs', href: '/docs/' },
];

const FULL = 'Sessions, tokens, estimated cost and models';

// The 13 integrations the CLI scans for. `bleed`: the icon is already an app tile.
export const TOOLS = [
  { name: 'Claude Code', reports: FULL, icon: claudeCode },
  { name: 'OpenAI Codex', reports: FULL, icon: codex, bleed: true },
  { name: 'Cursor', reports: 'Composer sessions and activity', icon: cursor, iconDark: cursorDark },
  { name: 'Gemini CLI', reports: FULL, icon: geminiCli },
  { name: 'OpenCode', reports: FULL, icon: opencode, iconDark: opencodeDark },
  { name: 'Amp', reports: FULL, icon: amp, bleed: true },
  { name: 'Pi Agent', reports: FULL, icon: pi },
  { name: 'Qwen Code', reports: FULL, icon: qwen },
  { name: 'Kimi CLI', reports: FULL, icon: kimi, bleed: true, note: 'Kimi CLI and Kimi Code' },
  { name: 'Antigravity', reports: FULL, icon: antigravity },
  { name: 'Roo Code', reports: 'Tasks, tokens and recorded cost', icon: rooCode, bleed: true },
  { name: 'Kilo Code', reports: 'Sessions, tokens and recorded cost', icon: kiloCode, bleed: true },
  { name: 'Aider', reports: 'Sessions, AI-attributed commits and lines', icon: aider, bleed: true },
];

export const FEATURES = [
  { icon: 'radar', title: 'Auto-detect supported tools',
    text: 'Finds the AI coding tools on your machine and the usage records they already keep.' },
  { icon: 'chart', title: 'Track available usage metrics',
    text: 'Sessions, tokens, estimated cost, lines and commits — whatever each tool records.' },
  { icon: 'branches', title: 'Understand models and activity',
    text: 'See usage split by model, and when you actually work, day by day.' },
  { icon: 'file', title: 'Generate visual reports',
    text: 'One self-contained HTML report you can open, keep and share.' },
];

// Report themes, in the order the CLI offers them. `bg` is sampled from the real
// report; `glow` tints the website's preview stage.
export const REPORT_THEMES = [
  { key: 'dark', name: 'Dark', vibe: 'Terminal noir', bg: '#111113', glow: '#64748b' },
  { key: 'light', name: 'Light', vibe: 'Clean minimal', bg: '#ffffff', glow: '#0891b2' },
  { key: 'cosmic', name: 'Cosmic', vibe: 'Deep space', bg: '#090f1f', glow: '#6366f1' },
  { key: 'forge', name: 'Forge', vibe: 'Amber heat', bg: '#160e03', glow: '#f59e0b' },
  { key: 'arctic', name: 'Arctic', vibe: 'Ice blue', bg: '#ffffff', glow: '#38bdf8' },
  { key: 'verdant', name: 'Verdant', vibe: 'Forest green', bg: '#08120a', glow: '#22c55e' },
  { key: 'neon', name: 'Neon', vibe: 'Pink synthwave', bg: '#140121', glow: '#ec4899' },
];

// What a few tools record, for the "metrics" feature (from TOOLS above).
export const METRIC_EXAMPLES = [
  { tool: 'Claude Code', metrics: ['Sessions', 'Tokens', 'Est. cost', 'Models'] },
  { tool: 'Cursor', metrics: ['Composer sessions'] },
  { tool: 'Roo Code', metrics: ['Tasks', 'Tokens', 'Recorded cost'] },
  { tool: 'Aider', metrics: ['Sessions', 'AI commits', 'Lines'] },
];

// Where StackPulse reads from (demo-home paths, the same ones the tools use).
export const LOCAL_FILES = [
  { path: '~/.claude/projects/', tool: 'Claude Code' },
  { path: '~/.codex/sessions/', tool: 'Codex' },
  { path: '~/.gemini/tmp/', tool: 'Gemini CLI' },
  { path: '…/Cursor/User/globalStorage/state.vscdb', tool: 'Cursor' },
];

// Output of `npx stackpulse --init stackpulse.yaml` (placeholder values).
export const CONFIG_YAML = `title: My AI Coding Stack
timeframe: 2026 — All Time
username: yourhandle
theme: dark
metrics:
  - sessions
  - tokens_used
  - cost_usd
  - commits
tools:
  claude_code:
    sessions: 312
    tokens_used: 23500
    cost_usd: 180
    commits: 42
  codex:
    sessions: 88
    tokens_used: 605400
    cost_usd: 0
  cursor:
    sessions: 540
    cost_usd: 240
  gemini:
    sessions: 200
    tokens_used: 8400
  aider:
    sessions: 55
    commits: 88
    lines_written: 9400`;

// METRICS and AI_TOOLS keys in the CLI's index.js.
export const METRIC_KEYS = [
  ['sessions', 'Sessions', 'Number of sessions or conversations'],
  ['tokens_used', 'Tokens Used', 'In thousands — 1500 means 1.5M'],
  ['cost_usd', 'Cost', 'US dollars, e.g. 14.50'],
  ['lines_written', 'Lines Written', 'Lines of code written by AI'],
  ['commits', 'AI Commits', 'Git commits attributed to AI'],
  ['hours_saved', 'Hours Saved', 'Estimated hours saved'],
  ['files_edited', 'Files Edited', 'Files edited by AI'],
  ['bugs_fixed', 'Bugs Fixed', 'Bugs resolved with AI help'],
];
export const TOOL_KEYS = ['claude_code', 'codex', 'opencode', 'amp', 'pi', 'gemini', 'qwen', 'kimi', 'cursor', 'antigravity', 'roocode', 'kilocode', 'aider'];

export const DOCS = {
  commands: [
    { cmd: 'npx stackpulse', text: 'Scan your tools and build a report interactively.' },
    { cmd: 'npx stackpulse --init stackpulse.yaml', text: 'Create a starter config file to fill in by hand.' },
    { cmd: 'npx stackpulse --config stackpulse.yaml', text: 'Build a report from a YAML or JSON config, no prompts.' },
    { cmd: 'npx stackpulse -c stackpulse.yaml -o my-card', text: 'Choose the output file name (my-card.html).' },
  ],
  flags: [
    ['-o, --output <name>', 'Output file name without extension (default: stackpulse)'],
    ['--theme <name>', 'dark, light, cosmic, forge, arctic, verdant or neon'],
    ['--title <text>', 'Card title'],
    ['--timeframe <text>', 'Timeframe label, e.g. "2026 — All Time"'],
    ['--username <handle>', 'Handle shown on the card'],
  ],
  requirements: [
    'Node.js 20.12 or newer (22.13+ recommended).',
    'Cursor, Roo Code and Kilo Code are read from SQLite: built into Node 22.5+, or the sqlite3 command-line tool on Node 20.',
    'Verified on macOS and Linux. Windows is not verified.',
  ],
  privacy: [
    'StackPulse reads the usage files your tools already keep on your disk.',
    'No account, sign-up or API keys. Nothing is uploaded.',
    'The report is a single HTML file saved where you choose.',
    'Running it with npx downloads the package from npm. When opened, the report loads its fonts from Google Fonts.',
  ],
};
