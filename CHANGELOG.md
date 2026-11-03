# Changelog

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
