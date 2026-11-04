#!/usr/bin/env python3
"""
End-to-end drive of the interactive wizard through a real pseudo-terminal
(POSIX only: Linux/macOS). Stdlib only.

    python3 tests/e2e/wizard_pty.py --node node --home <fixture home copy> --out <dir>

Drives complete journeys with real keystrokes (customize with a manual tool and
hostile text, accept defaults, browse details then exit, Ctrl+C) and checks the
terminal output and the generated report. Exit code 0 = pass.
"""
import argparse, fcntl, os, pty, re, select, struct, sys, termios, time

ANSI = re.compile(r'\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[\]PX^_].*?(\x07|\x1b\\)|\x1bc')
ENTER, SPACE, DOWN = b'\r', b' ', b'\x1b[B'


class Session:
    def __init__(self, argv, env, cwd, cols=120):
        self.pid, self.fd = pty.fork()
        if self.pid == 0:
            os.chdir(cwd)
            os.execvpe(argv[0], argv, env)
        if os.environ.get('WIZARD_ZERO_WIDTH') != '1':   # set =1 to reproduce a 0-column terminal
            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack('HHHH', 60, cols, 0, 0))
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

    def text(self):
        return ANSI.sub('', self.raw)

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


def run(a, scenario, cols):
    env = {k: v for k, v in os.environ.items() if k != 'FORCE_COLOR'}
    if scenario == 'nocolor':
        env['NO_COLOR'] = '1'
    env = {**env, 'HOME': a.home, 'USERPROFILE': a.home, 'TZ': 'UTC', 'TERM': 'xterm-256color',
           'COLUMNS': str(cols), 'LINES': '60', 'PATH': os.environ.get('PATH', '')}
    out = os.path.join(a.out, f'{scenario}-{cols}')
    os.makedirs(out, exist_ok=True)
    s = Session([a.node, os.path.abspath(a.bin)], env, out, cols)

    def answer(prompt, *keys):
        """Wait for a prompt, answer it, then wait for its done line. Inquirer redraws
        prompts, so syncing on completion is what stops stray keys queueing up."""
        s.expect(prompt)
        s.send(*keys)
        s.expect('[✓✔]' + r'\s+' + prompt)

    # Opening screen and scan summary: one table row per tool with real numbers
    s.expect(r'StackPulse \d+\.\d+\.\d+')
    s.expect(r'Scan complete · 2 tools detected · 11 not found')
    s.expect(r'Claude Code\s+3\s+14\.7K\s+≥\$0\.04 est\.')
    s.expect(r'Codex\s+1\s+9\.5K\s+\$0\.03 est\.')
    s.expect(r'est\. = estimated at API list prices')
    checks = {}

    if scenario == 'customize':
        answer(r'What would you like to do\?', DOWN, DOWN, ENTER)        # Customize report
        answer(r'Tools to include', DOWN, DOWN, SPACE, ENTER)            # + first undetected tool (OpenCode)
        answer(r'Sessions', b'7', ENTER)
        answer(r'Tokens used, in thousands', ENTER)                       # blank: unknown
        answer(r'Cost in USD', ENTER)                                     # blank is unknown, not $0.00
        answer(r'Metrics to show', ENTER)                                 # smart defaults
        answer(r'Theme', DOWN, ENTER)                                     # light
        answer(r'Title', b'Wizard <img src=x onerror=alert(1)>', ENTER)
        answer(r'Timeframe label', ENTER)
        answer(r'Handle \(optional', b'@tester', ENTER)
        answer(r'Output file name', b'wizard-card', ENTER)
        answer(r'Open the report in your browser', ENTER)                 # default: no
        s.expect(r'Report generated')
        s.expect(r'File\s+wizard-card\.html')
        s.expect(r'Tools\s+3 included \(Claude Code, Codex, OpenCode\)')
        code = s.wait()
        html = open(os.path.join(out, 'wizard-card.html'), encoding='utf-8').read()
        checks = {
            'exit 0': code == 0,
            'title escaped': 'Wizard &lt;img src=x onerror=alert(1)&gt;' in html and '<img src=x' not in html,
            'light theme': '#F4F4F0' in html,
            'handle': '@tester' in html,
            'claude tokens 14.7K': '14.7K' in html,
            'codex present': 'Codex' in html,
            'estimated cost labelled': '(est.)' in html,
            'partial cost footnote': 'Lower bound' in html and 'claude-zephyr-9-1' in html,
            'manual tool 7 sessions': '>7<' in html,
            'blank manual cost is unavailable': (
                (row := re.search(r'OpenCode.{0,1200}', html, re.S)) is not None
                and '—' in row.group(0)
                and '$0.00' not in row.group(0)
            ),
            'no share URL in terminal': 'twitter.com/intent' not in s.text(),
        }
    elif scenario == 'defaults':
        answer(r'What would you like to do\?', ENTER)                    # Generate report
        s.expect(r'Report generated')
        code = s.wait()
        html = open(os.path.join(out, 'stackpulse.html'), encoding='utf-8').read()
        checks = {
            'exit 0': code == 0,
            'one prompt only': s.text().count('What would you like to do?') >= 1 and 'Tools to include' not in s.text(),
            'dark theme': '#0A0A0B' in html,
            'both tools': 'Claude Code' in html and 'Codex' in html,
            'no share URL in terminal': 'twitter.com/intent' not in s.text(),
            'scrollback kept (no terminal reset)': '\x1bc' not in s.raw,
        }
    elif scenario == 'details':
        answer(r'What would you like to do\?', DOWN, DOWN, DOWN, ENTER)  # View details
        answer(r'Show details for', ENTER)                                # Claude Code
        s.expect(r'Cache reads\s+10\.0K\s+68\.0%')
        s.expect(r'claude-zephyr-9-1\s+(tokens\s)?300\s+(·\scost\s)?—\s+(·\s)?no\sprice')   # table or stacked layout
        answer(r'Show details for', DOWN, DOWN, ENTER)                    # Detection results
        s.expect(r'Aider\s+— not found')
        answer(r'Show details for', DOWN, DOWN, DOWN, ENTER)              # Back
        answer(r'What would you like to do\?', DOWN, DOWN, DOWN, DOWN, ENTER)  # Exit
        s.expect(r'No report was written')
        code = s.wait()
        checks = {'exit 0': code == 0, 'no file written': not os.listdir(out)}
    elif scenario == 'nocolor':                                          # run with NO_COLOR=1 on a colour TTY
        answer(r'What would you like to do\?', ENTER)
        s.expect(r'Report generated')
        code = s.wait()
        colours = re.findall(r'\x1b\[(?:3[0-9]|9[0-7]|38;[0-9;]+)m', s.raw)
        checks = {'exit 0': code == 0, 'no colour codes': not colours}
    elif scenario == 'cancel':
        s.expect(r'What would you like to do\?')
        s.send(b'\x03')                                                   # Ctrl+C
        s.expect(r'Cancelled\. No report was written\.')
        code = s.wait()
        checks = {'exit 130': code == 130, 'no file written': not os.listdir(out), 'no stack trace': '    at ' not in s.text()}

    if a.dump:
        open(os.path.join(a.dump, f'{scenario}-{cols}.ansi'), 'w').write(s.raw)
    failed = [k for k, ok in checks.items() if not ok]
    for k, ok in checks.items():
        print(('PASS ' if ok else 'FAIL ') + f'[{scenario} @{cols}] ' + k)
    return not failed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--node', default='node')
    ap.add_argument('--home', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--bin', default=os.path.join(os.path.dirname(__file__), '..', '..', 'index.js'))
    ap.add_argument('--scenario', action='append', help='customize, defaults, details, nocolor, cancel (default: all)')
    ap.add_argument('--cols', type=int, action='append', help='terminal width(s) (default: 120)')
    ap.add_argument('--dump', help='directory to save each raw terminal stream (for visual QA)')
    a = ap.parse_args()
    ok = True
    for cols in a.cols or [120]:
        for scenario in a.scenario or ['customize', 'defaults', 'details', 'nocolor', 'cancel']:
            ok = run(a, scenario, cols) and ok
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
