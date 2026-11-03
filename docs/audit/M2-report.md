# StackPulse M2 — adapter migration and verification

Responds to the second M1 review. Branch `modernization/m0-m1`, **local only — nothing
committed, pushed or published.** Linux x64, 2026-10-31.

## Summary

| | Result |
|---|---|
| Main suite | **92 / 92 pass, 0 todo** (was 76 + 3 todo) on Node 20.20, 22.23, 24.22, 26.13; `node:sqlite` and `sqlite3`-CLI paths |
| Renderer suite (4.0 prototype) | 75 pass, 1 todo (emoji, a 4.0 decision) |
| Interactive wizard (real PTY) | 8 / 8 checks |
| Installed-tarball smoke | pass |
| Backup | patch restores to a clean checkout of master; all 76+ new files identical; both suites pass there |

## 1. Review items → outcome

| Review item | Outcome |
|---|---|
| Don't downgrade ccusage on age | ✅ Kept **20.0.46**. Regression fixtures prove 20.0.35 is wrong on all five post-20.0.35 fixes (§3). |
| Gemini / Qwen / Kimi TODOs → passing, not deleted | ✅ Moved to the collector; the three tests now pass under the same names (`tests/adapters/collector-tools.test.js`). |
| Antigravity and Kilo on the collector, one source each | ✅ Collector first; native reader only when the collector has nothing — never summed. Tests prove both directions. |
| Silent loss of reformatted Claude logs | ✅ Root cause located upstream; diagnostic added; upstream issue **drafted, not filed** (§4). |
| Memory on large histories | ✅ Measured at 1 GB, under a memory limit, and with date filters (§5). |
| macOS / Windows | ⛔ Still not available here; `.github/workflows/ci.yml` covers both (not enabled). |
| Patch restoration | ✅ `git apply --check` + restore into a fresh clone + `npm ci` + both suites. It also caught a broken `npm test` script in the prototype. |
| No known-inaccurate adapter ships in 3.3.0 | ✅ Every remaining native adapter re-verified; three more defects fixed (§2). |

## 2. Adapter verification — against the tools' own source

| Tool | Path in 3.3.0 | Verified against | Finding |
|---|---|---|---|
| Claude, Codex, OpenCode, Amp, Pi | collector | ccusage v20.0.46 source; SLSA provenance names commit `5aa9d3fd` = tag | — |
| **Gemini CLI** | collector | `google-gemini/gemini-cli` `chatRecordingService.ts`, full history | Recorder has written per-message `tokens` since it was introduced (2025-08-19), **never `usageMetadata`**. Native parser read 0 tokens from every version. It now also writes `.jsonl`, which the native parser never read. |
| **Qwen Code** | collector | `QwenLM/qwen-code` `chatRecordingService.ts`, `storage.ts` | Writes `~/.qwen/projects/<id>/chats/<session>.jsonl`; native parser read `~/.qwen/tmp/*/chats/*.json` → nothing |
| **Kimi** | collector | `MoonshotAI/kimi-cli`; collector docs/tests | `wire.jsonl` `StatusUpdate.token_usage` / Kimi Code `usage.record` (turn scope only); native parser read neither |
| **Antigravity** | collector → IDE index fallback | collector source | Stores display labels / numeric codes, not API IDs; collector maps them (e.g. 1402 → `claude-opus-5-5`) |
| **Kilo Code** | collector (Kilo CLI DB) → extension fallback | `Kilo-Org/kilocode` `legacy-migration/` | Current extension runs on the Kilo CLI engine and **migrates legacy task history into `kilo.db`** — summing both would double count |
| **Roo Code** | native | `RooCodeInc/Roo-Code` `TaskHistoryStore`, `historyItemSchema` | Per-task `history_item.json` files are now authoritative; globalState is a lagging write-through. **Fixed**: files read first, globalState merged, deduped by task id. |
| **Aider** | native | `Aider-AI/aider` `repo.py` attribution matrix | Old "message contains aider" counted human commits and missed author-attributed ones. **Fixed** to aider's documented rules. |
| **Cursor** | native | closed source | **Fixed** double count: a composer in global + workspace storage counted twice (reproduced: 2 composers → 3). Now keyed by composer/tab id. |

Combined run, all seven collector-format tools in one HOME: **51,503 tokens, exact**, one collector
process, 239 ms.

## 3. Collector pin — behaviour, not age

Fixtures built from each upstream fix's own tests (`tests/helpers/release-home.js`,
`tests/core/collector-release-regressions.test.js`):

