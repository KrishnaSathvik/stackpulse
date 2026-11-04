# Changelog

## 3.4.0 — 2026-11-04

A new terminal experience, a clearer report, and two Codex accuracy fixes. Config files and existing
flags are unchanged.

### Report
- **Token composition**: a new section splits tokens into cache reads, cache writes, output and uncached
  input, with a row per tool. A tool's tokens that it does not split by type are shown as *Other*, so the
  parts always add up to the total. The numbers are the same ones the terminal details view shows.
- Model rows show the exact model ID under its display name, and long IDs wrap instead of widening the
  table.
- Each tool's cost says where it came from: `est.`, `rec.` or `mixed`.
- Keyboard focus is visible on the buttons, the scrollable tables can be scrolled with the keyboard, and
  the charts have text descriptions for screen readers.
- On phones, the activity grid scrolls inside its panel instead of widening the page. Sections no longer
  split across pages when printed.
- The StackPulse logo appears in the browser tab and the report footer, and prints in the PDF. It is
  embedded in the file, so the report still needs nothing else to open.
- Printed or saved as PDF, tool totals no longer wrap onto two lines, and the activity grid fits the page
  width.
- Costs show to the cent with thousands separators (`$1,234.56`), the same figure the terminal prints.
  Larger amounts were rounded or shortened before (`$1,235`, `$12.4k`).

### Codex accuracy
- **Cost used today's service tier for past usage.** When a Codex session did not record its service
  tier, the collector priced it at the `service_tier` in your current `~/.codex/config.toml`. With
  `priority` set there, older usage was charged at twice the standard rate. Tiers that sessions recorded
  are still used. Usage with no recorded tier is now priced at the standard rate. When your config sets
  another tier, the scan, the details view and the report also show the estimate at that tier, so the
  assumption is visible.
- **Forked subagent sessions were missing.** A forked Codex session that Codex wrote in one pass after
  compaction was dropped entirely, with its own usage. Those sessions are now counted. History that the
  fork replays from its parent session is excluded, so nothing is counted twice. A fork whose parent
  session is missing is not counted and is reported instead.
- To read those forks, the collector is given private temporary copies that hold usage numbers only, never
  the conversation. They are removed when the scan ends, fails or is interrupted, and any left by a crash
  are removed at the next scan.
- Codex auto-review usage has no published price; the collector counts and prices it as `gpt-5.6-luna`.
  The details view and the report now say so wherever a `gpt-5.6-luna` row appears.

### Package
- Only the images the README shows, and their attribution, ship from `website/`. Unused logos no longer
  ship. The README now opens with the terminal, then shows the report.

### Readable on any terminal
- Ordinary text uses the terminal's own foreground colour. Tool names, model IDs, counts and help
  text were forced white or dim and nearly vanished on light backgrounds.
- Accents are limited to colours that read on light and dark themes, and every state also has a
  symbol (✓ ! ✖ —), so nothing depends on colour alone. `NO_COLOR` is respected.
- The terminal is no longer cleared on start, so your scrollback is kept.

### Shorter flow
- A compact heading replaces the ASCII-art logo.
- The scan shows a spinner, then one table row per tool with sessions, tokens and cost, plus
  "N tools detected · M not found" instead of a line for every missing tool.
- One menu: **Generate report**, **Generate and open in browser**, **Customize report**,
  **View details**, **Exit**. Accepting the defaults takes one keypress.
- **Customize report** asks for tools, metrics and report details in one pass, with no
  "Press Enter to continue" confirmations between steps. Detected tools are pre-selected.
- In manual entry, a blank field means unknown for every number, not only cost. An explicit `0`
  stays zero.
- Ctrl+C exits cleanly: "Cancelled. No report was written."

### Details on request
- **View details** (or `--details`) shows each tool's token composition (input, output, cache
  read, cache write) and every model with tokens and cost, with full model IDs. It also shows
  detection results for all 13 tools.
- Cost labels: `est.` (API list price, not a bill), `rec.` (recorded by the tool), and `≥` for
  a lower bound. Missing data shows `—`, never 0.
- Incomplete sources, collector warnings and read failures stay visible under the table.

