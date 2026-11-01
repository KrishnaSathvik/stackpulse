import { useState, useRef, useEffect } from "react";

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

const THEMES = [
  { name: "Dark", bg: "#0f0f0f", cell: "#1e1e1e", on: "#22d3ee", text: "#e2e8f0", vibe: "Terminal noir" },
  { name: "Light", bg: "#f8f8f8", cell: "#e0e0e0", on: "#0ea5e9", text: "#1a1a1a", vibe: "Clean minimal" },
  { name: "Cosmic", bg: "#0a0e1f", cell: "#1a1e3a", on: "#818cf8", text: "#c7d2fe", vibe: "Deep space blues" },
  { name: "Forge", bg: "#1a0e04", cell: "#3d1f08", on: "#f59e0b", text: "#fde68a", vibe: "Amber heat" },
  { name: "Arctic", bg: "#f0f7ff", cell: "#d0e4f7", on: "#0284c7", text: "#0c4a6e", vibe: "Ice blue on white" },
  { name: "Verdant", bg: "#071210", cell: "#0f2920", on: "#34d399", text: "#a7f3d0", vibe: "Forest green" },
  { name: "Neon", bg: "#1a0520", cell: "#2d0a3e", on: "#f472b6", text: "#fbcfe8", vibe: "Pink synthwave" },
];

const TOOLS_FULL = [
  { name: "Claude Code", method: "ccusage", detail: "Sessions, tokens, cost, models", icon: "⚡", tier: "full" },
  { name: "OpenAI Codex", method: "@ccusage/codex", detail: "Sessions, tokens, cost, models", icon: "◆", tier: "full" },
  { name: "OpenCode", method: "@ccusage/opencode", detail: "Sessions, tokens, cost", icon: "▣", tier: "full" },
  { name: "Amp", method: "@ccusage/amp", detail: "Sessions, tokens, cost, credits", icon: "⊞", tier: "full" },
  { name: "Pi Agent", method: "@ccusage/pi", detail: "Sessions, tokens, cost", icon: "π", tier: "full" },
];

const TOOLS_TOKEN = [
  { name: "Gemini CLI", method: "Local JSONL", detail: "Sessions, tokens, activity", icon: "✦", tier: "token" },
  { name: "Qwen Code", method: "Local JSONL", detail: "Sessions, tokens, est. cost", icon: "◎", tier: "token" },
  { name: "Kimi Code", method: "Session files", detail: "Sessions, tokens, est. cost", icon: "◐", tier: "token" },
];

const TOOLS_SESSION = [
  { name: "Cursor", method: "SQLite DB", detail: "Composer sessions", icon: "▶", tier: "session" },
  { name: "Antigravity", method: "SQLite DB", detail: "Missions + agent sessions", icon: "◉", tier: "session" },
  { name: "Roo Code", method: "VS Code SQLite", detail: "Task history", icon: "□", tier: "session" },
  { name: "Kilo Code", method: "VS Code SQLite", detail: "Task history", icon: "◈", tier: "session" },
];

const TOOLS_GIT = [
  { name: "Aider", method: "History + git", detail: "Sessions, commits, lines", icon: "⬡", tier: "git" },
];

const COMPARE_ROWS = [
  { feature: "Multi-tool in one view", cc: "separate pkgs", cb: "✓ 8 tools", caut: "✓ 16 tools", sp: "✓ 13 tools", spWin: true },
  { feature: "Shareable HTML card", cc: "✗", cb: "✗", caut: "✗", sp: "✓", spWin: true },
  { feature: "Per-tool heatmap", cc: "✗", cb: "✗", caut: "✗", sp: "✓", spWin: true },
  { feature: "Export PNG / PDF / X", cc: "✗", cb: "✗", caut: "JSON / MD", sp: "✓ all three", spWin: true },
  { feature: "Cross-platform", cc: "✓", cb: "macOS only", caut: "✓", sp: "✓", spWin: true },
  { feature: "Zero dependencies", cc: "✓ tiny", cb: "Swift app", caut: "needs Rust", sp: "✓ Node 18+", spWin: true },
  { feature: "Real-time monitoring", cc: "✓", cb: "✓", caut: "✓", sp: "✗ snapshot", spWin: false },
  { feature: "Cost breakdown", cc: "✓ detailed", cb: "credits", caut: "✓", sp: "✓", spWin: true },
  { feature: "Config file support", cc: "✗", cb: "✗", caut: "✗", sp: "✓ YAML/JSON", spWin: true },
  { feature: "Themes", cc: "✗", cb: "✗", caut: "✗", sp: "✓ 7 themes", spWin: true },
];

