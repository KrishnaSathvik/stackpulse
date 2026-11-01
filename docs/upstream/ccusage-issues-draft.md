# DRAFT 1 — upstream issue for ccusage (not filed)

> Prepared by StackPulse M2. Filing requires the maintainer's approval.
> Target: https://github.com/ccusage/ccusage/issues/new

---

**Title:** Claude: usage lines with whitespace after `"usage":` are silently skipped

**Version:** ccusage 20.0.46 (commit `5aa9d3fd`), linux-x64

### What happens

A Claude Code JSONL line whose usage object is serialized with whitespace —
`"usage": {` instead of `"usage":{` — contributes nothing to any report. The
line is valid JSON with the same content; no warning is printed.

### Reproduction

```sh
mkdir -p repro/.claude/projects/p
cd repro
# compact (counted)
echo '{"type":"assistant","sessionId":"a","timestamp":"2026-10-20T10:00:00.000Z","requestId":"r1","message":{"id":"m1","model":"claude-opus-4-6","usage":{"input_tokens":100,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0}}}' > .claude/projects/p/compact.jsonl
# same record with spaces after separators (skipped)
echo '{"type": "assistant", "sessionId": "b", "timestamp": "2026-10-20T10:00:00.000Z", "requestId": "r2", "message": {"id": "m2", "model": "claude-opus-4-6", "usage": {"input_tokens": 50, "output_tokens": 0, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}}}' > .claude/projects/p/spaced.jsonl
HOME=$PWD npx ccusage@20.0.46 claude daily --json --offline
```

**Expected:** `totalTokens: 150` (two sessions).
**Actual:** `totalTokens: 100` — the spaced line is dropped; exit code 0, no warning.

Measured variants (single line, 150 tokens):

| Serialization | totalTokens |
|---|---|
| compact, ms timestamp | 150 |
| compact, no ms | 150 |
| spaced, ms timestamp | 0 |
| spaced, no ms | 0 |

### Cause

The Claude adapter's byte prefilter requires the exact sequence `"usage":{`:

- `rust/adapters/claude/src/lib.rs:510` — `memmem::Finder::new(br#""usage":{"#)`
- `rust/adapters/claude/src/daily.rs:303` — same marker

Lines without that exact byte sequence never reach the JSON parser.

### Why it matters

Claude Code writes compact JSON, so normal logs are unaffected. But logs that
pass through other tools (exporters, re-serializers, `jq .` without `-c`, Python
`json.dumps` with default separators, archive/merge scripts) are dropped
silently, and users see under-reported usage with no indication why.

### Suggested fix

Either match the key alone (`"usage"`) in the prefilter and let the parser
decide, or fall back to a full parse when `"usage"` is present but the compact
marker is not. A debug/warn line when a file contains usage records that were
not admitted would also help.

### Downstream mitigation

StackPulse (which pins ccusage) now detects such files by sampling log heads and
reports: *"N Claude log file(s) use spaced JSON; the collector skips those records,
so Claude totals are too low."*

---

# DRAFT 2 — upstream issue for ccusage (not filed)

**Title:** Unreadable `kilo.db` / `opencode.db` is skipped silently (exit 0, no warning)

**Version:** ccusage 20.0.46, linux-x64

### Reproduction

```sh
mkdir -p repro2/.local/share/kilo repro2/.local/share/opencode && cd repro2
echo corrupt > .local/share/kilo/kilo.db
echo corrupt > .local/share/opencode/opencode.db
HOME=$PWD npx ccusage@20.0.46 daily --json --by-agent --offline; echo "exit=$?"
```

**Expected:** a warning naming each unreadable database, as Antigravity has done since 20.0.46
("Skipping unreadable Antigravity database …").
**Actual:** exit 0, empty stderr; Kilo and OpenCode are simply absent from the report, which is
indistinguishable from "this tool was never used".

### Downstream mitigation

StackPulse now opens these databases itself when the collector reports nothing for them, and
marks the source as failed if the file can't be read or holds messages the collector didn't count.

---

# DRAFT 3 — smaller findings (not filed; could be one issue or comments)

All measured on ccusage 20.0.46 (linux-x64) with minimal fixtures; none emit a warning.

1. **Symlinked Claude project folders or `.jsonl` files are ignored** (0 tokens). Hard links work.
2. **`claude.commands.daily.project` as an array is ignored**, so the report covers *all* projects
   instead of the listed ones. A comma-separated string matches nothing. A single string works
   (exact, case-sensitive). An error or warning for the unsupported forms would prevent silent
   over- or under-reporting.
3. **Session attribution of de-duplicated messages follows file read order.** A resumed-session
   file that only repeats earlier messages counts as a session if it sorts before the original,
   and not if it sorts after (`copy-only.jsonl` → 2 sessions; `z-copy-only.jsonl` → 1). Token
   totals are unaffected. A documented rule (e.g. credit the earliest timestamp) would make
   session counts stable.
4. **`session` has no `--project` option** (focused or unified), unlike `daily`. The config-file
   filter does scope the session section of unified `daily` reports.
