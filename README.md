<p align="center">
  <img src="website/public/logo-mark.png" alt="StackPulse" width="72" />
</p>

<h1 align="center">StackPulse</h1>

<p align="center">
  <strong>Your AI coding tools. One clear picture.</strong>
</p>

<p align="center">
  StackPulse is a local-first CLI that brings usage statistics from your AI coding tools into one clear, shareable report.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/stackpulse"><img src="https://img.shields.io/npm/v/stackpulse?color=0891a2&label=npm" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/KrishnaSathvik/stackpulse?color=20b486" alt="MIT license" /></a>
  <img src="https://img.shields.io/badge/node-%E2%89%A5%2020.12-333333" alt="Node.js 20.12 or newer" />
</p>

<p align="center">
  <a href="https://stackpulsecli.com">Website</a> ·
  <a href="https://stackpulsecli.com/docs/">Docs</a> ·
  <a href="https://www.npmjs.com/package/stackpulse">npm</a> ·
  <a href="https://github.com/KrishnaSathvik/stackpulse">GitHub</a>
</p>

<p align="center">
  <img src="assets/cli-dark.png" alt="StackPulse in a terminal: a scan summary with one row per tool showing sessions, tokens and estimated cost, then a menu to generate the report, customize it or view details." width="560" />
</p>

## Quick start

```bash
npx stackpulse
```

Or install it and run it again later:

```bash
npm install -g stackpulse
stackpulse
```

StackPulse scans this machine, shows one row per tool it found, and asks what to do next:

- **Generate report**: press Enter to write `stackpulse.html` with every tool it found.
- **Generate and open in browser**: the same, then opens the file.
- **Customize report**: choose tools, metrics, theme, title, handle and file name, and enter numbers for tools it could not read.
- **View details**: token types and every model with its exact ID, for each tool.

To skip the menu, run `npx stackpulse --yes`. Add `--open` to open the report, or `--details` to print the details too.

## The report

<p align="center">
  <img src="assets/card-dark.png" alt="A StackPulse report: totals, a sessions chart, a row per tool and per model with tokens and estimated cost, token composition, and a year of activity." width="840" />
</p>

One standalone HTML file with totals, each tool's share, a row per tool and model, and a year of daily activity. Seven themes.

**Token composition** splits tokens into cache reads, cache writes, output and uncached input. Cache reads are conversation context the model reads again on each turn. They are usually most of the total, and they are not newly written text.

**Cost labels:** `est.` is an estimate at API list prices, not a bill. `rec.` is a cost the tool recorded. `—` means the tool does not record that number.

## Features

- Finds supported AI coding tools and reads the usage they already store locally.
- Reports sessions and day-by-day activity.
- Breaks out tokens and models when a tool records them.
- Splits tokens into cache reads, cache writes, output and uncached input.
- Shows recorded cost, or an API list-price estimate, when a price is known. An unknown cost stays unavailable. It is not shown as $0.
- Draws an activity heatmap for each tool.
- Writes one HTML report you can keep or share.
- Includes seven report themes.
- Runs locally. No account.

## Supported tools

Each tool contributes what it actually records. A dash in the report means that number is not available.

| | Tool | What the report can show |
| --- | --- | --- |
| <img src="website/src/assets/tools/claude-code.svg" width="22" height="22" alt="" /> | Claude Code | Sessions, tokens, estimated cost, models |
| <img src="website/src/assets/tools/codex.png" width="22" height="22" alt="" /> | OpenAI Codex | Sessions, tokens, estimated cost, models |
| <picture><source media="(prefers-color-scheme: dark)" srcset="website/src/assets/tools/cursor-dark.svg" /><img src="website/src/assets/tools/cursor.svg" width="22" height="22" alt="" /></picture> | Cursor | Composer sessions and activity |
| <img src="website/src/assets/tools/gemini-cli.png" width="22" height="22" alt="" /> | Gemini CLI | Sessions, tokens, estimated cost, models |
| <img src="website/src/assets/tools/opencode.svg" width="22" height="22" alt="" /> | OpenCode | Sessions, tokens, estimated cost, models |
| <img src="website/src/assets/tools/amp.svg" width="22" height="22" alt="" /> | Amp | Sessions, tokens, estimated cost, models |
| <img src="website/src/assets/tools/pi.svg" width="22" height="22" alt="" /> | Pi Agent | Sessions, tokens, estimated cost, models |
| <img src="website/src/assets/tools/qwen-code.svg" width="22" height="22" alt="" /> | Qwen Code | Sessions, tokens, estimated cost, models |
| <img src="website/src/assets/tools/kimi.png" width="22" height="22" alt="" /> | Kimi CLI | Sessions, tokens, estimated cost, models. Includes Kimi Code. |
| <img src="website/src/assets/tools/antigravity.svg" width="22" height="22" alt="" /> | Antigravity | Sessions, tokens, estimated cost, models |
| <img src="website/src/assets/tools/roo-code.png" width="22" height="22" alt="" /> | Roo Code | Tasks, tokens, recorded cost |
| <img src="website/src/assets/tools/kilo-code.svg" width="22" height="22" alt="" /> | Kilo Code | Sessions, tokens, recorded cost |
| <img src="website/src/assets/tools/aider.png" width="22" height="22" alt="" /> | Aider | Sessions, AI-attributed commits and lines |

