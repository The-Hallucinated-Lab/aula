# Aula — how this project works

A complete explanation of what Aula is, how it is built, how it is coded, and
what happens when you press Generate.

Last updated: 2026-08-18.

---

## 1. What the project is

Aula is a **Windows desktop application that builds university timetables**.

An administrator describes their institution in real numbers — how many
students, which programmes, how many classrooms of each type, how many staff,
what hours the place teaches — switches on the rules that apply to them, and
presses Generate. Aula produces a clash-free weekly timetable and, crucially,
explains itself: every session it could not place names the rule that blocked it,
by number.

### The problem it solves

University timetabling is a constraint satisfaction problem that grows viciously
with size. A mid-sized college with 24 cohorts, 90 courses, 28 rooms and 68 staff
has on the order of 10^400 possible assignments, almost all of them illegal. The
hard part is not producing _a_ timetable; it is producing one that satisfies every
rule simultaneously, and — when that is impossible — telling a human precisely
which rule to relax.

### What makes it different

Three things.

**It is driven by a published catalogue of 500 named constraints.** They are not
paraphrased or bucketed; they are stored verbatim and numbered 1 to 500 across
fifteen operational domains, from "No instructor can be scheduled for two classes
simultaneously" to "Ensure ornithology (bird watching) classes are scheduled at
dawn". Every one can be switched off, re-weighted from 1 to 5, and where it takes
a number — minimum overnight rest, room turnover minutes — retuned.

**It is honest about what it enforces.** 301 of the 500 are wired to engine logic:
the solver refuses them (hard) or prices them (soft) on every candidate placement.
The other 199 cannot be decided from a weekly-teaching data model — exam-week
seating, hazardous-waste pickup windows, catering rotas. Those are labelled
_advisory_ in the interface, stay switchable, and are exported for a human to sign
off. Nothing silently pretends to be checked.

**Everything is editable.** The wizard's numbers create a starting institution.
The moment you edit a person, a room or a course, that entity type is
_materialised_ — the generated list is snapshotted into your project as explicit
records, and the generator stops inventing it. You can add staff, assign them
courses from any department, mark rooms unavailable on particular days, delete
courses semester by semester, and write your own rules on top of the 500.

---

## 2. Technology stack

| Layer     | Choice                          | Why                                                                                        |
| --------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| Shell     | Electron 43                     | A real installable Windows application; native file dialogs, menus and window chrome       |
| UI        | React 19 + TypeScript 6         | Strict typing across a large domain model; no runtime type errors reaching the solver      |
| Build     | Vite 8 + `vite-plugin-electron` | Sub-second HMR in development, one command to a packaged installer                         |
| State     | Zustand 5                       | One store, named actions, no boilerplate; the whole app state is inspectable in one object |
| Solver    | Bespoke, in-house               | Explained in §5 — no dependency, runs in a Web Worker                                      |
| Assistant | Ollama running locally          | `gemma4:e4b` on the user's own machine; no data leaves the device                          |
| Packaging | electron-builder                | NSIS installer + portable executable                                                       |
| Lint      | oxlint                          | Fast enough to run on every save                                                           |

There is **no server, no database and no network call** except to `localhost:11434`
for the optional assistant. The whole application is a local tool.

---

## 3. Architecture

```
electron/
  main.ts          Electron main process: window, menu, file dialogs,
                   window-state persistence, the Ollama relay
  preload.ts       contextBridge — the only channel between renderer and Node

src/
  data/            Pure data and types. Imports nothing from engine or React.
    model.ts       Domain model: Institution, Course, Room, Faculty, Session…
    config.ts      SetupConfig — everything the wizard collects, plus validation
    records.ts     Editable entity records and the materialise-on-edit rule
    generator.ts   SetupConfig -> Institution
    metrics.ts     Utilisation, load spread, gaps, lunch protection
    exporters.ts   CSV and JSON output
    help.ts        Field-level explanations, in one place
    constraints/
      types.ts     Rule-key union, parameter model, catalogue types
      rows1-3.ts   The 500 constraints, verbatim
      catalogue.ts Assembly and integrity audit
      custom.ts    User-defined rule templates

  engine/          Scheduling. Imports data; never React or the DOM.
    occupancy.ts   Incremental index: "is this room free at Tue 11:00?" in O(1)
    context.ts     Shared lookups and helpers for every rule
    rules.ts       124 rule implementations
    customRules.ts Evaluator for user-defined rules
    solver.ts      The scheduler
    worker.ts      Web Worker entry point
    client.ts      Promise-shaped worker client
    assistant.ts   Briefing builder and Ollama protocol

  pages/           Overview, Timetable, Setup, Data, Scenarios, Constraints, Assistant
  components/      Shared UI primitives, title bar, custom-rule editor
  store.ts         The single Zustand store
  platform.ts      Electron bridge with a browser fallback

scripts/harness.ts Headless verification suite
```

