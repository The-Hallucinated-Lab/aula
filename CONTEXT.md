# SYSTEM CONTEXT MANIFEST & EXECUTION TIMELINE

## 1. PROJECT IDENTIFICATION & OPERATIONAL STATE

- **Project Identifier:** AULA-TIMETABLE-STUDIO
- **Operational Status:** PRODUCTION / STABLE (v1.0.0)
- **Architecture Style:** Domain-Driven desktop monolith — Electron shell + React renderer + isolated solver worker
- **Primary Runtime:** Node.js 20+ / Electron 43 / TypeScript 6
- **System Purpose:** Generates university timetables from administrator-supplied figures (students, programmes, rooms, staff, hours) against a catalogue of 500 named constraints, and explains every rejection by constraint number.

## 2. TECHNICAL STACK MATRIX

| Layer | Technology | Version | Enforcement Rules |
| :--- | :--- | :--- | :--- |
| **Desktop shell** | Electron | 43.x | `contextIsolation: true`, `nodeIntegration: false`, CJS preload, no renderer filesystem access |
| **Renderer** | React + Vite | 19 / 8 | Strict TS, `erasableSyntaxOnly`, `noUnusedLocals`, no `any` at module boundaries |
| **State** | Zustand | 5.x | Single store; all mutations go through named actions |
| **Solver/Compute** | Bespoke constraint engine | — | Runs in a Web Worker; never on the UI thread; hard wall-clock budget |
| **Packaging** | electron-builder | 26.x | NSIS + portable, x64, `publish: never` |

## 3. ARCHITECTURAL BOUNDARIES & RULES

1. [RULE-01] `src/data/**` is pure data and types. It must never import from `src/engine` or `src/pages`.
2. [RULE-02] `src/engine/**` may import `src/data`, never React or the DOM. This is what allows the headless verification harness to exercise the whole engine.
3. [RULE-03] Rules never read constraint prose. They read parameters, so an administrator can retune a threshold without a code change.
4. [RULE-04] The generator must never emit a structurally impossible demand. If no configured room has a fume hood, no course is given a fume-hood requirement — the solver should fail on real scarcity, never on generator fiction.
5. [RULE-05] A constraint is only shown as "engine-enforced" if `isImplemented(rule)` is true. Advisory constraints are labelled as such in the UI and in exports.
6. [RULE-06] CPU-bound work (generation + solving) runs in `src/engine/worker.ts`. The renderer never blocks.
7. [RULE-07] Every catalogue change must keep `npm run verify` green — it audits all 500 entries and re-derives the hard invariants independently of the solver.

## 4. CURRENT SYSTEM GAPS & KNOWN SHORTCOMINGS

- [GAP-06] The assistant needs Ollama installed locally; without it the page falls back to the deterministic explainer. This is by design, but it means the richer answers are not available on a clean machine.
- [GAP-07] Custom rules offer eight templates. Anything outside them still has to be expressed by tuning a catalogue constraint.
- [GAP-01] 199 of the 500 constraints are advisory. They are tracked, weighted, switchable and exported for sign-off, but the engine cannot decide them from the current data model (exam-week seating, hazardous-waste windows, catering rotas, ceremony logistics). Extending the model — an assessment entity, a facilities calendar — is the path to enforcing more.
- [GAP-02] The solver is a constraint-guided greedy placer with least-slack ordering and a bounded candidate search. It guarantees every enabled hard constraint and minimises weighted soft cost, but it does not prove optimality. A CP-SAT backend would.
- [GAP-03] Cohort gap minimisation is weaker than the other soft objectives; typical output leaves ~9 free slots per cohort per week.
- [GAP-04] Institution data is generated from the wizard's figures. There is no CSV/SIS import path yet; `generateInstitution` is the single seam where one would attach.
- [GAP-05] Exam scheduling is out of scope for this build — the app schedules the weekly teaching timetable.

## 5. IMMUTABLE EXECUTION TIMELINE & BUG LOG

<!-- TIMELINE LOGS BEGIN BELOW THIS LINE -->

