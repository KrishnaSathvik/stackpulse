# Report engine prototype (StackPulse 4.0)

Not shipped — this directory is outside the npm `files` list and has its own
dev dependency. It answers one question before we commit to an architecture:
**can hand-composed SVG + resvg produce share-quality PNGs without Chromium?**

```bash
cd prototypes/report-v4
npm install
node render.js --all          # → out/{pulse,editorial}-{sample,fixture,single,empty}.{svg,png}
```

## Pipeline

```
normalized tool records (M1 data contract)
  → view-model.js        totals + coverage, tool share, ranked models, 30-day activity, insights
  → styles/pulse.js      dark graphite, one dominant number
    styles/editorial.js  off-white, ink typography, 3-column grid
  → SVG (escaped text, estimated text widths, truncation)
  → @resvg/resvg-js      PNG at 2× (2400×1260), explicit font files, no system font lookup
```

## Findings

| Question | Result |
|---|---|
| Render time | 70–125 ms per card (2400×1260) |
| Added dependency | `@resvg/resvg-js` ≈ 4.3 MB per platform (prebuilt, no compile) |
| Fonts | Inter + JetBrains Mono loaded from files; both OFL — bundle ~1.5 MB of subsets in 4.0 |
| Network | none |
| Data fidelity | `fixture` card renders real collector output: 24.2K tokens, 4 sessions, unpriced model starred |
| Edge cases | 13 tools (folds to 5 + "N more"), sessions-only tool, no data, long model IDs all render without overlap |

## Known limits (decide in M4/M5)

- Text widths are estimated (0.6 em/char); a real measure (fontkit, or Satori's
  layout) would let labels sit tighter. Estimates are deliberately generous.
- Only the wide 1200×630 layout exists; square and landscape need their own compositions.
- Model ranking uses all-time breakdowns because 3.x data has no per-day model split;
  the card says so in its footnote.
- Colors: categorical slots come from the validated dataviz reference order
  (dark mode passes all checks; light mode needs visible labels, which Editorial has).