### The two boundaries that matter

**`src/data` never imports `src/engine` or React.** It is pure description.

**`src/engine` may import `src/data`, but never React or the DOM.** This is what
lets `npm run verify` bundle the entire engine with esbuild and exercise it in
Node, with no browser and no mocking. The verification suite is not testing a
sketch of the solver; it is testing the solver that ships.

### Why the solver runs in a Web Worker

Generation and solving are CPU-bound and scale with the institution. On the UI
thread a two-second solve would freeze the window and Windows would paint
"(Not Responding)" on the title bar. `engine/worker.ts` runs both off-thread; the
window stays interactive and shows progress.

---

## 4. How the data flows

```
Setup wizard
    │  writes
    ▼
SetupConfig ──────────► summarise()  ──► blocking errors and warnings,
    │                                    shown before you can solve
    │  generateInstitution()
    ▼
Institution  (campuses, buildings, rooms, departments, programmes,
    │         courses, cohorts, faculty, equipment, time grid)
    │
    │  ┌── overrides.faculty / .courses / .rooms / .sections
    │  │   take over once the user edits that entity type
    │  ▼
    │  editable records (data/records.ts)
    │
    │  solve()  in a Web Worker
    ▼
SolveReport (sessions, violations, unplaced, bottlenecks, timings)
    │
    ├──► Timetable grid, drag-and-drop editing, substitutions
    ├──► Overview: metrics, heatmap, what did not fit and why
    ├──► Assistant briefing
    └──► CSV / JSON exports
```

### Materialise-on-edit

This is the mechanism behind "everything is editable", and it is worth
understanding.

A `SetupConfig` normally contains only _numbers_: 68 staff, 40% assistant
professors, 6 lecture rooms of 72 seats. The generator turns those into concrete
entities deterministically from a seed.

The moment you edit one staff member, the store calls `facultyRecordsFrom()`,
which snapshots **all 68** generated staff into `config.overrides.faculty` as
explicit records, applies your edit, and saves. From then on `generateInstitution`
sees `overrides.faculty` and stops generating staff entirely — your roster is the
truth. The same applies independently to courses, rooms and section counts, and
each can be reset back to generated.

The consequence is that a project file is self-contained and reproducible: either
the numbers regenerate the entities, or the entities are written down.

---

## 5. How the scheduling engine works

### The demand model

Before placing anything, the solver builds a list of _demands_: for every cohort,
for every course that cohort must take, one demand carrying how many meetings are
needed, how many consecutive slots each meeting occupies, which rooms could
physically host it, and which instructors are qualified and available.

Demands are then sorted by **slack** — roughly `rooms × instructors`, adjusted for
headcount. The most constrained demand is placed first. A 200-seat lecture with one
suitable hall and two qualified lecturers gets the first choice; a seminar with
twenty options waits. This ordering alone accounts for most of the difference
between "it fits" and "it doesn't".

### Placing one session

For each demand the solver walks candidate placements — day, slot, instructor,
room — and for each:

1. **Hard gate.** Every enabled hard rule runs, cheapest first: instructor free?
   room free? cohort free? capacity? room type? The first failure rejects the
   candidate and is counted against that constraint's number.
2. **Soft pricing.** Surviving candidates are scored by every enabled soft rule,
   multiplied by that rule's weight. Gaps, building changes, early starts,
   utilisation and welfare all contribute.
