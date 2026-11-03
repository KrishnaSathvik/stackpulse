# M3 — Memory-bounded, incremental collection (design + prototype results)

Status: **hardened prototype, experimental** (`src/collectors/sharded.js`). It is not wired into the CLI, opt-in only if ever
wired, and excluded from the npm package.
See §6 for the hardening round (privacy, lifecycle, sessions, total memory).
Local only — nothing committed or pushed. Collector: ccusage 20.0.46, linux-x64.

## 1. What the collector actually does (measured)

232 MB synthetic history (208 MB Claude across 40 projects, 13 MB Codex); peak RSS of the
collector process.

| Variant | Peak | Time | Notes |
|---|---|---|---|
| Unified `daily --by-agent --sections daily,session` (3.3.0 today) | 523 MB | 4.1 s | |
| Unified daily only | 397 MB | 1.2 s | |
| `session` section only | 540 MB | 2.6 s | **the session section is the memory hog** |
| Claude only / Codex only | 382 / 65 MB | | memory follows the data ingested |
| `claude daily --project=<one of 40>` | 46 MB (baseline) | 0.2 s | **filter applied at discovery — real scoping** |
| `claude session --project=…` | — | — | **not supported** (only `--id`) |
| `CLAUDE_CONFIG_DIR` → 10/40 projects, copies | 116 MB | 0.4 s | real scoping |
| same, **hard links** | 133 MB | 0.7 s | real scoping, no data copied |
| same, **symlinked folders or files** | — | — | **ignored silently: 0 tokens** |
| `--since` 30 d / 90 d / 1 y (969 MB history) | 2.05 GB | 12–13 s | **date filters do not reduce memory** |

**Cross-file de-duplication is global.** The same message in two files of one project, or in two
different projects, counts once in a unified run. Running per-project shards naively would count
it once per shard. Real causes include resumed sessions, and history duplicated across
`~/.claude` and `~/.config/claude`.

## 2. Design

1. **Discover** Claude projects across every root (`CLAUDE_CONFIG_DIR` list, `~/.claude`,
   `~/.config/claude`). The same project name under several roots forms one unit.
2. **Group by shared messages.** Stream every file once, hashing each `message.id` to 64 bits.
   Projects that share any id are joined (union-find), so a message and all its copies are always
   read in the **same** collector run, where the collector's own de-duplication applies. The index
   is a typed-array hash table (~12 bytes per message). A hash collision only over-merges, which
   costs memory and never accuracy. Per-project id lists are cached on disk by fingerprint.
3. **Shard.** Hard-link each group's files into a scratch `CLAUDE_CONFIG_DIR` (symlinks are
   ignored by the collector). Run the normal collector there with `HOME` and every other source
   pointed at an empty directory, so the collector's semantics are untouched: dedup, pricing,
   sessions, model mapping.
4. **Cache** each shard's aggregate output under a keyed fingerprint (HMAC, see §6) of the shard's
   files: relative path, size, mtime, inode, and the collector version. Any append, rewrite, delete, rename or rotation
   changes the fingerprint, so only that shard is recomputed.
5. **Rest pass.** One ordinary run with Claude excluded (`CLAUDE_CONFIG_DIR` → empty) covers every
   other source.
6. **Merge.** Concatenate rows and pass them through the same `normalizeCcusageReport()`. Costs are
   rounded to 1e-10 USD so results don't depend on summation order.

## 3. Prototype results

Equivalence gate (`tests/core/sharded-equivalence.test.js`): sharded output must **deep-equal**
a full run after normalization. Passing cases:

- mixed tools,
- cross-project duplicate messages,
- one project under two roots,
- cache reuse,
- append, delete, rename/rotate,
- a same-size rewrite.

| History | Mode | Time | Largest collector | StackPulse | Exact |
|---|---|---|---|---|---|
| 232 MB | full | 4.0 s | 543 MB | 80 MB | ✓ |
| 232 MB | sharded, cold | 6.2 s | 127 MB | 126 MB | ✓ |
| 232 MB | sharded, warm | **0.5 s** | 95 MB | 88 MB | ✓ |
| 969 MB | full | 17.3 s | **2,051 MB** | 122 MB | ✓ |
| 969 MB | sharded, cold (2 parallel) | 16.9 s | **209 MB** | 174 MB | ✓ |
| 969 MB | sharded, warm | **1.7 s** | 163 MB | 124 MB | ✓ |
| 969 MB | sharded, after one append | 2.2 s (1 of 40 shards recomputed) | 178 MB | 141 MB | ✓ |