### Completion
- The long X share URL is no longer printed; the report's own Share button is unchanged.
- The success screen shows the file, theme, included tools and any coverage warning, plus how
  to open the file. `--open` (or the menu option) opens it in your default browser without a
  shell. Success is reported only when the system opener succeeds.

### Layout
- Output adapts to the terminal width. Tables fall back to a stacked list on narrow terminals,
  and paths and model IDs are never cut.
- Tools are listed in a fixed order. Previously they followed whichever scan finished first.

### Scripting
- Non-interactive runs (pipes, CI) and `--yes` write the default report without prompting.
- Unwritable output paths fail with a clear message instead of a stack trace.
- `figlet` is no longer a dependency.

## 3.3.1 — 2026-11-03

### Report layout
- The title no longer repeats the sessions, tokens, and cost already shown in the totals.
- The sessions chart sits beside its legend, and the tool table uses the full width of the report.

## 3.3.0 — 2026-11-03

Correctness release. No CLI flags, config keys or themes removed.

### Accuracy fixes
- **Codex, OpenCode, Amp and Pi reported nothing**: their `@ccusage/*` packages became
  deprecation stubs. All collector-backed tools now use one pinned `ccusage@20.0.46` run.
- **Claude Code totals included other tools** (unified collector output was attributed to Claude);
  each tool now gets only its own usage.
- **Session counts** are real sessions, no longer the number of active days.
- **Codex tokens**: reasoning was added on top of output (it is already inside it).
- **Gemini CLI, Qwen Code and Kimi** read 0 tokens from every real install — the native parsers
  targeted formats those tools never wrote. They now use the collector and read current formats.
- **Antigravity** now reports tokens and models from its conversation databases (the IDE session
  index remains as a sessions-only fallback).
- **Kilo Code** reads the Kilo CLI database with recorded cost; the legacy extension history is a
  fallback only, because current Kilo migrates it into that database (no double counting).
- **Roo Code / Kilo extension** always reported 0 (wrong storage key); Roo's per-task history files
  are now read as authoritative.
- **Cursor** counted a composer twice when it appeared in global and workspace storage.
- **Cursor** on large histories: a database that times out or cannot be read now marks Cursor
  *incomplete* with the reason (or *failed* when nothing else is readable) instead of silently
  dropping its sessions. Composer and message queries use the key index (a measured 34 GB
  database: 46 s → 0.1 s), and the `sqlite3` CLI path (Node 20) no longer stalls on large values,
  with a bounded 120 s per-query timeout (`STACKPULSE_SQLITE_TIMEOUT_MS`, 1 s – 10 min).
- **Aider** scanned `~/Projects` and `~/projects` (and `Code`/`code`, …) twice on case-insensitive
  filesystems (macOS, Windows), doubling sessions, commits and lines; directories reached through
  symlinks were also counted again. Directories are now matched by filesystem identity.
- **Aider** commits follow aider's own attribution (author `(aider)`, `Co-authored-by: aider` trailer,
  `aider:` prefix) instead of any commit mentioning "aider".
- Heatmap dates no longer shift by a day outside UTC.

### Cost honesty
- Unknown cost is shown as "—", never `$0`; a real zero shows `$0.00`; sub-cent costs show `<$0.01`.
- Costs are labelled *(est.)* when estimated, with the pricing source; a total that excludes usage
  with no known price is starred as a lower bound. Kilo and Roo costs are labelled recorded.
- Unknown model IDs are shown exactly as recorded.

### Reliability and security
- No shell anywhere: all subprocesses use `execFile`; SQLite is read-only via `node:sqlite` or
  the `sqlite3` CLI with bound parameters.
- Every value in the HTML card is escaped; colours are allow-listed.
- Collector failures are reported (missing binary, out of memory, timeout, bad output) instead of
  showing as "no data"; collector warnings appear under the affected tool.
- "Out of memory" is reported only on evidence: the collector's allocation-failure message
  (definite), or a SIGKILL while the kernel's cgroup OOM-kill counter rose (container limits).
  That counter is shared with other processes, so it is reported as a *probable* memory-related
  termination. Any other kill is reported as "stopped by SIGKILL (not identified as out-of-memory)".
