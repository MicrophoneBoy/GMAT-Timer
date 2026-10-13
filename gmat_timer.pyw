"""GMAT Timer: a floating set timer for GMAT practice booklets that stays on top while a set runs.
   Python keeps the clock, the global Q hotkey and the history, and serves the look (HTML/CSS/JS in timer_ui/) to an
   Edge app window. The widget is kept on top only while a set is running, so it never covers the History chart.
   Usage: pythonw gmat_timer.pyw [--data DIR] [--booklets DIR]
     --data      folder for timer_history.json and Timer History.csv (default: this script's folder)
     --booklets  folder with the booklet files Q.html, DI.html, V.html (default: DATA/og_booklets)
   Every question gets a target by type, keeping each section's real-exam budget: Quant PS 2:09 (45 min / 21 Q),
   Verbal CR 1:57 (45 / 23), RC 1:57 a question with up to 2:30 of passage reading moved onto each passage's first
   question (other RC questions keep at least 1:15),
   DI (booklet = DS + Two-Part, 2:15 average) DS 2:02, Two-Part 2:45. Small timer per question: green, yellow from
   target - 20 s, red from target + 30 s. Big countdown = sum of targets; colour = gap to target: green ahead, yellow
   behind by under 30 s, red behind by more. Sets can be any mix, in the order picked.
   History: timer_history.json (the record) + Timer History.csv (rebuilt from the JSON on every save).
   Edge runs as a guest (no sign-in, no sync, nothing kept) in its own data dir under %LOCALAPPDATA%/GMATTimer, where the
   window position, theme and logs live too. A normal new profile signs itself into the Windows Microsoft account and
   pops a dialog, so guest mode is on purpose; guest app windows get ' - [Guest]' added to their title."""
import os, re, io, sys, json, csv, time, threading, ctypes, datetime, subprocess, traceback, urllib.request, argparse
from ctypes import wintypes
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

