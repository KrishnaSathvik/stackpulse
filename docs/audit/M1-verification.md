# StackPulse M1 — verification report

Responds to the M0/M1 review. Branch `modernization/m0-m1`, local only: **nothing
committed, pushed or published.** Linux x64 container, 2026-10-31.

Legend: ✅ verified here · ⚠️ verified with a caveat · ⛔ not verifiable here (CI file provided) · 🔁 deferred by design

## 1. Review findings → outcome

| Review item | Outcome |
|---|---|
| Node 18 compatibility not established | ✅ **Established false — and already false in 3.2.3.** Its own dependencies (`@inquirer/prompts`, `inquirer`, `commander`, `ora`) need Node ≥ 20.12; `string-width` uses a regex flag Node 18 can't parse. 3.2.3 crashes at startup on Node 18. `engines` corrected to `>=20.12.0`. |
| Collector aggregation (no double counting across sections) | ✅ Tokens come only from per-agent daily rows; session rows only count sessions; aggregate fields are ignored. Invariants tested: per-model sum = tool total = sum of days, exactly. Large-history run matches ground truth to the token. |
| Unknown-model cost semantics (record level) | ✅ **Real defect found and fixed.** A model can carry `missingPricing` *and* a recorded cost (confirmed with the real collector). It was dropped to `null` while still counted in the tool total. Now each record is `complete`/`partial`/`unavailable`, rolled up; source is `recorded`/`estimated`/`mixed`; partial totals are starred as lower bounds on the stat and the tool row. |
| Exact model IDs / no relabelling | ✅ **Fixed.** Friendly names only for recognised families (Claude Opus/Sonnet/Haiku, GPT-n, o-series). `claude-zephyr-9-1`, `gpt-oss-120b`, `claude-opus-4-6-thinking-extended` etc. show verbatim. |
| Every adapter tested independently incl. malformed/empty | ✅ 13/13 detect (positive, negative, no cross-detection); collector mapping for 5; native parsers with valid/malformed/empty input. ⚠️ Three **pre-existing parser gaps proven** and recorded as `todo` tests (§3). |
| SVG/PNG rendering surface | ✅ 76 renderer tests: inert markup, measured (not estimated) text collisions, glyph coverage, fonts, snapshots. ⚠️ emoji (§3). |
| Install from the actual npm tarball | ✅ Clean install with empty npm cache on Node 20/22/24/26; integrity of all 7 collector packages matches the registry and lockfile. |
| CLI compatibility (wizard, config, flags, errors) | ✅ Wizard driven end to end through a real PTY; configs/themes/error paths diffed against 3.2.3. |
| macOS / Windows | ⛔ Not available here. `.github/workflows/ci.yml` covers 3 OS × 4 Node versions (not enabled — needs a push). |

## 2. Verification matrix

| Test | Result | Evidence |
|---|---|---|
| Multi-agent collector: exact per-agent totals | ✅ | `tests/core/collector-mapping.test.js` (5 owned agents + 1 unowned + misleading aggregates) |
| Model switch inside one session | ✅ | Codex fixture: 6,000 / 3,500 tokens per model; large run: 500 Codex sessions switching every 20 events, exact totals |
| Known + unknown pricing in one tool | ✅ | real collector output `home-mixed-cost` → `partial`, `mixed`, $0.5018 lower bound |
| Node 18 | ⛔ unsupported (pre-existing) | startup `SyntaxError` in `string-width`; documented in README |
| Node 20.20 / 22.23 / 24.22 / 26.13 | ✅ 76 pass, 0 fail, 3 todo — each | both SQLite paths (`node:sqlite` and forced `sqlite3` CLI) on 22/24/26; CLI path on 20 |
| No SQLite reader at all | ✅ | typed `sqlite-unavailable` error, never "no data" |
| Linux | ✅ | everything in this report |
| macOS, Windows | ⛔ | CI workflow provided; `tarball-smoke.mjs` is cross-platform; PTY wizard is POSIX-only |
| Interactive wizard, all 3 steps | ✅ 8/8 checks | `tests/e2e/wizard_pty.py`: repo + installed tarball × Node 20/22/24/26, 0-column terminal, CLI SQLite |
| Existing YAML/JSON configs | ✅ | 10 configs diffed vs 3.2.3: themes identical; only intended changes (coverage notes, explicit `0` → `$0.00`, escaped text) |
| Error paths | ✅ identical to 3.2.3 | missing/invalid config, bad theme, unknown flag. Still raw stack traces → M3 |
| Malicious HTML input | ✅ | title/handle/tool/model names, colours; escaping + colour allowlist tests |
| Malicious SVG input | ✅ | only `svg/title/text/rect/line/path/g/clipPath` emitted; no handlers, hrefs, URLs; `url()` local only |
| PNG: clipping / overlap | ✅ | every text measured with real fonts; inside canvas; ≥ 3 px apart (the old "Amp4%" bug is caught by a regression test) |
| PNG: font substitution | ✅ | primary faces proven loaded (mono-advance and Display-metric probes); CJK/Arabic covered via OS fallback fonts; tofu **and** invisible glyphs detected |
| PNG: emoji | ⚠️ todo | resvg can't paint bitmap colour-emoji fonts — renders blank (§3) |
| Image snapshots | ✅ | 14 cards × pixel diff (≤ 0.5 % tolerance) + SVG hash; 244 KB |
| Renderer stress | ✅ | 13 tools, sessions-only, no activity, full year (weekly bars), 3T tokens / 123M sessions, 200-char and CJK/RTL model IDs |
| Tarball smoke | ✅ | `tests/e2e/tarball-smoke.mjs`: 26 files, no repo-only dirs, `--version`/`--init`/`--config`, scan = fixture truth |
| `--omit=optional` install (no native binary) | ✅ **defect fixed** | previously reported "no usage"; now `binary-missing` error with ccusage's own instructions |
| Large history (232 MB, 362k lines, 1 year) | ✅ exact | 2,000 Claude + 500 Codex sessions, 10,654,498,032 + 345,816,132 tokens = ground truth; 3.5–4.1 s |

