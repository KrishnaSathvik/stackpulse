#!/usr/bin/env node
// Replays the raw terminal streams saved by drive-cli.py through a terminal
// emulator and writes src/data/terminal-capture.json: lines of { t, c, b } spans
// (text, colour name, bold) exactly as the terminal shows them.
//
//   summary  status line, per-tool table and cost notes
//   menu     the same screen with the "What would you like to do?" menu
//   details  the Claude Code details view (token composition and models)
//
//   XTERM=<path to @xterm/headless> node scripts/terminal-export.mjs <drive-cli out dir> <out json> [columns] [key suffix]
//
// With a suffix (e.g. Narrow), the parts are added to an existing JSON file as
// summaryNarrow, menuNarrow and detailsNarrow, shown on phones.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const [dir, outFile, colsArg = '100', suffix = ''] = process.argv.slice(2);
const COLS = Number(colsArg);
const { Terminal } = createRequire(import.meta.url)(process.env.XTERM);
const COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

async function screen(file) {
  const term = new Terminal({ cols: COLS, rows: 400, allowProposedApi: true, scrollback: 0 });
  await new Promise(r => term.write(readFileSync(file, 'utf-8').replace(/\r?\n/g, '\r\n'), r));
  const buf = term.buffer.active;
  const lines = [];
  for (let y = 0; y < buf.length; y++) {
    const line = buf.getLine(y);
    const spans = [];
    for (let x = 0; x < term.cols; x++) {
      const cell = line.getCell(x);
      if (!cell || cell.getWidth() === 0) continue;
      const c = cell.isFgDefault() ? 'default' : cell.isFgPalette() ? COLORS[cell.getFgColor() % 8] : 'default';
      const b = !!cell.isBold();
      const ch = cell.getChars() || ' ';
      const last = spans[spans.length - 1];
      if (last && last.c === c && last.b === b) last.t += ch; else spans.push({ t: ch, c, b });
    }
    // Trim trailing spaces so lines match what the terminal shows.
    while (spans.length && !spans[spans.length - 1].t.trimEnd()) spans.pop();
    if (spans.length) spans[spans.length - 1].t = spans[spans.length - 1].t.trimEnd();
    lines.push(spans);
  }
  while (lines.length && !lines[lines.length - 1].length) lines.pop();
  return lines;
}

const text = (l) => l.map(s => s.t).join('');
const find = (lines, rx, from = 0) => { for (let i = from; i < lines.length; i++) if (rx.test(text(lines[i]))) return i; return -1; };
const trimBlank = (ls) => { while (ls.length && !ls[0].length) ls.shift(); while (ls.length && !ls[ls.length - 1].length) ls.pop(); return ls; };

const menuScreen = await screen(join(dir, 'menu.raw'));
const head = find(menuScreen, /StackPulse/);
const ask = find(menuScreen, /What would you like to do\?/);
const nav = find(menuScreen, /navigate/, ask);
const summary = trimBlank(menuScreen.slice(find(menuScreen, /Scan complete/), ask));
const menu = trimBlank(menuScreen.slice(head, find(menuScreen, /Exit/, ask) + 1));

const detailScreen = await screen(join(dir, 'details.raw'));
const picked = find(detailScreen, /Show details for .*Claude Code/);
const next = find(detailScreen, /^\? Show details for/, picked + 1);
const details = trimBlank(detailScreen.slice(picked + 1, next));

if (head < 0 || ask < 0 || nav < 0 || picked < 0 || next < 0) throw new Error('capture markers not found');
const prev = suffix && existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf-8')) : {};
writeFileSync(outFile, JSON.stringify({ ...prev, ['summary' + suffix]: summary, ['menu' + suffix]: menu, ['details' + suffix]: details }) + '\n');
console.log(`summary ${summary.length} lines, menu ${menu.length}, details ${details.length}`);
