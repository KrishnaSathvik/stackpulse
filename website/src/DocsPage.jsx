import { useEffect, useRef, useState } from 'react';
import { COMMAND, CONFIG_YAML, DOCS, GITHUB_URL, METRIC_KEYS, TOOLS, TOOL_KEYS } from './content.js';
import { Footer, Header, ToolIcon } from './components/sections.jsx';
import { CodeBlock, CommandCopy, Icon, Shot, Terminal, useSiteTheme } from './components/ui.jsx';

// Six sections, each answering one question.
const SECTIONS = [
  ['quick-start', 'Quick start', 'How do I start using StackPulse?'],
  ['cli', 'CLI reference', 'What commands and options can I use?'],
  ['configuration', 'Configuration', 'How do I make a repeatable report?'],
  ['results', 'Understanding results', 'What do the numbers mean?'],
  ['tools', 'Supported tools', 'Which AI coding tools work, and what does each record?'],
  ['help', 'Help & requirements', 'What do I need, and what if something doesn’t work?'],
];

function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0][0]);
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean);
    const onScroll = () => {
      // A section is current once its top reaches the sticky bars (its scroll-margin), plus some slack.
      let current = els[0]?.id;
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      for (const el of els) {
        const line = pad + (parseFloat(getComputedStyle(el).scrollMarginTop) || 0) + 48;
        if (el.getBoundingClientRect().top <= line) current = el.id;
      }
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = els[els.length - 1].id;
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return active;
}

function DocSection({ id, children }) {
  const [, title, question] = SECTIONS.find(s => s[0] === id);
  return (
    <section id={id} className="doc-sec" aria-labelledby={`${id}-title`}>
      <header className="doc-sec__head">
        <h2 id={`${id}-title`}><a href={`#${id}`}>{title}</a></h2>
        <p>{question}</p>
      </header>
      {children}
    </section>
  );
}

// `code` spans inside docs text.
const rich = (text) => text.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

// A command in a table cell, with its own copy button.
function CopyCode({ code }) {
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
    setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1600);
  };
  return (
    <span className="copycode">
      <code>{code}</code>
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : `Copy: ${code}`} title={copied ? 'Copied' : 'Copy'}>
        <Icon name={copied ? 'check' : 'copy'} size={14} />
      </button>
    </span>
  );
}

// Phones and tablets: the sections as a row of tabs that scrolls sideways. A label and an
// edge fade say there is more until the last tab is in view; the current tab follows the page.
function SectionTabs({ active }) {
  const ref = useRef(null);
  const [atEnd, setAtEnd] = useState(false);
  const update = () => { const n = ref.current; if (n) setAtEnd(n.scrollLeft + n.clientWidth >= n.scrollWidth - 4); };
  useEffect(() => { update(); window.addEventListener('resize', update); return () => window.removeEventListener('resize', update); }, []);
  useEffect(() => {
    const n = ref.current, tab = n?.querySelector('.is-active');
    if (n && tab && n.scrollWidth > n.clientWidth) n.scrollTo({ left: Math.max(0, tab.offsetLeft - 24), behavior: 'smooth' });
  }, [active]);
  return (
    <div className={`docs-mnav-wrap${atEnd ? ' is-end' : ''}`}>
      <p className="docs-mnav__hint" aria-hidden="true">Swipe for more sections <Icon name="arrow" size={13} /></p>
      <nav ref={ref} className="docs-mnav" aria-label="Documentation sections" onScroll={update}>
        {SECTIONS.map(([id, text]) => (
          <a key={id} href={`#${id}`} className={active === id ? 'is-active' : undefined} aria-current={active === id ? 'location' : undefined}>{text}</a>
        ))}
      </nav>
    </div>
  );
}

function SideNav({ active, className, label }) {
  return (
    <nav className={className} aria-label={label}>
      {SECTIONS.map(([id, text]) => (
        <a key={id} href={`#${id}`} className={active === id ? 'is-active' : undefined} aria-current={active === id ? 'location' : undefined}>{text}</a>
      ))}
    </nav>
  );
}