## 3. Defects found during verification

Fixed:

1. **Partial cost dropped** (model with `missingPricing` + recorded cost) → per-record cost model (`src/core/cost.js`).
2. **All-unpriced tool with recorded cost reported as unavailable** → same fix.
3. **Unknown model IDs relabelled** ("Claude Zephyr 9 1") → verbatim.
4. **Collector non-zero exit treated as "no data"** — a missing native binary (`--omit=optional`, release-age cutoffs) silently produced an empty card → typed error.
5. **Malformed collector JSON crashed the normalizer** (`session: 5`) → tolerant parsing, tested.
6. **Spinner hang on 0-column terminals** (ora loops clearing lines forever; seen with some CI/IDE TTYs) → spinner disabled there.
7. **Named CSS colours from 3.x configs rejected** by my first allowlist → hex, named, `rgb()/hsl()` accepted; injection still blocked.
8. **`npm test` unusable on Node < 21** (glob) → `tests/run.js`.
9. **Fixture pollution** (npx cache written into the fixture HOME) → removed; collector tests run on a copy and assert the fixture is unchanged.
10. **Renderer:** 365 bars at 3 px gaps went negative-width → weekly buckets; "3000B" → "3T"; CJK truncation estimated at Latin widths → per-script widths; long numbers truncated sublines → compact counts.

Proven, not fixed (pre-existing; recorded as `todo` tests that flip when fixed):

| Gap | Evidence | Plan |
|---|---|---|
| Gemini CLI current chat format (`tokens` per message) | collector reads 2,500 tokens; native parser 0 | Decision A: collector owns Gemini (M2) |
| Qwen Code current layout (`~/.qwen/projects/*/chats/*.jsonl`) | collector reads 1,750 tokens; native parser `null` | Decision A (M2) |
| Kimi session count = files / working dirs, not sessions | 3 files of one session → 3 | Decision A (M2) |
| Emoji in PNG | resvg can't paint CBDT colour emoji; draws nothing | 4.0 decision (§5) |

Also observed upstream (no StackPulse change): the collector's Claude reader **ignores JSON
written with spaces** (`"type": "assistant"`). Real Claude Code writes compact JSON, so users are
unaffected, but a reformatted log would be silently skipped — a good `doctor` check
(files seen vs sessions counted).

## 4. Collector pin

| | |
|---|---|
| Pinned | `ccusage@20.0.46` + 6 platform packages |
| Registry | integrity hashes match lockfile for all 7; npm registry signatures present; SLSA v1 provenance attestation |
| Published | 2026-10-30 — **1 day old** |
| Settled alternative | `20.0.35` (2026-10-17): **identical normalized output** on both fixtures |

Release cadence is near-daily. Recommendation: pin the newest release that is ≥ 14 days old at
release time (today: 20.0.35), re-run the fixtures on each bump.

## 5. Performance and resources

