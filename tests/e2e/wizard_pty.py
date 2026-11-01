#!/usr/bin/env python3
"""
End-to-end drive of the interactive wizard through a real pseudo-terminal
(POSIX only: Linux/macOS). Stdlib only.

    python3 tests/e2e/wizard_pty.py --node node --home <fixture home copy> --out <dir>

Walks all three steps with real keystrokes, including toggling a manual tool and
typing hostile text, then checks the generated card. Exit code 0 = pass.
"""
import argparse, fcntl, os, pty, re, select, struct, sys, termios, time

ANSI = re.compile(r'\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[\]PX^_].*?(\x07|\x1b\\)|\x1bc')
ENTER, SPACE, DOWN = b'\r', b' ', b'\x1b[B'


class Session:
    def __init__(self, argv, env, cwd):
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            os.chdir(cwd)
            os.execvpe(argv[0], argv, env)
        if os.environ.get('WIZARD_ZERO_WIDTH') != '1':   # set =1 to reproduce a 0-column terminal
            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack('HHHH', 60, 120, 0, 0))
        self.raw = ''        # undecoded-escape stream; stripped as a whole so split sequences can't leak
        self.pos = 0         # how much of the stripped text has been consumed
        self.log = []

    def expect(self, pattern, timeout=60):
        deadline = time.time() + timeout
        rx = re.compile(pattern)
        while time.time() < deadline:
            text = ANSI.sub('', self.raw)
            m = rx.search(text, self.pos)
            if m:
                self.pos = m.end()
                time.sleep(float(os.environ.get('WIZARD_SETTLE', '0.4')))   # let the prompt start reading stdin
                return m
            r, _, _ = select.select([self.fd], [], [], 0.2)
            if r:
                try:
                    self.raw += os.read(self.fd, 65536).decode('utf-8', 'replace')
                except OSError:
                    break
        if os.environ.get('WIZARD_RAW_DUMP'):
            open(os.environ['WIZARD_RAW_DUMP'], 'w').write(self.raw)
        tail = ANSI.sub('', self.raw)[-1500:]
        raise AssertionError(f'timeout waiting for {pattern!r}\n--- last output ---\n{tail}')

    def send(self, *keys, pause=0.15):
        for k in keys:
            if k.startswith(b'\x1b') or len(k) == 1:
                os.write(self.fd, k)           # control key / escape sequence: one write
            else:
                for ch in k:                   # text: typed one character at a time
                    os.write(self.fd, bytes([ch]))
                    time.sleep(0.01)
            time.sleep(pause)

    def wait(self, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            pid, status = os.waitpid(self.pid, os.WNOHANG)
            if pid:
                if os.environ.get('WIZARD_RAW_DUMP'):
                    open(os.environ['WIZARD_RAW_DUMP'], 'w').write(self.raw)
                return os.waitstatus_to_exitcode(status)
            try:
                r, _, _ = select.select([self.fd], [], [], 0.2)
                if r:
                    self.raw += os.read(self.fd, 65536).decode('utf-8', 'replace')
            except OSError:
                pass
        raise AssertionError('process did not exit')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--node', default='node')
    ap.add_argument('--home', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--bin', default=os.path.join(os.path.dirname(__file__), '..', '..', 'index.js'))
    a = ap.parse_args()

    env = {**os.environ, 'HOME': a.home, 'USERPROFILE': a.home, 'TZ': 'UTC', 'TERM': 'xterm-256color',
           'COLUMNS': '120', 'LINES': '60', 'PATH': os.environ.get('PATH', '')}
    s = Session([a.node, os.path.abspath(a.bin)], env, a.out)

    def answer(prompt, *keys):
        """Wait for a prompt, answer it, then wait for its ✔ line. Inquirer redraws
        prompts, so syncing on completion is what stops stray keys queueing up."""
        s.expect(prompt)
        s.send(*keys)
        s.expect('\u2714' + r'\s+' + prompt)

    # Scan phase: both fixture tools must be found with real numbers
    s.expect(r'Claude Code\s+3 sessions\s+·\s+14\.7K tokens')
    s.expect(r'Codex\s+1 sessions\s+·\s+9\.5K tokens')
    answer(r'Select tools to include on your card:', ENTER)        # keep pre-checked tools (data found)
    answer(r'Add any tools you use manually\?', SPACE, ENTER)     # first undetected tool (OpenCode)
    answer(r'Enter OpenCode stats\?', ENTER)
    answer(r'Sessions:', b'7', ENTER)
    answer(r'Tokens used \(K\):', ENTER)
    answer(r'Cost USD:', ENTER)
    answer(r'Ready to choose metrics\? → Press Enter to continue', ENTER)
    answer(r'Which metrics to show on your card\?', ENTER)        # smart defaults
    answer(r'Ready to customise card details\? → Press Enter to continue', ENTER)
    answer(r'Card title:', b'Wizard <img src=x onerror=alert(1)>', ENTER)
    answer(r'Timeframe:', ENTER)
    answer(r'Your handle \(e\.g\. @latentengineer_\):', b'@tester', ENTER)
    answer(r'Visual theme:', DOWN, ENTER)                          # light
    answer(r'Output filename \(no extension\):', b'wizard-card', ENTER)

    s.expect(r'Card ready!')
    s.expect(r'Claude Code')
    code = s.wait()
    assert code == 0, f'exit code {code}'

    html = open(os.path.join(a.out, 'wizard-card.html'), encoding='utf-8').read()
    checks = {
        'title escaped': 'Wizard &lt;img src=x onerror=alert(1)&gt;' in html and '<img src=x' not in html,
        'light theme': '#F4F4F0' in html,
        'handle': '@tester' in html,
        'claude tokens 14.7K': '14.7K' in html,
        'codex present': 'Codex' in html,
        'estimated cost labelled': '(est.)' in html,
        'partial cost footnote': 'Lower bound' in html and 'claude-zephyr-9-1' in html,
        'manual tool 7 sessions': '>7<' in html,
    }
    failed = [k for k, ok in checks.items() if not ok]
    for k, ok in checks.items():
        print(('PASS ' if ok else 'FAIL ') + k)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