3. **Selection.** The cheapest candidate wins. A zero-cost candidate ends the
   search immediately.

The bounded pass stops after 160 priced candidates, which keeps a full solve to
about two seconds.

### Three passes, not one

Greedy placement with no backtracking can strand a late session behind an early,
arbitrary choice. Aula therefore has three escalating passes:

1. **Bounded search** — the fast path described above.
2. **Exhaustive sweep** — if nothing was found, every day, slot, room and
   instructor is examined with no cap, taking the first legal placement rather
   than the prettiest.
3. **Displacement** — if that also fails, the solver looks for a placement whose
   only obstacle is an occupied room, moves the occupant to a different room, and
   takes its place. Every rule is re-checked for _both_ sessions, so a
   displacement can never introduce a violation. It is bounded at 60 attempts.

The report counts how often passes 2 and 3 were needed, so you can see how tight
the institution really is.

### What is guaranteed, and what is not

**Guaranteed:** no enabled hard constraint is ever violated. The verification
suite re-derives this independently rather than trusting the solver.

**Not guaranteed:** optimality. This is a constraint-guided greedy placer, not a
CP-SAT solver. It will not prove that a better soft-cost arrangement does not
exist. What it gives instead is speed, determinism for a given seed, and a full
audit trail of every refusal.

### Constraints are data, not code

A rule implementation never reads constraint prose. It reads parameters:

```ts
facultyMinRest: {
  check: (c, occ, ctx, p) => {
    const restMinutes = num(p, 'restHours', 12) * 60
    …
  }
}
```

`restHours` comes from the catalogue's default merged with whatever the
administrator set in the interface. Changing "minimum overnight rest" from 12
hours to 10 is a click, not a code change. 72 of the 500 constraints expose
settings this way.

---

## 6. The constraint catalogue

500 constraints across fifteen domains:

|      | Domain                               | Range   |
| ---- | ------------------------------------ | ------- |
| I    | Universal hard constraints           | 1–10    |
| II   | Instructor workload and legal limits | 11–30   |
| III  | Instructor preferences               | 31–40   |
| IV   | Student cohort and pathway           | 41–60   |
| V    | Course and curriculum sequencing     | 61–80   |
| VI   | Standard time blocks and grid rules  | 81–90   |
| VII  | Room types and physical capabilities | 91–110  |
| VIII | Specialised equipment and IT         | 111–125 |
| IX   | Campus geography and travel times    | 126–135 |
| X    | Maintenance, setup and logistics     | 136–145 |
| XI   | Accessibility and inclusivity        | 146–155 |
| XII  | Departmental and administrative      | 156–165 |
| XIII | Examination constraints              | 166–175 |
| XIV  | Financial, environmental and energy  | 176–180 |
| XV   | Granular sub-constraints and nuances | 181–500 |

Each entry carries its verbatim text, its domain, a hard/soft classification, an
optional rule key, and any editable parameters. `auditCatalogue()` runs at start-up
in development and fails loudly if an ordinal is missing, duplicated, or sitting
outside its domain's range.

### Custom rules

Institution-specific rules live separately, numbered U001 upwards, so the
published numbering is never disturbed. Eight templates are available — keep a
slot free, keep a day free, no early starts, no late finishes, cap hours per day,
cap consecutive hours, require a building, avoid a building — each scoped to
everyone, a cohort, a staff member, a department, a course or a room. They are
evaluated by the same engine in the same pass, so a hard custom rule binds exactly
as tightly as a hard catalogue rule.

They are templates rather than free text on purpose: a rule the engine cannot
evaluate is not a constraint, it is a note.

---

## 7. The assistant

The Assistant page is backed by a language model **running on the user's own
machine** through Ollama, defaulting to `gemma4:e4b`.

It is given a compact factual briefing built from the solved schedule — cohorts,
rooms, staff loads, bottlenecks, unplaced sessions, and each cohort's week — and
instructed to answer only from it and never to invent a figure. The briefing is
deliberately bounded: an 8B model answers a tight briefing far better than a dump
of 360 sessions, which would crowd out the question itself.

