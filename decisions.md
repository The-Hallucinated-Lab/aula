# Decision log

Every decision of consequence taken while building Aula, with the reasoning and
the alternatives that were rejected. Newest section last.

Format: **D-nn** — decision · why · what was rejected.

---

## Session 1 — 2026-08-18 — from demonstrator to application

### Architecture

**D-01 — Electron rather than a web app or WinUI.**
The brief asked for a Windows application anyone can install and run. Electron
gives a real installable app with native dialogs, menus and window chrome while
keeping the React front-end that already existed. *Rejected:* WinUI 3 / C#, which
would have meant discarding the working UI; a plain web app, which cannot own the
window, the file system or an installer.

**D-02 — The scheduling engine runs in a Web Worker.**
Solving is CPU-bound and grows with institution size. On the UI thread a two-second
solve freezes the window and Windows paints "(Not Responding)" on the title bar.
*Rejected:* solving on the main thread with a progress spinner — the spinner cannot
animate while the thread is blocked.

**D-03 — `src/data` never imports `src/engine` or React; `src/engine` never
imports React or the DOM.**
This is what allows the entire engine to be bundled and exercised in Node by the
verification harness, with no browser and no mocking. The tests exercise the code
that ships. *Rejected:* co-locating everything by feature, which reads well but
makes the engine untestable without a DOM.

**D-04 — One Zustand store, all mutations through named actions.**
The whole application state is one inspectable object and every change has a name
that appears in the activity log. *Rejected:* Redux (ceremony without benefit at
this size); React context (re-render storms across a 500-row catalogue).

### The constraint catalogue

**D-05 — Store all 500 constraints verbatim, numbered 1 to 500.**
They are the published list. Paraphrasing or bucketing them would break every
report that cites a rule by number, and would quietly lose the distinctions the
list was written to capture. *Rejected:* summarising into ~40 rule families, which
was tempting for tidiness and wrong for traceability.

**D-06 — Split enforcement into "engine-enforced" and "advisory", and say which
in the interface.**
301 constraints map to real engine logic. The other 199 cannot be decided from a
weekly-teaching data model — exam-week seating, hazardous-waste pickup windows,
catering rotas, commencement logistics. They remain in the catalogue, switchable
and weighted, and are exported for human sign-off.
*Rejected:* implementing all 500 as stubs that always pass. That would have made
the headline number "500 enforced" and every one of those 199 a lie. A constraint
that always returns true is not enforcement, it is decoration.

**D-07 — Rules read parameters, never constraint prose.**
`facultyMinRest` reads `restHours`; it does not know what its own sentence says.
This is what lets an administrator change minimum overnight rest from 12 hours to
10 without a code change. 72 constraints expose settings this way.

**D-08 — Demote exam-session rules and software-licence expiry to advisory.**
These were initially mapped to rule keys. On review they could only ever have been
vacuous: this build schedules the weekly teaching timetable, so there are no exam
sessions for `examNoOverlap` to check, and no licence model for `licenceValid` to
read. Shipping a check that can never fire is worse than admitting the gap.

**D-09 — Custom rules are templates, numbered U001 upwards, not free text.**
A separate numbering keeps the published 1–500 undisturbed. Templates — keep a
slot free, cap consecutive hours, require a building, and five more — are used
instead of free text because a rule the engine cannot evaluate is not a
constraint, it is a note. Notes belong in the advisory column.

### The solver

**D-10 — A constraint-guided greedy placer with least-slack ordering, not CP-SAT.**
Places the most constrained demand first, gates every enabled hard rule, prices
every enabled soft rule, and picks the cheapest candidate. Guarantees no hard
violation and finishes in about two seconds; does not prove optimality.
*Rejected:* OR-Tools CP-SAT — a large native dependency, a much heavier packaged
app, and a model that is far harder to attribute a refusal back to a numbered
constraint. Attribution was worth more here than optimality.

