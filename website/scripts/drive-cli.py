"""Drive the real interactive StackPulse CLI through a pseudo-terminal and save the
raw terminal stream at two points: the opening summary with its menu, and the
details view for Claude Code. terminal-export.mjs turns these into the site's
src/data/terminal-capture.json.

  python3 scripts/drive-cli.py <stackpulse repo> <demo home> <out dir> [columns]

Run it twice: at 100 columns for desktop panels, and at 42 for phones (the CLI
switches to its stacked layout when a table does not fit).
"""
import os, sys
sys.path.insert(0, os.path.join(sys.argv[1], 'tests', 'e2e'))
from wizard_pty import Session, ENTER, DOWN

repo, home, out = sys.argv[1], sys.argv[2], sys.argv[3]
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 100
os.makedirs(out, exist_ok=True)
env = {**os.environ, 'HOME': home, 'USERPROFILE': home, 'TZ': 'UTC', 'TERM': 'xterm-256color', 'FORCE_COLOR': '1'}
env.pop('NO_COLOR', None)
s = Session(['node', os.path.join(repo, 'index.js')], env, out, cols=cols)

s.expect(r'What would you like to do\?')
s.expect(r'navigate')
open(os.path.join(out, 'menu.raw'), 'w', newline='').write(s.raw)

s.send(DOWN, DOWN, DOWN, ENTER)                 # View details
s.expect(r'Show details for')
s.send(ENTER)                                   # Claude Code (first tool)
s.expect(r'Show details for')
s.expect(r'navigate')
open(os.path.join(out, 'details.raw'), 'w', newline='').write(s.raw)

s.send(b'\x03')                                 # Ctrl+C: leaves without writing a report
sys.exit(0 if s.wait() in (0, 130) else 1)