Cache footprint: 8.1 MB for the 232 MB history (id lists + per-shard output).

## 4. Limits and open points

- **Bound = largest shard group.** One enormous project, or projects chained together by shared
  messages, still needs ~2× its size. That is better than ~2× everything, but not constant memory.
  Truly constant memory needs streaming in the collector (upstream) or a native streaming reader.
- **Hard links need the cache on the same filesystem as the logs.** Otherwise the prototype fails
  with `shard-link`, and the policy is to fall back to the full run. Windows (NTFS hard links) and
  macOS are untested.
- **Codex and the other sources aren't sharded.** Codex used ~5× its log size (65 MB for 13 MB);
  the same technique (`CODEX_HOME` shards) would apply if needed.
- **Grouping reads compact `"message":{"id":"…"}`.** Spaced-JSON lines are skipped by the collector
  anyway (see the draft upstream issues).
- The cache lives in the user's home (`~/.cache/stackpulse`). It needs a size cap, a version key
  (already includes the collector version) and a `--no-cache` / clear command.

## 5. Recommendation

1. Keep 3.3.0 on the single full run. It's verified and simple, and failures are now explicit.
2. In M3, wire the sharded collector behind a size threshold (e.g. Claude logs > 300 MB) **and** as
   the automatic retry after an `out-of-memory` failure. It must report in the CLI which mode was
   used.
3. Make it the default only after macOS/Windows CI and a cache-management command exist.
4. Raise streaming and the silent-skip issues upstream (drafts in `docs/upstream/`). If upstream
   streaming lands, sharding can become a pure cache.

## 6. Hardening round (M3 review)

### Privacy — hard links are now the exception, not the rule
- **Project filter instead of links.** The collector's config filter
  (`claude.commands.daily.project`) scopes **both** daily and session data and bounds what it
  reads. It is exact and case-sensitive, one project per run. Every single-project group now uses
  a generated, owner-only config; no links of any kind are created. In every benchmark below,
  40/40 shards used the filter and 0 used links.
- **Links only for groups of projects that share messages**, which must be read in one run.
  These are temporary:
  - created in `work/run-<pid>-<random>` (mode 0700) and removed after each shard;
  - removed on exit and on SIGINT/SIGTERM;
  - swept on the next run if the owning process died (SIGKILL);
  - a live concurrent scan's directory is left alone.
- **The cache holds aggregates only.** Per-day, per-agent, per-model numbers and session
  activity times. No prompts, session IDs, file names, message or request IDs, or raw lines. A
  test plants secrets in every one of those places and greps every cache file, plus a structural
  check on session rows. A mutation that kept session IDs fails the test.
- **Deleted sessions:** unreferenced cache entries are pruned after every complete run.
- **Cross-volume:** a failed link is a typed `shard-link` error and leaves nothing behind. The
  policy is to fall back to the full run.

### Privacy — what the serialized cache holds (audited, M3 review round 2)
Audit method: a fixture whose secrets sit in every position (prompt text, session ID, session
**file** name, project **folder** name, `cwd`, message and request IDs). Run both strategies,
then read every byte in the cache directory (`walk` + grep, plus `strings` by hand), under an
isolated `HOME`.

Every file the cache can hold (enforced by an allowlist test):

| File | Content | Can reveal |
|---|---|---|
| `secret` (0600) | 32 random bytes | nothing; it keys the two hashes below |
| `entries/agg-<64 hex>.json` (0600) | per-day / per-agent / per-model token and cost numbers; one `{agent, metadata:{lastActivity}}` per session; `warnings` always `[]` | usage volume and activity times, model names |
| `entries/ids-<64 hex>.bin` (0600) | sorted 64-bit hashes of message IDs | message count per project |
| `work/` (0700) | empty between runs; temporary filter configs and hard-link trees only during a run | — |

