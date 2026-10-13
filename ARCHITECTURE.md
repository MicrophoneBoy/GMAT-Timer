# Architecture

## Overview

```
pythonw gmat_timer.pyw
 ├─ HTTP server on 127.0.0.1:47521 (stdlib ThreadingHTTPServer)
 │    serves timer_ui/ and a small JSON API
 ├─ Session: the clock, the splits and the targets (one at a time, under a lock)
 ├─ Hotkey thread: Win32 RegisterHotKey for Q, only while a set runs
 └─ Window watcher (main thread)
      launches Edge as an app window, keeps it always on top,
      remembers its position and size, and shuts everything down when it closes

Edge app window "GMAT Timer"            Edge app window "GMAT Timer · History"
 widget.html + widget.js                 results.html + results.js
 polls /api/state every 200 ms           polls /api/poll every second
```

Python owns all state. The pages only draw what the API returns and send button presses back, so reloading a page never loses a running set.

## Why an Edge app window

The UI is HTML and CSS: soft shadows, gradients, blur, smooth SVG charts and animation. Edge ships with Windows and can show a page as an app window (`--app=URL`) with no tabs or address bar, so nothing has to be installed.

- **Its own data folder.** Edge runs with its own `--user-data-dir` (`%LOCALAPPDATA%\GMATTimer\edge-guest`), so it is a separate process from your everyday Edge.
- **Guest mode (`--guest`).** A brand-new Edge profile signs itself into the Windows Microsoft account and shows a "signed in on this device" dialog. Guest mode avoids that: no sign-in, no sync, and nothing kept between runs. Guest windows add ` - [Guest]` to their title, and the window finder accepts that suffix.
- **Always on top.** Python finds the window by its title and calls `SetWindowPos(HWND_TOPMOST)`. The watcher re-applies it every 0.4 s in case anything clears it.
- **Size and position.** These are set by Python in physical pixels. Edge's own `--window-size` uses device-independent pixels, which change with Windows display scaling and text size.
  - The first time, the widget opens on the right edge, about 19% of the screen wide.
  - After that, the last position and size are reused.
- **Zoom to fit.** The page scales its 300×440 design to the window (`#stage` CSS `zoom`), so dragging the window's edge resizes everything.
- **Closing.** When the widget window closes, the watcher:
  - saves a running set as partial;
  - sends `WM_CLOSE` to every window of that Edge process, and force-quits it after 6 seconds if needed;
  - stops the server.
- **Single instance.** A second launch finds the port in use, pings `/api/ping`, asks the running copy to raise its widget (`/api/focus`) and exits.

The Python process calls `SetProcessDpiAwareness(2)` so that window rectangles are in physical pixels. Every Win32 function gets explicit ctypes `argtypes`; without them `HWND_TOPMOST` (-1) is passed wrongly on 64-bit Python.

## Global Q hotkey

- `RegisterHotKey(NULL, 1, MOD_NOREPEAT, 'Q')` runs on its own thread, which runs a message loop.
- A `WM_HOTKEY` message records `time.perf_counter()` at the moment of the key press and calls `Session.press`.
- Presses less than 0.8 s apart are ignored.
- The hotkey is registered when a set starts or resumes, and unregistered on pause, end or finish. Unregistering posts `WM_QUIT` to the hotkey thread.
- While it is registered, Windows delivers every Q press to the timer, so Q does not type in other apps. That is why it is on only while a set runs.
- If registering fails because another program owns Q, the widget catches Q itself while it has focus.

## The clock

`Session` keeps:

- `t0`: when the set started.
- `paused_total` and `paused_at`: time spent paused.
- `stamps`: the active time at each Q press.
- `qs`: one entry per question, with `og`, `set`, `level`, `read`, `type` and `target`.

The active time is `now − t0 − paused_total` (minus the current pause, if any). A split is the difference between two stamps.

The widget gets `elapsed` with each poll and adds `performance.now()` drift between polls, so the display stays smooth at 10 frames a second without asking the server more often.

### Targets