export default function DocsPage() {
  const [theme, toggleTheme] = useSiteTheme();
  const active = useActiveSection();
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Header theme={theme} onToggleTheme={toggleTheme} home="/" current="Docs" />

      <div className="docs-shell">
        <div className="docs-hero">
          <h1>StackPulse docs</h1>
          <p>How to run StackPulse, every option it takes, and what the numbers in your report mean.</p>
        </div>
        <SectionTabs active={active} />

        <div className="docs-layout">
          <SideNav active={active} className="docs-nav" label="Documentation" />

          <main id="main" className="docs-body">

            <DocSection id="quick-start">
              <CommandCopy command={COMMAND} />
              <p className="doc-note">Needs Node.js 20.12 or newer. To keep it installed: <code>npm install -g stackpulse</code>, then run <code>stackpulse</code>.</p>
              <div className="doc-split">
                <ol className="steps">
                  <li><strong>Scan</strong>StackPulse looks for 13 supported tools on this machine and prints sessions, tokens and cost for each one it finds.</li>
                  <li><strong>Choose</strong>Press Enter for the default report, or choose <em>Customize report</em> to pick tools, metrics, theme and file name. <em>View details</em> shows token types and models.</li>
                  <li><strong>Open</strong>It writes one standalone HTML file and prints where it saved it. Choose <em>Generate and open in browser</em> to open it straight away.</li>
                </ol>
                <Terminal part="menu" narrow command="" title="npx stackpulse"
                  label="What StackPulse prints: one block per tool it found, with sessions, tokens and estimated cost, then the menu: Generate report, Generate and open in browser, Customize report, View details, Exit." />
              </div>
            </DocSection>

            <DocSection id="cli">
              <div className="dtable dtable--cli" tabIndex={0} role="region" aria-label="Commands and options">
                <table>
                  <thead><tr><th scope="col">Command or flag</th><th scope="col">Purpose</th><th scope="col">Example</th></tr></thead>
                  {DOCS.cli.map(([group, rows]) => (
                    <tbody key={group}>
                      <tr className="dtable__group"><th scope="colgroup" colSpan={3}>{group}</th></tr>
                      {rows.map(([flag, purpose, example]) => (
                        <tr key={flag}><th scope="row"><code>{flag}</code></th><td>{purpose}</td><td><CopyCode code={example} /></td></tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </DocSection>

            <DocSection id="configuration">
              <div className="doc-split doc-split--config">
                <CodeBlock code={CONFIG_YAML} lang="yaml" title="stackpulse.yaml" />
                <div className="doc-prose">
                  <p>Create a starter file, edit its numbers, then build from it. No prompts are shown.</p>
                  <CodeBlock code={'npx stackpulse --init stackpulse.yaml\nnpx stackpulse -c stackpulse.yaml'} />
                  <p><code>--theme</code>, <code>--title</code>, <code>--timeframe</code>, <code>--username</code> and <code>--output</code> override the file.</p>
                  <p><code>tokens_used</code> is in thousands: <code>1500</code> means 1.5M. Leave out <code>cost_usd</code> when it is unknown.</p>
                  <p className="doc-keys"><span>Tool keys</span>{TOOL_KEYS.map(k => <code key={k}>{k}</code>)}</p>
                  <p className="doc-keys"><span>Metric keys</span>{METRIC_KEYS.map(([k]) => <code key={k}>{k}</code>)}</p>
                </div>
              </div>
            </DocSection>

            <DocSection id="results">
              <figure className="doc-shot">
                <Shot name={`tokens-${theme}`} mobile={`tokens-m-${theme}`}
                  alt="The report's token composition: 476.3M tokens, 90.1% cache reads, then cache writes, output, uncached input and other, with a row per tool." />
                <figcaption>Token composition in the report (demo data).</figcaption>
              </figure>
              <div className="dtable dtable--results" tabIndex={0} role="region" aria-label="What the report shows">
                <table>
                  <thead><tr><th scope="col">You see</th><th scope="col">It means</th></tr></thead>
                  <tbody>{DOCS.results.map(([k, d]) => <tr key={k}><th scope="row"><code>{k}</code></th><td>{d}</td></tr>)}</tbody>
                </table>
              </div>
              <p className="doc-note">The terminal and the report show the same numbers. The report is one standalone HTML file; use <em>Save as PDF</em> in it, or your browser’s Print command, for a PDF. When entering numbers by hand, leave a field blank if it is unknown; enter <code>0</code> only for a real zero.</p>
            </DocSection>

            <DocSection id="tools">
              <div className="dtable dtable--tools" tabIndex={0} role="region" aria-label="Supported tools and what each records">
                <table>
                  <thead><tr><th scope="col">Tool</th><th scope="col">Sessions</th><th scope="col">Tokens</th><th scope="col">Cost</th><th scope="col">Models</th><th scope="col">Notes</th></tr></thead>
                  <tbody>{TOOLS.map(t => {
                    const [sessions, tokens, cost, models, note] = DOCS.matrix[t.name];
                    return (
                      <tr key={t.name}>
                        <th scope="row"><span className="dtool"><ToolIcon tool={t} size={22} />{t.name}</span></th>
                        {[sessions, tokens, cost, models].map((v, i) => <td key={i} className={v === '—' ? 'is-na' : undefined}>{v}</td>)}
                        <td className="dtable__note">{note}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <p className="doc-note"><code>est.</code> estimated at API list prices · <code>rec.</code> recorded by the tool · <code>—</code> not recorded locally.</p>
            </DocSection>

            <DocSection id="help">
              <h3 className="doc-h3">Requirements and privacy</h3>
              <dl className="doc-defs">
                {DOCS.requirements.map(([k, d]) => <div key={k}><dt>{k}</dt><dd>{rich(d)}</dd></div>)}
              </dl>
              <h3 className="doc-h3">Troubleshooting</h3>
              <dl className="doc-defs doc-defs--wide">
                {DOCS.troubleshooting.map(([k, d]) => <div key={k}><dt>{k}</dt><dd>{rich(d)}</dd></div>)}
              </dl>
              <p className="doc-note">Still stuck? <a href={`${GITHUB_URL}/issues`}>Open an issue on GitHub</a> with the output StackPulse printed.</p>
            </DocSection>
          </main>
        </div>
      </div>
      <Footer home="/" />
    </>
  );
}