| Fix (release) | 20.0.35 | 20.0.46 | Expected |
|---|---|---|---|
| Claude requestless `resp_` duplicate (20.0.37) | 250 | **125** | 125 |
| Codex repeated first-response snapshot (20.0.45, upstream fixture `issue_1970`) | 0 | **1,010** | 1,010 |
| Codex Ultrafast pricing, `gpt-6.1-sol` (20.0.46) | $0.00252 | **$0.01512** | $0.01512 |
| Antigravity model ID 1402 (20.0.38+) | `model_placeholder_m402` | **`claude-opus-5-5`** | `claude-opus-5-5` |
| One unreadable Antigravity DB (20.0.46) | **whole run fails — all 10 tools lost** | skipped + warning | skipped |

Package integrity: all 7 packages match lockfile and registry hashes, npm-signed; SLSA v1
provenance commit equals the `v20.0.46` tag.

**Config isolation (from the 20.0.43 change):** ccusage auto-merges `.ccusage/ccusage.json` in
the current directory and `~/.claude/ccusage.json`. A user file with `since` cut StackPulse's
totals from **24,200 to 200 tokens** silently. StackPulse now always passes an empty `--config`;
tested with both user and project config files present.

## 4. Silently skipped Claude logs

- **Cause:** ccusage admits a Claude line only if it contains the exact bytes `"usage":{`
  (`rust/adapters/claude/src/lib.rs:510`, `daily.rs:303`). Spaced JSON never reaches the parser.
- **StackPulse:** samples the head of each Claude log (64 KB/file, 32 MB budget). Affected files
  produce a warning under Claude Code in the scan. If *all* records are skipped, the scan reports an
  error instead of "no data".
- **Upstream:** `docs/upstream/ccusage-issues-draft.md` — minimal repro verified
  (100 vs 150 tokens), root cause, suggested fix. **Not filed**; posting needs your approval.

## 5. Memory

| History | Wall time | Peak RSS (collector) | Accuracy |
|---|---|---|---|
| 232 MB / 362k lines | 3.5–4.1 s | 520–550 MB | exact |
| 969 MB / ~1.5M lines | 16.7 s | **2.05 GB** | exact (46.8 B tokens) |
| 969 MB, `--since` 1 year / 90 d / 30 d | 12–13 s | **2.05–2.06 GB** | — |
| 969 MB under a 1.5 GB address-space limit | 4 s | — | **typed `out-of-memory` error** with plain advice (was a backtrace note) |

**Conclusion:** memory is about 2.1× the log size, and **date filtering does not reduce it**
(the collector parses everything, then filters). That rules out "bounded collection by date". The
options for M3 are:

1. **Sharded runs:** one collector run per Claude project directory, summed. Peak = largest shard.
   Needs care because cross-file dedup only happens within a run; resumed sessions stay in the same
   project directory, so sharding by project is likely safe — to be proven with fixtures.
2. **Incremental cache:** per-file aggregates keyed by mtime/size; only changed files re-read.
3. **Upstream streaming:** raise with ccusage alongside §4.

Not a 3.3.0 blocker. The failure is now explicit, and typical histories (hundreds of MB) need
under 1 GB.

## 6. Defects found and fixed this round

1. **Kilo extension + CLI double-count risk:** prevented by design (one source, proven by the migration code and tests).
2. **Collector memoization** keyed only on dates. A second scan of a different HOME or data directory reused the first result. Now keyed on all location variables.
3. **User `ccusage.json`** could change StackPulse's numbers (§3).
4. **Collector warnings were discarded** on successful runs (e.g. a skipped database). They're now shown under the affected tool.
5. **OOM and other collector failures** surfaced backtrace noise. They're now typed, with a plain message.
6. **Cursor** composer double count (§2).
7. **Roo Code** missed tasks once its per-task files became authoritative (§2).
8. **Aider** attribution false positives and negatives (§2).
9. **Sub-cent costs** printed as `$0.00` (reads as free), in both the CLI and the HTML. Now `<$0.01`, escaped in HTML and plain in share text.
10. **Test infrastructure:**
    - Prototype `npm test` never ran (found by the restore check).
    - The SQLite fixture builder's CLI path was broken on Node 20.
    - A Python escape in the PTY driver was deprecated.
    - Kilo truth arithmetic was wrong (Kilo counts reasoning separately).

## 7. Still open

- macOS / Windows execution (CI file ready, not enabled).
- Cursor is closed source — verified against reproduced storage cases, not its code.
- Live installs: formats verified against each tool's source and the collector's own fixtures, not against live user data.
- 4.0 items: emoji placeholder, OS font fallback with coverage warning, image snapshots per OS.

## 8. Decisions requested

1. **File the upstream ccusage issue** (§4)? It would post publicly under your GitHub account.
2. **Enable CI** (requires a push of the workflow file).
3. **M3 memory approach:** sharded runs, incremental cache, or both (§5).
4. **3.3.0 release:** with macOS/Windows still unverified, run CI first and then decide; I recommend not publishing before that.
