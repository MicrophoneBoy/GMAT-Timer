# Changelog

## 2.2 · 2026-10-13

- **Marks.** Each question can be marked right, wrong or guessed: on the "set done" card (✓ / ✕ / ? buttons), or later under the History chart (click the circle to cycle). A guess counts as a miss.
- **Score.** History shows a Score tile, and each session in the list shows its score.
- **Misses tab.** It lists every wrong or guessed question across sessions, with counts by question type. Click one to jump to it in its session's chart.
- **Data.** `result` is saved per question in the JSON, and the CSV has a new `result` column.
- **Fixes.**
  - The "set done" card is reorganised so a 5-question set fits without scrolling.
  - The sparkline now sizes to its box.

## 2.1 · 2026-10-13

- **Targets by question type**:
  - DS 2:02 and Two-Part 2:45 (the same 2:15 average budget);
  - RC passages get up to 2:30 of reading on their first question, with at least 1:15 for each other question;
  - CR 1:57 and PS 2:09.
- **Targets everywhere.** The countdown is the sum of the targets, and the colours and `±Ns` splits are measured against each question's own target. Yellow starts at target − 20s and red at target + 30s; for Quant that matches the original 1:50 / 2:40.
- **Set picker.** Pick any sets in any order from a grid. Done sets are marked, and the order is shown on badges and saved with the session (for example "Sets 4, 1").
- **History.** The chart has a zone band for each question and a target step line. The tooltip shows the question type and target. The tiles show vs target, worst and 30s+ over.
- **CSV columns.** `type` and `target` are new; `vs target` replaces `vs pace`.
- **Command-line options.** `--data` and `--booklets` keep personal data outside the code folder.
- **Missing booklets.** The widget says which booklet file it could not find.
- **Edge guest mode.** Edge runs as a guest, so it never signs in or shows a sign-in dialog.
- **Fixes.**
  - A time just under zero showed as "−0:00".
  - The done card title wrapped.
  - The sparkline's target line drew past its edges.

## 2.0 · 2026-10-13

- **New interface.** HTML and CSS in an always-on-top Edge app window, replacing tkinter.
- **Widget.**
  - A section pill with a sliding highlight.
  - A two-ring countdown (time used and questions done).
  - A per-question timer with a progress bar, mini sectors and animated splits.
  - Pause blur, two-click End, and a "set done" card with a sparkline.
- **History window.** Session list with filter, checkboxes and delete; summary tiles; a smooth line chart with zones, labels and hover details. It opens by itself when a set finishes.
- **Themes.** Light (sky blue) and dark (black and purple), shared by both windows.
- **Window.** Zoom-to-fit resizing, a remembered position, a single instance, and a clean shutdown of Edge.
- **Icon** for the shortcut and the windows.

## 1.0 · 2026-10-13

- **First version** in tkinter.
- **Timing.**
  - A per-set countdown at real exam pace.
  - A per-question timer that turns yellow at 1:50 and red at 2:40.
  - A global Q hotkey, with splits shown as `±s` against pace.
- **Records.** A line chart at the end, a history list and a "Delete selected" button. History is saved to JSON and CSV.
