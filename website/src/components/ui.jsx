import { useCallback, useEffect, useRef, useState } from 'react';
import capture from '../data/terminal-capture.json';
import sizes from '../data/shot-sizes.json';

// ── Screenshot assets (real StackPulse output, see scripts/) ────────────────
const SHOT_URLS = import.meta.glob('../assets/shots/*.webp', { eager: true, import: 'default' });
export function shot(name) {
  const src = SHOT_URLS[`../assets/shots/${name}.webp`];
  const [width, height] = sizes[name] || [];
  return { src, width, height };
}
export function Shot({ name, alt, eager = false, ...rest }) {
  const s = shot(name);
  return <img src={s.src} width={s.width} height={s.height} alt={alt}
    loading={eager ? 'eager' : 'lazy'} decoding="async" fetchPriority={eager ? 'high' : undefined} {...rest} />;
}

// ── Theme (site light/dark; independent of report themes) ───────────────────
export function useSiteTheme() {
  const [theme, setTheme] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#ffffff');
    try { localStorage.setItem('sp-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);
  useEffect(() => {   // enable colour transitions only after first paint (no flash on load)
    const id = requestAnimationFrame(() => document.documentElement.classList.add('theme-ready'));
    return () => cancelAnimationFrame(id);
  }, []);
  return [theme, useCallback(() => setTheme(t => (t === 'dark' ? 'light' : 'dark')), [])];
}

// ── Reveal on scroll (one-shot, respects reduced motion via CSS) ────────────
export function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// ── Icons (stroke icons drawn for this site) ────────────────────────────────
const PATHS = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  checkCircle: <><circle cx="12" cy="12" r="9.5" /><path d="m7.5 12.3 3 3 6-6.3" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  zoom: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5" /></>,
  radar: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 12 18.5 5.5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  branches: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="12" r="2" /><path d="M6 7v10M6 12h7a3 3 0 0 0 3-3V9" /></>,
  grid: <><rect x="3.5" y="3.5" width="5" height="5" rx="1.2" /><rect x="9.5" y="3.5" width="5" height="5" rx="1.2" /><rect x="15.5" y="3.5" width="5" height="5" rx="1.2" /><rect x="3.5" y="9.5" width="5" height="5" rx="1.2" /><rect x="9.5" y="9.5" width="5" height="5" rx="1.2" /><rect x="3.5" y="15.5" width="5" height="5" rx="1.2" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  html: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="m10 12-2 2 2 2M14 12l2 2-2 2" /></>,
  print: <><path d="M7 9V3h10v6" /><rect x="3.5" y="9" width="17" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  chart: <><path d="M4 20h16" /><path d="M7 16v-4M12 16V7M17 16v-6" /></>,
  terminal: <><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="m7 9.5 3 2.5-3 2.5M12.5 15H17" /></>,
  donut: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" /><path d="M12 3.5v5M20.5 12h-5" /></>,
  expand: <><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" /></>,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  sliders: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  npm: <path d="M3 8h18v8h-9v1.5H8V16H3V8Zm2 1.8v4.4h2v-3h1.5v3H10V9.8H5Zm6 0v5.9h2v-1.5h2.5V9.8H11Zm2 1.5h1v1.4h-1v-1.4Zm4-1.5v4.4h1.5v-3H20v3h.5V9.8H17Z" />,
  github: <path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.7-.2.7-.5v-1.7c-2.7.6-3.3-1.2-3.3-1.2-.4-1.1-1-1.4-1-1.4-.9-.6 0-.6 0-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1 2.9.8.1-.6.3-1 .6-1.3-2.1-.2-4.3-1-4.3-4.7 0-1 .4-1.9 1-2.6-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 0 1 4.8 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.6 1 2.6 0 3.7-2.2 4.5-4.3 4.7.3.3.6.9.6 1.8v2.6c0 .3.2.6.7.5A9.5 9.5 0 0 0 12 2.5Z" />,
};
const FILLED = new Set(['npm', 'github']);
export function Icon({ name, size = 20, ...rest }) {
  const filled = FILLED.has(name);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'}
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {PATHS[name]}
    </svg>
  );
}

// ── Brand mark: public/logo-mark.png, a tight transparent crop of public/logo.png ─
export function Logo({ size = 28 }) {
  return <img className="brand__mark" src="/logo-mark.png" width={size} height={size} alt="" decoding="async" />;
}

// ── Copy-to-clipboard command ───────────────────────────────────────────────
export function CommandCopy({ command, id }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(command); }
    catch {   // older browsers / insecure contexts
      const ta = Object.assign(document.createElement('textarea'), { value: command });
      ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="command">
      <span className="command__prompt" aria-hidden="true">$</span>
      <code className="command__text" id={id}>{command}</code>
      <button type="button" className={`command__btn${copied ? ' is-copied' : ''}`} onClick={copy}
        aria-label={copied ? 'Copied to clipboard' : `Copy command: ${command}`}>
        <Icon name={copied ? 'check' : 'copy'} size={16} />
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
      <span className="sr-only" aria-live="polite">{copied ? 'Command copied' : ''}</span>
    </div>
  );
}