**D-11 — Three escalating passes: bounded search, exhaustive sweep, displacement.**
Greedy placement with no backtracking can strand a late session behind an early,
arbitrary room choice. The bounded pass is capped at 160 priced candidates for
speed; if it finds nothing, an exhaustive sweep runs with no cap; if that also
fails, the solver moves an occupying session to another room and takes its place,
re-checking every rule for *both* sessions. This was added after the verification
suite caught a real 359/360 failure — see D-27.

**D-12 — Every refusal is attributed to a constraint number and counted.**
The Overview ranks the constraints that refused the most placements, and each
unplaced session names the rules that blocked it as clickable chips. This is the
difference between "no solution" and "relax C017 or add a lab".

**D-13 — Verification re-derives the invariants rather than trusting the solver.**
`npm run verify` recounts double bookings, capacity breaches, room-type
mismatches, unqualified assignments, sabbatical assignments and cap breaches from
the produced schedule. A solver bug cannot mark its own homework.

**D-14 — The generator must never emit a structurally impossible demand.**
If the configured rooms have no fume hood, no course is given a fume-hood
requirement. If no accessible seminar room exists, no cohort is flagged as needing
one. Otherwise the solver fails on generator fiction and the explanation shown to
the user is false.

### Windows shell

**D-15 — Frameless window with a custom title bar.**
Lets the app canvas extend into the non-client area while Windows keeps the
caption-button region. The right-hand 138px is reserved and nothing interactive is
placed there, per the Windows UI protocol.

**D-16 — The renderer never touches the file system.**
`contextIsolation` on, `nodeIntegration` off, and a preload that exposes exactly
four capabilities: save, open, window controls, menu actions. Later extended with
the assistant relay.

**D-17 — Window geometry is persisted; the window paints only when ready.**
Position, size and maximised state are written on close. `ready-to-show` avoids a
white flash on launch.

### Assistant

**D-18 — Back the assistant with a local model via Ollama, defaulting to
`gemma4:e4b`.**
Requested directly in the review notes. It runs on the user's own machine, so
institutional data never leaves the device.

**D-19 — Relay assistant requests through the Electron main process.**
In a packaged app the renderer's origin is `file://`, which Ollama rejects on
CORS. The main process has no such restriction. Tokens stream back over IPC.
*Rejected:* fetching from the renderer, which works in development and breaks in
the installer — the worst possible failure mode.

**D-20 — Ground the model in a bounded briefing and forbid invention.**
The model receives a compact factual summary of the solved schedule and is told
to answer only from it. The briefing is bounded deliberately: an 8B model answers
a tight briefing far better than a dump of 360 sessions, which would crowd out the
question.

**D-21 — Keep the deterministic explainer as a fallback, and label which answered.**
If Ollama is absent, or the model errors mid-answer, the page answers from the
report directly. The language model is an enhancement, never a dependency.

---

## Session 2 — 2026-08-18 — acting on the review notes

Source: a handwritten reMarkable annotation, decoded from the PDF's per-font
ToUnicode CMaps. All 27 items are recorded in `docs/review-notes-2026-08-18.md`.

**D-22 — Materialise-on-edit for every entity type.**
The review said "basically everything should be editable". The wizard's numbers
generate a starting institution; the first edit to a staff member, room or course
snapshots that entire list into the project as explicit records, and the generator
stops inventing that type. Each type can be reset back to generated independently.
*Rejected:* making the wizard produce records immediately, which loses the ability
to re-scale an institution by changing one number; and a diff/patch overlay, which
is harder to reason about and to save.

**D-23 — An edit invalidates the schedule but does not re-solve it.**
Editing a room rebuilds the institution preview so the data screens update
immediately, but leaves the existing sessions alone. Re-solving takes seconds and
is the user's decision, not a side effect of typing.

**D-24 — Remove the 53-flag room capability grid; replace it with 14 presets.**
The review said plainly: "remove capabilities". The full flag list was noise for
almost every user. The 14 presets cover what the enforced constraints actually
read, each with a one-line explanation, and the underlying model still accepts any
flag from an import.

**D-25 — Buildings gain a floor count; rooms are distributed across it.**
Requested directly. Floor matters for step-free access when a building has no
lift, which several accessibility constraints read.

