# Facelet: audit and revamp (November 2026)

The prototype had solid foundations: real random-state scramblers, WCA-correct statistics,
a hand-written WebGL cube and a verified algorithm set. It fell short in four ways:

- **Edge cases.** Window switching, touch cancels, very large sessions and 4x4/5x5 replays
  all misbehaved.
- **Phones.** Phone layouts were an afterthought.
- **Trainer content.** Much of the trainer's alternative-algorithm data was wrong from the
  drawn angle.
- **Customisation.** There was almost none beyond fonts and cube colours.

This document lists what was wrong, what changed and what is still open.

Every fix below was reproduced in code (and in most cases with a script or test) before it was
changed. Three parallel audits covered the timer, the trainer, and the cube, stats and tools
pages.

---

## Update: 4 November 2026

### Every event now scrambles the way the WCA's scrambler does
Each event was checked against the source of TNoodle, the official WCA scrambler.

| Event | Before | Now |
|---|---|---|
| 4x4, 4BLD, virtual 4x4 | Random-move (40 moves) | **Random state.** Our own reduction solver follows TNoodle's phase plan (centres, edge pairing with parity, then the 3x3 solver). The output uses only U D L R F B Uw Rw Fw and averages about 48 moves, against TNoodle's ≈ 45. Tables take about 1 s on first use; a scramble takes about 0.2–0.6 s and is generated ahead of time. 4BLD keeps TNoodle's x/y/z orientation. |
| FMC | A state whose solution broke the `R' U' F` padding rule was thrown away and redrawn. Because the solver is deterministic, about half of all states could never appear. | The rule is enforced inside the 3x3 solver, so every state is equally likely. |
| 3BLD, MBLD | The last move could share an axis with the first orientation move (for example `… R2 Rw`) | Prevented the same way, as TNoodle does |
| 2x2, Skewb | Optimal-length scrambles (shorter states gave shorter scrambles) | Always exactly 11 moves, like TNoodle. Skewb states are now drawn exactly uniformly. |
| Pyraminx | Optimal length plus tips | Exactly 11 moves plus tips |

