# Website screenshot pipeline

Every product image on the site is real StackPulse output, generated from a
fictional, deterministic demo home directory (a year of activity across five
tools). No real usage data is involved.

Regenerate after any change to the CLI's report (for example the 3.3.0 bar-label
readability fix, or the 4.0 redesign):

```bash
# 1. Fictional demo data (Claude Code, Codex, Gemini CLI, Cursor, Aider; 364 days)
node scripts/make-demo-home.mjs /tmp/sp-demo-home           # Node 22.5+, git

# 2. Drive the real interactive CLI through a pseudo-terminal, once per theme
#    (theme index = position in the CLI's theme list: 0 dark … 6 neon)
i=0; for t in dark light cosmic forge arctic verdant neon; do
  python3 scripts/drive-cli.py <path-to-stackpulse-repo> /tmp/sp-demo-home /tmp/sp-cards/$t $i /tmp/sp-cards/$t/terminal.raw
  i=$((i+1)); done

# 3. Screenshot the cards into src/assets/shots/ (needs Puppeteer, Chrome, cwebp):
#    card-* (hero), stats/table/donut/heatmap-* close-ups at 3x, theme-* for all 7 themes
PUPPETEER=<puppeteer esm entry> CHROME=<chrome binary> node scripts/capture.mjs /tmp/sp-cards src/assets/shots
```

Then update `src/data/shot-sizes.json` (width/height of each `.webp`, used to
reserve layout space) and re-export `src/data/terminal-capture.json` by
replaying `dark/terminal.raw` through a VT emulator (pyte, a 100×1000 screen;
read the file with `newline=''` so carriage returns survive). `scan` is the
"Scanning for AI tools…" block down to its closing rule; `summary` is the
per-tool/per-model list printed after "Your AI Card".

Cards are cropped above their footer, which holds the "Share on X" button.

`prototype-assets/` keeps the in-progress report redesign renders. They are not
used by the site; when that renderer ships, regenerate the shots from it and
they replace the current report imagery in place.

Integration logos and their sources: `src/assets/tools/SOURCES.md`.
