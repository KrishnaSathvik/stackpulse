# StackPulse M0 baseline audit + M1 critical fixes

> **Superseded in part by [M1-verification.md](M1-verification.md)** (review follow-up): Node 18
> is not supported (never was), cost semantics are now per record, unknown model IDs display
> verbatim, and the test counts below are out of date.

Branch: `modernization/m0-m1` (local only — nothing committed, pushed or published)
Baseline: `master` @ `195a108` (npm 3.2.3) · Node 22.23 · Linux · 2026-10-31

## How the evidence was gathered

1. Built a fixture home directory (`tests/fixtures/home-basic`) with real-format
   Claude Code and Codex session logs whose correct totals are known by hand:
   3 Claude sessions on 2 days, a duplicated streaming message, an unknown future
   model (`claude-zephyr-9-1`), a malformed line, and a Codex session that switches
   model mid-session.
2. Ran the **3.2.3 parsers unchanged** against it (`HOME=<fixture>`).
3. Ran the **real collector** (`ccusage@20.0.46`) against the same fixture and kept
   its JSON as a test fixture.
4. Wrote tests for the correct behaviour, then fixed until they passed.

### Ground truth vs 3.2.3

| | Correct | 3.2.3 reported |
|---|---|---|
| Claude Code tokens | 14,700 | **24,000** (Codex folded in) |
| Claude Code models | 4 Claude models | **+ GPT-5 Codex, GPT-5.5 Codex Max** |
| Claude Code heatmap dates | 2026-10-20, 2026-10-21 | **null, null** (no heatmap) |
| Claude Code sessions | 3 | **2** (active-day count fallback) |
| Codex | 1 session, 9,500 tokens | **null — no data** |
| Unknown-model cost | unavailable | **$0.00**, totals silently low |
| Scan time (5 collector tools, warm npx cache) | — | **5.5 s**; new: **0.2 s** for all 13 adapters |

## Findings

Severity: **P0** wrong data or security, **P1** reliability/accuracy, **P2** hygiene.
Status: ✅ fixed in this patch · 🔶 partly fixed · ⏭ deferred (milestone).

| # | Sev | Finding | Evidence | Status |
|---|---|---|---|---|
| 1 | P0 | `ccusage` v20 became a multi-agent CLI. The Claude parser's `ccusage daily` call now returns **all agents**, so Codex/OpenCode/Amp/Pi usage is attributed to Claude Code and then counted again by their own adapters. | Fixture: 24.0K vs 14.7K | ✅ |
| 2 | P0 | `@ccusage/codex`, `/opencode`, `/amp`, `/pi` 19.0.0 (what `@latest` resolves to) are deprecation stubs printing `use npx ccusage instead`. **Four adapters return no data for every user.** | `npx @ccusage/codex@latest daily --json` | ✅ |
| 3 | P0 | Every collector ran `npx …@latest` through a shell: unpinned code downloaded at scan time, fails offline, and a compromised publish would run on users' machines. | `parsers/*.js` `execSync(\`npx ${pkg}@latest …\`)` | ✅ |
| 4 | P0 | HTML generator interpolated title, timeframe, handle, tool/model names and colours unescaped — stored XSS via a config file or a crafted model ID, and CSS injection via `color`. | `<img onerror>` / `<script>` survived into output | ✅ |
| 5 | P0 | SQLite and git calls were shell strings with interpolated paths (`sqlite3 "${dbPath}" …`, `find "${root}"`, `git -C "${repo}" … \| wc`). A directory name containing `"$(…)"` executes. Item keys were also spliced into SQL. | Test creates a path with `$(touch PWNED)`; no file is created now | ✅ |
| 6 | P0 | Session count fell back to **number of active days** when the session call failed — always, after v20 renamed `sessions` → `session`. | `sessions?.sessions?.length ?? days.length` | ✅ |
| 7 | P1 | Codex model tokens added `reasoningOutputTokens` on top of `outputTokens` (reasoning is already inside output) and read a `cachedInputTokens` field that no longer exists. | ccusage codex JSON | ✅ |
| 8 | P1 | Missing cost became `$0` everywhere (Gemini hardcoded 0; unpriced models summed as 0; Cursor/Roo/Kilo/Antigravity/Aider 0). Generator rendered real 0 and unknown identically as "—". | | ✅ null = unavailable, 0 = zero, cost labelled *est.*, unpriced models footnoted |
| 9 | P1 | Qwen/Kimi priced unknown models at an invented `default` rate; Antigravity/Gemini/Qwen/Kimi filled in placeholder model names ("Gemini 3 Pro", "Kimi K2.5"). | | ✅ never invented |
| 10 | P1 | Roo Code / Kilo Code always reported 0. VS Code stores an extension's globalState as one row keyed by extension ID; the parser only read keys *named* like `taskHistory`. The loose `cline` match could also pick up the separate Cline extension. | Fixture DB | ✅ reads `taskHistory` from the extension row (tasks, tokens, recorded cost, dates); exact extension IDs; needs live-install confirmation in M2 |
| 11 | P1 | Heatmap dates used `toISOString()` on local-midnight dates: shifted one day for users east of UTC. Same bug in Cursor/Aider date extraction. | Tests across Asia/Kolkata, LA, Kiritimati | ✅ |
| 12 | P1 | Parser failures swallowed (`catch {}`) — "no data" and "broken" looked identical. | | 🔶 scan now prints the reason; collector errors are typed (`not-installed`, `timeout`, `exit`, `invalid-json`); Cursor reports unreadable DBs. A `doctor` command is M3. |
| 13 | P1 | `sqlite3` CLI required (absent on Windows by default). | | ✅ uses built-in `node:sqlite` on Node ≥ 22.5, `sqlite3` via execFile otherwise |
| 14 | P1 | Aider used `find`, `wc`, `awk`, `which` — POSIX-only. | | ✅ fs walk + one `git` execFile per repo |
| 15 | P1 | README promised "Save as PNG via html2canvas" and a `--no-png` flag; neither exists. Landing page repeated the PNG claim. | `grep html2canvas` → none | ✅ docs corrected; native PNG is the 4.0 prototype |
| 16 | P1 | Kimi: newer Kimi Code stores sessions under `~/.kimi-code/` (`wire.jsonl`); session count used `max(kimi.json keys, file count)` — keys are working directories, files are not sessions. | ccusage 20 binary reads `.kimi-code`, `wire.jsonl` | 🔶 path detected; correct parsing ⏭ M2 |
| 17 | P1 | Cursor may double count: global `cursorDiskKV` composers plus legacy per-workspace `allComposers` can describe the same composer. | Code reading | ⏭ M2 (needs real profiles) |
| 18 | P1 | Aider attribution greps "aider" in any commit message; aider's default attribution is `(aider)` in the author/committer name. | | ⏭ M2 |
| 19 | P2 | Version printed as 3.2.0 while package is 3.2.3. | | ✅ read from package.json |
| 20 | P2 | 3,719 `node_modules` files, `.DS_Store` ×4, `nul`, `wkhtmltopdf.pkg`, an inert `gitignore`, and three generated cards (likely personal usage data) were tracked. | `git ls-files` | ✅ untracked/removed in the index (not committed); generated cards left on disk |
| 21 | P2 | No automated tests; `prepublishOnly` only ran `node --check`. | | ✅ 29 offline tests; `prepublishOnly` runs them |
| 22 | P2 | `index.js` (609 lines) and `generator.js` (502) mix concerns. | | ⏭ M3 — new code lives in `src/`, no big-bang move |

