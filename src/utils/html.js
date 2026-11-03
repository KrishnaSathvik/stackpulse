/**
 * src/utils/html.js
 * Escaping for every value interpolated into generated HTML/SVG.
 * Card text comes from local session data, config files and prompts, so all of
 * it is treated as untrusted.
 */

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** Escape for both element content and quoted attribute values. */
export function escapeHtml(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"'`]/g, ch => ENTITIES[ch]);
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const NAMED = /^[a-z]{3,20}$/i;                                   // CSS named colours (letters only)
const FUNC = /^(?:rgb|rgba|hsl|hsla)\(\s*[\d.]+%?(?:\s*[,\s/]\s*[\d.]+%?){2,3}\s*\)$/i;

/**
 * Allow colour syntaxes 3.x configs used (hex, named, rgb()/hsl() with numeric
 * arguments). Nothing that can carry `;`, `url(`, quotes or `<` gets through.
 */
export function safeColor(value, fallback = '#64748B') {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  return HEX.test(v) || NAMED.test(v) || FUNC.test(v) ? v : fallback;
}