- Every source is classified complete / incomplete / failed / absent. A partly readable source
  (e.g. a corrupt Antigravity database) marks that tool *incomplete* in the scan and on the card;
  a fallback used because the main source failed is marked incomplete too, never shown as clean.
- Unreadable Kilo/OpenCode databases, which the collector skips without a warning, are detected
  and reported.
- A user's `ccusage.json` can no longer change stackpulse's numbers.
- Warns when Claude logs are written in a format the collector skips (spaced JSON).
- Spinner no longer hangs on terminals that report zero width.

### Report readability
- **Values were unreadable on their own bars**: each number was drawn in the tool's colour on top of a
  bar of the same colour. Values now sit beside a slim bar, so they read clearly in every theme.
- **Clearer text and headings**: section headings, stat icons and the handle use the theme's accent;
  totals, model names, column headers and heatmap labels are higher-contrast and bolder.
- **Activity "active days" counted a day once per tool** (a year could show 525 active days). It now
  counts distinct dates, and no longer shows a session total that disagreed with the card's own total.
- **Billions of tokens** read as `5.36B` instead of `5363.7M`; "1 session" is singular.
- Table rows appear immediately when printing or with reduced motion enabled.

### Command line
- `--theme`, `--title`, `--timeframe` and `--username` now override a `--config` file, as `--help`
  always said; they were silently ignored before.
- Unknown themes, and missing or malformed config files, stop with a clear message instead of a
  stack trace (or, for themes, a silent fallback to `dark`).
- Running on an unsupported Node version prints the requirement instead of an unrelated
  `SyntaxError` (new `bin/stackpulse.js` launcher).
- Dependency security updates: `js-yaml` 4.3.2, `figlet` 1.12.0.

### Requirements
- Node.js **20.12+** (3.x never ran on Node 18; `engines` now says so). Node 22.13+ recommended.

### Docs
- README no longer promises a PNG export button or a `--no-png` flag that never existed.
- README explains that token totals are exact while session counts follow the collector's
  file-based, read-order-dependent attribution of resumed sessions.


## 3.2.0 (2026-03-12)

### Features
- Renamed project to **stackpulse** (`npx aicard`)
- Smart donut chart — auto-picks the most balanced metric instead of always using sessions
- Precise session counts — shows exact numbers with commas (1,971 not 2.0k)
- Better Share on X — lists each tool with individual stats
- Per-tool heatmap legend with actual tool colors
- Save as PNG button in HTML card (via html2canvas)
- Auto-detect PNG CLI tool — skips prompt if wkhtmltoimage not installed
- 7 color-coded themes visible in wizard without scrolling

### Fixes
- **Cursor parser rewrite** — reads `cursorDiskKV` table (modern format) instead of only legacy `ItemTable`
- **Codex heatmap fix** — `@ccusage/codex` returns dates as "Feb 02, 2026" not ISO; added `normalizeDate()` to all ccusage parsers
- **Heatmap data preservation** — fixed `allData` shallow merge that wiped `daily[]` arrays; added `scannedSnapshot` fallback
- **Generator heatmap resilience** — handles missing `toolKey` field with multi-pass fallback

### Hardened Parsers
- **Kimi CLI** — corrected storage path to `~/.kimi/sessions/`, reads `kimi.json` index for session count
- **Antigravity** — dynamic key discovery instead of hardcoded guesses
- **Aider** — reduced scan depth, 5s timeout cap, max 10 repos, skip home root
- **OpenCode** — JSON sanitizer for logger contamination bug in `@ccusage/opencode`
- **Roo Code / Kilo Code** — added fragility warnings for key pattern matching

## 3.0.0 (2026-03-11)

### Initial Release
- 13 AI tool parsers (Claude Code, Codex, Cursor, Gemini CLI, Aider, and 8 more)
- Interactive 3-step wizard (tools → metrics → card details)
- 7 visual themes (dark, light, cosmic, forge, arctic, verdant, neon)
- GitHub-style activity heatmap
- Donut chart + bar table with model breakdown
- YAML/JSON config file support
- Share on X integration
- PNG export via wkhtmltoimage
