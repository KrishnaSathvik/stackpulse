# Changelog

## 3.3.0 — UNRELEASED DRAFT (not published)

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
