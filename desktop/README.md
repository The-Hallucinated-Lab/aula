# Aula — Timetable Studio

Aula is a Windows desktop application for university timetable planning. It is
intended for the registrar or department head who has to turn an institution's
real numbers — students, programmes, classrooms, staff, teaching hours — into a
week that works. Everything runs locally: there is no server, no account and no
network call. The scheduling engine, the data and the exported files never leave
the machine.

## What it does

- An administrator fills in a six-step Setup wizard with their own figures:
  institution name, year and term; teaching days, day start and end, slot length,
  passing time, lunch window and evening start; programmes with years, sections,
  students per section and course load; buildings and room groups with type,
  count, seats, turnover time and capabilities; faculty headcount, rank mix and
  the daily, weekly, adjunct and TA caps.
- The wizard validates as you type and refuses to solve a configuration that
  cannot work, naming the shortfall — for example, that a programme needs a
  lecture room seating 200 while the largest one holds 90.
- It carries a catalogue of 500 named scheduling constraints, reproduced verbatim
  and numbered 1 to 500, grouped into 15 operational domains.
- Of those, 301 are enforced by the engine and 199 are advisory: the engine cannot
  decide them from the data model, so they are tracked, weighted, switchable and
  exported for a human to sign off. The interface labels which is which.
- Every constraint can be switched off and re-weighted from 1 to 5, and 72 of them
  expose editable numeric or time settings, such as the minimum overnight rest
  between an evening and a morning class.
- The engine runs in a Web Worker, so the window never freezes while it solves.
- When a session cannot be placed, the app names the constraint number that
  blocked it rather than showing an empty grid.
- Dragging a class to a new slot checks the rules live: green if every enabled
  hard constraint still holds, red with the blocking rule number if not. A room
  clash resolves itself when a suitable room is free.
- Marking an instructor absent for a day proposes qualified, available substitutes
  and repairs only that day, leaving the rest of the week untouched.

## Getting started

```bash
npm install        # install dependencies
npm run dev        # run in development (opens the Electron window)
npm run dev:web    # run only the browser version, no Electron
npm run verify     # headless self-test of the catalogue and the solver
npm run build      # typecheck and build the renderer and Electron bundles
npm run package    # build the Windows installer and portable executable
```

`npm run package` writes to `release/`:

- `Aula-Setup-1.0.0-x64.exe` — NSIS installer, per-user, choosable install directory
- `Aula-Portable-1.0.0-x64.exe` — single-file portable build

## Keyboard shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl` + `G` | Generate timetable |
| `Ctrl` + `S` | Save project |
| `Ctrl` + `O` | Open project |
| `Ctrl` + `E` | Export timetable |
| `Ctrl` + `K` | Constraint catalogue |
| `Ctrl` + `,` | Institution setup |

## Exports

- Timetable CSV — one row per session, with day, time, course, cohort, instructor and room
- Faculty workload CSV — scheduled hours against contractual cap, per instructor
- Constraint register CSV — all 500 rules with their state, weight, settings and
  whether they are engine-enforced or awaiting human sign-off
- Full JSON — institution, sessions, solve report and constraint state
- Projects save and reopen as `.aula.json`

## How it is put together

```
electron/          main process, preload bridge (contextIsolation on)
src/data/          types, setup config, generator, metrics, exporters
src/data/constraints/  the 500-constraint catalogue and its type system
src/engine/        occupancy index, rule registry, solver, Web Worker
src/pages/         Overview, Timetable, Setup, Data, Scenarios, Constraints, Assistant
scripts/harness.ts headless verification suite
```

Two boundaries matter. `src/data` is pure data and types and never imports the
engine or React. `src/engine` may import `src/data` but never React or the DOM —
which is what lets `npm run verify` exercise the whole engine without a browser.

Rules never read constraint prose; they read parameters. That is what lets an
administrator retune a threshold without a code change.

## Verification

`npm run verify` runs the pipeline headlessly and re-derives the hard invariants
independently of the solver, so a solver bug cannot mark its own homework. It
checks that all 500 constraints are present and unique, that every referenced rule
has an implementation, that generation is deterministic for a fixed seed, and then
that the produced schedule has no double-booked room, instructor or cohort, no
capacity or room-type breach, no unqualified or sabbatical assignment, no exceeded
weekly cap, and nothing scheduled outside the grid. It exits non-zero on any
failure.