- `qtype(og)` gives the type from the OG number range:

  | Type | OG numbers |
  |---|---|
  | PS | 1-272 |
  | DS | 273-409 |
  | TPA (Two-Part) | 410-466 |
  | RC | 467-612 |
  | CR | 613-802 |

- `set_targets(ns, starts)` walks a set's questions:
  - Non-RC questions get `TARGET[type]`.
  - An RC passage of `k` questions starts at a passage-start OG. It gets `k × 1:57` in total. Each answer gets `a = max(1:15, (k × 1:57 − 2:30) / k)`, and the first question gets the rest (the reading time plus its own answer time).
- Booklet RC sets list one range per passage (`505-508, 509-514`), and `load_sets` records the first OG of each range as a passage start.

## API

All endpoints are under `/api/`. GET calls take no body; POST calls take and return JSON.

| Endpoint | Method | What it does |
|---|---|---|
| `ping` | GET | `{"app": "gmat-timer"}`, used for the single-instance check |
| `init` | GET | Sections, every set with question count, target total, type counts, passages and times done, the default next set, colour offsets and settings |
| `state` | GET | The session snapshot (`idle`, `run` with `elapsed`, `stamps`, `targets`, `types`; or `done` with the saved record) plus the theme |
| `start` | POST | `{"sec": "V", "sets": [3, 0]}`: set indexes in the order to run them |
| `q`, `pause`, `undo`, `end`, `new` | POST | Session controls (`new` leaves the done screen) |
| `history` | GET | Every saved session and a version number |
| `delete` | POST | `{"ids": [...]}`: removes sessions and rebuilds the CSV |
| `open-results` | POST | `{"id": ...}`: opens or raises the History window on that session |
| `poll` | GET | History version, the latest "show this session" request, and the theme (for the History window) |
| `settings` | GET/POST | Read or update `settings.json` (theme, last section, window rectangle) |
| `focus` | POST | Raise the widget (used by a second launch) |

## Files written

| File | Where | What |
|---|---|---|
| `timer_history.json` | `--data` | The record of every session |
| `Timer History.csv` | `--data` | Rebuilt from the JSON on every save |
| `settings.json` | `%LOCALAPPDATA%\GMATTimer` | Theme, last section, widget rectangle |
| `log.txt` | `%LOCALAPPDATA%\GMATTimer` | Errors (`pythonw` has no console) |
| `edge-guest\` | `%LOCALAPPDATA%\GMATTimer` | Edge's data folder for the app windows |

## Front end

- **Shared code.**
  - `common.js` holds the API helper, time formats, inline SVG icons and the theme switch.
  - It also has `stats()`, a monotone cubic curve (no overshoot between points) and both charts.
- **Charts.** Both are plain SVG strings: no chart library and no network.
  - `sparkline` draws the small chart on the "set done" card.
  - `bigChart` draws the History chart, with a zone band for each column, the target step line, `±Ns` pills (sessions of up to 18 questions), set separators and hover tooltips.
- **Themes.** `ui.css` defines both themes as tokens on `:root` and `:root[data-theme="dark"]`. Light uses sky blue; dark uses black and purple through the same `--sky*` and `--accent-*` tokens. Status colours (green, yellow, red) are the same in both.
- **Fonts.** Text is Segoe UI Variable and numbers are Bahnschrift with tabular figures, so digits do not jitter while counting.

## Testing

These environment variables point the app at test data:

| Variable | What it overrides |
|---|---|
| `GMAT_TIMER_DATA` | the data folder |
| `GMAT_TIMER_BOOKLETS` | the booklet folder |
| `GMAT_TIMER_APP` | the `%LOCALAPPDATA%` folder |
| `GMAT_TIMER_PORT` | the port |

To drive the UI without touching the real keyboard:

- **Without the hotkey.** Import the module and replace `Hotkey.on` / `Hotkey.off`, then call the API with POST requests.
- **Screenshots.** The README images were made this way, with headless Edge and the DevTools protocol, so no window appeared on screen.