SRC = os.path.dirname(os.path.abspath(__file__))
UI = os.path.join(SRC, 'timer_ui')
_ap = argparse.ArgumentParser(add_help=False)
_ap.add_argument('--data'); _ap.add_argument('--booklets')
_args, _ = _ap.parse_known_args()
DATA = _args.data or os.environ.get('GMAT_TIMER_DATA') or SRC    # env overrides are for testing
BOOKLETS = _args.booklets or os.environ.get('GMAT_TIMER_BOOKLETS') or os.path.join(DATA, 'og_booklets')
HIST = os.path.join(DATA, 'timer_history.json')
CSV = os.path.join(DATA, 'Timer History.csv')
APP = os.environ.get('GMAT_TIMER_APP') or os.path.join(os.environ.get('LOCALAPPDATA') or SRC, 'GMATTimer')
PROFILE, SETTINGS, LOG = (os.path.join(APP, p) for p in ('edge-guest', 'settings.json', 'log.txt'))
EDGES = [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe', r'C:\Program Files\Microsoft\Edge\Application\msedge.exe']
PORT = int(os.environ.get('GMAT_TIMER_PORT') or 47521)
SECS = {'Q': ('Quant', 45 * 60 / 21), 'V': ('Verbal', 45 * 60 / 23), 'DI': ('Data Insights', 45 * 60 / 20)}
YELLOW_OFF, RED_OFF, GAP_RED, DEBOUNCE = -20, 30, 30, 0.8
TARGET = {'PS': 45 * 60 / 21, 'CR': 45 * 60 / 23, 'DS': 122.0, 'TPA': 165.0}
RC_PACE, READ, RC_MIN = 45 * 60 / 23, 150.0, 75.0  # RC budget per question; up to 2:30 reading on a passage's first question; 1:15 floor per question

def qtype(og):
    return 'PS' if og <= 272 else 'DS' if og <= 409 else 'TPA' if og <= 466 else 'RC' if og <= 612 else 'CR'

def set_targets(ns, starts):
    """Target seconds for each question of a set; an RC passage keeps k x 1:57 in total, with the reading on question 1."""
    out, i = [], 0
    while i < len(ns):
        if qtype(ns[i]) != 'RC':
            out.append(TARGET[qtype(ns[i])]); i += 1; continue
        j = i + 1
        while j < len(ns) and qtype(ns[j]) == 'RC' and ns[j] not in starts: j += 1
        k = j - i; a = max(RC_MIN, (k * RC_PACE - READ) / k)      # short passages: less reading, never under 1:15 a question
        out += [k * RC_PACE - (k - 1) * a] + [a] * (k - 1); i = j
    return out
TITLE, RTITLE = 'GMAT Timer', 'GMAT Timer · History'
BASE_W, BASE_H = 300, 440                     # widget design size in CSS px; the page zooms to fit the window
TYPES = {'.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
         '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png'}

def log(msg):
    try:
        os.makedirs(APP, exist_ok=True)
        with io.open(LOG, 'a', encoding='utf-8') as f: f.write('%s  %s\n' % (datetime.datetime.now().strftime('%m-%d %H:%M:%S'), msg))
    except Exception: pass

def fmt(s):
    s = int(round(abs(s))); return '%d:%02d' % (s // 60, s % 60)

# ---------- booklet sets and history ----------
_sets = {}
def load_sets(sec):
    """[(label, kind, [og numbers], set of passage-start ogs)], {og: level}, in booklet order. Cached per file mtime."""
    path = os.path.join(BOOKLETS, sec + '.html')
    mt = os.path.getmtime(path)
    if sec in _sets and _sets[sec][0] == mt: return _sets[sec][1]
    h = io.open(path, encoding='utf-8').read()
    level = {int(n): lv for n, lv in re.findall(r'<tr><td><b>(\d+)</b></td><td class="a">.*?<span class="lv \w+">(Easy|Medium|Hard)</span>', h)}
    out = []
    for label, kind, qs in re.findall(r'<tr><td>((?:Set|Bonus) \d+)</td><td>([^<]*)</td><td>([^<]*)</td>', h):
        ns, starts = [], set()
        for part in qs.split(','):
            a, _, b = part.strip().partition('-')
            r = list(range(int(a), int(b or a) + 1))
            if b or kind == 'RC': starts.add(r[0])        # each RC part is one passage
            ns += r
        out.append((label, kind, ns, starts))
    _sets[sec] = (mt, (out, level))
    return out, level

HLOCK, SLOCK = threading.RLock(), threading.Lock()
VERSION = [0]

def save_hist(h):
    """JSON is the record; the CSV is rebuilt from it every time, so deletes reach both."""
    with HLOCK:
        json.dump(h, io.open(HIST, 'w', encoding='utf-8'), indent=1)
        with io.open(CSV, 'w', newline='', encoding='utf-8-sig') as fh:
            w = csv.writer(fh)
            w.writerow(['date', 'section', 'set', 'q in session', 'OG #', 'type', 'level', 'seconds', 'target', 'vs target (+ = gained)', 'result'])
            for rec in h:
                for k, q in enumerate(rec['questions']):
                    t = q.get('target', rec['pace'])
                    w.writerow([rec['date'], SECS[rec['section']][0], q['set'], k + 1, q['og'], q.get('type', qtype(q['og'])), q['level'],
                                q['sec'], round(t), round(t - q['sec']), q.get('result', '')])
        VERSION[0] += 1

def load_hist():
    with HLOCK:
        try: h = json.load(io.open(HIST, encoding='utf-8'))
        except Exception: return []
        if any('id' not in r for r in h):                 # sessions saved by v1 have no id
            for i, r in enumerate(h): r.setdefault('id', 'v1-%d' % i)
            save_hist(h)
        return h

_settings = []
def settings(update=None):
    with SLOCK:
        if not _settings:
            try: _settings.append(json.load(io.open(SETTINGS, encoding='utf-8')))
            except Exception: _settings.append({})
        s = _settings[0]
        if update:
            s.update(update); os.makedirs(APP, exist_ok=True)
            json.dump(s, io.open(SETTINGS, 'w', encoding='utf-8'))
        return dict(s)

def init_data():
    h = load_hist(); out = {}
    for k, (name, pace) in SECS.items():
        try: sets, _ = load_sets(k)
        except OSError:                                              # booklet missing: the widget says where it looked
            out[k] = dict(name=name, pace=pace, next=0, sets=[], missing=os.path.join(BOOKLETS, k + '.html')); continue
        labels = [s[0] for s in sets]
        done = [l for r in h if r['section'] == k for l in r['sets']]
        nxt = next((i for i, l in enumerate(labels) if l not in done), 0)
        rows = []
        for label, kind, ns, starts in sets:
            types = {}
            for n in ns: types[qtype(n)] = types.get(qtype(n), 0) + 1
            rows.append(dict(label=label, kind=kind, n=len(ns), secs=sum(set_targets(ns, starts)), types=types,
                             passages=len(starts) if kind == 'RC' else 0, done=done.count(label)))
        out[k] = dict(name=name, pace=pace, next=nxt, sets=rows)
    return dict(sections=out, yellowOff=YELLOW_OFF, redOff=RED_OFF, gapRed=GAP_RED, settings=settings())

# ---------- Win32 ----------
user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
HW = wintypes.HWND
ENUM = ctypes.WINFUNCTYPE(wintypes.BOOL, HW, wintypes.LPARAM)
for fn, args in (('SetWindowPos', [HW, HW, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]),
                 ('IsWindow', [HW]), ('IsWindowVisible', [HW]), ('IsIconic', [HW]), ('IsZoomed', [HW]),
                 ('GetWindowRect', [HW, ctypes.POINTER(wintypes.RECT)]), ('GetClientRect', [HW, ctypes.POINTER(wintypes.RECT)]),
                 ('GetWindowTextLengthW', [HW]), ('GetWindowTextW', [HW, wintypes.LPWSTR, ctypes.c_int]),
                 ('GetWindowThreadProcessId', [HW, ctypes.POINTER(wintypes.DWORD)]),
                 ('PostMessageW', [HW, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]), ('ShowWindow', [HW, ctypes.c_int]),
                 ('SetForegroundWindow', [HW]), ('GetWindowLongW', [HW, ctypes.c_int]), ('EnumWindows', [ENUM, wintypes.LPARAM]),
                 ('MonitorFromRect', [ctypes.POINTER(wintypes.RECT), wintypes.DWORD]),
                 ('SystemParametersInfoW', [wintypes.UINT, wintypes.UINT, ctypes.c_void_p, wintypes.UINT]),
                 ('MessageBoxW', [HW, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.UINT]),
                 ('PostThreadMessageW', [wintypes.DWORD, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]),
                 ('RegisterHotKey', [HW, ctypes.c_int, wintypes.UINT, wintypes.UINT]), ('UnregisterHotKey', [HW, ctypes.c_int]),
                 ('GetMessageW', [ctypes.POINTER(wintypes.MSG), HW, wintypes.UINT, wintypes.UINT])):
    getattr(user32, fn).argtypes = args
user32.MonitorFromRect.restype = wintypes.HMONITOR
kernel32.OpenProcess.restype = wintypes.HANDLE
kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
kernel32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
TOPMOST, NOTOPMOST = HW(-1), HW(-2)
NOSIZE, NOMOVE, NOZORDER, NOACTIVATE = 0x1, 0x2, 0x4, 0x10
WM_CLOSE, WM_HOTKEY, WM_QUIT, MOD_NOREPEAT, VK_Q = 0x10, 0x312, 0x12, 0x4000, 0x51

def msgbox(text): user32.MessageBoxW(None, text, 'GMAT Timer', 0x30)

def top_windows():
    out = []
    def cb(h, _):
        if user32.IsWindowVisible(h):
            n = user32.GetWindowTextLengthW(h); b = ctypes.create_unicode_buffer(n + 1); user32.GetWindowTextW(h, b, n + 1)
            pid = wintypes.DWORD(); user32.GetWindowThreadProcessId(h, ctypes.byref(pid))
            out.append((h, b.value, pid.value))
        return True
    user32.EnumWindows(ENUM(cb), 0)
    return out

def find(title, timeout=0.0):
    end = time.time() + timeout
    while True:
        for h, t, p in top_windows():
            if t == title or t.startswith(title + ' - ['): return h, p
        if time.time() >= end: return None, None
        time.sleep(0.1)

def rect(h, client=False):
    r = wintypes.RECT(); (user32.GetClientRect if client else user32.GetWindowRect)(h, ctypes.byref(r))
    return [r.left, r.top, r.right, r.bottom]

def work_area():
    r = wintypes.RECT(); user32.SystemParametersInfoW(0x30, 0, ctypes.byref(r), 0); return r

def on_screen(rc):
    r = wintypes.RECT(*rc); return bool(user32.MonitorFromRect(ctypes.byref(r), 0))

def raise_window(h):
    if user32.IsIconic(h): user32.ShowWindow(h, 9)
    user32.SetWindowPos(h, TOPMOST, 0, 0, 0, 0, NOSIZE | NOMOVE)
    user32.SetWindowPos(h, NOTOPMOST, 0, 0, 0, 0, NOSIZE | NOMOVE)
    user32.SetForegroundWindow(h)

def edge_path(): return next((p for p in EDGES if os.path.exists(p)), None)

def launch(url):
    return subprocess.Popen([edge_path(), '--user-data-dir=' + PROFILE, '--guest', '--no-first-run', '--no-default-browser-check', '--disable-sync',
                             '--hide-crash-restore-bubble', '--overscroll-history-navigation=0', '--app=' + url])

# ---------- global Q hotkey (own thread; registered only while a set is running) ----------
class Hotkey:
    def __init__(self, cb): self.cb, self.tid, self.th, self.ok = cb, None, None, False
    def on(self):
        if self.th: return self.ok
        ready = threading.Event()
        def run():
            self.tid = kernel32.GetCurrentThreadId()
            self.ok = bool(user32.RegisterHotKey(None, 1, MOD_NOREPEAT, VK_Q)); ready.set()
            msg = wintypes.MSG()
            while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
                if msg.message == WM_HOTKEY: self.cb(time.perf_counter())
            user32.UnregisterHotKey(None, 1)
        self.th = threading.Thread(target=run, daemon=True); self.th.start(); ready.wait(2)
        return self.ok
    def off(self):
        th, self.th = self.th, None
        if th:
            user32.PostThreadMessageW(self.tid, WM_QUIT, 0, 0)
            if th is not threading.current_thread(): th.join(2)

# ---------- the clock ----------
class Session:
    def __init__(self):
        self.lock = threading.RLock(); self.hk = Hotkey(self.press)
        self.state, self.rec, self.paused_at, self.hotkey_ok = 'idle', None, None, True

    def start(self, sec, picks):
        with self.lock:
            if self.state == 'run': return
            sets, level = load_sets(sec)
            ch = [sets[i] for i in picks if 0 <= i < len(sets)]
            if not ch: return
            self.sec, self.pace = sec, SECS[sec][1]
            self.qs = [dict(og=n, set=s[0], level=level.get(n, ''), read=(qtype(n) == 'RC' and n in s[3]), type=qtype(n), target=round(t, 1))
                       for s in ch for n, t in zip(s[2], set_targets(s[2], s[3]))]
            self.labels = [s[0] for s in ch]
            self.total = sum(q['target'] for q in self.qs)
            self.stamps, self.t0, self.paused_total, self.paused_at, self.last_press = [], time.perf_counter(), 0.0, None, 0.0
            self.state, self.rec = 'run', None
            self.hotkey_ok = self.hk.on()

    def active(self, at=None):
        at = at or time.perf_counter()
        return at - self.t0 - self.paused_total - ((at - self.paused_at) if self.paused_at else 0)

    def press(self, at=None):
        at = at or time.perf_counter()
        with self.lock:
            if self.state != 'run' or self.paused_at or at - self.last_press < DEBOUNCE: return
            self.last_press = at; self.stamps.append(self.active(at))
            if len(self.stamps) == len(self.qs): self.finish(True)

    def pause(self):
        with self.lock:
            if self.state != 'run': return
            if self.paused_at:
                self.paused_total += time.perf_counter() - self.paused_at; self.paused_at = None
                self.hotkey_ok = self.hk.on()
            else:
                self.paused_at = time.perf_counter(); self.hk.off()

    def undo(self):
        with self.lock:
            if self.state == 'run' and self.stamps: self.stamps.pop()

    def finish(self, complete, show=True):
        with self.lock:
            if self.state != 'run': return
            self.hk.off()
            if self.paused_at: self.paused_total += time.perf_counter() - self.paused_at; self.paused_at = None
            times = [round(b - a, 1) for a, b in zip([0] + self.stamps, self.stamps)]
            self.state = 'idle'
            if not times: return
            done_sets = self.labels if complete else [l for l in self.labels if l in {q['set'] for q in self.qs[:len(times)]}]
            rec = dict(id='s%d' % int(time.time() * 1000), date=datetime.datetime.now().strftime('%Y-%m-%d %H:%M'), section=self.sec,
                       sets=done_sets, pace=round(self.pace, 1), complete=complete,
                       questions=[dict(q, sec=t) for q, t in zip(self.qs, times)])
            with HLOCK:
                h = load_hist(); h.append(rec); save_hist(h)
            self.rec, self.state = rec, 'done'
        if show: threading.Thread(target=open_results, args=(rec['id'],), daemon=True).start()

    def snapshot(self):
        with self.lock:
            s = dict(state=self.state)
            if self.state == 'run':
                s.update(sec=self.sec, secName=SECS[self.sec][0], labels=self.labels, n=len(self.qs), pace=self.pace, total=self.total,
                         elapsed=self.active(), stamps=self.stamps, paused=bool(self.paused_at), hotkey=self.hotkey_ok,
                         ogs=[q['og'] for q in self.qs], setOf=[q['set'] for q in self.qs],
                         types=[q['type'] for q in self.qs], targets=[q['target'] for q in self.qs], reads=[q['read'] for q in self.qs])
            elif self.state == 'done':
                s.update(rec=self.rec, secName=SECS[self.rec['section']][0])
            return s

SESSION = Session()
URL = ['']
WIDGET = [None]
FOCUS = {'n': 0, 'id': None}
RLOCK = threading.Lock()

def open_results(rid=None):
    with RLOCK:
        FOCUS['n'] += 1; FOCUS['id'] = rid
        h, _ = find(RTITLE)
        if not h:
            launch(URL[0] + '/results.html')
            h, _ = find(RTITLE, 10)
            if h:
                wa = work_area(); W, H = wa.right - wa.left, wa.bottom - wa.top
                w, hh = int(W * 0.86), int(H * 0.86)
                user32.SetWindowPos(h, None, wa.left + (W - w) // 2, wa.top + (H - hh) // 2, w, hh, NOZORDER)
        if h: raise_window(h)

# ---------- HTTP ----------
def api(name, body):
    s = SESSION
    if name == 'ping': return {'app': 'gmat-timer'}
    if name == 'init': return init_data()
    if name == 'state': return dict(s.snapshot(), theme=settings().get('theme', 'light'))
    if name == 'start':
        s.start(body['sec'], [int(i) for i in body['sets']]); settings({'sec': body['sec']}); return s.snapshot()
    if name == 'q': s.press(); return s.snapshot()
    if name == 'pause': s.pause(); return s.snapshot()
    if name == 'undo': s.undo(); return s.snapshot()
    if name == 'end': s.finish(False); return s.snapshot()
    if name == 'new':
        with s.lock:
            if s.state == 'done': s.state = 'idle'
        return s.snapshot()
    if name == 'history': return {'items': load_hist(), 'version': VERSION[0]}
    if name == 'delete':
        ids = set(body.get('ids') or [])
        with HLOCK: save_hist([r for r in load_hist() if r['id'] not in ids])
        return {'ok': True, 'version': VERSION[0]}
    if name == 'mark':                                           # right / wrong / guess for one question; None clears it
        rid, k, res = body.get('id'), int(body.get('k', -1)), body.get('result')
        if res not in ('right', 'wrong', 'guess', None): return {'error': 'bad result'}
        with HLOCK:
            h = load_hist()
            r = next((x for x in h if x['id'] == rid), None)
            if not r or not 0 <= k < len(r['questions']): return {'error': 'not found'}
            for q in [r['questions'][k]] + ([s.rec['questions'][k]] if s.rec and s.rec.get('id') == rid else []):
                if res: q['result'] = res
                else: q.pop('result', None)
            save_hist(h)
        return {'ok': True, 'version': VERSION[0]}
    if name == 'open-results':
        threading.Thread(target=open_results, args=(body.get('id'),), daemon=True).start(); return {'ok': True}
    if name == 'poll': return {'version': VERSION[0], 'focus': FOCUS, 'theme': settings().get('theme', 'light')}
    if name == 'settings': return settings(body or None)
    if name == 'focus':
        if WIDGET[0]: raise_window(WIDGET[0])
        return {'ok': True}
    return None

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body, ctype='application/json'):
        if not isinstance(body, bytes): body = json.dumps(body).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store')
        self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        path = self.path.split('?')[0].split('#')[0]
        if path.startswith('/api/'): return self.call(path[5:], {})
        f = os.path.normpath(os.path.join(UI, path.lstrip('/') or 'widget.html'))
        if not f.startswith(UI + os.sep) or not os.path.isfile(f): return self.send(404, {'error': 'not found'})
        self.send(200, open(f, 'rb').read(), TYPES.get(os.path.splitext(f)[1], 'application/octet-stream'))
    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = json.loads(self.rfile.read(n) or b'{}') if n else {}
        self.call(self.path[5:] if self.path.startswith('/api/') else '', body)
    def call(self, name, body):
        try: out = api(name, body)
        except Exception as e:
            log(traceback.format_exc()); return self.send(500, {'error': str(e)})
        self.send(200, out) if out is not None else self.send(404, {'error': 'unknown api'})

# ---------- main ----------
def serve():
    try: srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    except OSError:
        try:                                                      # already running: bring that widget forward and quit
            r = json.load(urllib.request.urlopen('http://127.0.0.1:%d/api/ping' % PORT, timeout=2))
            if r.get('app') == 'gmat-timer':
                urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:%d/api/focus' % PORT, data=b'{}', method='POST'), timeout=3)
                return None
        except Exception: pass
        srv = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def place_widget(h):
    saved = settings().get('rect')
    if saved and on_screen(saved):
        x0, y0, x1, y1 = saved
    else:                                                         # right edge, vertically centred, about 19% of the screen wide
        wa = work_area(); W = wa.right - wa.left
        o, c = rect(h), rect(h, client=True)
        w = max(380, min(560, int(W * 0.19)))
        hh = int(w * BASE_H / BASE_W) + (o[3] - o[1]) - (c[3] - c[1])
        x0 = wa.right - w - int(W * 0.015); y0 = wa.top + max(10, (wa.bottom - wa.top - hh) // 2)
        x1, y1 = x0 + w, y0 + hh
    user32.SetWindowPos(h, None, x0, y0, x1 - x0, y1 - y0, NOZORDER)

def close_edge(pid):
    for h, t, p in top_windows():
        if p == pid: user32.PostMessageW(h, WM_CLOSE, 0, 0)
    ph = kernel32.OpenProcess(0x00100000, False, pid)             # SYNCHRONIZE
    if ph:
        gone = kernel32.WaitForSingleObject(ph, 6000) == 0; kernel32.CloseHandle(ph)
        if gone: return
    subprocess.run(['taskkill', '/PID', str(pid), '/T', '/F'], capture_output=True, creationflags=0x08000000)

def main():
    os.makedirs(APP, exist_ok=True)
    try: ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception: pass
    if not edge_path(): return msgbox('Microsoft Edge was not found, so the timer window cannot open.')
    srv = serve()
    if not srv: return
    URL[0] = 'http://127.0.0.1:%d' % srv.server_address[1]
    old, _ = find(TITLE)                                          # a leftover window from a crash: close it first
    if old: user32.PostMessageW(old, WM_CLOSE, 0, 0); time.sleep(1)
    launch(URL[0] + '/widget.html')
    h, pid = find(TITLE, 20)
    if not h: return msgbox('The timer window did not open. Details: %s' % LOG)
    WIDGET[0] = h; place_widget(h)
    last, same = None, 0
    while user32.IsWindow(h):
        time.sleep(0.4)
        want = SESSION.state == 'run'                             # on top only during a set (paused included)
        if want != bool(user32.GetWindowLongW(h, -20) & 0x8):
            user32.SetWindowPos(h, TOPMOST if want else NOTOPMOST, 0, 0, 0, 0, NOSIZE | NOMOVE | NOACTIVATE)
        if user32.IsIconic(h) or user32.IsZoomed(h): continue
        rc = rect(h)
        if rc != last: last, same = rc, 0
        else:
            same += 1
            if same == 3 and rc != settings().get('rect'): settings({'rect': rc})
    SESSION.finish(False, show=False)                             # closed mid-set: keep what was timed
    close_edge(pid)
    srv.shutdown()

if __name__ == '__main__':
    if sys.stderr is None:                                        # pythonw: no console
        os.makedirs(APP, exist_ok=True); sys.stdout = sys.stderr = io.open(LOG, 'a', encoding='utf-8')
    try: main()
    except Exception:
        log(traceback.format_exc()); msgbox('GMAT Timer crashed. Details: %s' % LOG)
