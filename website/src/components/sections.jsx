import { useEffect, useRef, useState } from 'react';
import { COMMAND, GITHUB_URL, LOCAL_FILES, METRIC_EXAMPLES, NAV, NPM_URL, REPORT_THEMES, TOOLS } from '../content.js';
import { CellField, CommandCopy, Icon, Kicker, Logo, Shot, Terminal, shot, useZoom } from './ui.jsx';

// ── Header ──────────────────────────────────────────────────────────────────
// `home` prefixes the section links: '' on the homepage, '/' on other pages.
export function Header({ theme, onToggleTheme, home = '', current }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <header className={`header${scrolled ? ' is-scrolled' : ''}`}>
      <div className="container header__inner">
        <a className="brand" href={home || '#top'} aria-label="StackPulse home"><Logo /> StackPulse</a>
        <nav className="nav" aria-label="Main">
          {NAV.map(n => <a key={n.href} href={n.href} aria-current={current === n.label ? 'page' : undefined}>{n.label}</a>)}
        </nav>
        <div className="header__actions">
          <button type="button" className="icon-btn theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

function SplitHead({ index, kicker, id, title, children }) {
  return (
    <div className="split-head reveal">
      <div>
        <Kicker index={index}>{kicker}</Kicker>
        <h2 id={id}>{title}</h2>
      </div>
      {children && <p>{children}</p>}
    </div>
  );
}

function Frame({ title, children, className = '', actions }) {
  return (
    <div className={`frame ${className}`}>
      <div className="frame__bar">
        <span className="dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="frame__title">{title}</span>
        <span className="frame__actions">{actions}</span>
      </div>
      {children}
    </div>
  );
}

// ── 1. Hero ─────────────────────────────────────────────────────────────────
export function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero__wash" aria-hidden="true" />
      <CellField className="hero__cells" cols={40} rows={16} seed={11} />
      <div className="container hero__inner">
        <div className="hero__copy">
          <Kicker index="">AI coding usage analytics</Kicker>
          <h1 id="hero-title" className="reveal" style={{ '--i': 1 }}>
            Your AI coding tools. <em>One clear picture.</em>
          </h1>
          <p className="hero__lede reveal" style={{ '--i': 2 }}>
            StackPulse reads the usage your AI coding tools already record on your machine
            and turns it into one visual report.
          </p>
          <div className="hero__cta reveal" style={{ '--i': 3 }}><CommandCopy command={COMMAND} /></div>
          <ul className="strip reveal" style={{ '--i': 4 }}>
            <li><b>13</b> supported tools</li>
            <li><b>Local</b> files on your disk</li>
            <li><b>Zero</b> accounts or API keys</li>
          </ul>
        </div>
        <div className="hero__visual reveal" style={{ '--i': 2 }}>
          <figure className="hero-tools">
            <figcaption className="sr-only">The 13 AI coding tools StackPulse reads on your machine.</figcaption>
            {[TOOLS.slice(0, 4), TOOLS.slice(4, 9), TOOLS.slice(9)].map(row => (
              <div key={row[0].name} className="hero-tools__row">
                {row.map(tool => (
                  <span key={tool.name} className="hero-tools__item" title={tool.name}>
                    <ToolIcon tool={tool} size={48} />
                  </span>
                ))}
              </div>
            ))}
          </figure>
        </div>
      </div>
    </section>
  );
}

// ── 2. Product story ────────────────────────────────────────────────────────
const STORY = [
  { key: 'tools', title: 'See every tool at once',
    text: 'Totals across all your tools, how many tools reported each number, and each tool’s share of your sessions.' },
  { key: 'models', title: 'Understand models and usage',
    text: 'A row for every tool and every model under it: sessions, tokens, estimated cost, lines and commits.' },
  { key: 'tokens', title: 'See what your tokens are made of',
    text: 'Cache reads, cache writes, output and uncached input, so a large token total is easy to read.' },
  { key: 'activity', title: 'Explore activity over time',
    text: 'A year of daily activity, one block per tool, so you can see when each one actually gets used.' },
];