// ── Terminal: replays real CLI screens captured through a terminal emulator ─
export function Terminal({ part, from = 0, command = 'npx stackpulse', title = 'zsh — stackpulse', className = '', label }) {
  const lines = capture[part].slice(from);
  return (
    <figure className={`terminal ${className}`} aria-label={label} style={{ margin: 0 }}>
      <div className="terminal__bar"><span className="dots" aria-hidden="true"><i /><i /><i /></span><span className="terminal__title">{title}</span></div>
      <pre className="terminal__body">
        {command && <div className="terminal__cmd"><b>~/Projects</b> $ {command}</div>}
        {lines.map((spans, i) => (
          <div key={i}>{spans.length ? spans.map((s, j) =>
            <span key={j} className={`t-${s.c}${s.b ? ' t-bold' : ''}`}>{s.t}</span>) : ' '}</div>
        ))}
      </pre>
    </figure>
  );
}

export function Browser({ url, children, className = '' }) {
  return (
    <div className={`window browser ${className}`}>
      <div className="window__bar"><span className="dots" aria-hidden="true"><i /><i /><i /></span><span className="window__url">{url}</span></div>
      {children}
    </div>
  );
}

// ── Signature motif: a field of activity cells, like the report's heatmap ───
// Deterministic (seeded), denser towards `bias` ('right' | 'center').
function seeded(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function CellField({ cols = 36, rows = 12, cell = 14, gap = 5, seed = 7, bias = 'right', className = '' }) {
  const rand = seeded(seed);
  const rects = [];
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
    const x = c / (cols - 1);
    const w = bias === 'right' ? x * x : 1 - Math.abs(x - 0.5) * 1.6;
    const v = rand() * (0.35 + w);
    const level = v > 1.05 ? 4 : v > 0.8 ? 3 : v > 0.55 ? 2 : v > 0.3 ? 1 : 0;
    rects.push(<rect key={`${c}-${r}`} x={c * (cell + gap)} y={r * (cell + gap)} width={cell} height={cell} rx="3.5" className={`cf-${level}`} />);
  }
  return (
    <svg className={`cellfield ${className}`} viewBox={`0 0 ${cols * (cell + gap) - gap} ${rows * (cell + gap) - gap}`} aria-hidden="true" focusable="false">
      {rects}
    </svg>
  );
}

// Section index label: "01 — Product"
export function Kicker({ index, children }) {
  return <p className="kicker"><span className="kicker__cells" aria-hidden="true"><i /><i /><i /></span>{index && <span className="kicker__index">{index}</span>}{children}</p>;
}

// ── Code block with copy (docs) ─────────────────────────────────────────────
export function CodeBlock({ code, title, lang = 'shell' }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); }
    catch {
      const ta = Object.assign(document.createElement('textarea'), { value: code });
      ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="codeblock">
      <div className="codeblock__bar">
        <span className="codeblock__title">{title || (lang === 'shell' ? 'Terminal' : lang.toUpperCase())}</span>
        <button type="button" className={`codeblock__copy${copied ? ' is-copied' : ''}`} onClick={copy} aria-label={copied ? 'Copied' : `Copy ${title || 'code'}`}>
          <Icon name={copied ? 'check' : 'copy'} size={14} /><span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className={`codeblock__body lang-${lang}`} tabIndex={0} aria-label={title || (lang === 'shell' ? 'Terminal command' : `${lang.toUpperCase()} code`)}><code>{lang === 'shell'
        ? code.split('\n').map((l, i) => <span key={i} className="line"><span className="codeblock__ps" aria-hidden="true">$ </span>{l}</span>)
        : code.split('\n').map((l, i) => {
          const m = l.match(/^(\s*)(- )?([\w]+:)?(.*)$/);
          return <span key={i} className="line">{m[1]}{m[2] && <span className="y-dash">{m[2]}</span>}{m[3] && <span className="y-key">{m[3]}</span>}<span className={m[3] ? 'y-val' : 'y-item'}>{m[4]}</span></span>;
        })}</code></pre>
      <span className="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
    </div>
  );
}

// ── Enlarge an image in a modal dialog ──────────────────────────────────────
export function useZoom() {
  const ref = useRef(null);
  const [item, setItem] = useState(null);
  useEffect(() => { if (item) ref.current?.showModal(); }, [item]);
  const dialog = (
    <dialog ref={ref} className="zoom" onClose={() => setItem(null)} onClick={e => e.target === ref.current && ref.current.close()} aria-label={item?.alt}>
      {item && <>
        <button type="button" className="icon-btn zoom__close" onClick={() => ref.current.close()} aria-label="Close"><Icon name="close" size={18} /></button>
        <img src={shot(item.name).src} alt={item.alt} />
      </>}
    </dialog>
  );
  return [setItem, dialog];
}
