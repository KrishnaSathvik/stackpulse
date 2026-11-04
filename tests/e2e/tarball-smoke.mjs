#!/usr/bin/env node
// Install the packed tarball into a clean directory and exercise it without any
// repository files: --version, --init, --config, and a full adapter scan of the
// fixture HOME. Cross-platform (used by CI on Linux, macOS and Windows).
//
//   node tests/e2e/tarball-smoke.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const work = mkdtempSync(join(tmpdir(), 'sp-smoke-'));
process.on('exit', () => rmSync(work, { recursive: true, force: true }));
const isWin = process.platform === 'win32';
// npm is a .cmd shim on Windows; arguments below are fixed strings, not user input.
const npm = (args, cwd) => {
  // With shell:true Node joins args with spaces, so quote any containing spaces (Windows user dirs).
  const argv = isWin ? args.map(a => (/\s/.test(a) ? `"${a}"` : a)) : args;
  const r = spawnSync(isWin ? 'npm.cmd' : 'npm', argv, { cwd, encoding: 'utf-8', shell: isWin });
  if (r.status !== 0) throw new Error(`npm ${args.join(' ')} failed:\n${r.stderr}`);
  return r.stdout;
};
const step = (name) => console.log(`• ${name}`);

step('pack');
npm(['pack', '--pack-destination', work, '--silent'], repo);
const tgz = readdirSync(work).find(f => f.endsWith('.tgz'));
assert.ok(tgz, 'tarball produced');

step('install into a clean project');
const app = join(work, 'app');
cpSync(join(repo, 'tests', 'fixtures', 'home-basic'), join(work, 'home'), { recursive: true });
mkdirSync(app);
npm(['init', '-y'], app);
npm(['install', '--no-audit', '--no-fund', join(work, tgz)], app);
const pkgDir = join(app, 'node_modules', 'stackpulse');
for (const repoOnly of ['tests', 'prototypes', 'docs', 'src/collectors/sharded.js']) assert.ok(!existsSync(join(pkgDir, repoOnly)), `${repoOnly} must not ship`);

step('package contents: README images only, nothing else from the website');
// The README is rendered from the package on npm, so every local image it shows must
// ship. Nothing else from website/ or assets/ may: no site source, no unused images.
// The logo attribution travels with the logos.
const readmeImages = new Set([...readFileSync(join(pkgDir, 'README.md'), 'utf-8').matchAll(/(?:src|srcset)="([^":]+)"/g)].map(m => m[1]));
const ATTRIBUTION = 'website/src/assets/tools/SOURCES.md';
const shipped = readdirSync(pkgDir, { recursive: true, withFileTypes: true })
  .filter(e => e.isFile()).map(e => join(e.parentPath ?? e.path, e.name).slice(pkgDir.length + 1).replace(/\\/g, '/'))
  .filter(f => /^(website|assets)\//.test(f));
for (const f of shipped) assert.ok(readmeImages.has(f) || f === ATTRIBUTION, `${f} ships but the README does not use it`);
for (const img of readmeImages) assert.ok(existsSync(join(pkgDir, img)), `README image ${img} is missing from the package`);
assert.ok(shipped.includes(ATTRIBUTION), 'logo attribution ships with the logos');

// Run through the published bin entry (the Node-version launcher), as npx would.
const pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf-8'));
const bin = join(pkgDir, pkgJson.bin.stackpulse);
const env = { ...process.env, HOME: join(work, 'home'), USERPROFILE: join(work, 'home'), TZ: 'UTC', NO_COLOR: '1' };
const run = (args) => execFileSync(process.execPath, [bin, ...args], { cwd: work, env, encoding: 'utf-8' });

step('--version');
const version = pkgJson.version;
assert.match(run(['--version']), new RegExp(version.replace(/\./g, '\\.')));

step('--init + --config');
run(['--init', 'card.yaml']);
run(['--config', 'card.yaml', '-o', 'card']);
assert.ok(readFileSync(join(work, 'card.html'), 'utf-8').includes('My AI Coding Stack'));

step('adapter scan from the installed package');
const scan = `
  const base = ${JSON.stringify(pathToFileURL(join(pkgDir, 'parsers')).href)} + '/';
  const out = {};
  for (const k of ['claude-code','codex','opencode','amp','pi','gemini','qwen','kimi','cursor','antigravity','roocode','kilocode','aider']) {
    const m = await import(base + k + '.js');
    if (m.detect()) { const r = await m.parse(); out[k] = r && { s: r.sessions, t: r.tokens?.total, status: r.cost?.status }; }
  }
  console.log(JSON.stringify(out));`;
const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', scan], { cwd: work, env, encoding: 'utf-8' }).trim().split('\n').pop());
assert.deepEqual(result['claude-code'], { s: 3, t: 14700, status: 'partial' });
assert.deepEqual(result.codex, { s: 1, t: 9500, status: 'complete' });

console.log(`✔ tarball smoke passed on ${process.platform}/${process.arch}, Node ${process.version}`);