- **No plaintext names.** No file names, project names, paths, session IDs, message/request IDs or
  prompt text are stored. The JSON key set and the string values (date, agent, model only) are
  allowlisted by a test; a mutation that kept one extra session field fails it.
- **Hashes over predictable inputs are keyed.** The cache key hashes relative paths, sizes, mtimes
  and inodes, all guessable. Before this round it was a plain SHA-256, so someone holding a copy
  of the cache could confirm a guessed file name offline. It is now HMAC-SHA256 with the per-cache
  secret.
- **Message-ID hashes are seeded** from the same secret. The hash is non-cryptographic (FNV, 64-bit,
  needed for speed). Its inputs are server-assigned random IDs, so a guess is impractical anyway.
  The seed stops the same message giving the same hash in two caches.
- **No correlation across caches.** A test shows two caches over identical logs share no file name
  and no id list.
- **Secret lifecycle:**
  - Created once with an exclusive link, so concurrent first runs agree on one key.
  - A missing or truncated secret is replaced. That invalidates the whole cache, and the next
    complete run prunes the old entries (tested).
- **Warnings are never cached.** Collector warnings quote real file paths. A shard whose run
  produced any is recomputed on every run instead (tested with a path-bearing warning). The warning
  still reaches the user.
- **Stale temp files** from a killed writer are pruned by the next complete run (tested).
- **Residual exposure (accepted):** anyone who can read the cache learns per-day usage, cost,
  model names, session activity times, and the number of projects and messages. That is the same
  information as the report StackPulse prints. Owner-only modes are the protection. On Windows,
  mode bits are ignored and the directory inherits the profile's ACL.
- **Not a security boundary against the same user.** Anyone who can read the cache can also read
  the logs themselves.

### Cache correctness
- **Key:** cache-format version, collector version (which also fixes its bundled offline
  pricing), resolved timezone, date range, isolated config, and each file's path, size, mtime and
  inode. Tests show a timezone or date-range change recomputes everything.
- **Restart:** a separate process reuses the cache (4/4 cached) with exact results.
- **Concurrent scans:** two processes on one cache are both exact. Writes are temp-file + rename.
- **Modified during a scan:** each shard is re-fingerprinted after its run. A change means it isn't
  cached and is re-read once. A test appends mid-scan; the result equals a full run of the final
  state, and the next run reuses the cache.

### Session accuracy — equivalence is not correctness
Two different claims, and only the second one is fully proven:

1. **Upstream equivalence (sessions and everything else).** Sharded output deep-equals one
   full collector run. This proves sharding changes nothing. It does **not** prove the collector's
   session count is semantically right.
2. **Token correctness (independent).** Token totals are checked against hand-computed truth
   (every distinct message once), not only against the collector. Examples:
   - the resume test asserts `(100+1)+(100+1)+(50+1)+(7+1)`;
   - the OOM fallback asserts 120,000 / 360,000 exactly.

**Session semantics, as observed in ccusage 20.0.46:**
- A session is a log *file*, named after its stem.
- A message duplicated across files is credited to the file read **first**.
- A resume file containing only repeated messages counts as a session only if it is read first.

So session counts are **order-dependent** and can differ by one per copy-only resume file. They
are what the collector reports, not an independently verified number. StackPulse documents them
that way (README, "Sessions") and does not claim more.

- **Upstream quirk:** the collector credits a de-duplicated message to the file it reads
  **first**. So a resume file containing only repeated messages counts as a session or not
  depending on its name (measured 2 vs 1). Token totals are unaffected.
- **Sharding reproduces it exactly.** Resumes in the same project, in another project, and
  copies across two Claude roots all match a full run (4 = 4 sessions, same tokens and days).
- `session --project` doesn't exist (focused or unified). The config filter covers the session
  section, which is why it is used.

### Total memory (whole process tree, sampled every 25 ms)