Checked against the WCA scrambler and already matching:
- 5x5–7x7 random-move (60/80/100, with TNoodle's move sets);
- 5BLD (3Rw/3Fw/3Uw orientation);
- Clock (no pin suffix);
- Megaminx (Pochmann);
- Square-1 notation.

The one TNoodle check we skip is for Square-1: it rejects random states solvable in under 11 moves, which are astronomically rare.

New tests:
- the 4x4 piece model against the independent sticker cube for all 36 moves;
- 200 random 4x4 states, each reproduced exactly by its scramble with only legal notation;
- sampling uniformity;
- exact lengths and minimum distances for 2x2, Skewb and Pyraminx;
- the FMC and 3BLD axis rules.

### The clock is centred while you solve
In focus mode the interface fades during inspection and solving. The digits then glide to the exact centre of the screen instead of staying centred in the now-invisible layout, and they return when the solve ends. The PB burst aims at the clock's resting place.

### A distinctive look, same calm base
- **Surfaces.** Panels float on a soft canvas with a lit top edge and layered shadow. In the dark they sit a step above the background.
- **Typography.** Page titles, the wordmark, session names and dialog titles use Instrument Serif; small labels use mono capitals. A single lit facelet is the mark: in the logo, in section eyebrows, beside the session best and in the loader.
- **The clock.** It reads like a chronograph:
  - smaller decimals;
  - a tick-mark hold indicator that lights from the centre;
  - a soft light behind the digits.
- **Motion.** Sliding tab and segment thumbs, scrambles that fade in, new solves that slide into the list, and dialogs that spring open.
- **Phones.** A floating glass tab bar and a stats card.
- **Customize.** Serif or sans headings, smaller decimals on or off, and the soft light on or off.

---

## 1. Bugs fixed

### Timer (the core)
| Severity | Problem | Fix |
|---|---|---|
| High | Switching windows while holding Space never delivered the key-up, so the timer stayed armed and the next tap started a solve instantly. Touch cancels did the same. | The engine gained `abortHold()`, wired to window blur and `pointercancel`. |
| High | Choosing the same average for both solve-list columns (allowed in Settings) crashed the list with a duplicate-key error. | Columns are de-duplicated. |
| Medium | An early release during inspection reset the 8 s / 12 s alerts, so "eight seconds" could fire twice. | Alerts reset only when inspection starts. |
| Medium | On phones the clock was clamped to 64 px. | It now fills the width (container units), sized against "00.00" so it doesn't jump at 10 s. |
| Medium | In monochrome, "ready" looked the same as idle. | Clearer hold → ready: fade, a small scale-up and a hold bar. Optional red/green or accent colours. |
| Medium | Focusing a slider, checkbox or colour picker blocked the spacebar (they were treated as text fields). | Only text inputs count now. |
| Medium | A settings change made in the last 150 ms before closing the tab was lost. | Settings are flushed on `pagehide` and when the tab is hidden. |
| Low | The tool dock said "No preview for this event" while the first scramble loaded. It also forgot that you had collapsed it, and started collapsed on screens narrower than 1100 px. | Loading skeleton; the collapsed state is saved. |
| Low | "Move to session" in a solve's details was a select reading "—". | It's a proper menu now. |
| Low | The PB confetti ran at twice the speed on 120 Hz screens and covered the new time. | Physics are time-based, and the burst radiates out from the edge of the digits. |
| Low | Modals focused the first button, so a stray Space or Enter pressed it. | Only an explicit `autofocus` gets focus; otherwise the dialog does. |
| Low | The next scramble waited for the database write. | It appears immediately. |
| Low | Lazy pages showed a blank screen while loading, and `npm run verify:algs` pointed at a file that doesn't exist. | Both fixed. |

### Statistics page
| Severity | Problem | Fix |
|---|---|---|
| High | The page crashed in Chrome at about 110k solves (`Math.min(...array)` exceeds the argument limit). | Plain loops. Verified with 120,001 solves. |
| Medium | Each rolling average was computed up to 4 times. The charts built about 1.8 MB of SVG path data each at 100k solves. | Rolling averages are shared. Lines keep each pixel column's min and max, and dots are de-duplicated per pixel. Lines dropped to about 20 KB and the scatter to about 200 KB. |
| Medium | The PB chart's scale ignored the average lines, so 22–31% of ao5/ao12 points were pinned to the top edge. | The scale covers everything drawn. |
| Medium | "Last 100 / 1000 / All" only affected two cards. | It now scopes every card. |
| Low | The histogram showed repeated y-ticks ("1, 2, 2, 3"). Axes mixed "12" with "12.50". | Integer "nice" ticks, and consistent decimals for each step. |
| Low | The calendar started weeks on Sunday while the weekday chart started on Monday. Its tooltips were clipped on the top rows, it opened at the oldest weeks on phones, and it said "all sessions" while showing one. | All fixed. |
| Low | The mean was rounded to 0.01 even at 0.001 precision. Custom Sub-X read "1:05" as 1 s. | Fixed. |
| Low | The headline cards ignored the event's format. | 6x6, 7x7 and FMC show mo3; BLD shows its success rate. |

### Virtual cube
| Severity | Problem | Fix |
|---|---|---|
| High | Rotations made during inspection were left out of the reconstruction, so the replays and "Solution" text of most inspected solves were wrong. | Recorded at t = 0. |
| Medium | Replays froze on any 4x4/5x5 slice move: names like `R[1-2]'` couldn't be parsed back. | Correct M/E/S names. All keymapped moves now round-trip on 2x2–5x5. |
| Medium | A drag started within ~110 ms of the previous turn orbited the camera instead of turning a layer. | Picking works during animations. |
| Medium | On phones the toolbar overflowed, there were no stats or history, and the cube overflowed the screen width. | The toolbar wraps, plus a stats line, a history sheet and a portrait-aware field of view. |
| Low | Changing the theme didn't update the renderer. A lost WebGL context left a blank canvas. Turning while a scramble loaded corrupted the saved scramble. Reset didn't stop a replay. The replay clock read 0.00. | All fixed. |

### Tools
- **Batch generation.** Up to 200 scrambles went to the worker in one request; 200 Square-1 scrambles take about 44 s, and that froze the timer's next scramble. Now it generates in chunks with progress and Stop. Previews and filenames use the batch's own event.
- **Average calculator.** It dropped the `+2` in "12.34 +2", called an untrimmed mean "ao4" and ignored the precision setting. Fixed.
- **Metronome.** It drifted because it ran on chained timers. It is now scheduled on the audio clock.
- **Smaller fixes.** Printed sheets get an event and date title, old solver results clear when you edit the input, and the About page shows Ctrl K on Windows.

### Algorithm trainer
| Severity | Problem | Fix |
|---|---|---|
| High | 985 of 1,562 alternative algorithms (63%) didn't solve the case as drawn without a U turn first, and "Use" saved them unchecked. | The needed AUF is detected and shown, for example `(U2) L' U' L F…`, and saved with the algorithm. Custom algorithms get the same treatment. A test checks all 1,562. |
| Medium | Wrong PLL arrows for Z, Jb, Ra, Rb and all four G perms. | The arrows undo the algorithm's final AUF. A test checks all 21 PLLs. |
| Medium | Weighted mode was biased: in a simulation, the case after the current one was picked 85% of the time instead of 33%. | Fixed. |
| Medium | Every attempt started a second animation loop, and leaving mid-solve leaked one. | One guarded loop, cancelled on exit. |
| Medium | **Touch:** tapping a button mid-solve was ignored, so tapping "Cases" left and lost the attempt. There was no `pointercancel`, and focus mode never engaged. | Any tap stops the clock without pressing what's underneath. Focus mode works. |
| Medium | Importing a backup could be overwritten by stale trainer data still in memory. | The trainer reloads after import. |
| Low | Several small problems: <ul><li>A "-0.00" flash at the start.</li><li>No ready state.</li><li>Cmd and Alt stopped the clock, and the stop-key setting was ignored.</li><li>Only 50 times were kept per case, so "best" was best-of-50.</li><li>The 2-look sets were never randomised.</li><li>Changing a case's status wiped your typed algorithm.</li><li>Validation was too loose for 2-look PLL and too strict for CMLL algorithms that end with an M turn.</li><li>"Train PLL" from the command palette did nothing on the trainer page.</li><li>Answer columns overflowed on phones.</li></ul> | All fixed. 200 times plus an all-time best are kept per case, and there is a new Discard button for mis-stops. |

## 2. Design: what changed

- **One colour system.** Every grey is now mixed (CSS `color-mix`) from a background, a text
  colour and an optional accent. The default ratios reproduce the original hand-picked greys
  exactly, so pure monochrome looks the same as before. The same mechanism also handles
  palettes, custom colours and accents. Colours are painted before the app loads, so they
  never flash.
- **Timer page.**
  - The session picker lists the current event's sessions first.
  - Clear empty states, and a first-run hint ("Hold Space, release to start").
  - A small "today" line, and PB rows marked in the panel.
  - Stats under the time can be configured.
  - A three-tab dock (Preview, Solver, Trend) replaces seven tabs that overflowed.
- **Phones.**
  - A bottom stats bar that opens the full session panel as a bottom sheet.
  - A scramble-preview button, and short picker labels ("WCA").
  - The clock sized to the screen.
- **Quieter controls.** In monochrome nothing changes. With an accent, the accent colours
  toggles, sliders, primary buttons, PBs, chart lines and the calendar.

## 3. What was missing, now built

- **Customize panel.** Open it with the palette icon in the top bar or Alt P. It sits beside
  the timer, so changes are visible live, and the full set is also under Settings →
  Appearance. It covers:
  - Light, dark or system theme.
  - 6 palettes (Mono, Paper, Slate, Sage, Dusk, Midnight), or custom background and text
    colours for each mode.
  - 8 accents or a custom colour.
  - Timer font: Sans, Mono, Serif, System, or a seven-segment **Display** like a Stackmat.
  - Timer size and weight.
  - Hold and ready colours: fade, red/green or accent.
  - Interface font, scramble font and scramble size.
  - Which stats sit under the time.
  - Session panel on or off, and left or right.
  - Dock, today line, focus mode, OK/+2/DNF buttons and the next-best hint.
- **Session manager** (session menu → Manage sessions). Every session, grouped by event, with
  solve counts. You can filter, rename inline, reorder, delete, and create a session for any
  event.
- **"11.82 or faster for a new best ao5".** It appears only when a new best is within reach
  (no faster than your best single).
- **Milestones.** A quiet note at 100, 250, 500, 1,000… solves in a session.
- **Wake lock and haptics.**
  - Keep screen awake stops the phone dimming mid-session; it lets go after a few idle
    minutes.
  - Haptics give a short buzz when the timer is ready.
- **Full screen.** Alt F, or from the command palette.
- **Accessibility.** Each result (and any PB) is announced to screen readers.
- **Trainer additions.** Discard an attempt, AUF-aware custom algorithms, and properly
  randomised 2-look setups.

## 4. Performance

- **First load.** About 64 KB of gzipped JS, roughly the same as the prototype's 62 KB despite
  the additions. The Customize panel, session manager and CSV export load on demand and are
  preloaded when idle.
- **50k-solve session.**
  - A new solve reaches the list in about 20 ms.
  - The Stats page renders in about 0.3 s.
  - The rolling average is now O(trim) per step instead of O(n).
- **120k-solve session.** The Stats page renders without errors, and switching the range takes
  about 50 ms.

## 5. Checked

- `npm test`: 63 tests, all passing (4 new):
  - Rolling averages checked against a direct computation at every index, across DNF rates,
    trims and both precisions.
  - The time-needed-for-a-new-best calculation.
  - The abandoned-hold behaviour.
  - Every trainer alternative and every PLL diagram.
- `npm run check`: 0 errors and 0 warnings.
- `npm run build`: clean.
- **Browser:**
  - Every page loads with no console errors.
  - The timer flow, blur handling, the session manager, bottom sheet and Customize panel.
  - Dark, palette and accent combinations.
  - Phone layouts for the timer and cube pages.
  - The Stats page at 120k solves.

## 6. Still open (updated 4 November)

- **Hardware input.** There is no Bluetooth smart cube or timer support, and no Stackmat input
  through the microphone. Both need hardware to build and test against.
- **Minor rough edges:**
  - The cube canvas doesn't redraw when the screen's pixel density changes without a resize
    (for example, dragging the window to another monitor).
  - Expanding the biggest ZBLS group draws 192 diagrams at once.
  - Pressing Escape while renaming in the session manager closes the whole dialog.
