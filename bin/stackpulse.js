#!/usr/bin/env node
// Launcher: check the Node version before loading the CLI. The CLI's dependencies
// use syntax that older Node versions cannot even parse, so a check inside
// index.js would never run — Node 18 would fail with an unrelated SyntaxError.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 12)) {
  console.error(`stackpulse requires Node.js 20.12 or newer (found ${process.version}).\n`
    + 'Install a current LTS release from https://nodejs.org and run it again.');
  process.exit(1);
}
await import('../index.js');