function generateHeatmap() {
  const weeks = [];
  for (let w = 0; w < 13; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const r = Math.random();
      let level = 0;
      if (r > 0.3) {
        const wf = w < 3 ? 0.5 : w < 8 ? 1 : 0.8;
        const df = (d === 0 || d === 6) ? 0.4 : 1;
        const intensity = r * wf * df;
        if (intensity > 0.7) level = 5;
        else if (intensity > 0.55) level = 4;
        else if (intensity > 0.4) level = 3;
        else if (intensity > 0.25) level = 2;
        else if (intensity > 0.1) level = 1;
      }
      days.push(level);
    }
    weeks.push(days);
  }
  return weeks;
}

const greens = ["#18181b", "#0d1f17", "#14532d", "#16a34a", "#22c55e", "#4ade80"];

function MiniHeatmap({ cellBg, onBg }) {
  const cells = useRef(Array.from({ length: 21 }, () => Math.random() > 0.45));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 10 }}>
      {cells.current.map((on, i) => (
        <div key={i} style={{ aspectRatio: "1", borderRadius: 2, background: on ? onBg : cellBg }} />
      ))}
    </div>
  );
}

export default function StackPulseLanding() {
  const mobile = useIsMobile();
  const [heatmap] = useState(generateHeatmap);
  const [copied, setCopied] = useState(false);
  const [copiedBottom, setCopiedBottom] = useState(false);

  const handleCopy = (which) => {
    navigator.clipboard?.writeText("npx stackpulse");
    if (which === "top") { setCopied(true); setTimeout(() => setCopied(false), 2000); }
    else { setCopiedBottom(true); setTimeout(() => setCopiedBottom(false), 2000); }
  };

  const s = {
    page: { background: "#0a0a0b", color: "#fafafa", fontFamily: "'Outfit', system-ui, sans-serif", minHeight: "100vh", lineHeight: 1.6, WebkitFontSmoothing: "antialiased", overflowX: "hidden" },
    mono: { fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace" },
    muted: { color: "#a1a1aa" },
    dim: { color: "#71717a" },
    accent: "#22d3ee",
    section: { maxWidth: 900, margin: "0 auto", padding: mobile ? "48px 16px" : "80px 24px" },
  };

  return (
    <div style={s.page}>

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, padding: mobile ? "12px 16px" : "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(10,10,11,0.85)", backdropFilter: "blur(16px)", borderBottom: "1px solid #27272a" }}>
        <div style={{ ...s.mono, fontWeight: 700, fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/logo.png" alt="stackpulse" style={{ width: 24, height: 24, borderRadius: 4 }} />
          stackpulse
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <a href="https://github.com/KrishnaSathvik/stackpulse" target="_blank" rel="noreferrer" style={{ ...s.mono, fontSize: 13, color: "#a1a1aa", textDecoration: "none", padding: "6px 14px", border: "1px solid #27272a", borderRadius: 6, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#a1a1aa"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
            GitHub
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ minHeight: mobile ? "auto" : "90vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: mobile ? "60px 16px 40px" : "100px 24px 60px", textAlign: "center", position: "relative" }}>
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 800, height: 600, background: "radial-gradient(ellipse at center, rgba(34,211,238,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ ...s.mono, fontSize: 12, color: s.accent, background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)", padding: "6px 16px", borderRadius: 100, marginBottom: 32, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 6, background: s.accent, borderRadius: "50%" }} />
          v3.2 · 13 tools supported
        </div>

        <h1 style={{ fontSize: "clamp(48px, 8vw, 84px)", fontWeight: 800, letterSpacing: -3, lineHeight: 0.95, marginBottom: 24 }}>
          Your AI tools.
          <br />
          <span style={{ background: "linear-gradient(135deg, #22d3ee, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>One pulse.</span>
        </h1>

        <p style={{ fontSize: "clamp(16px, 2.5vw, 20px)", color: "#a1a1aa", maxWidth: 580, margin: "0 auto 40px", fontWeight: 300 }}>
          Scans your machine for AI coding tools, reads local usage data, and generates a shareable HTML card with donut chart, per-tool heatmap, and export to PNG, PDF, or X.
        </p>

        <div onClick={() => handleCopy("top")} style={{ background: "#111113", border: `1px solid ${copied ? s.accent : "#27272a"}`, borderRadius: 12, padding: mobile ? "12px 18px" : "16px 28px", ...s.mono, fontSize: mobile ? 14 : 16, display: "inline-flex", alignItems: "center", gap: mobile ? 10 : 16, cursor: "pointer", transition: "all 0.2s", boxShadow: copied ? `0 0 20px rgba(34,211,238,0.1)` : "none", maxWidth: "100%" }}>
          <span style={{ color: s.accent }}>$</span>
          <span>npx stackpulse</span>
          <span style={{ fontSize: 11, color: copied ? "#34d399" : "#71717a", background: copied ? "rgba(52,211,153,0.1)" : "#18181b", padding: "4px 10px", borderRadius: 4, whiteSpace: "nowrap" }}>
            {copied ? "✓ copied" : "copy"}
          </span>
        </div>

        <div style={{ ...s.mono, fontSize: 12, color: "#71717a", display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", marginTop: 20 }}>
          <span>Node.js 18+</span><span>·</span><span>Zero API keys</span><span>·</span><span>Works offline</span><span>·</span><span>MIT License</span>
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
          <a href="https://www.npmjs.com/package/stackpulse" target="_blank" rel="noreferrer" style={{ ...s.mono, fontSize: 13, color: "#a1a1aa", textDecoration: "none" }}>npm →</a>
          <a href="https://github.com/KrishnaSathvik/stackpulse" target="_blank" rel="noreferrer" style={{ ...s.mono, fontSize: 13, color: "#a1a1aa", textDecoration: "none" }}>GitHub →</a>
        </div>
      </section>

      {/* HEATMAP CARD */}
      <section style={s.section}>
        <div style={{ ...s.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, color: s.accent, marginBottom: 12 }}>What you get</div>
        <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, letterSpacing: -1.5, marginBottom: 12 }}>A card that tells the whole story</h2>
        <p style={{ color: "#a1a1aa", fontSize: 16, maxWidth: 540, marginBottom: 48 }}>Per-tool usage breakdown with model details, donut chart with smart metric selection, GitHub-style activity heatmap with per-tool rows. Save as PNG, PDF, or share on X — all from the card.</p>

        <div style={{ background: "#111113", border: "1px solid #27272a", borderRadius: mobile ? 12 : 16, padding: mobile ? 16 : 32, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, #22d3ee, transparent)", opacity: 0.3 }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div style={{ ...s.mono, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, background: "#22c55e", borderRadius: "50%" }} />
              AI Tool Usage
            </div>
            <div style={{ ...s.mono, fontSize: 11, color: "#71717a" }}>Jan 2026 – Mar 2026</div>
          </div>

          {/* Heatmap Grid */}
          <div style={{ display: "flex", gap: mobile ? 2 : 3, marginBottom: 24, overflowX: "auto", paddingBottom: 8 }}>
            {heatmap.map((week, wi) => (
              <div key={wi} style={{ display: "flex", flexDirection: "column", gap: mobile ? 2 : 3 }}>
                {week.map((level, di) => (
                  <div key={di} style={{ width: mobile ? 10 : 12, height: mobile ? 10 : 12, borderRadius: 2, background: greens[level], transition: "transform 0.15s" }}
                    onMouseEnter={e => e.target.style.transform = "scale(1.4)"}
                    onMouseLeave={e => e.target.style.transform = "scale(1)"} />
                ))}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: mobile ? "flex-start" : "center", flexDirection: mobile ? "column" : "row", flexWrap: "wrap", gap: mobile ? 10 : 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, ...s.mono, fontSize: 11, color: "#71717a" }}>
              Less
              {greens.map((c, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }} />)}
              More
            </div>
            <div style={{ display: "flex", gap: mobile ? 12 : 20, ...s.mono, fontSize: mobile ? 10 : 11, color: "#71717a", flexWrap: "wrap" }}>
              <span><strong style={{ color: "#fafafa" }}>847</strong> sessions</span>
              <span><strong style={{ color: "#fafafa" }}>2.1M</strong> tokens</span>
              <span><strong style={{ color: "#fafafa" }}>$142</strong> estimated</span>
            </div>
          </div>

          {/* Donut */}
          <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "160px 1fr", gap: mobile ? 20 : 32, alignItems: "center", justifyItems: mobile ? "center" : "start", marginTop: mobile ? 20 : 32, paddingTop: mobile ? 20 : 32, borderTop: "1px solid #27272a" }}>
            <svg viewBox="0 0 160 160" style={{ width: mobile ? 120 : 140, height: mobile ? 120 : 140 }}>
              <circle cx="80" cy="80" r="60" fill="none" stroke="#18181b" strokeWidth="14" />
              <circle cx="80" cy="80" r="60" fill="none" stroke="#22d3ee" strokeWidth="14" strokeDasharray="150.8 226.2" strokeDashoffset="0" transform="rotate(-90 80 80)" strokeLinecap="round" />
              <circle cx="80" cy="80" r="60" fill="none" stroke="#a78bfa" strokeWidth="14" strokeDasharray="90.5 286.5" strokeDashoffset="-150.8" transform="rotate(-90 80 80)" strokeLinecap="round" />
              <circle cx="80" cy="80" r="60" fill="none" stroke="#34d399" strokeWidth="14" strokeDasharray="60.3 316.7" strokeDashoffset="-241.3" transform="rotate(-90 80 80)" strokeLinecap="round" />
              <circle cx="80" cy="80" r="60" fill="none" stroke="#f97316" strokeWidth="14" strokeDasharray="37.7 339.3" strokeDashoffset="-301.6" transform="rotate(-90 80 80)" strokeLinecap="round" />
              <text x="80" y="76" textAnchor="middle" fontFamily="monospace" fontSize="22" fontWeight="700" fill="#fafafa">4</text>
              <text x="80" y="94" textAnchor="middle" fontFamily="monospace" fontSize="10" fill="#71717a">tools</text>
            </svg>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { color: "#22d3ee", name: "Claude Code", val: "40%" },
                { color: "#a78bfa", name: "Cursor", val: "24%" },
                { color: "#34d399", name: "OpenAI Codex", val: "16%" },
                { color: "#f97316", name: "Gemini CLI", val: "10%" },
              ].map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, ...s.mono, fontSize: 12, color: "#a1a1aa" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }} />
                  {d.name}
                  <span style={{ marginLeft: "auto", color: "#fafafa", fontWeight: 600 }}>{d.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 13 TOOLS */}
      <section style={s.section} id="tools">
        <div style={{ ...s.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, color: s.accent, marginBottom: 12 }}>Coverage</div>
        <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, letterSpacing: -1.5, marginBottom: 12 }}>13 tools. Four data tiers.</h2>
        <p style={{ color: "#a1a1aa", fontSize: 16, maxWidth: 540, marginBottom: 48 }}>Each tool stores data differently. stackpulse reads the right format for each — ccusage, JSONL, SQLite, or git history.</p>

        {[
          { label: "Full data", desc: "sessions + tokens + cost + heatmap", tools: TOOLS_FULL, color: "#22d3ee" },
          { label: "Token data", desc: "sessions + tokens + heatmap", tools: TOOLS_TOKEN, color: "#a78bfa" },
          { label: "Session data", desc: "sessions only", tools: TOOLS_SESSION, color: "#f97316" },
          { label: "Git-based", desc: "sessions + commits + lines", tools: TOOLS_GIT, color: "#34d399" },
        ].map((tier, ti) => (
          <div key={ti} style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: tier.color }} />
              <span style={{ ...s.mono, fontSize: 13, fontWeight: 600 }}>{tier.label}</span>
              <span style={{ ...s.mono, fontSize: 11, color: "#71717a" }}>— {tier.desc}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {tier.tools.map((t, i) => (
                <div key={i} style={{ background: "#111113", border: "1px solid #27272a", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: 10, transition: "all 0.2s", cursor: "default" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#3f3f46"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#27272a"; e.currentTarget.style.transform = "translateY(0)"; }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: "#1f1f23", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{t.icon}</div>
                  <div>
                    <div style={{ ...s.mono, fontSize: 13, fontWeight: 500 }}>{t.name}</div>
                    <div style={{ ...s.mono, fontSize: 10, color: "#71717a", marginTop: 2 }}>{t.method}</div>
                    <div style={{ fontSize: 11, color: "#52525b", marginTop: 3 }}>{t.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* COMPARISON */}
      <section style={s.section} id="compare">
        <div style={{ ...s.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, color: s.accent, marginBottom: 12 }}>Landscape</div>
        <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, letterSpacing: -1.5, marginBottom: 12 }}>Good tools exist. Different problem.</h2>
        <p style={{ color: "#a1a1aa", fontSize: 16, maxWidth: 560, marginBottom: 48 }}>ccusage, CodexBar, and caut are excellent for what they do. stackpulse fills the gap none of them cover.</p>

        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", margin: mobile ? "0 -16px" : 0, padding: mobile ? "0 16px" : 0 }}>
          <table style={{ width: "100%", minWidth: mobile ? 580 : "auto", borderCollapse: "collapse", ...s.mono, fontSize: mobile ? 11 : 13 }}>
            <thead>
              <tr>
                {["", "ccusage", "CodexBar", "caut", "stackpulse"].map((h, i) => (
                  <th key={i} style={{ textAlign: "left", padding: mobile ? "10px 8px" : "12px 14px", color: "#71717a", fontWeight: 500, fontSize: mobile ? 9 : 11, textTransform: "uppercase", letterSpacing: 1, borderBottom: "1px solid #27272a", whiteSpace: "nowrap", ...(i === 4 ? { background: "rgba(34,211,238,0.04)", color: s.accent } : {}) }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row, i) => (
                <tr key={i}>
                  <td style={{ padding: mobile ? "10px 8px" : "13px 14px", borderBottom: "1px solid #1f1f23", color: "#fafafa", fontWeight: 500, whiteSpace: "nowrap" }}>{row.feature}</td>
                  <td style={{ padding: mobile ? "10px 8px" : "13px 14px", borderBottom: "1px solid #1f1f23", color: row.cc.startsWith("✓") ? "#22c55e" : "#71717a" }}>{row.cc}</td>
                  <td style={{ padding: mobile ? "10px 8px" : "13px 14px", borderBottom: "1px solid #1f1f23", color: row.cb.startsWith("✓") ? "#22c55e" : row.cb === "✗" ? "#71717a" : "#f97316" }}>{row.cb}</td>
                  <td style={{ padding: mobile ? "10px 8px" : "13px 14px", borderBottom: "1px solid #1f1f23", color: row.caut.startsWith("✓") ? "#22c55e" : row.caut === "✗" ? "#71717a" : "#f97316" }}>{row.caut}</td>
                  <td style={{ padding: mobile ? "10px 8px" : "13px 14px", borderBottom: "1px solid #1f1f23", background: "rgba(34,211,238,0.04)", color: row.spWin ? "#22c55e" : "#71717a", fontWeight: row.spWin ? 600 : 400 }}>{row.sp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={s.section}>
        <div style={{ ...s.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, color: s.accent, marginBottom: 12 }}>How it works</div>
        <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, letterSpacing: -1.5, marginBottom: 48 }}>Three steps. Ten seconds.</h2>

        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
          <div style={{ position: "absolute", left: 19, top: 44, bottom: 44, width: 1, background: "#27272a" }} />

          {[
            { num: "1", title: "Run the command", desc: "npx stackpulse — no install needed. The interactive wizard auto-detects AI tools on your machine and lets you add more manually." },
            { num: "2", title: "Choose your metrics", desc: "Pick from sessions, tokens, cost, commits, or lines written. Customize title, handle, theme — or use a YAML config to skip the wizard entirely." },
            { num: "3", title: "Get your card", desc: "Opens stackpulse.html in your browser. Per-tool heatmap rows, donut chart, model breakdowns. Export PDF or share directly on X." },
          ].map((step, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "40px 1fr", gap: 24, alignItems: "start", padding: "20px 0" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#18181b", border: "1px solid #27272a", display: "flex", alignItems: "center", justifyContent: "center", ...s.mono, fontSize: 14, fontWeight: 600, color: s.accent, position: "relative", zIndex: 1 }}>{step.num}</div>
              <div>
                <h3 style={{ ...s.mono, fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{step.title}</h3>
                <p style={{ color: "#a1a1aa", fontSize: 14 }}>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* STATS BAR */}
      <section style={{ padding: mobile ? "40px 16px" : "64px 24px", borderTop: "1px solid #27272a", borderBottom: "1px solid #27272a" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: mobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: mobile ? 24 : 32, textAlign: "center" }}>
          {[
            { num: "No", label: "Network Requests" },
            { num: "No", label: "API Keys" },
            { num: "No", label: "Telemetry" },
            { num: "100%", label: "Local" },
          ].map((stat, i) => (
            <div key={i}>
              <div style={{ ...s.mono, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 700, letterSpacing: -2, color: "#fafafa" }}>{stat.num}</div>
              <div style={{ ...s.mono, fontSize: 11, color: "#71717a", textTransform: "uppercase", letterSpacing: 1.5, marginTop: 4 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* THEMES */}
      <section style={s.section} id="themes">
        <div style={{ ...s.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, color: s.accent, marginBottom: 12 }}>Customization</div>
        <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 700, letterSpacing: -1.5, marginBottom: 12 }}>7 themes. Pick your vibe.</h2>
        <p style={{ color: "#a1a1aa", fontSize: 16, marginBottom: 48 }}>
          Use <code style={{ ...s.mono, background: "#18181b", padding: "2px 8px", borderRadius: 4, fontSize: 14, color: s.accent }}>--theme</code> to switch.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: mobile ? "repeat(auto-fill, minmax(90px, 1fr))" : "repeat(auto-fill, minmax(120px, 1fr))", gap: mobile ? 8 : 12 }}>
          {THEMES.map((t, i) => {
            const isLight = t.name === "Light" || t.name === "Arctic";
            return (
              <div key={i} style={{ background: t.bg, borderRadius: 10, padding: "18px 14px", textAlign: "center", ...s.mono, fontSize: 12, fontWeight: 500, color: t.text, border: `1px solid ${isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.06)"}`, transition: "transform 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-3px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
                <MiniHeatmap cellBg={t.cell} onBg={t.on} />
                {t.name}
                <div style={{ fontSize: 9, color: isLight ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.35)", marginTop: 3 }}>{t.vibe}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: mobile ? "60px 16px" : "120px 24px", textAlign: "center", position: "relative" }}>
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 800, height: 400, background: "radial-gradient(ellipse at center, rgba(34,211,238,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ ...s.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 2, color: s.accent, marginBottom: 12 }}>Get started</div>
        <h2 style={{ fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 800, letterSpacing: -2, marginBottom: 16 }}>See your pulse.</h2>
        <p style={{ color: "#a1a1aa", fontSize: 16, marginBottom: 40 }}>One command. All your AI tools. Your machine only.</p>

        <div onClick={() => handleCopy("bottom")} style={{ background: "#111113", border: `1px solid ${copiedBottom ? s.accent : "#27272a"}`, borderRadius: 12, padding: mobile ? "12px 18px" : "16px 28px", ...s.mono, fontSize: mobile ? 14 : 16, display: "inline-flex", alignItems: "center", gap: mobile ? 10 : 16, cursor: "pointer", transition: "all 0.2s", maxWidth: "100%" }}>
          <span style={{ color: s.accent }}>$</span>
          <span>npx stackpulse</span>
          <span style={{ fontSize: 11, color: copiedBottom ? "#34d399" : "#71717a", background: copiedBottom ? "rgba(52,211,153,0.1)" : "#18181b", padding: "4px 10px", borderRadius: 4, whiteSpace: "nowrap" }}>
            {copiedBottom ? "✓ copied" : "copy"}
          </span>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: mobile ? "32px 16px" : "40px 24px", borderTop: "1px solid #27272a" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: mobile ? "column" : "row", justifyContent: "space-between", alignItems: mobile ? "center" : "center", gap: 16, textAlign: mobile ? "center" : "left" }}>
          <span style={{ ...s.mono, fontSize: 13, color: "#71717a" }}>
            stackpulse · built by <a href="https://github.com/KrishnaSathvik" target="_blank" rel="noreferrer" style={{ color: "#a1a1aa", textDecoration: "none" }}>@KrishnaSathvik</a>
          </span>
          <div style={{ display: "flex", gap: 20 }}>
            {[
              { label: "npm", href: "https://www.npmjs.com/package/stackpulse" },
              { label: "GitHub", href: "https://github.com/KrishnaSathvik/stackpulse" },
              { label: "𝕏", href: "https://x.com/latentengineer_" },
            ].map((l, i) => (
              <a key={i} href={l.href} target="_blank" rel="noreferrer" style={{ ...s.mono, fontSize: 12, color: "#71717a", textDecoration: "none" }}>{l.label}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
