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
  { key: 'activity', title: 'Explore activity over time',
    text: 'A year of daily activity, one block per tool, so you can see when each one actually gets used.' },
];

function StoryVisual({ step, theme, zoom }) {
  if (step === 'tools') return (
    <div className="sv sv--tools">
      <div className="sv__shot">
        <Shot name={`stats-${theme}`} alt="Report totals: 1,086 sessions, 476.3M tokens, $487.55 estimated cost, 1,958 lines written and 46 AI commits, each with how many tools reported it." />
      </div>
      <div className="sv__stats" style={{ '--shot': `url("${shot(`stats-${theme}`).src}")` }} aria-hidden="true">
        {[0, 1, 2, 3, 4].map(i => <span key={i} style={{ '--i': i }} />)}
      </div>
      <div className="sv__row">
        <div className="sv__donut"><Shot name={`donut-${theme}`} alt="Report sessions donut: 1,086 sessions split across Cursor, Aider, Claude Code, Codex and Gemini CLI." /></div>
        <Terminal part="scan" from={11} title="Detected on this machine" command=""
          label="The five tools StackPulse detected, with their sessions, tokens and estimated cost." />
      </div>
    </div>
  );
  const name = step === 'models' ? `table-${theme}` : `heatmap-${theme}`;
  const alt = step === 'models'
    ? 'Report table: Cursor and Aider rows, then Claude Code, Codex and Gemini CLI with a row per model showing tokens and estimated cost.'
    : 'Report activity heatmap: a year of daily activity for Cursor, Aider, Claude Code, Codex and Gemini CLI.';
  return (
    <div className={`sv sv--${step}`}>
      <button type="button" className="sv__zoom" onClick={() => zoom({ name, alt })} aria-label="Enlarge screenshot">
        <Shot name={name} alt={alt} />
        <span className="sv__zoomhint"><Icon name="expand" size={14} /> Enlarge</span>
      </button>
    </div>
  );
}

export function Story({ theme }) {
  const [step, setStep] = useState('tools');
  const [zoom, dialog] = useZoom();
  const refs = useRef({});
  const onKey = (e, i) => {
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const next = STORY[(i + d + STORY.length) % STORY.length].key;
    setStep(next); refs.current[next]?.focus();
  };
  const active = STORY.findIndex(s => s.key === step);
  return (
    <section className="section" id="screenshots" aria-labelledby="story-title">
      <div className="container">
        <SplitHead index="01" kicker="Product" id="story-title" title="From your terminal to a clear report.">
          Run one command. StackPulse scans your tools, prints a summary, and writes a report you can explore.
        </SplitHead>
        <div className="story reveal">
          <div className="story__steps" role="tablist" aria-label="What the report shows" aria-orientation="vertical">
            {STORY.map((s, i) => (
              <button key={s.key} type="button" role="tab" id={`tab-${s.key}`} aria-selected={step === s.key} aria-controls="story-stage"
                tabIndex={step === s.key ? 0 : -1} ref={el => { refs.current[s.key] = el; }}
                className="story__step" onClick={() => setStep(s.key)} onKeyDown={e => onKey(e, i)}>
                <span className="story__num">{String(i + 1).padStart(2, '0')}</span>
                <span className="story__body"><strong>{s.title}</strong><span>{s.text}</span></span>
              </button>
            ))}
          </div>
          <div className="story__stage" id="story-stage" role="tabpanel" aria-labelledby={`tab-${step}`}>
            <Frame title={`stackpulse.html — ${STORY[active].title.toLowerCase()}`}>
              <div className="story__view" key={step}><StoryVisual step={step} theme={theme} zoom={zoom} /></div>
            </Frame>
          </div>
        </div>
      </div>
      {dialog}
    </section>
  );
}

// ── 3. Activity heatmap ─────────────────────────────────────────────────────
export function Activity({ theme }) {
  return (
    <section className="section" id="activity" aria-labelledby="activity-title">
      <div className="container">
        <SplitHead index="02" kicker="Activity" id="activity-title" title="A year of daily activity, one row per tool.">
          Each block is a day. Brighter blocks are the days that tool was used more.
        </SplitHead>
        <div className="activity reveal">
          <Frame title="stackpulse.html — activity" className="activity__frame">
            <div className="activity__shot">
              <Shot name={`heatmap-${theme}`}
                alt="Report activity heatmap: 294 active days across a year, with one row each for Cursor, Aider, Claude Code, Codex and Gemini CLI." />
            </div>
          </Frame>
        </div>
      </div>
    </section>
  );
}

// ── 4. Features ─────────────────────────────────────────────────────────────
export function Features() {
  return (
    <section className="section" id="features" aria-labelledby="features-title">
      <div className="container">
        <SplitHead index="03" kicker="Features" id="features-title" title="Built around what your tools actually record.">
          No estimates dressed up as data. StackPulse reports what each tool keeps, and says when a number covers only some of them.
        </SplitHead>
        <div className="feats">
          <article className="feat feat--discover reveal">
            <div className="feat__text">
              <h3>Automatic tool discovery</h3>
              <p>One scan checks for all 13 supported tools and shows what each one has recorded.</p>
            </div>
            <Terminal part="scan" from={3} title="Scanning for AI tools" command=""
              label="A StackPulse scan: eight tools not installed, five found with their sessions, tokens and estimated cost." />
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
              <h3>Model and activity breakdowns</h3>
              <p>Usage split by model wherever the tool records it.</p>
            </div>
            <Terminal part="summary" from={3} title="Summary" command=""
              label="StackPulse summary: Claude Code, Codex and Gemini CLI, each with tokens and estimated cost per model." />
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
            <Kicker index="04">Integrations</Kicker>
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
  const refs = useRef({});
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
        <SplitHead index="05" kicker="Report themes" id="themes-title" title="Seven looks for your report.">
          Themes style the HTML report StackPulse writes. Pick one in the CLI, or pass <code>--theme</code>.
        </SplitHead>
        <div className="themes reveal">
          <div className="theme-bar" role="radiogroup" aria-label="Report theme">
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
          <div className="themes__stage">
            <Frame title={`stackpulse.html · ${current.name} theme`}>
              <div className="crop crop--theme">
                <Shot key={selected} name={`theme-${selected}`} alt={`The StackPulse report in the ${current.name} theme.`} />
              </div>
            </Frame>
          </div>
          <ul className="themes__facts">
            <li><Icon name="html" size={16} /> One self-contained HTML file</li>
            <li><Icon name="sliders" size={16} /> You choose the metrics</li>
            <li><Icon name="file" size={16} /> Repeatable builds from a config file</li>
          </ul>
        </div>
      </div>
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