**D-26 — Room availability is a per-day, per-slot grid.**
A whole-day toggle expands internally to every slot of that day, so one tick
reaches the same `roomBlocked` rule that handles individual periods. One mechanism,
two levels of granularity.

**D-27 — Added the displacement pass after verification caught a real failure.**
Materialising and re-solving an unchanged institution placed 359 of 360 sessions.
Investigation showed zero structural difference between the two institutions: the
loss came from soft-cost differences changing the greedy path, stranding one
session behind an occupied room. The bounded and exhaustive passes could not fix
it because the obstacle was a committed placement, not an unexplored candidate.
Displacement — move the occupant, take its place, re-check every rule for both —
restored 360/360. *Rejected:* softening the check to accept 359/360, which would
have hidden a genuine weakness that real users would hit.

**D-28 — Per-year section overrides, keyed `${programId}:${year}`.**
Real intakes are uneven: three first-year sections and one final-year. The
programme default remains, and a year-level override sits on top.

**D-29 — Cross-department teaching assignment.**
The faculty editor lets you pick courses from any department, not just the
person's own. Requested in the review; also simply true of how institutions work.

**D-30 — Field help lives in one file, `data/help.ts`.**
Twelve of the twenty-seven review items were questions — "what is turnover?",
"what is a research day" — which meant the interface had failed to explain itself.
Keeping the wording in one place means the same concept reads identically
everywhere and can be checked for accuracy in one pass.

**D-31 — Rewrote a delegated help sentence that was factually inverted.**
The local model described "walk time" as *the maximum walking time allowed between
consecutive classes*. It is the actual walk time between two buildings, used to
refuse placements nobody could reach. The draft passed every structural gate and
was still wrong; it was corrected by hand before shipping. Structural gates cannot
catch semantic errors — a human review pass is not optional.

---

## Local-model delegation decisions

**D-32 — Use the local reader for retrieval, never for judgement.**
`orch-reader` (gemma4:e4b, 64K context) reads long files and returns short
answers, keeping large files out of the main context. Its output is treated as a
map, not a verdict.

**D-33 — Cross-check the reader against a deterministic search before acting.**
Asked to list the rules with an `audit` function, the reader returned seven of
eight and included one my own grep had missed. Neither source alone was right; the
cross-check produced the correct answer of eight. This is now the standing
practice for anything the reader reports.

**D-34 — Moved the delegation harness from `ollama run` to the HTTP API.**
Piping `ollama run` into a file injects terminal control sequences mid-word and
silently corrupts the output — "their\e[5D\e[Ktheir". The API returns clean JSON,
allows thinking mode to be switched off explicitly, and pins the context window
per call.

**D-35 — Escalate model rather than loop on the same one.**
`llama3` ignored structural instructions across two attempts, including an
explicit correction pass — it kept bullet characters and dropped fenced command
blocks. `gemma4:e4b` passed every gate on the first attempt. Structured-output
tasks now route to `gemma4`.

**D-36 — Cap local coder calls at 8K context on this machine.**
With the 64K-context reader resident, a second 8B model at 32K context returns
HTTP 500 — 8GB of VRAM cannot hold both. Diagnosed from a bare 500 with no
message; worth recording so it is not re-diagnosed.

**D-37 — Write source files with the Write tool, not shell heredocs.**
Heredocs through the shell bridge repeatedly mangled backticks, `${}` and quotes,
and on one occasion injected a NUL byte into `solver.ts` that silently corrupted a
template literal. Patches are now applied with Python scripts that assert every
match, so a failed patch fails loudly instead of half-applying.

**D-38 — A dated calendar and a repeating week meet in exactly three places.**
The obvious design — "holidays remove slots from the timetable" — is wrong, and
it is wrong in a way that looks right. A timetable is a week that repeats; a
holiday is one date. Cancelling Thursday 22 October does not mean Thursdays are
unavailable, and modelling it that way would delete sixteen weeks of teaching to
represent one lost afternoon. The three honest effects are: a dated closure
removes one *occurrence* of a weekday, which changes how many times a course
actually meets; a weekday that loses *every* one of its dates stops being a
teaching day and leaves the grid entirely; and an entry the user marks as
repeating weekly does fall in the same place every week, so it alone can be
blocked out on the grid. `data/academicCalendar.ts` is the only place these are
computed, and the UI names which effect each entry has as you create it.

