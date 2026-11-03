/**
 * src/models/catalog.js
 * Display names for model IDs discovered in local session data.
 *
 * Discovery is data-driven: whatever ID a tool recorded is kept verbatim as
 * `model`. This module only derives a friendlier label when the ID matches a
 * recognised family pattern (Claude Opus/Sonnet/Haiku, GPT-n, o-series), so
 * new versions of known families render without code changes. Anything else
 * is shown exactly as recorded — an unrecognised ID is never relabelled as if
 * we knew what it was.
 */

const DATE_SUFFIX = /-(\d{8}|\d{4}-\d{2}-\d{2})$/;

// Suffix words we can name confidently within a recognised family.
const SUFFIX_WORDS = {
  codex: 'Codex', mini: 'Mini', nano: 'Nano', pro: 'Pro', max: 'Max', turbo: 'Turbo', high: 'High', low: 'Low',
};

const suffixLabel = (parts) => {
  const words = parts.split('-').filter(Boolean);
  return words.every(w => SUFFIX_WORDS[w]) ? words.map(w => SUFFIX_WORDS[w]) : null;
};

const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

const RULES = [
  // claude-opus-4-6, claude-sonnet-4-5-20250929, claude-haiku-4-5, claude-opus-4
  [/^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?$/,
    (m) => `${cap(m[1])} ${m[2]}${m[3] ? '.' + m[3] : ''}`],
  // claude-3-5-sonnet, claude-3-opus
  [/^claude-(\d+)(?:-(\d{1,2}))?-(opus|sonnet|haiku)$/,
    (m) => `${cap(m[3])} ${m[1]}${m[2] ? '.' + m[2] : ''}`],
  // gpt-5, gpt-5.5-codex-max, gpt-4o-mini, gpt-4.1
  [/^gpt-(\d+(?:\.\d+)?o?)((?:-[a-z]+)*)$/,
    (m) => { const s = suffixLabel(m[2]); return s ? ['GPT-' + m[1], ...s].join(' ') : null; }],
  // o3, o4-mini, o1-pro
  [/^(o\d)((?:-[a-z]+)*)$/,
    (m) => { const s = suffixLabel(m[2]); return s ? [m[1], ...s].join(' ') : null; }],
];

/** True when the ID matches a recognised family pattern. */
export function isRecognizedModel(id) {
  return displayModelName(id) !== id && typeof id === 'string' && id !== '';
}

/**
 * @param {string|null|undefined} id raw model identifier from the source
 * @returns {string} friendly label for recognised families, otherwise the raw ID
 */
export function displayModelName(id) {
  if (!id || typeof id !== 'string') return 'Unknown model';
  // Provider prefixes ("anthropic/claude-…") are dropped only when the rest is recognised.
  const bare = id.split('/').pop().replace(DATE_SUFFIX, '');
  for (const [re, fmt] of RULES) {
    const m = bare.match(re);
    if (!m) continue;
    const label = fmt(m);
    if (label) return label;
  }
  return id;
}
