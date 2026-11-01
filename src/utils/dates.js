/**
 * src/utils/dates.js
 * Calendar-date helpers that stay in the user's local timezone.
 * `toISOString().slice(0, 10)` converts to UTC first and shifts dates by a day
 * for anyone east or west of UTC near midnight; use these instead.
 */

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
export function localDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Normalize a collector date ("2026-02-02", "20260202", "Feb 02, 2026") to YYYY-MM-DD. */
export function normalizeDate(value) {
  if (value == null) return null;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return localDate(new Date(s));
}