| History | Mode | Time | Total peak | Exact |
|---|---|---|---|---|
| 232 MB | full | 3.9 s | 649 MB | ✓ |
| 232 MB | sharded cold ×1 / ×2 / ×4 | 7.9 / 5.5 / 4.4 s | 258 / 334 / 550 MB | ✓ |
| 232 MB | sharded warm | 0.4 s | 218 MB | ✓ |
| 969 MB | full | 15.7 s | **2,139 MB** | ✓ |
| 969 MB | sharded cold ×1 / ×2 | 20.6 / 14.4 s | **370 / 531 MB** | ✓ |
| 969 MB | sharded warm | 1.5 s | 341 MB | ✓ |
| 969 MB, 1.5 GB per-process limit | full | — | — | ✗ typed `out-of-memory` |
| 969 MB, 1.5 GB per-process limit | sharded cold ×2 | 13.3 s | 531 MB | **✓ exact** |

Concurrency trades memory for time. At ×4 most of the saving is gone, so concurrency must be
capped, and ideally derived from free memory.

### Memory limits — per-process vs aggregate (M3 review round 2)
The 1.5 GB rows above are a **per-process** limit (`ulimit -v`-style). Each collector process
gets its own allowance, so they don't show what happens in a container, where every process in
the cgroup shares **one** limit. Aggregate limits were measured with a child memory cgroup
(v1, `memory.limit_in_bytes` and `memory.memsw.limit_in_bytes`). The limit covers StackPulse,
the collector's Node launcher and the native collector together.

| History | Aggregate limit | Mode | Result |
|---|---|---|---|
| 232 MB | 450 MB | full | ✗ kernel OOM kill |
| 232 MB | 450 MB | sharded ×1 / ×2 | ✓ exact, cgroup peak 123 / 187 MB |
| 30 projects × 6,000 lines | 160 / 200 / 260 MB | full → OOM → one sharded retry | ✓ exact 360,000 tokens, 30 sessions |
| 20 projects × 3,000 lines (~35 MB), test | 110 MB | full → OOM → one sharded retry | ✓ exact 120,000 tokens, 20 sessions |

Under an aggregate limit, concurrency multiplies against the same allowance. That's why the
retry runs at concurrency 1.

### Out-of-memory classification and fallback policy
A kernel OOM kill looks like any `kill -9`: SIGKILL, no message. Before this round it surfaced
as a generic `exit` error. Classification now requires **positive evidence**
(`src/utils/oom.js`, `runCcusage`):

| Evidence | Classified as |
|---|---|
| collector stderr `memory allocation of N bytes failed` | `out-of-memory` (`allocation-failure`) |
| SIGKILL **and** the cgroup `oom_kill` counter (ours plus ancestors, v1 `memory.oom_control` / v2 `memory.events`) rose during the run | `out-of-memory` (`cgroup-oom-kill`) |
| any other SIGKILL/SIGABRT, or no counter readable (macOS, Windows, restricted containers) | `killed`: "stopped by SIGKILL (not identified as out-of-memory)" |

**Attribution limit.** The cgroup counter is shared by every process in the cgroup and its
ancestors. A rise shows that the kernel OOM-killed *some* process during the run, not that it
killed the collector. An unrelated process killed at the same moment as the collector was
killed for another reason would be misread. That evidence is therefore worded as **probable**:
"probable memory-related termination; the kernel does not say which process it killed". Only the
collector's own allocation-failure message is definite. The automatic retry is not wired in
3.3.0, so this affects only the wording of the error. Before any retry is wired (4.0), the
attribution should be tightened, e.g. by running the collector in its own cgroup where one can
be created, or by checking the kernel log for its PID where readable.

Tests: a real kernel OOM in a 192 MB cgroup is classified `cgroup-oom-kill`. A manual SIGKILL
is `killed` with no evidence.

Fallback (`collectWithOomFallback`, tested but **not wired**; sharding stays opt-in):
- Retry **only** on `out-of-memory`. Timeouts, `killed`, invalid output, collector errors,
  `shard-link` and every other code are rethrown unchanged. 15 tests cover each case.
- **One** retry at most, at concurrency 1, with exactly one explicit notice saying why.
- If the retry also fails, the error names both failures (`out-of-memory` or `retry-failed`).
  No partial result is ever passed off as complete.

### Updated recommendation
1. 3.3.0 ships the single full run (unchanged).
2. Wire the sharded collector as an **experimental** mode, opt-in only, plus **one bounded retry
   after a classified `out-of-memory`** at concurrency 1. Tell the user it happened and why.
3. Default it only after macOS/Windows CI, a cache size cap, and `--no-cache` / clear-cache
   commands.