## What changed

```
src/collectors/ccusage.js   pinned ccusage@20.0.46 dependency, one shell-free call
                            (daily --by-agent --sections daily,session --offline) shared by
                            all collector adapters; pure normalizer; typed errors
src/models/catalog.js       display names from family patterns; raw IDs always kept
src/utils/{html,sqlite,dates}.js   escaping + colour allowlist, safe read-only SQLite, local dates
parsers/vscode-task-history.js     shared Roo/Kilo reader
parsers/*                   collector adapters reduced to detect() + one call; no shell anywhere;
                            null for anything a tool does not record
generator.js                escapes everything; "—" = unavailable with tooltip, 0 = zero;
                            coverage ("1 of 2 tools"), "(est.)" label, unpriced footnote
index.js                    keeps null, passes cost provenance, prints failure reasons, real version
tests/                      fixtures + node:test suites (core, adapters, reporting, cli, models)
prototypes/report-v4/       Pulse + Editorial SVG/PNG prototypes (not shipped)
```

### Collector token semantics (verified against 20.0.46)

`input` excludes cache reads (Codex cached input is moved out) · `output` includes
reasoning · `cacheRead`, `cacheCreation` are separate · **total = input + output +
cacheRead + cacheCreation**. Duplicate streaming entries (same message + request ID)
are counted once.

## Compatibility (3.x)

No CLI flags, config keys or themes were removed. Visible behaviour changes, all deliberate:

- Tools that don't record a metric show "—" (with a tooltip) instead of a value; a real zero now shows `0` / `$0.00`.
- Claude Code totals will **drop** for anyone who also uses Codex/OpenCode/Amp/Pi (they were double counted).
- Codex/OpenCode/Amp/Pi **start reporting again**.
- Session counts change from active days to real sessions.
- Cost is labelled *(est.)* with a one-line footnote; unpriced models are listed.
- Install adds ~5.4 MB (pinned collector, one platform binary) instead of downloading on every run.

That fits a **3.3.0** minor release. ~~Node 18 stays supported~~ — corrected: 3.x has never run on Node 18; `engines` is now `>=20.12.0` (see M1-verification).

## Verification

```bash
npm test                                   # 29 pass, 0 fail — also passes with HTTP(S)_PROXY pointed at a dead port
npm pack --dry-run                         # 26 files, 41.7 kB; no tests/fixtures/prototypes
cd prototypes/report-v4 && npm i && node render.js --all
```

Not yet verified: macOS and Windows, live installs of every tool (all adapters except
the collector path are fixture-verified only), and the interactive wizard driven end to end
(its data path is covered through `--config` and direct adapter tests).

## Decisions needed before M2

1. **Hybrid ownership.** ccusage 20 now reads Gemini, Kimi (incl. `.kimi-code`), Qwen,
   Antigravity, Kilo and Copilot CLI with tokens and models. Recommendation: move those
   to the collector (one owner per tool, so no double counting), keep native adapters
   for Cursor, Roo Code and Aider, and add Copilot CLI as a 14th tool.
2. **Node baseline for 4.0.** Node 18 and 20 are end-of-life. Requiring Node 22 would
   drop the `sqlite3` CLI fallback and allow `node --test` globs everywhere.
3. **Release split.** Ship this as 3.3.0, keep the report engine for 4.0.