- **Timestamp:** 2026-08-18T18:45:00Z
- **Session ID:** aula-v1-electron-500c
- **Author/Agent:** Claude Opus 5
- **Target Subsystem:** whole application
- **Intent:** Turn the SIH25028 front-end demonstrator into a real Windows desktop application: encode all 500 constraints as configurable data, build an engine that genuinely enforces what it can, and let an administrator enter their own institution's figures.
- **Bugs Discovered:**
  1. Default room capacities made labs and electives structurally unplaceable (60-student sections vs 36/40/48-seat rooms) — the solver placed only 191 of 360 meetings and reported an unhelpful "no feasible slot".
  2. Constraint 118 (portable smartboard IT-delivery pad) mapped to `roomTurnover` with no gating, so it demanded a spare slot between *every* booking in *every* room, roughly halving room throughput.
  3. The generator flagged year-1 cohorts as needing accessible rooms while the configured plant had no accessible seminar rooms or labs, creating an impossible demand (constraint 384 blocked 11,211 placements).
  4. Unplaced-session reporting concatenated code and message into one map key, so `reason` came out `undefined` and `blockedBy` was empty.
  5. The Electron preload was emitted as CommonJS but named `preload.mjs`; Electron parsed it as ESM, `require` was undefined, and the bridge failed silently — taking the custom title bar and every file dialog with it. With `frame: false` this left a window with no way to close it.
  6. Generating from the top bar produced a schedule but the Overview stayed on its empty state, because the page gated on `setupComplete` rather than on having a report.
  7. A stray NUL byte was introduced into `solver.ts` by an in-place `sed` pass and silently corrupted a template literal.
- **Fixes Applied:**
  1. Raised default lab/computer-lab/seminar capacities and added a per-programme, per-room-kind feasibility check to `summarise()` that names the exact room type, the shortfall and three ways to resolve it.
  2. Gated constraint 118 behind `requiresEquipment`, so the turnover only applies to courses that actually book portable equipment.
  3. `generateInstitution` now computes which room kinds have an accessible room and only flags a cohort when every kind it will be taught in is covered.
  4. Reason tracking became `Map<code, {count, message}>`; unplaced rows now carry a human sentence plus the blocking constraint codes, which the Overview renders as clickable chips.
  5. Forced the preload to `format: 'cjs'` / `preload.cjs` and added a `preload-error` listener in main so a future regression is loud rather than silent.
  6. Overview and Timetable now gate on `report` / `sessions.length`; a successful solve sets `setupComplete`.
  7. Stripped the NUL and switched to explicit LF-preserving writes.
- **Context Modifications:**
  - New: `src/data/model.ts`, `src/data/config.ts`, `src/data/exporters.ts`, `src/data/constraints/{types,rows1,rows2,rows3,catalogue}.ts`
  - New: `src/engine/{context,occupancy,rules,solver,worker,client}.ts`
  - New: `src/pages/Setup.tsx`, `src/components/TitleBar.tsx`, `src/platform.ts`, `src/styles/app.css`
  - New: `electron/main.ts`, `electron/preload.ts`, `scripts/harness.ts`, `build/icon.png`
  - Rewritten: `store.ts`, `generator.ts`, `metrics.ts`, and every page
  - Removed: `src/data/types.ts` (superseded by `model.ts`)
- **Verification:** `npm run typecheck` clean across both TS projects; `npm run lint` clean (2 pre-existing fast-refresh warnings); `npm run verify` 21/21 checks pass — 360/360 meetings placed, 0 clashes, 0 capacity/type/qualification/cap/grid breaches, 2.4 s; `npm run build` succeeds; the packaged Electron app was launched and driven through generate → timetable → constraints.