**D-39 — Calendar dates are parsed in UTC, never local time.**
`new Date('2026-10-19')` is UTC midnight, but `getDay()` reads it in local time,
which moves the date onto the previous weekday for anyone west of Greenwich and
can move it forward elsewhere. For an application whose entire intended audience
is UTC+5:30 that is a holiday landing on the wrong day of the week. Every date is
an integer epoch-day number internally, and `weekdayOf` uses `getUTCDay()`.

**D-40 — Adding a person collects the whole record before the person exists.**
"+ Add staff" used to append a placeholder called "New staff member", qualified
for nothing. The scheduler can do nothing with that record, so it sat inert until
somebody remembered to go back and fill it, and a roster quietly accumulated
staff who could never be given a class. The intake dialog now collects identity,
teaching capability, workload and availability up front, validates that the
record is schedulable (a name, at least one course, a daily cap that fits inside
the weekly one), and only then creates it. Cancelling leaves nothing behind.

**D-41 — Eligibility is resolved into the roster, not checked in a rule.**
Programme eligibility and session-type authorisation depend only on the course,
so `facultyFromRecords` intersects them into `subjects` when the institution is
built. That shrinks the solver's candidate space before the search starts rather
than rejecting branches it has already walked into. Group size cannot be resolved
that way — it belongs to the cohort — so it lives in `canTeach`, which both the
solver's candidate filter and the substitution finder call, so the two can never
disagree about who is allowed to teach what.