| | |
|---|---|
| Fixture scan, all 13 adapters | ~0.2 s |
| 232 MB / 362k-line history | 3.5–4.1 s wall |
| StackPulse process | ~80 MB RSS |
| Collector process (native) | **520–550 MB peak RSS** — holds history in memory |
| Install footprint | 43 MB `node_modules` (one platform binary) |

The collector's memory grows with history size. Bounding it (default `--since` window, opt-in
all-time) belongs in M3 before large users hit it.

## 6. Decisions requested

1. **Collector pin:** 20.0.35 (settled, identical on fixtures) or 20.0.46 (newest pricing)?
2. **Emoji in PNG (4.0):** bundle an outline emoji font (~10 MB+), draw a visible placeholder
   (e.g. `□`) with the raw ID kept in HTML/JSON, or accept blanks. Recommend placeholder.
3. **Fallback fonts (4.0):** OS fonts as glyph fallback (current prototype; CJK/Arabic depend on the
   OS) vs bundling ~17 MB. Recommend OS fallback + coverage warning.
4. **CI:** enabling `.github/workflows/ci.yml` requires a push — only on your approval.

## 7. Not done

- macOS and Windows execution (CI file only).
- Live installs of any tool (all adapters except the collector path are fixture-verified; current
  Gemini/Qwen formats are validated against the collector as oracle, not live files).
- `doctor`, machine-readable export, memory bounding, friendly error messages (M3).

## 8. 3.3.0 release-candidate gates (frozen; not released)

Run on 2026-10-31 against the current working tree. Nothing committed, pushed or published.

| Gate | Result |
|---|---|
| Test suite, Node 20.20 / 22.23 / 24.22 / 26.13 | **144 / 144** on each |
| Node 18.20 | 142 / 144. The CLI can't start: dependencies use a regex flag Node 18 lacks. Pre-existing; `engines >=20.12.0` |
| cgroup OOM tests, 3 runs on each of Node 20/22/24/26 | stable. The 64 MB limit was too tight for Node 24's own processes (the probe, not the collector, was killed); now 192 MB. Test cgroups are now always removed (a single `rmdir` raced with exiting tasks and left 4 behind) |
| Packed tarball installed into a clean project (`tests/e2e/tarball-smoke.mjs`) | ✓ `--version`, `--init` + `--config`, full adapter scan |
| Package contents (`npm pack --dry-run`) | 30 files, 50.4 kB: runtime only. `src/collectors/sharded.js`, tests, docs and prototypes excluded |
| Interactive wizard in a PTY (`tests/e2e/wizard_pty.py`) | ✓ all checks (escaping, theme, tokens, cost labels, manual tool) |
| 4.0 renderer prototypes | 75 / 75, plus 1 known TODO (colour emoji in PNG, a 4.0 decision) |
| Backup patch scan | no tokens, keys, real home paths or e-mail addresses. No caches, link trees, `work/` dirs, bytecode, `node_modules` or generated cards. Only fixture paths (`/home/u/...`) |
| Restore: fresh clone of `master` + `git rm --cached node_modules` + `git apply --index` | tree identical to the working tree, except ignored generated output (old card HTMLs on disk, `prototypes/*/out`) |

`package.json` still reads `3.2.3`. The version bump belongs to the release step, which is not
authorized.

## 9. Remaining 3.3.0 release blockers (frozen; no further development)

1. **macOS and Windows have not been run.** `.github/workflows/ci.yml` is prepared, not pushed:
   - OS × Node 20.12 / 22 / 24 / 26;
   - sqlite3 CLI installed on every OS;
   - a platform-facts step (collector binary resolves, `node:sqlite` present or not);
   - full tests on both SQLite backends; the run fails if any collector or SQLite test is skipped;
   - installed-tarball smoke test (`--version`, `--init`/`--config`, full adapter scan).

   Running it requires a push, or manual runs of the same commands on a Mac and a Windows machine.
   Still not covered by automation:
   - the interactive wizard on Windows (no POSIX PTY): check it by hand;
   - real installs of the tools themselves on each OS (fixtures only).
2. **Final review** of the release diff, CHANGELOG, tarball and the cross-platform results.
3. **Version bump to 3.3.0 and publication:** separate approval.

Not blockers: M3 sharding stays excluded from the package and unused by the CLI. The OOM
retry is not wired.

Observed once and not reproduced: one failure in a run of the two OOM test files right after an
edit. The run was not captured. The next 11 runs of those files and 4 full-suite runs were clean.
The kernel-OOM tests depend on the kernel's choice of victim; if a CI run shows it, capture the TAP output.