- **Timestamp:** 2026-08-18T22:40:00Z
- **Session ID:** aula-v1.1-review-response
- **Author/Agent:** Claude Opus 5
- **Target Subsystem:** data model, engine, Data studio, Constraints, Assistant
- **Intent:** Act on a handwritten review (decoded from "Computer Networks and SLM.pdf") covering 27 items: make every entity editable, add building floors and per-room availability, remove the capability-flag clutter, allow custom rules, add per-department section control, wire a local-model assistant, and answer twelve "what is X" questions as inline help.
- **Bugs Discovered:**
  1. Materialising an unchanged institution and re-solving it placed 359 of 360 sessions. A structural diff showed zero differences in anything the search reads; the loss came from soft-cost differences changing the greedy path, stranding one session behind a committed room booking. Neither the bounded nor the exhaustive pass could recover it, because the obstacle was an existing placement rather than an unexplored candidate.
  2. A delegated help sentence described "walk time" as the maximum walking time allowed between classes. It is the actual walk time between buildings. The draft passed every structural gate and was still factually inverted.
  3. The first assistant design fetched Ollama from the renderer. That works in development and fails in the installer, where the origin is `file://` and Ollama refuses it on CORS.
  4. The local delegation harness corrupted output mid-word by piping `ollama run` into a file, which injects terminal control sequences.
- **Fixes Applied:**
  1. Added a bounded displacement pass to the solver: when a placement's only obstacle is an occupied room, the occupant is moved to another room and the new session takes its place, with every rule re-checked for both sessions. Capped at 60 attempts. Restored 360/360, and the report now counts repairs and displacements so tightness is visible.
  2. Corrected the sentence by hand and moved all field help into `data/help.ts` so wording is verified in one place.
  3. Moved the assistant to an IPC relay in the main process, streaming tokens back over `assistant:chunk`.
  4. Rewrote `delegate.sh` and `ask.sh` to use the Ollama HTTP API with thinking explicitly off and the context window pinned per call.
- **Context Modifications:**
  - New: `src/data/records.ts`, `src/data/help.ts`, `src/data/constraints/custom.ts`, `src/engine/customRules.ts`, `src/engine/assistant.ts`, `src/components/CustomRules.tsx`, `docs/review-notes-2026-08-18.md`, `explanation.md`, `decisions.md`
  - Extended: `config.ts` (overrides, building floors, custom rules, record-aware validation), `generator.ts` (record-driven construction), `solver.ts` (three-pass placement), `store.ts` (entity CRUD, custom-rule CRUD), `exporters.ts` (per-view grid export), `electron/main.ts` and `preload.ts` (assistant relay)
  - Rewritten: `pages/DataStudio.tsx` (full CRUD), `pages/Assistant.tsx` (local model with fallback)
- **Verification:** `npm run typecheck` and `npm run lint` clean; `npm run verify` 30/30 checks pass including the new editable-record round trip, room-availability enforcement, section overrides and custom-rule enforcement; the assistant relay was exercised against a live `gemma4:e4b` (20 streamed chunks, answer grounded in the briefing); `npm run build` succeeds.


- **Timestamp:** 2026-08-19T22:30:00Z
- **Session ID:** aula-v1.2-calendar-staff-floors
- **Author/Agent:** Claude Opus 5
- **Target Subsystem:** data model, generator, engine rules, solver, Setup wizard, Data studio, new Calendar screen
- **Intent:** Three changes asked for together: replace the placeholder-row "add faculty" with a proper intake dialog covering identity, teaching capability, workload/availability and location; rebuild the Setup rooms step so each building has a floor count and each floor holds its own mix of room types and specialised labs; and add a whole academic-calendar section for institution events and custom holidays that actually reaches the timetable.
- **Bugs Discovered:**
  1. `accessibleKinds` in the generator decided a cohort's accessibility need from the `wheelchairAccess` feature flag alone, while constraints C147/C384 also check the room's floor and whether the building has a lift. The moment room groups could name a floor, the ordinary configuration "computer labs on the second floor of a liftless lab block" produced a cohort with an unsatisfiable need; the solver lost a lab meeting and could only report "LC202 has no lift and is above ground floor". Latent since the flag existed, reachable from normal input only after this change.
  2. Every page is wrapped in `.fade-in`, which carries a transform, so `position: fixed` overlays resolved against the page box rather than the viewport. Measured at scrollY 900 the overlay reported `top: -720, height: 2396`; the dialog rendered off-screen. The pre-existing substitution sheet in Timetable had the identical defect.
  3. `tryDisplacement` incremented its 60-attempt budget before checking whether the room was occupied, spending the entire allowance on empty cells and reporting "no displacement possible" without evaluating a single swap.
  4. Materialising the roster was lossy: the generator wrote `earliestSlot: wantsEarly ? 0 : 1` for ~70% of staff, which no shift preference in the record editor can express, so opening the staff list once silently rewrote everyone to "no preference" and changed the schedule. (`latestSlot` was also computed from a variable that had no effect either way.)
  5. `facultyQualified` in the rule registry is referenced by no catalogue row — qualification is enforced by pre-filtering in `buildDemands`. A group-size cap added to the rule would have been dead code.
