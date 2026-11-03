import { useEffect, useState } from 'react';
import { COMMAND, CONFIG_YAML, DOCS, METRIC_KEYS, TOOLS, TOOL_KEYS } from './content.js';
import { Footer, Header, ToolIcon } from './components/sections.jsx';
import { CodeBlock, CommandCopy, Icon, Kicker, useSiteTheme } from './components/ui.jsx';

const SECTIONS = [
  ['quick-start', 'Quick start', 'Get started'],
  ['commands', 'Commands', 'Usage'],
  ['config', 'Config files', 'Usage'],
  ['options', 'Options', 'Usage'],
  ['tools', 'Supported tools', 'Reference'],
  ['requirements', 'Requirements & privacy', 'Reference'],
];
const GROUPS = ['Get started', 'Usage', 'Reference'].map(g => [g, SECTIONS.filter(s => s[2] === g)]);

const COMMANDS = [
  ['terminal', 'Interactive scan', 'Scan your tools and build a report step by step.', 'npx stackpulse'],
  ['file', 'Create a config file', 'Write a starter config you can fill in by hand.', 'npx stackpulse --init stackpulse.yaml'],
  ['sliders', 'Build from a config', 'Build a report from a YAML or JSON config, with no prompts.', 'npx stackpulse --config stackpulse.yaml'],
  ['html', 'Choose the output name', 'Writes my-card.html instead of the default stackpulse.html.', 'npx stackpulse -c stackpulse.yaml -o my-card'],
];

function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0][0]);
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean);
    const onScroll = () => {
      const y = window.scrollY + 160;
      let current = els[0]?.id;
      for (const el of els) if (el.offsetTop <= y) current = el.id;
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) current = els[els.length - 1].id;
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return active;
}

function DocSection({ id, index, label, title, lede, children }) {
  return (
    <section id={id} className="doc-sec">
      <header className="doc-sec__head">
        <Kicker index={index}>{label}</Kicker>
        <h2><a href={`#${id}`}>{title}</a></h2>
        {lede && <p>{lede}</p>}
      </header>
      {children}
    </section>
  );
}

function Callout({ icon = 'checkCircle', children }) {
  return <div className="callout"><Icon name={icon} size={18} /><p>{children}</p></div>;
}

