/**
 * data/sample.js — ILLUSTRATIVE sample data for visual testing. Not real usage.
 * Deterministic (seeded) so renders are comparable run to run. Deliberately
 * includes all 13 tools, sessions-only tools, an unpriced model and a very
 * long model ID to stress the layout.
 */

function prng(seed) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}

const PROFILE = {
  claude_code: { weight: 1.0, models: ['claude-opus-4-6', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5'] },
  codex:       { weight: 0.55, models: ['gpt-5.5-codex-max', 'gpt-5-codex'] },
  opencode:    { weight: 0.22, models: ['anthropic/claude-sonnet-4-5', 'qwen3-coder-plus-2026-09-experimental-long-context'] },
  amp:         { weight: 0.09, models: ['claude-sonnet-4-5'] },
  pi:          { weight: 0.05, models: ['gpt-5-mini'] },
  gemini:      { weight: 0.14, models: ['gemini-2.5-pro'], noCost: true },
  qwen:        { weight: 0.03, models: ['qwen3-coder-plus'] },
  kimi:        { weight: 0.02, models: ['kimi-k2-turbo-preview'], unpriced: true },
  roocode:     { weight: 0.04, models: [] },
  kilocode:    { weight: 0.02, models: [] },
  cursor:      { sessionsOnly: true },
  antigravity: { sessionsOnly: true },
  aider:       { sessionsOnly: true },
};

export function sampleTools() {
  const rand = prng(42);
  const tools = {};
  for (const [key, p] of Object.entries(PROFILE)) {
    const daily = [];
    let tokens = 0, cost = 0, sessions = 0;
    for (let d = 2; d <= 31; d++) {
      const weekend = [0, 6].includes(new Date(Date.UTC(2026, 9, d)).getUTCDay());
      if (rand() < (weekend ? 0.75 : 0.3)) continue;
      const s = 1 + Math.floor(rand() * (p.sessionsOnly ? 6 : 9));
      const t = p.sessionsOnly ? 0 : Math.round(p.weight * (180_000 + rand() * 900_000) * (d > 20 ? 1.6 : 1));
      const c = p.noCost || p.unpriced ? 0 : t * 4.2e-6;
      daily.push({ date: `2026-10-${String(d).padStart(2, '0')}`, toolKey: key, sessions: s, totalTokens: t, totalCost: c });
      tokens += t; cost += c; sessions += s;
    }
    const split = [0.6, 0.3, 0.1];
    tools[key] = {
      sessions,
      tokens_used: p.sessionsOnly ? null : tokens / 1000,
      cost_usd: p.sessionsOnly || p.noCost || p.unpriced ? null : cost,
      cost: { usd: p.sessionsOnly || p.noCost || p.unpriced ? null : cost, kind: p.sessionsOnly || p.noCost || p.unpriced ? 'unavailable' : 'estimated', partial: false },
      tokens: p.sessionsOnly ? null : { input: tokens * 0.07, output: tokens * 0.05, cacheRead: tokens * 0.8, cacheWrite: tokens * 0.08, total: tokens },
      modelBreakdown: (p.models || []).map((m, i) => ({ model: m, displayName: null, tokens_used: tokens * (split[i] ?? 0.05) / 1000, missingPricing: !!p.unpriced })),
      daily,
    };
  }
  return tools;
}
