/**
 * svg.js — tiny SVG primitives shared by report styles.
 * All text goes through esc(); widths are estimated from per-font advance
 * ratios so long labels truncate instead of colliding.
 */

import { escapeHtml as esc } from '../../src/utils/html.js';
export { esc };

// Average advance width as a fraction of font-size (measured for Inter / JetBrains Mono).
const ADVANCE = { sans: 0.6, display: 0.6, mono: 0.6 };   // slightly generous: overlap is worse than slack

// Full-width scripts (CJK, Hangul, fullwidth forms) and emoji are ~1em per glyph.
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;
const EMOJI = /\p{Extended_Pictographic}/u;

export function textWidth(str, size, family = 'sans', weight = 400) {
  const boost = weight >= 700 ? 1.06 : weight >= 600 ? 1.03 : 1;
  let em = 0;
  for (const ch of String(str)) em += EMOJI.test(ch) ? 1.25 : WIDE.test(ch) ? 1.05 : ADVANCE[family] * boost;
  return em * size;
}

/** Truncate with an ellipsis so the string fits maxWidth. */
export function fit(str, maxWidth, size, family = 'sans', weight = 400) {
  const s = String(str);
  if (textWidth(s, size, family, weight) <= maxWidth) return s;
  const chars = [...s];                    // code points, so surrogate pairs are never split
  let lo = 0, hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(chars.slice(0, mid).join('') + '…', size, family, weight) <= maxWidth) lo = mid; else hi = mid - 1;
  }
  return chars.slice(0, Math.max(1, lo)).join('') + '…';
}

const FAMILY = {
  sans: "Inter, 'Inter Display', sans-serif",
  display: "'Inter Display', Inter, sans-serif",
  mono: "'JetBrains Mono', monospace",
};

export function text(x, y, str, { size = 14, family = 'sans', weight = 400, fill, anchor = 'start', tracking = 0, opacity, maxWidth } = {}) {
  const content = maxWidth ? fit(str, maxWidth, size, family, weight) : String(str);
  return `<text x="${r(x)}" y="${r(y)}" font-family="${FAMILY[family]}" font-size="${size}" font-weight="${weight}"`
    + ` fill="${fill}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}`
    + `${tracking ? ` letter-spacing="${tracking}"` : ''}${opacity != null ? ` opacity="${opacity}"` : ''}`
    + ` style="font-variant-numeric: tabular-nums">${esc(content)}</text>`;
}

export const rect = (x, y, w, h, fill, rx = 0, extra = '') =>
  `<rect x="${r(x)}" y="${r(y)}" width="${r(Math.max(0, w))}" height="${r(Math.max(0, h))}" rx="${rx}" fill="${fill}"${extra}/>`;

export const line = (x1, y1, x2, y2, stroke, width = 1) =>
  `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${stroke}" stroke-width="${width}"/>`;

/** Bar with only its data-end rounded (top), anchored flat on the baseline. */
export function columnBar(x, baseY, w, h, fill, radius = 3) {
  if (h <= 0) return '';
  const rr = Math.min(radius, h, w / 2);
  return `<path d="M${r(x)} ${r(baseY)} V${r(baseY - h + rr)} Q${r(x)} ${r(baseY - h)} ${r(x + rr)} ${r(baseY - h)}`
    + ` H${r(x + w - rr)} Q${r(x + w)} ${r(baseY - h)} ${r(x + w)} ${r(baseY - h + rr)} V${r(baseY)} Z" fill="${fill}"/>`;
}

/**
 * Segmented bar: one whole split into parts, 2px surface gaps, rounded outer ends.
 * segments: [{ pct, fill }]
 */
export function segmentedBar(x, y, w, h, segments, { gap = 2, radius = 4, id = 'seg' } = {}) {
  const usable = w - gap * (segments.length - 1);
  let cx = x, out = `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}"/></clipPath><g clip-path="url(#${id})">`;
  for (const s of segments) {
    const sw = Math.max(usable * s.pct, 2);
    out += rect(cx, y, sw, h, s.fill);
    cx += sw + gap;
  }
  return out + '</g>';
}

export const r = (n) => Math.round(n * 10) / 10;

export function svgDoc(w, h, body, { title = 'StackPulse report', bg } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">`
    + `<title>${esc(title)}</title>${bg ? rect(0, 0, w, h, bg) : ''}${body}</svg>\n`;
}