Requests are relayed through the Electron main process rather than fetched from
the renderer. In a packaged app the renderer's origin is `file://`, which Ollama
rejects on CORS; the main process has no such restriction. Tokens stream back over
IPC so the answer appears as it is written.

If Ollama is not installed or not running, the page falls back to a deterministic
explainer that reads the report directly — it can still answer what blocked the
most placements, who is busiest, what constraint 184 says, and what a given cohort
does on a given day. The language model is an enhancement, never a dependency, and
the interface says which one answered.

---

## 8. How the code is written

**Strict TypeScript throughout.** `noUnusedLocals`, `noUnusedParameters`,
`erasableSyntaxOnly`. No `any` at any module boundary. The domain model is
expressed in types precise enough that the solver cannot be handed a malformed
institution.

**Comments explain why, not what.** `// increment i` is noise; "A closed day
expands to every slot of that day, so one tick in the availability grid reaches
the same rule that handles individual slots" is the reason the code looks the way
it does.

**Failure is loud.** No empty `catch` blocks. When the Electron preload failed to
load during development, the symptom was a missing title bar and no error at all —
so a `preload-error` listener now reports it. The catalogue audit and the
unimplemented-rule check run at start-up in development for the same reason.

**Never emit an impossible demand.** If the configured rooms have no fume hood, no
course is given a fume-hood requirement. If no accessible seminar room exists, no
cohort is flagged as needing one. The solver should fail on real scarcity, never
on generator fiction — otherwise the explanation it gives the user is a lie.

**Verification re-derives, it does not trust.** `npm run verify` checks the
produced schedule against the invariants from scratch: it recounts double
bookings, capacity breaches, room-type mismatches, unqualified assignments,
sabbatical assignments and cap breaches itself. A solver bug cannot mark its own
homework.

---

## 9. What happens when you press Generate

1. `summarise(config)` validates. Blocking errors stop the solve and are shown
   with the specific fix — "B.Tech CSE: lectures need a Lecture room seating 200,
   but the largest Lecture holds 90. Raise its capacity, split the section, or add
   rooms."
2. The config, the 500 constraint states and any custom rules are posted to the
   Web Worker.
3. The worker builds the institution — from the numbers, or from your edited
   records where they exist.
4. Demands are built and sorted by slack.
5. Each demand is placed by the three-pass search, every hard rule gated and every
   soft rule priced.
6. Post-hoc audits run: contact hours per course, low-enrolment flags, grid slack,
   core courses with no sessions.
7. An independent invariant check counts any double booking that survived — it
   should always be zero, and it is verified rather than assumed.
8. The report returns: sessions, violations, unplaced groups with reasons and
   blocking constraint numbers, the constraints that refused the most placements,
   timings and the soft penalty.

The Overview then shows what fitted, what did not, and which rule to relax.

---

## 10. Running and building

```bash
npm install        # install dependencies
npm run dev        # development, opens the Electron window
npm run dev:web    # browser only, no Electron
npm run verify     # headless self-test of the catalogue and solver
npm run build      # typecheck and build renderer + Electron bundles
npm run package    # Windows installer and portable executable
```

`npm run package` writes `Aula-Setup-1.0.0-x64.exe` and
`Aula-Portable-1.0.0-x64.exe` to `release/`.

### Verification

`npm run verify` runs 30 checks: catalogue integrity, rule-implementation
coverage, configuration feasibility, generation determinism, a full solve, then
independent re-derivation of every hard invariant, the editable-record round trip,
room-availability enforcement, section overrides, and custom-rule enforcement. It
exits non-zero on any failure, so it can gate a build.

---

## 11. Known limits

- **199 of 500 constraints are advisory.** Extending the data model — an
  assessment entity, a facilities calendar — is the path to enforcing more.
- **The solver does not prove optimality.** A CP-SAT backend would; this trades
  that for speed and a complete audit trail.
- **No SIS or CSV import yet.** `generateInstitution` is the single seam where one
  would attach.
- **Exam scheduling is out of scope.** This builds the weekly teaching timetable.
- **The build is not code-signed**, so Windows SmartScreen warns on first run.