- **Fixes Applied:**
  1. `accessibleKinds` now mirrors what C147 and C384 check: step-free by floor, lift or feature, and the building not marked inaccessible. Restored 360/360 on the default configuration.
  2. Added `Portal` in `components/Dialog.tsx` and routed the new dialogs and the existing substitution sheet through it.
  3. The displacement counter increments only when a swap is actually evaluated.
  4. The generator now assigns one of the four shift windows the record editor offers, and `shiftOf`/`windowFor` use the same floored midpoint, so the round trip is exact.
  5. Group size is enforced by `canTeach` in `data/model.ts`, called by both the solver's candidate filter and the store's substitution finder.
- **Context Modifications:**
  - New: `src/data/academicCalendar.ts`, `src/pages/Calendar.tsx`, `src/components/Dialog.tsx`, `src/components/FacultyDialog.tsx`
  - Extended: `model.ts` (calendar types, `EmploymentType`, seven new `Faculty` fields, `canTeach`), `config.ts` (term dates, `events`, `RoomGroupConfig.floor` and `specialisation`, calendar-aware `summarise`), `normalise.ts` (events, legacy `holidays` migration, floor clamping, the full staff record), `records.ts` (the staff record an institution actually collects, `ROOM_SPECIALISATIONS`), `generator.ts` (grid drops calendar-lost weekdays, groups honour their floor, records map onto the model in full), `rules.ts` (C010 and C151 now read the calendar instead of restating that the day is a teaching day; personal consecutive caps; home-building and room-kind preferences; weekday attrition in `spreadAcrossWeek`), `exporters.ts` (`calendarCsv`, meetings-per-term column), `store.ts` (calendar actions, record-taking `addFaculty`), `Setup.tsx` (rooms step rebuilt around buildings → floors → facilities; term dates and an impact strip), `DataStudio.tsx` (roster rows plus the intake dialog; facility picker on rooms), `Timetable.tsx` (per-weekday teaching-date counts, blackout cells, meetings-this-term), `TopBar.tsx`/`App.tsx`/`electron/main.ts` (Calendar route, nav, menu and export)
  - Two constraints moved from tautology to enforced: C010 (`holidayBlackout`) and C151 (`religiousHoliday`) previously only re-asserted that the day was in the teaching week.
- **Verification:** `npm run typecheck` clean; `npm run lint` clean (the same 2 pre-existing fast-refresh warnings); `npm run verify` 60/60 checks pass, including 15 new ones covering UTC date handling, one-off vs full-weekday closures, weekly blackouts, observances against mandatory teaching, the legacy holiday migration, floor placement and clamping, and every new staff field reaching the solver; `npm run build` succeeds; driven in a browser end to end — added a three-day Dussehra closure and watched Mon/Tue/Wed drop to 15/16 teaching dates and the timetable headers follow, added a staff member through the dialog (validation refused an unnamed and unqualified record), and reduced a block from four floors to one and confirmed its rooms moved down rather than disappearing.
- **Packaging note:** `npm run package` failed three times with `EPERM: rename 'release\win-unpacked.tmp' -> 'release\win-unpacked'`. The extracted directory could be deleted but not renamed, which is an on-access scanner holding it, not a permissions or Controlled-Folder-Access problem (that feature is off on this machine). It cleared on a later attempt with no change to the project. If it recurs: delete `release\win-unpacked.tmp` and run again.
- **Known limitation:** holding two periods a week in every room lifts room pressure to 36% and, on some seeds, strands the last meeting of one course behind instructors who are all committed elsewhere at the remaining feasible times. The displacement pass moves rooms, not people, so it cannot rescue that — GAP-02. The app reports the shortfall by constraint number; the harness asserts the cost is at most one meeting rather than asserting perfection.
