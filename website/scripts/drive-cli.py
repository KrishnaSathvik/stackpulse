import os, sys, re
sys.path.insert(0, os.path.join(sys.argv[1], 'tests', 'e2e'))
from wizard_pty import Session, ENTER, SPACE, DOWN
rc, home, out, theme_idx, raw_dump = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
env = {**os.environ, 'HOME': home, 'USERPROFILE': home, 'TZ': 'UTC', 'TERM': 'xterm-256color', 'COLUMNS': '100', 'LINES': '60', 'FORCE_COLOR': '3'}
os.makedirs(out, exist_ok=True)
s = Session(['node', os.path.join(rc, 'index.js')], env, out)
def answer(prompt, *keys):
    s.expect(prompt); s.send(*keys); s.expect('✔' + r'\s+' + prompt)
answer(r'Select tools to include on your card:', ENTER)
answer(r'Add any tools you use manually\?', ENTER)
answer(r'Ready to choose metrics\? → Press Enter to continue', ENTER)
answer(r'Which metrics to show on your card\?', ENTER)
answer(r'Ready to customise card details\? → Press Enter to continue', ENTER)
answer(r'Card title:', ENTER)
answer(r'Timeframe:', ENTER)
answer(r'Your handle \(e\.g\. @latentengineer_\):', b'@demo', ENTER)
answer(r'Visual theme:', *([DOWN] * theme_idx), ENTER)
answer(r'Output filename \(no extension\):', b'card', ENTER)
s.expect(r'Card ready!')
code = s.wait()
open(raw_dump, 'w').write(s.raw)
sys.exit(code)