export default function DocsPage() {
  const [theme, toggleTheme] = useSiteTheme();
  const active = useActiveSection();
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Header theme={theme} onToggleTheme={toggleTheme} home="/" current="Docs" />

      <div className="docs-hero">
        <div className="container docs-hero__inner">
          <div>
            <Kicker index="">Documentation</Kicker>
            <h1>Run StackPulse and read your report.</h1>
            <p>Commands, config files and options, plus exactly what StackPulse reads from each supported tool.</p>
          </div>
          <div className="docs-hero__card">
            <p className="docs-hero__label">Quick start</p>
            <CommandCopy command={COMMAND} />
            <p className="docs-hero__note"><Icon name="checkCircle" size={16} /> Node.js 20.12 or newer · no install, no account</p>
          </div>
        </div>
      </div>

      <div className="container docs-layout">
        <aside className="docs-nav" aria-label="Documentation">
          {GROUPS.map(([label, items]) => (
            <div key={label} className="docs-nav__group">
              <p className="docs-nav__label">{label}</p>
              {items.map(([id, text]) => <a key={id} href={`#${id}`} className={active === id ? 'is-active' : undefined} aria-current={active === id ? 'location' : undefined}>{text}</a>)}
            </div>
          ))}
        </aside>

        <main id="main" className="docs-body">

          <DocSection id="quick-start" index="01" label="Get started" title="Quick start"
            lede="Run StackPulse with npx. There is nothing to install and no account to create.">
            <div className="doc-split">
              <ol className="steps">
                <li><strong>Scan</strong>StackPulse checks for all 13 supported tools and lists the ones it finds, with a quick summary of each.</li>
                <li><strong>Choose</strong>Confirm the tools and metrics to include. Detected tools are pre-selected, and you can add others by hand.</li>
                <li><strong>Generate</strong>Pick a title, handle and theme. StackPulse writes a standalone HTML report and prints where it saved it.</li>
              </ol>
              <div className="doc-card">
                <CodeBlock code="npx stackpulse" />
                <Callout>Needs <strong>Node.js 20.12 or newer</strong>. Node 22.13+ is recommended.</Callout>
              </div>
            </div>
          </DocSection>

          <DocSection id="commands" index="02" label="Usage" title="Commands"
            lede="Every command runs through npx, so there is nothing to install.">
            <div className="cmd-grid">
              {COMMANDS.map(([icon, title, text, cmd]) => (
                <article key={cmd} className="cmd-card">
                  <div className="cmd-card__head">
                    <span className="cmd-card__icon"><Icon name={icon} size={18} /></span>
                    <div><h3>{title}</h3><p>{text}</p></div>
                  </div>
                  <CodeBlock code={cmd} />
                </article>
              ))}
            </div>
          </DocSection>

          <DocSection id="config" index="03" label="Usage" title="Config files"
            lede="Build the same report every time from a YAML or JSON file.">
            <div className="doc-split doc-split--config">
              <div>
                <CodeBlock code={CONFIG_YAML} lang="yaml" title="stackpulse.yaml" />
                <p className="doc-small"><code>--init</code> creates this file. Its numbers are placeholders — replace them with your own.</p>
              </div>
              <div className="doc-stack">
                <div>
                  <h3>Tool keys</h3>
                  <p>Use these under <code>tools</code>. Any other key is shown with its own name.</p>
                  <div className="keys">{TOOL_KEYS.map(k => <code key={k}>{k}</code>)}</div>
                </div>
                <Callout icon="file">Tokens are given in thousands: <code>1500</code> means 1.5M.</Callout>
              </div>
            </div>
            <h3 className="doc-h3">Metric keys</h3>
            <p>List the metrics your report should show under <code>metrics</code>, and give each tool a value for them.</p>
            <div className="dtable" tabIndex={0} role="region" aria-label="Metric keys">
              <table>
                <thead><tr><th scope="col">Key</th><th scope="col">Shown as</th><th scope="col">Value</th></tr></thead>
                <tbody>{METRIC_KEYS.map(([k, label, hint]) => <tr key={k}><th scope="row"><code>{k}</code></th><td>{label}</td><td>{hint}</td></tr>)}</tbody>
              </table>
            </div>
          </DocSection>

          <DocSection id="options" index="04" label="Usage" title="Options"
            lede={<>With <code>--config</code>, these override the values in the file. In the interactive flow they pre-fill the answers.</>}>
            <div className="dtable" tabIndex={0} role="region" aria-label="Options">
              <table>
                <thead><tr><th scope="col">Flag</th><th scope="col">Description</th></tr></thead>
                <tbody>{DOCS.flags.map(([f, d]) => <tr key={f}><th scope="row"><code>{f}</code></th><td>{d}</td></tr>)}</tbody>
              </table>
            </div>
          </DocSection>

          <DocSection id="tools" index="05" label="Reference" title="Supported tools"
            lede="StackPulse reads the usage each tool records locally, so what appears in your report depends on what that tool stores.">
            <div className="tool-grid">
              {TOOLS.map(t => (
                <div key={t.name} className="tool-row">
                  <ToolIcon tool={t} size={28} />
                  <div><strong>{t.note || t.name}</strong><span>{t.reports}</span></div>
                </div>
              ))}
            </div>
            <Callout icon="file">Estimated cost is an API list-price estimate, not a subscription bill. Roo Code and Kilo Code show the cost those tools recorded.</Callout>
          </DocSection>

          <DocSection id="requirements" index="06" label="Reference" title="Requirements & privacy">
            <div className="doc-pair">
              <div className="doc-card">
                <h3><Icon name="terminal" size={18} /> Requirements</h3>
                <ul className="list">{DOCS.requirements.map(r => <li key={r}>{r}</li>)}</ul>
              </div>
              <div className="doc-card">
                <h3><Icon name="lock" size={18} /> Privacy</h3>
                <ul className="list">{DOCS.privacy.map(r => <li key={r}>{r}</li>)}</ul>
              </div>
            </div>
          </DocSection>
        </main>
      </div>
      <Footer home="/" />
    </>
  );
}