**D-42 — The generator's accessibility guard must check what the rules check.**
`accessibleKinds` decided whether a cohort could be flagged as needing accessible
rooms by looking only at the `wheelchairAccess` feature flag. C147 and C384 also
check the floor and whether the building has a lift. The moment room groups
gained a floor, a perfectly ordinary configuration — computer labs on the second
floor of a block with no lift — produced a cohort with a need the estate could
not meet, and the solver could only report it as an unplaceable lab. The guard
now mirrors the rules exactly. This is RULE-04 ("never emit a structurally
impossible demand") applied to a case that had been latent since the flag existed.

**D-43 — Modals are portalled to `<body>`.**
Every page is wrapped in `.fade-in`, which carries a transform, and a transform
makes an element the containing block for `position: fixed` descendants. An
overlay rendered inside the page therefore resolved against the page box rather
than the viewport: on a scrolled page the dialog landed off-screen with its
backdrop stretched over the whole document. Measured at scrollY 900, the overlay
reported `top: -720, height: 2396` instead of covering the viewport. The existing
substitution sheet had the same defect and was fixed with it.

**D-44 — The displacement budget counts displacements, not cells.**
`tryDisplacement` incremented its 60-attempt counter before checking whether the
room it was looking at was occupied at all, so the whole allowance was spent
walking empty cells in the first day or two and the pass reported "no
displacement possible" without having evaluated one. The counter now increments
only when a real swap is about to be tried.


---

## Session 3 — 2026-08-23 — fitting a real institution

**D-45 — The person is a `Staff`; `Faculty` is an institutional division.**
Institutions use "Faculty" for the top-level academic division (FOSTA — Faculty of
Science and Technology). The code used it for a teacher. That is a genuine
collision rather than a preference — the word is needed for a different concept
— so the person moved: `Faculty` → `Staff`, `FacultyRecord` → `StaffRecord`,
`Session.facultyId` → `staffId`.

The 124 **rule keys are deliberately unchanged**. `facultyMaxWeekly` still reads
correctly as the name of a rule, and those keys are the join between
`engine/rules.ts` and 500 published catalogue rows; renaming them would have
meant editing 79 KB of the catalogue to gain nothing. The type rename is
mechanical and `tsc -b` drives it to completion; the key rename would have been
neither. *Rejected:* keeping `Faculty` for the person and calling the division
something else, which leaves the ambiguity in place permanently.

`Cohort` was **not** renamed to `Section`, because there is no collision there —
only a local preference. That one is handled with UI strings.

**D-46 — Shift confinement is structural, and it lives at the rejection
chokepoint rather than in the search loop.**
A morning-shift section has no students on campus in the evening, so an evening
placement is not an expensive option, it is not an option — the same character
as qualification, which D-41 already resolves into the roster.

It also could not have been a catalogue rule: `activeRules` only ever activates
rules that a numbered row references, and the published 1–500 range is closed
(D-05), so a new rule key would have been dead code.

The placement is the load-bearing part. Every path that commits a session —
the bounded search, the exhaustive sweep, the displacement pass and interactive
drag-and-drop — funnels through `firstHardFailure` or `allHardFailures`, so the
gate sits there. A check in the search loop alone would have left the user able
to drag a class out of its shift by hand. The loop *also* pre-filters, but only
for speed. The harness re-derives the invariant from the produced schedule
independently, per D-13.

**D-47 — A configuration with no shifts is one shift spanning the day.**
Not "shifts off". One code path, so the confinement check never needs a null
case, and a single-shift institution never has to think about the feature. The
two-shift split is a preset applied in Setup, not a default: confining every
section to half the grid is a real scheduling constraint, and switching it on
for everybody would have made the shipped default fail for reasons that have
nothing to do with the institution being described.

**D-48 — A batch profile states the difference, not the curriculum.**
Course load changes between intakes — one batch takes a single elective, the next
takes two — while the programme does not. A `Profile` therefore holds
`Partial<CoursePolicy>` per programme and sits *on top of* the programme's own
figures, which is the same shape as the per-year section override (D-28): the
default remains, the override states what changed. "Copy from" clones a profile
so a new intake starts as the one it resembles; graduated batches are archived
rather than deleted so old timetables still explain themselves.
*Rejected:* moving the five policy fields off `ProgramConfig` entirely, which
would have made every profile restate a whole curriculum to change one number,
and broken the programme editor in the same pass.

**D-49 — The last period of the day may be shorter than the rest.**
A 50-minute grid from 09:00 does not divide into a day ending at 18:00: ten whole
periods reach 17:20 and leave 40 minutes, and an eleventh would run to 18:10. The
old behaviour floored the count and silently lost the final period — which is why
a class scheduled to end at 18:10 could not be placed against an 18:00 close.
`TimeGrid.durations` now carries a real length per slot and
`minFinalSlotMinutes` makes the choice a stated policy. Consequently **nothing
may compute a duration as `length * slotMinutes`**; `sessionMinutes` in
`data/model.ts` is the single definition, placed there rather than in the engine
because exporters and the UI need it and `src/data` may not import `src/engine`.

**D-50 — C017 protects the break for people who span it, and nobody else.**
The rule was wider than the constraint it implements. C017 reads "Instructors
must be granted a guaranteed lunch break **if teaching across the midday
block**", and the qualifier is the whole rule: somebody teaching only one side of
the break takes lunch on the other side by construction. Protecting the midday
slots for everybody who taught that day was, on a two-shift grid whose boundary
sits at midday, the largest single source of refusals in the solve. Narrowing it
to what the text says removed C017 from the top blockers entirely.

This is the second time a rule has been found to disagree with its own published
sentence (D-31 was the first, in prose rather than logic). Both were invisible to
every automated gate.

**D-51 — Workload is a band per designation, with a floor as well as a ceiling.**
A Professor and an Assistant Professor do not carry the same hours, and the
difference is policy, not preference. `loadByRank` replaces the flat ceiling, and
`loadForRank` is the single resolver so the generator's rosters and
`expectedStaffCapacity`'s estimate can never disagree. A minimum matters too:
constraint 19 is about the floor and nothing recorded one.

**The numbers are defaults, not facts.** The two requirement sources disagree —
the internal review recorded Assistant Professor as 12 min / 16 max, the
coordinator gave Assistant ~14–16, Associate ~12, Professor ~8 — and neither is
authoritative. The mechanism is what was built; the figures need departmental
confirmation before anybody relies on them.

**D-52 — Walk time was removed from the interface; the lift flag was not.**
The review asked for both to go, on the grounds that a single per-building
walking figure cannot express times that vary from 2 to 10 minutes depending on
which two blocks. That is right about walk time, and it is gone from Setup
(the field remains in the model at a uniform default because the back-to-back
travel rules read it, and it can still arrive from an import).

The lift flag is a different matter and was kept. C147 and C384 read lift status
and floor, and **D-42 records a real bug** — a cohort with an accessibility need
the estate could not meet — that existed precisely because the generator ignored
them. Removing the flag would reintroduce it. This is the one item of the review
that was not implemented as asked, and the reason is recorded here rather than
left as a silent divergence.

**D-53 — One combobox, twenty-seven dropdowns.**
`components/ui.tsx` had `Field`, `NumberInput`, `TextInput`, `Segmented` and
`Switch` — and no select at all. Every dropdown in the app was a native
`<select>`: fine for five options, unusable for choosing one instructor from
several hundred, which is the coordinator's daily reality. One primitive with
type-to-filter, keyboard navigation and Tab-to-complete, then a mechanical swap
of all 27, is what makes "type-to-search everywhere" a day's work rather than a
fortnight's. `hint` carries the staff code or department that tells two people
with the same name apart.

The dropdown is positioned absolutely inside a relative wrapper, not fixed:
every page is wrapped in `.fade-in`, whose transform makes it the containing
block for fixed descendants (D-43), and absolute positioning is simply immune to
that. Options must also cancel the click's default action, because `Field` wraps
controls in a `<label>` and a label forwards clicks to its control — without it,
choosing an option with the mouse reopens the list it just closed.

**D-54 — Institution setup and term setup are separate screens, and the constant
one is locked.**
Most of what the old six-step wizard asked for does not change between terms:
how many floors a block has, which schools sit under which faculty, when the
morning shift ends. Sections, staffing, curriculum policy and term dates are what
a timetable manager actually revisits. Mixing them meant re-reading the whole
institution to change four numbers, and put the settings with the widest blast
radius directly in the path of routine work.

**D-55 — Institution edits accumulate as a draft and are committed deliberately.**
Requested directly: changing institutional data has a ripple effect, so it should
not save as you type. The preview still moves while you type — the impact of a
change has to be visible — but nothing reaches storage until Save, and the
confirmation names which settings will change rather than asking a bare "are you
sure". Generating is blocked while a draft is outstanding, because
`completeSetup` solves the saved config and would otherwise quietly schedule the
old institution beside the new figures.

Per-entity edits in the Data studio stay immediate. D-23 already establishes that
an edit invalidates the schedule without re-solving, and that behaviour is right;
the draft layer is scoped to the ripple-effect surface only.

**D-56 — An import is a materialisation from a file.**
GAP-04 named `generateInstitution` as the seam for imported data, but a better
one already existed: `EntityOverrides` (D-22) already means "explicit records
take over and the generator stops inventing this type". Feeding it from a CSV
instead of from an edit inherits the whole validation, editing and
reset-to-generated path unchanged.

Two rules govern `data/importers.ts`. **No row is ever silently dropped** — a row
that cannot be used comes back with its line number and a sentence, because a
roster that imports "successfully" with eleven people missing is worse than one
that refuses. And **nothing trusts the file**: columns may be missing, in any
order, or spelled three ways; numbers may be blank or nonsense. The CSV parser is
written out rather than pulled in because the failure modes are specific — a
quoted comma, a doubled quote, Excel's byte-order mark — and a course called
"Design, Analysis of Algorithms" is not unusual.

**D-57 — The coordinator's thousand-selection problem is asserted, not assumed.**
The largest single complaint about the incumbent system was that choosing a
course did not carry forward to its sections: forty sections meant repeating the
same selection forty times. Aula cannot have that defect, because a course
belongs to a programme-year and every section of that year is taught it —
qualification is recorded once per course, never per section. That is the claim
the whole comparison rests on, so the harness asserts it rather than leaving it
to be inferred from the schema.