// What the report shows, as a plain list. The full report itself is in the themes section.
export function Story() {
  return (
    <section className="section" id="screenshots" aria-labelledby="story-title">
      <div className="container">
        <SplitHead index="01" kicker="Product" id="story-title" title="From your terminal to a clear report.">
          Run one command. StackPulse scans your tools, prints a summary, and writes a report you can explore.
        </SplitHead>
        <ol className="story-list reveal">
          {STORY.map((s, i) => (
            <li key={s.key} className="story-list__item">
              <span className="story__num">{String(i + 1).padStart(2, '0')}</span>
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ── 4. Features ─────────────────────────────────────────────────────────────
export function Features() {
  return (
    <section className="section" id="features" aria-labelledby="features-title">
      <div className="container">
        <SplitHead index="02" kicker="Features" id="features-title" title="Built around what your tools actually record.">
          No estimates dressed up as data. StackPulse reports what each tool keeps, and says when a number covers only some of them.
        </SplitHead>
        <div className="feats">
          <article className="feat feat--discover reveal">
            <div className="feat__text">
              <h3>Automatic tool discovery</h3>
              <p>One scan checks all 13 supported tools and shows one row for each tool it found. Press Enter to write the report, or customize it first.</p>
            </div>
            <Terminal part="menu" title="npx stackpulse" command=""
              label="A StackPulse scan: five tools found, each with sessions, tokens and estimated cost, then the menu: Generate report, Generate and open in browser, Customize report, View details, Exit." />
          </article>
          <article className="feat feat--metrics reveal" style={{ '--i': 1 }}>
            <div className="feat__text">
              <h3>Accurate, available metrics</h3>
              <p>Each tool contributes what it records — nothing invented to fill the gaps.</p>
            </div>
            <ul className="metric-list">
              {METRIC_EXAMPLES.map(m => {
                const tool = TOOLS.find(t => t.name === m.tool);
                return (
                  <li key={m.tool}>
                    <span className="metric-list__tool"><ToolIcon tool={tool} size={22} />{m.tool}</span>
                    <span className="metric-list__chips">{m.metrics.map(x => <span key={x}>{x}</span>)}</span>
                  </li>
                );
              })}
            </ul>
          </article>
          <article className="feat feat--models reveal">
            <div className="feat__text">
              <h3>Token and model details</h3>
              <p>View details shows each tool’s token types and every model with its exact ID, without crowding the summary.</p>
            </div>
            <Terminal part="details" title="View details — Claude Code" command=""
              label="StackPulse details for Claude Code: tokens by type, mostly cache reads, then each model with its exact ID, tokens and estimated cost." />
          </article>
          <article className="feat feat--local reveal" style={{ '--i': 1 }}>
            <div className="feat__text">
              <h3>Local visual reports</h3>
              <p>StackPulse reads files already on your disk and writes one HTML report. No account, nothing uploaded.</p>
            </div>
            <ol className="flow" aria-label="Files StackPulse reads, and the report it writes">
              {LOCAL_FILES.map(f => (
                <li key={f.path}><Icon name="folder" size={16} /><code>{f.path}</code><span>{f.tool}</span></li>
              ))}
              <li className="flow__out"><Icon name="html" size={16} /><code>./stackpulse.html</code><span>Your report</span></li>
            </ol>
          </article>
        </div>
      </div>
    </section>
  );
}

// ── 4. Supported tools ──────────────────────────────────────────────────────
export function ToolIcon({ tool, size = 44 }) {
  return (
    <span className={`tool-icon${tool.bleed ? ' tool-icon--bleed' : ''}${tool.iconDark ? ' tool-icon--darkmark' : ''}`} style={{ '--s': `${size}px` }}>
      <img src={tool.icon} alt="" width={size} height={size} className={tool.iconDark ? 'has-dark' : undefined} loading="lazy" />
      {tool.iconDark && <img src={tool.iconDark} alt="" width={size} height={size} className="dark-only" loading="lazy" />}
    </span>
  );
}

export function Tools() {
  return (
    <section className="section" id="tools" aria-labelledby="tools-title">
      <div className="container">
        <ul className="wall reveal">
          <li className="wall__lead">
            <Kicker index="03">Integrations</Kicker>
            <h2 id="tools-title"><span className="wall__num">13</span> AI coding tools, one report.</h2>
            <p>Read straight from the files each tool keeps on your machine.</p>
          </li>
          {TOOLS.map(t => (
            <li key={t.name} className="wall__tool" title={t.note}>
              <ToolIcon tool={t} size={40} />
              <span>{t.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── 5. Report themes ────────────────────────────────────────────────────────
export function Themes() {
  const [selected, setSelected] = useState('cosmic');
  const [open, setOpen] = useState(false);     // the full report is collapsed until asked for
  const [zoom, dialog] = useZoom();
  const refs = useRef({});
  // Phones: the thumbnails scroll sideways. A label and an edge fade say so until the last
  // one is in view; the selected theme scrolls into view.
  const bar = useRef(null);
  const [strip, setStrip] = useState({ end: true });
  const measure = () => {
    const n = bar.current; if (!n) return;
    setStrip({ end: n.scrollLeft + n.clientWidth >= n.scrollWidth - 4 });
  };
  useEffect(() => { measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, []);
  useEffect(() => {
    const n = bar.current, card = refs.current[selected];
    if (n && card && n.scrollWidth > n.clientWidth) n.scrollTo({ left: Math.max(0, card.offsetLeft - n.offsetLeft - 20), behavior: 'smooth' });
  }, [selected]);
  const onKey = (e, i) => {
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const next = REPORT_THEMES[(i + d + REPORT_THEMES.length) % REPORT_THEMES.length].key;
    setSelected(next); refs.current[next]?.focus();
  };
  const current = REPORT_THEMES.find(t => t.key === selected);
  return (
    <section className="section" id="reports" aria-labelledby="themes-title">
      <div className="container">
        <SplitHead index="04" kicker="Report themes" id="themes-title" title="Seven looks for your report.">
          Themes style the HTML report StackPulse writes. Pick one in the CLI, or pass <code>--theme</code>.
        </SplitHead>
        <div className="themes reveal">
          <div className={`theme-strip${strip.end ? ' is-end' : ''}`}>
          <p className="theme-strip__hint" aria-hidden="true">
            <span>Swipe to see all {REPORT_THEMES.length} themes <Icon name="arrow" size={13} /></span>
          </p>
          <div className="theme-bar" role="radiogroup" aria-label="Report theme" ref={bar} onScroll={measure}>
            {REPORT_THEMES.map((t, i) => {
              const on = t.key === selected;
              return (
                <button key={t.key} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
                  ref={el => { refs.current[t.key] = el; }} className="theme-card"
                  style={{ '--sw': t.bg }} onClick={() => setSelected(t.key)} onKeyDown={e => onKey(e, i)}>
                  <span className="theme-card__sw" aria-hidden="true"><img src={shot(`theme-${t.key}`).src} alt="" loading="lazy" /></span>
                  <span className="theme-card__text">
                    <span className="theme-card__name">{t.name}</span>
                    <span className="theme-card__vibe">{t.vibe}</span>
                  </span>
                  {on && <span className="theme-card__check" aria-hidden="true"><Icon name="check" size={11} /></span>}
                </button>
              );
            })}
          </div>
          </div>
          <div className="themes__stage">
            <button type="button" className="story__full themes__toggle" aria-expanded={open} aria-controls="themes-report"
              onClick={() => setOpen(o => !o)}>
              <Icon name={open ? 'close' : 'expand'} size={15} /> {open ? 'Hide the report' : `Show the full report in ${current.name}`}
            </button>
            {open && <div id="themes-report" className="themes__panel">
            <Frame title={`stackpulse.html · ${current.name} theme`}>
              {/* The whole report in the selected theme. Tap or click to view it larger. */}
              <button type="button" className="themes__report" onClick={() => zoom({ name: `card-${selected}`, tall: true,
                alt: `The full StackPulse report in the ${current.name} theme.` })} aria-label={`Enlarge the report in the ${current.name} theme`}>
                <Shot key={selected} name={`card-${selected}`} alt={`The full StackPulse report in the ${current.name} theme: totals, sessions by tool, a row per tool and model, token composition and a year of activity.`} />
              </button>
            </Frame>
            <p className="themes__hint" aria-hidden="true">Tap the report to view it larger.</p>
            <button type="button" className="story__full themes__toggle" aria-expanded={open} aria-controls="themes-report"
              onClick={() => { setOpen(false); document.getElementById('themes-title')?.scrollIntoView({ block: 'start' }); }}>
              <Icon name="close" size={15} /> Hide the report
            </button>
            </div>}
          </div>
          <ul className="themes__facts">
            <li><Icon name="html" size={16} /> One self-contained HTML file</li>
            <li><Icon name="sliders" size={16} /> You choose the metrics</li>
            <li><Icon name="file" size={16} /> Repeatable builds from a config file</li>
          </ul>
        </div>
      </div>
      {dialog}
    </section>
  );
}

// ── 6. Final CTA + footer ───────────────────────────────────────────────────
export function FinalCTA() {
  return (
    <section className="cta" aria-labelledby="cta-title">
      <CellField className="cta__cells" cols={48} rows={6} seed={3} bias="center" />
      <div className="container cta__inner reveal">
        <div>
          <h2 id="cta-title">See your AI coding usage clearly.</h2>
          <p>One command, run on your own machine.</p>
        </div>
        <CommandCopy command={COMMAND} />
      </div>
    </section>
  );
}

export function Footer({ home = '' }) {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__about">
          <a className="brand" href={home || '#top'}><Logo size={24} /> StackPulse</a>
          <span className="footer__tag">AI coding usage, made clear.</span>
        </div>
        <nav className="footer__links" aria-label="StackPulse elsewhere">
          <a href={NPM_URL} rel="noopener" target="_blank"><Icon name="npm" size={18} /> npm</a>
          <a href={GITHUB_URL} rel="noopener" target="_blank"><Icon name="github" size={18} /> GitHub</a>
        </nav>
      </div>
    </footer>
  );
}
