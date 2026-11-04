/**
 * src/cli/term.js
 * Terminal presentation primitives: a restrained colour palette, ANSI-aware
 * width, wrapping, and an adaptive table that falls back to a stacked layout.
 *
 * Colour rules (light and dark terminals alike):
 *   - ordinary text uses the terminal's own foreground: never white, never dim
 *   - accents are cyan / green / red / magenta, which read on both backgrounds
 *     (blue is too dark on black, yellow too pale on white)
 *   - every state also carries a symbol or word, so nothing depends on colour
 * chalk detects the terminal's colour depth and FORCE_COLOR, but on a TTY it
 * ignores NO_COLOR, so that is applied here (https://no-color.org: any
 * non-empty value disables colour; FORCE_COLOR, when set, wins).
 */
import chalk from 'chalk';

/** Colour level after NO_COLOR / FORCE_COLOR, given chalk's detected level. */
export function colorLevel(env = process.env, detected = chalk.level) {
  if (env.FORCE_COLOR !== undefined) return detected;
  if (env.NO_COLOR) return 0;
  return detected;
}
chalk.level = colorLevel();

export const ui = {
  brand:   (s) => chalk.bold.cyan(s),
  accent:  (s) => chalk.cyan(s),
  strong:  (s) => chalk.bold(s),
  ok:      (s) => chalk.green(s),
  warn:    (s) => chalk.magenta(s),
  error:   (s) => chalk.red(s),
  heading: (s) => chalk.bold(s),
};

// Symbols are distinct shapes, so success / warning / failure differ without colour.
export const sym = {
  ok:    '✓',   // ✓
  warn:  '!',
  error: '✖',   // ✖
  bullet:'·',   // ·
  dash:  '—',   // —
};

const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
export const stripAnsi = (s) => String(s).replace(ANSI_RE, '');

// East Asian wide and emoji code points occupy two columns.
function cpWidth(cp) {
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;
  if (cp >= 0x300 && cp <= 0x36f) return 0;                // combining marks
  if (cp === 0x200b || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  if ((cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x20000 && cp <= 0x3fffd)) return 2;
  return 1;
}

/** Visible column width, ignoring ANSI escape sequences. */
export function width(s) {
  let w = 0;
  for (const ch of stripAnsi(s)) w += cpWidth(ch.codePointAt(0));
  return w;
}

export const padEnd   = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)));
export const padStart = (s, n) => ' '.repeat(Math.max(0, n - width(s))) + s;

/**
 * Usable columns. Falls back to 80 when the terminal does not report a size
 * (pipes, some CI and IDE terminals report 0 or nothing).
 */
export function termColumns(stream = process.stdout) {
  const c = stream?.columns;
  if (Number.isFinite(c) && c > 0) return c;
  const env = parseInt(process.env.COLUMNS, 10);
  return Number.isFinite(env) && env > 0 ? env : 80;
}

/** Content width: the terminal minus a small margin, capped so wide screens stay readable. */
export function contentWidth(cols = termColumns(), max = 100) {
  return Math.max(20, Math.min(cols - 2, max));
}

/**
 * Word-wrap plain or styled text to `max` columns. Continuation lines get
 * `indent`. A single word longer than a line (a path, a model ID) is put on a
 * line of its own and never cut: splitting it would make it uncopyable or turn
 * one model name into what looks like two. The terminal soft-wraps it.
 */
export function wrap(text, max, indent = '') {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/ +/).filter(w => w !== '');
    let line = '';
    let first = true;
    const room = () => max - (first ? 0 : width(indent));
    const flush = () => { out.push((first ? '' : indent) + line); line = ''; first = false; };
    for (const word of words) {
      if (line && width(line) + 1 + width(word) > room()) flush();
      line = line ? line + ' ' + word : word;
    }
    if (line || words.length === 0) flush();
  }
  return out;
}

/**
 * A wrapped paragraph: every line starts with `indent`; continuation lines get
 * `hang` more (to align under text that follows a leading symbol).
 */
export function para(text, max, { indent = '  ', hang = '' } = {}) {
  const room = Math.max(10, max - width(indent));
  return wrap(text, room, hang).map(l => indent + l);
}

/**
 * Render rows as an aligned table if it fits in `max` columns, otherwise as a
 * stacked list (one block per row). Never truncates a value.
 *
 * columns: [{ key, label, align: 'left'|'right', bare }] — the first column is the row title;
 *          `bare` columns (states like "incomplete") print without their label when stacked;
 *          `attach` columns join the previous value when stacked; `gapBefore` sets the spacing
 * rows:    [{ [key]: string }]                       — values may contain ANSI
 */
export function table(columns, rows, { max = contentWidth(), indent = '  ', gap = 3 } = {}) {
  const widths = columns.map(c => Math.max(width(c.label), ...rows.map(r => width(r[c.key] ?? ''))));
  // Column i is preceded by `gapBefore` spaces (default `gap`); an empty column adds nothing.
  const gaps = columns.map((c, i) => (i === 0 || widths[i] === 0 ? 0 : c.gapBefore ?? gap));
  const total = width(indent) + widths.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0);

  if (total <= max) {
    const cell = (c, i, v) => (c.align === 'right' ? padStart(v, widths[i]) : padEnd(v, widths[i]));
    const line = (vals) => (indent + columns.map((c, i) => ' '.repeat(gaps[i]) + cell(c, i, vals[i])).join('')).replace(/\s+$/, '');
    return [
      line(columns.map(c => ui.heading(c.label))),
      indent + '─'.repeat(total - width(indent)),
      ...rows.map(r => line(columns.map(c => r[c.key] ?? ''))),
    ];
  }

  // Stacked: title on its own line, then "label value" pairs wrapped beneath it.
  const out = [];
  const inner = indent + '  ';
  for (const r of rows) {
    out.push(...wrap(ui.strong(r[columns[0].key] ?? ''), max - width(indent), indent).map((l, i) => (i ? l : indent + l)));
    const pairs = [];
    for (const c of columns.slice(1)) {
      if ((r[c.key] ?? '') === '') continue;
      // Non-breaking spaces keep each "label value" pair together when the line wraps.
      const text = (c.bare ? r[c.key] : `${c.label.toLowerCase()} ${r[c.key]}`).replace(/ /g, '\u00a0');
      if (c.attach && pairs.length) pairs[pairs.length - 1] += '\u00a0' + text;   // e.g. "cost $5.71 est."
      else pairs.push(text);
    }
    out.push(...wrap(pairs.join(` ${sym.bullet} `), max - width(inner), inner).map((l, i) => (i ? l : inner + l)));
  }
  return out;
}
