# Website screenshot pipeline

Every product image on the site is real StackPulse output, generated from a
fictional, deterministic demo home directory (a year of activity across five
tools). No real usage data is involved.

Regenerate after any change to the CLI output or the report:

```bash
# 1. Fictional demo data (Claude Code, Codex, Gemini CLI, Cursor, Aider; 364 days)
node scripts/make-demo-home.mjs /tmp/sp-demo-home           # Node 22.5+, git

# 2. One report per theme, written by the real CLI
for t in dark light cosmic forge arctic verdant neon; do
  mkdir -p /tmp/sp-cards/$t && (cd /tmp/sp-cards/$t && HOME=/tmp/sp-demo-home TZ=UTC \
    node <path-to-stackpulse-repo>/index.js --yes --theme $t --username @demo -o card); done

# 3. Screenshot the reports into src/assets/shots/ (needs Puppeteer, Chrome, cwebp):
#    card-* (hero), stats/table/donut/heatmap/tokens-* close-ups at 3x, theme-* for all 7 themes
PUPPETEER=<puppeteer esm entry> node scripts/capture.mjs /tmp/sp-cards src/assets/shots

# 4. Terminal panels: drive the interactive CLI in a pseudo-terminal, then replay the
#    stream through a terminal emulator into src/data/terminal-capture.json
python3 scripts/drive-cli.py <path-to-stackpulse-repo> /tmp/sp-demo-home /tmp/sp-term
XTERM=<path to @xterm/headless> node scripts/terminal-export.mjs /tmp/sp-term src/data/terminal-capture.json
#    …and again at 42 columns for phones (the CLI's stacked layout)
python3 scripts/drive-cli.py <path-to-stackpulse-repo> /tmp/sp-demo-home /tmp/sp-term-narrow 42
XTERM=<path to @xterm/headless> node scripts/terminal-export.mjs /tmp/sp-term-narrow src/data/terminal-capture.json 42 Narrow

# 5. README images (assets/cli-dark.png, assets/card-dark.png)
PUPPETEER=<puppeteer esm entry> node scripts/readme-images.mjs /tmp/sp-cards ../assets
```

Then update `src/data/shot-sizes.json` (width/height of each `.webp`, used to
reserve layout space). `terminal-capture.json` holds three parts: `summary` (the
scan table and notes), `menu` (the same screen with the menu) and `details` (the
Claude Code details view), each also as a 42-column `…Narrow` version shown on phones.

Cards are cropped above their footer, which holds the "Share on X" button.

`prototype-assets/` keeps the in-progress report redesign renders. They are not
used by the site; when that renderer ships, regenerate the shots from it and
they replace the current report imagery in place.

Integration logos and their sources: `src/assets/tools/SOURCES.md`.