Cursor does not store tokens or cost locally. If Antigravity has no conversation history, StackPulse reports its session count only.

Estimated cost is an API list price, not a subscription bill. Roo Code and Kilo Code show the cost those tools recorded. For Codex, usage is priced at the service tier each session recorded. Usage with no recorded tier is priced at the standard rate. If your Codex config sets another tier, such as priority, StackPulse also shows what the estimate would be at that tier. You can add a tool by hand under **Customize report**. Leave any number blank if you do not know it, or enter `0` when the cost really is zero.

## How it works

1. **Run** `npx stackpulse`. It looks for the 13 tools above, reads their local usage, and prints a summary table.
2. **Generate** the report with defaults, or **customize** the tools, metrics, theme, title, handle, and file name. **View details** shows token types (input, output, cache reads and writes) and per-model usage.
3. **Open** the HTML report, or choose **Generate and open in browser**. Use **Save as PDF** for the browser print dialog, or **Share on X** for a prefilled post.

If something looks wrong, the summary says so: a tool marked *incomplete* could only be partly read, and the reason is printed under the table and in the report.

Outside an interactive terminal (a pipe or a script), or with `--yes`, StackPulse writes the default report without asking. The terminal output respects `NO_COLOR` and reads on light and dark backgrounds.

## Configuration

Skip the prompts with a YAML or JSON file.

```bash
npx stackpulse --init stackpulse.yaml
npx stackpulse --config stackpulse.yaml
```

`--init` writes a starter file. A shorter config looks like this:

```yaml
title: My AI Coding Stack
timeframe: 2026 — All Time
username: yourhandle
theme: dark
metrics:
  - sessions
  - tokens_used
  - cost_usd
tools:
  claude_code:
    sessions: 312
    tokens_used: 23500
    cost_usd: 180
  cursor:
    sessions: 540
```

`tokens_used` is in thousands: `23500` means 23.5M tokens. Omit `cost_usd` when it is unknown. These flags override the file: `--theme`, `--title`, `--timeframe`, `--username`, and `--output`.

| Flag | What it does |
| --- | --- |
| `-c, --config <file>` | Build from a YAML or JSON file |
| `--init [file]` | Write a starter config (`ai-usage.yaml` if you omit the name) |
| `-o, --output <name>` | File name without an extension. Default: `stackpulse` |
| `--theme <name>` | `dark`, `light`, `cosmic`, `forge`, `arctic`, `verdant`, or `neon` |
| `--title <text>` | Report title |
| `--timeframe <text>` | Label such as `2026 — All Time` |
| `--username <handle>` | Handle shown on the report |
| `-y, --yes` | Write the default report without prompts |
| `--open` | Open the report in your default browser when it is written |
| `--details` | Also print token types, models, and detection results after the scan |
| `-V, --version` | Print the version |
| `-h, --help` | Print help |

You can also put `lines_written`, `commits`, `hours_saved`, `files_edited`, or `bugs_fixed` in a config. Aider supplies commits and lines from your repositories. The other three are values you enter yourself.

## Report themes

Pick one under **Customize report**, or pass `--theme`.

| Dark | Light | Cosmic | Forge |
| --- | --- | --- | --- |
| <img src="website/src/assets/shots/theme-dark.webp" alt="Dark theme" width="220" /> | <img src="website/src/assets/shots/theme-light.webp" alt="Light theme" width="220" /> | <img src="website/src/assets/shots/theme-cosmic.webp" alt="Cosmic theme" width="220" /> | <img src="website/src/assets/shots/theme-forge.webp" alt="Forge theme" width="220" /> |

| Arctic | Verdant | Neon |
| --- | --- | --- |
| <img src="website/src/assets/shots/theme-arctic.webp" alt="Arctic theme" width="220" /> | <img src="website/src/assets/shots/theme-verdant.webp" alt="Verdant theme" width="220" /> | <img src="website/src/assets/shots/theme-neon.webp" alt="Neon theme" width="220" /> |

## Privacy

StackPulse reads usage files that are already on your machine. It does not ask for an account or an API key, and it does not upload your usage.

`npx` downloads the package from npm. The report is one HTML file saved where you choose. When you open it, the page loads JetBrains Mono and Space Grotesk from Google Fonts.

## Requirements

- Node.js 20.12 or newer. Node.js 22.13 or newer is recommended.
- Verified on macOS and Linux. Windows is not verified.
- Cursor, Roo Code, and Kilo Code are read from SQLite. That reader is built into Node.js 22.5 and newer. On Node.js 20, install the `sqlite3` command-line tool.
- A large history needs enough free memory to read it.

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/KrishnaSathvik/stackpulse).

## License

[MIT](LICENSE) © [Krishna Sathvik Mantripragada](https://github.com/KrishnaSathvik)
