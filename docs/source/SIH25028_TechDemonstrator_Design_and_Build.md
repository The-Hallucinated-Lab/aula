# Smart Classroom & AI Timetable Scheduler — Technology Demonstrator

### Reworked Design & Build Document — SIH25028 (Smart Education theme)

**Author:** Pratyush P. · **Scope:** Single-machine technology demonstrator (project prototype) · **Status:** Design + build-ready

> **What changed from v1, in one breath.** This is no longer a deployed, multi-user institution platform. It is a **self-contained desktop technology demonstrator** that proves the hard idea at the centre of SIH25028: _you can replace weeks of manual Excel timetabling with a system that generates a provably conflict-free, utilization-optimized, multi-department timetable in seconds, edits it live, repairs it when a teacher goes absent, and explains itself in plain language._ No mobile app. No cloud. No production deployment. No student-facing product. One machine, one operator, one impressive demo — and every architecturally weak piece from v1 has been removed or replaced with something that actually works for a prototype.

---

## Part 0 — What SIH25028 Actually Demands (refocus)

Strip the problem statement to its load-bearing requirements. A winning demonstrator hits these and ignores everything else:

1. **Replace manual Excel scheduling** with automated generation. _(The core value.)_
2. **Optimize classroom/lab utilization** — the "Smart Classroom" half: right batch → right room, no congestion, no empty halls. The statement claims a ~30% utilization boost; your demo should _show_ that number on a dashboard.
3. **Handle multi-department constraints** — hard (no teacher in two rooms at once) and soft (preferred timings).
4. **NEP 2020 friendliness** — multidisciplinary courses, flexible electives, varying batch sizes.
5. **Dynamic disruption handling** — a teacher takes sudden leave → instant qualified substitute or reshuffle.
6. **Drag-and-drop manual adjustment** with real-time clash alerts — the statement names this explicitly; it's a guaranteed demo crowd-pleaser and v1 under-weighted it.
7. **Transparency** — clear, followable, exportable timetables.

Everything below serves these seven. Two pieces of Indian-context grounding justify the constraint design and are worth stating because judges reward domain awareness:

- **AICTE numeric norms** become hard constraints directly: faculty:student ratio **1:20** (engineering), cadre ratio **1:2:6** (Prof:Assoc:Asst, UG), **~10 sq.ft./student** instructional space, **tutorial rooms ≈ 25%** of classrooms.
- **NEP 2020 / CBCS / FYUGP** means students in "the same" programme pick **different elective baskets**, so a timetable must be clash-free at the level of _elective groups_, not just fixed cohorts. This is the one genuinely hard combinatorial wrinkle, and the demonstrator handles it deliberately (Part 3.3) rather than pretending it doesn't exist.

---

## Part 1 — The Reframe: What's In, What's Out, and the Demo Thesis

### 1.1 In / Out

| Removed (was v1)                          | Kept & strengthened                    | Added ("more if added")                                       |
| ----------------------------------------- | -------------------------------------- | ------------------------------------------------------------- |
| Student mobile app                        | Deterministic CP-SAT scheduling engine | Drag-and-drop editor + live clash detection                   |
| Student-facing portal & journey archive   | 200+ configurable constraints          | Synthetic institution generator (demo at 5,000-student scale) |
| Production deployment / on-prem ops       | Multi-department scheduling            | Utilization dashboards (before/after heatmaps)                |
| Government-buyer positioning, DPDP gating | Dynamic substitution                   | Scenario comparison (generate & rank candidate timetables)    |
| Cloud/server backend, HA, DR, K8s         | Local Ollama AI copilot                | Infeasibility explainer (which constraint to relax)           |
| Full RBAC / SSO / MFA                     | Export to followable formats           | One-click export: PDF grid, Excel, iCal                       |

Students and faculty **still exist — as data, not as users.** The scheduler needs cohort sizes, elective registrations, faculty qualifications and availability. It does not need a student login, a profile screen, or a phone. That distinction is what makes the prototype tractable.

### 1.2 The single operator

The demonstrator has exactly one human role: the **Timetable Coordinator (Admin)**. Faculty, rooms, courses, and students are all modelled as input data the coordinator manages. This deletes the entire authentication/authorization problem from v1 — there is nothing to gate because there is one local user on one machine. (An optional lightweight "Admin vs Read-only Viewer" toggle can _demonstrate_ the access-separation idea if a judge asks, but it's cosmetic, not load-bearing.)

### 1.3 The demo thesis — six "wow" moments

Design the whole build to make these six things happen live, in order:

1. **Generate:** import (or generate) a messy multi-department institution → click once → conflict-free timetable in seconds.
2. **Prove:** dashboard shows 0 clashes, room utilization jumped from ~55% to ~85%, faculty load is balanced.
3. **Edit:** drag a class to a new slot → the grid instantly flashes red on the double-booking it would create.
4. **Repair:** mark a professor absent Thursday → the app proposes a qualified, free substitute in one click, changing nothing else.
5. **Explain:** type "why is second-year Tuesday so heavy?" → the AI answers in plain English, grounded in the actual schedule.
6. **Diagnose:** over-constrain it on purpose → instead of a blank screen, the app says "these 3 rules conflict; relax this one and it solves."

If your build delivers those six, the project lands. Everything else is supporting cast.

---

## Part 2 — Architecture (Single Desktop App)

Removing mobile and deployment lets the architecture become genuinely clean — and it maps directly onto patterns you've already shipped (ScoobyBench's sidecar, LOCALBOT/ContextCore's Electron + local inference).

```
┌──────────────────────────────────────────────────────────────┐
│                 ONE DESKTOP APPLICATION (offline)             │
│                                                              │
│   ┌────────────────────────┐                                 │
│   │  ELECTRON + REACT UI    │   Renderer process             │
│   │  • Data entry / config  │                                 │
│   │  • Timetable grid       │   talks over REST/WS to ──┐     │
│   │  • Drag-drop editor      │      127.0.0.1 only        │     │
│   │  • Dashboards / export  │                            │     │
│   │  • AI chat panel        │                            ▼     │
│   └────────────────────────┘        ┌───────────────────────┐ │
│                                     │  PYTHON ENGINE (sidecar)│ │
│   ┌────────────────────────┐        │  FastAPI on localhost  │ │
│   │  OLLAMA (local)         │◄──────►│  • OR-Tools CP-SAT     │ │
│   │  llama3.1:8b / qwen2.5  │        │  • Substitution repair │ │
│   │  http://localhost:11434 │        │  • Infeasibility (IIS) │ │
│   └────────────────────────┘        │  • Import / export     │ │
│                                     │  • SQLite (embedded)   │ │
│                                     └───────────────────────┘ │
│   Everything runs on one machine. No internet required        │
│   after models are pulled. No server, no ports exposed.       │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 Component choices — and what each replaces from v1

- **Shell: Electron + React + Zustand.** Unchanged — the right choice and your strongest stack. Now it's the _whole_ frontend, not just an admin console.
- **Engine: Python + FastAPI as a localhost sidecar.** _Replaces_ the v1 "backend server." The engine is spawned as a child process bound to `127.0.0.1:<random-port>` on app launch — no external server, no exposed network surface. This is exactly the ScoobyBench .NET-sidecar pattern, in Python.
- **Solver: Google OR-Tools CP-SAT.** Unchanged — this is the correct, free, state-of-the-art tool and the intellectual core.
- **Database: SQLite (embedded).** _Replaces_ PostgreSQL. For a single-machine demonstrator, SQLite is strictly better: zero-config, one file, ships inside the app, no Docker, no server process, no setup step in your demo. It comfortably handles a 5,000-student synthetic institution. Access it through **SQLAlchemy**, so swapping to PostgreSQL later is a one-line connection-string change if this ever grows up. (This directly satisfies your original "free SQL with no practical limit" requirement — SQLite's limits are far beyond anything a timetabling prototype touches.)
- **AI: Ollama, local.** Unchanged in spirit, correctly scoped in role (Part 6). Assumes Ollama installed locally; the app calls `http://localhost:11434`.
- **Removed entirely:** React Native, FCM/push, JWT/Argon2/MFA/SSO, Redis queues, Docker Compose for prod, K8s/Helm, blue-green, DPDP compliance gating, DR windows. None of it belongs in a demonstrator, and each was a v1 liability.

### 2.2 The one non-negotiable design rule (carried from v1)

**The deterministic engine decides. The LLM never decides.** OR-Tools produces every timetable, substitution, and allocation — provably constraint-valid. Ollama only _explains, advises, queries, and drafts_. This is the difference between "AI-powered" as a credible claim and "AI-powered" as a hidden double-booking waiting to embarrass you on stage. It is also a _selling point_ for the demo: "deterministic correctness, AI-native experience."

---

## Part 3 — The Deterministic Engine (Core)

### 3.1 Formulation (CP-SAT)

Model each required class meeting (a "session") as a unit that must be placed in a `(timeslot, room)` and is bound to a `(faculty, cohort/elective-group)`.

- **Decision variables:** for each session `s`, a boolean `place[s, t, r]` = 1 if `s` occupies timeslot `t` in room `r`. Restrict the domain so `r` only ranges over rooms where `capacity(r) ≥ size(s)` and `type(r)` matches — this prunes the space _before_ solving.
- **Each session placed exactly once:** `AddExactlyOne(place[s, t, r] for all t, r)`.
- **Room no-double-book:** for every `(t, r)`, `sum over s of place[s, t, r] ≤ 1`.
- **Faculty no-clash:** for every `(faculty f, t)`, `sum of place[s, t, r]` over sessions taught by `f` and all `r` `≤ 1`.
- **Cohort/elective-group no-clash:** for every `(group g, t)`, `sum` over sessions attended by `g` `≤ 1`.
- **Load caps, availability, holidays:** forbid `t` where faculty is unavailable; cap daily/weekly sums.
- **Soft constraints → objective:** introduce penalty variables (gaps, subject spread, capacity waste, load imbalance) and `Minimize` their weighted sum. CP-SAT returns optimal-or-best-within-time-budget.

Wrap the solver with a **time budget** (e.g., 30s) so it always returns the best solution found rather than hanging — non-negotiable for a live demo.

### 3.2 Multi-department handling

Model departments as owners of rooms and faculty, but let sessions request _any_ room via a shared pool. Shared central facilities (auditorium, big labs) are global resources with the same no-double-book constraint. Cross-department electives simply create sessions whose `group` spans students from multiple departments — the clash constraints handle the rest automatically. This is how "multi-department" stops being special-cased and becomes just data.

### 3.3 The NEP elective wrinkle — handled, not hidden

Fixed cohorts are easy. NEP electives break the "batch moves as one unit" assumption. The demonstrator's tractable-but-honest approach:

- Represent each **elective section** as its own resource with a capacity.
- Represent **elective groups** — the distinct combinations of baskets students actually chose — as attendance units for the clash constraints.
- The engine guarantees no elective-group has two of its sessions in the same slot. Because groups (not individual students) are the units, the problem stays solvable at demonstrator scale while still being genuinely NEP-aware.
- If two students picked truly unique basket combinations, they each become (small) groups; the model still holds, it just adds constraints.

State this scope explicitly in the demo: _"We schedule at the elective-group level, which is NEP-compliant and scales; per-individual optimization is the natural next step."_ Honesty here beats a hand-wave a domain judge will catch.

---

## Part 4 — Constraint Catalogue (200+, configurable)

The engine can _express_ the constraints below; the coordinator _toggles and weights_ them per run. **Ship the demo with ~20 hard + ~10 soft enabled** so it reliably produces a feasible timetable, and expose the rest as a configuration panel that shows off expressiveness. Legend: **[H]** hard · **[S]** soft/weighted.

**A. Faculty availability & load**
1.[H] No faculty in two places one slot. 2.[H] Max hours/day. 3.[H] Max hours/week. 4.[H] Blocked during leave/OD. 5.[H] Only teaches qualified subjects. 6.[H] Guest faculty only in declared windows. 7.[H] Adjunct weekly cap. 8.[S] Preferred hours. 9.[S] No-teach preference slots. 10.[S] Minimize idle gaps. 11.[S] Minimize daily campus span. 12.[H] Rest gap across distant buildings. 13.[S] Cap consecutive teaching hours. 14.[S] Even weekly distribution. 15.[H] Protected admin slots (HoD/Dean). 16.[S] Keep classes in a building cluster. 17.[H] PG-teaching qualification match. 18.[S] Research-day request. 19.[H] Medical-leave exclusion. 20.[S] Same faculty across a course's sections.

**B. Faculty equity & policy**
21.[S] Load parity within designation. 22.[H] Cadre-ratio (1:2:6/1:2) compliance. 23.[S] Seniors not only on intro courses. 24.[S] Fair share of undesirable slots. 25.[H] No below-minimum load. 26.[S] Junior–senior mentorship pairing. 27.[H] External examiner windows. 28.[S] Co-locate lab+theory of a course.

**C. Rooms & infrastructure**
29.[H] Capacity ≥ headcount. 30.[H] One session per room-slot. 31.[H] Room-type match. 32.[H] Smart-room-only courses. 33.[H] Accessibility (ground/lift). 34.[S] Minimize capacity waste. 35.[S] Nearby rooms for consecutive classes. 36.[H] Maintenance windows block. 37.[H] Building open/close hours. 38.[S] Prefer dept-owned rooms. 39.[H] Exam-reserved rooms excluded. 40.[S] Balance utilization across buildings. 41.[H] Fire-safety occupancy. 42.[H] Fixed-AV rooms locked to programs. 43.[S] Ventilation preference. 44.[H] Central facilities via global calendar. 45.[S] Cluster dept rooms. 46.[H] Closed rooms removed.

**D. Labs, equipment & specialized resources**
47.[H] Subject-equipped lab only. 48.[H] Lab cap = workstations. 49.[H] Unshareable equipment no double-book. 50.[H] Consumable/technician availability. 51.[H] Lab technician co-scheduled. 52.[S] Cluster labs (setup/teardown). 53.[H] License-limited software concurrency. 54.[H] Safety officer for hazardous labs. 55.[H] Machine maintenance windows. 56.[S] Fair rotation across labs. 57.[H] Council lab-hours-per-credit. 58.[H] Split batch ≤ workstation count. 59.[S] Same lab across term. 60.[H] GPU/server-dependent courses.

**E. Student cohort / batch**
61.[H] Cohort no two classes one slot. 62.[H] All core courses scheduled. 63.[S] Daily contact-hour cap. 64.[S] No >2 consecutive same-subject. 65.[S] Spread subject across ≥3 days. 66.[S] Lunch break. 67.[S] No isolated classes with long gaps. 68.[H] Cohort ≤ combined room capacity. 69.[S] Minimize inter-building movement. 70.[S] Heavier subjects earlier. 71.[H] Practical after its theory. 72.[S] Balanced weekly load. 73.[H] Protected NSS/NCC/sports slots. 74.[H] Mandated library/self-study periods.

**F. Individual/elective layer (NEP)**
75.[H] Elective-group timetable clash-free. 76.[H] Elective section capacity ≥ registrants. 77.[H] Major/Minor/Multidisciplinary non-overlap per group. 78.[S] Minimize group-day gaps. 79.[H] Prerequisite before dependent. 80.[H] Credit-load within UGC bounds. 81.[S] Respect elective preference ranking. 82.[H] ABC-transferred credits honoured. 83.[H] Multiple-entry re-joiners at correct level. 84.[S] Compact elective blocks. 85.[H] Skill-course contact-hours (NCrF). 86.[H] Value-added courses clash-free with core.

**G. Course, curriculum & pedagogy**
87.[H] Contact hours = credits × council rule. 88.[H] Offered-term only. 89.[H] Prerequisite DAG respected. 90.[H] Co-requisites same term. 91.[S] High-focus courses in alert slots. 92.[H] Module I before II. 93.[S] Tutorial after lecture. 94.[H] Guest-lecture fixed to expert. 95.[H] Fieldwork contiguous blocks. 96.[S] Interdisciplinary timing for cross-dept reach. 97.[H] Remedial off-core-hours. 98.[H] Project/thesis slots for final year. 99.[S] Studio in long blocks. 100.[H] Honours eligibility (CGPA).

**H. Time, slot & calendar**
101.[H] Within working hours. 102.[H] No classes on holidays. 103.[H] Exam weeks block teaching. 104.[H] Fixed assembly/orientation slots. 105.[S] Avoid post-break scheduling. 106.[H] Slot duration matches session type. 107.[H] University-wide common slot honoured. 108.[S] Even weekly spread. 109.[H] Working-Saturday policy. 110.[H] Shift separation (morning/evening). 111.[H] Festival-adjusted timings. 112.[S] Make-up buffer slots. 113.[H] Event days block buildings. 114.[H] Closure → freeze + re-plan. 115.[S] Align with transport windows. 116.[H] Consistent timestamps.

**I. NEP & regulatory compliance**
117.[H] Credit-framework bounds (132/176, state-variant). 118.[H] Multidisciplinary credits attendable. 119.[H] AICTE 1:20 ratio satisfiable. 120.[H] Cadre ratio in who-teaches-what. 121.[H] ≥10 sq.ft./student. 122.[H] Tutorial rooms ≥25%. 123.[H] Min working days (~180). 124.[H] Council contact-hour minimums. 125.[H] Reservation seat matrix. 126.[H] ABC export format. 127.[H] Attendance-eligibility trackable. 128.[H] Internal-assessment windows. 129.[H] CO-PO mapping recorded. 130.[S] NAAC/NBA evidence auto-generated. 131.[H] Y1 anti-ragging/orientation. 132.[H] IKS/language courses. 133.[H] Internship credits embedded. 134.[H] Multiple-exit eligibility tracked.

**J. Examination & assessment**
135.[H] No student two exams one slot. 136.[H] Hall capacity ≥ candidates (distanced). 137.[H] Gap between a student's exams. 138.[H] Invigilator no clash. 139.[H] Invigilator load balanced. 140.[H] Practical exam: lab + external examiner. 141.[S] Heavy exams not back-to-back. 142.[H] Inter-session buffer. 143.[H] Extra-time rooms for special needs. 144.[H] Within university exam window. 145.[S] Minimize exam-period length. 146.[H] Supplementary exams separated.

**K. Facilities (extended modules the engine can express)**
147.[H] Hostel occupancy ≤ room type. 148.[H] Gender-segregated allocation. 149.[S] Merit/preference room allotment. 150.[H] Fee-cleared for allotment. 151.[H] Mess capacity per shift. 152.[S] Meal shift aligned to classes. 153.[H] Guest-house approval workflow. 154.[H] No double-book of shared facilities. 155.[S] Maintenance in low-usage windows. 156.[H] Transport route capacity. 157.[S] Bus timing sync. 158.[H] Infirmary staffing in campus hours. 159.[S] Sports slots clash-free with academics. 160.[H] Faculty-quarter entitlement.

**L. Administrative & institutional**
161.[H] Only registered students in rolls. 162.[H] Guest-faculty budget caps. 163.[S] Utilization targets optimized. 164.[H] Minimum viable enrolment to run a course. 165.[S] Cost-minimization (fewer overtime/guest slots). 166.[H] Audit log of schedule changes. 167.[H] Approval workflow (draft→publish). 168.[H] Immutable published versions. 169.[S] Minimize disruption on re-plan (stability). 170.[S] Utilization reports auto-generated. 171.[H] Referential integrity across entities. 172.[S] Automated reporting cadence.

**M. Substitution & dynamic disruption**
173.[H] Substitute qualified for subject. 174.[H] Substitute free + under cap. 175.[S] Prefer same-department. 176.[S] Prefer lightest-load substitute. 177.[H] Substitution logged. 178.[S] Local repair, not full re-solve. 179.[H] Cancelled class frees room. 180.[H] Emergency closure → bulk reschedule + make-up. 181.[S] Reschedule into existing free slot. 182.[H] Merged sections respect combined capacity.

**N. Data quality, fairness & meta**
183.[H] No orphan records. 184.[H] Every enabled hard constraint individually satisfiable (pre-check). 185.[S] Infeasibility diagnosis (minimal conflict set). 186.[S] Fairness audit across slots. 187.[H] Duplicate detection. 188.[S] Explainability (assignment → rules). 189.[H] Constraint-priority ordering. 190.[S] Stability score vs previous version. 191.[H] Input validation (capacities, hours, dates). 192.[S] Sensitivity analysis. 193.[H] Solver time-budget cap. 194.[S] Warm-start from last version.

**O. Extended / institution-specific long tail**
195.[S] Religious/cultural observance slots. 196.[H] Club slots non-conflicting. 197.[S] Guest-lecture cross-dept reach. 198.[H] Placement-drive days block academics. 199.[S] Seasonal (avoid top-floor afternoons in summer). 200.[H] Language-of-instruction match. 201.[S] Energy-clustering (shut unused blocks). 202.[H] Attendance-device availability. 203.[S] Content-creation/recording rooms. 204.[H] Dual-degree partner slot sync. 205.[H] Hybrid sessions need bandwidth rooms. 206.[S] FDP days protected. 207.[H] Research-scholar coursework around lab duty. 208.[S] Alumni/mentor evening sessions. 209.[S] Cohort travel-time minimization. 210.[H] Warm-startable scenario snapshots.

**Rule of thumb:** the differentiated feature is _not_ "we support 210 constraints." It's constraint **184–185**: when the enabled hard constraints conflict, the app tells you the smallest set to relax. Build that.

---

## Part 5 — Dynamic Features

### 5.1 Substitution (fast local repair)

When a faculty is marked absent, do **not** re-run the full solver. Solve the small sub-problem: among faculty who are (a) qualified for the orphaned session's subject, (b) free in that slot, (c) under their daily cap — pick optimally via **min-cost bipartite matching (Hungarian algorithm)**, with cost favouring same-department and lightest current load. Change nothing else (stability objective). Returns in milliseconds. This is a _different algorithm from a different module_ than generation — keep them separate.

### 5.2 Drag-and-drop editor + live clash detection

The grid is the star of the demo. On drag-start, precompute the target cell's occupancy (room/faculty/cohort bitsets). On hover, evaluate clashes in O(1) via bitset AND and paint the cell green/red. On drop into a valid cell, commit; into an invalid one, snap back with a tooltip naming the exact violated constraint. This is pure client-side logic over cached occupancy structures — fast and offline.

### 5.3 Infeasibility explainer

When generation fails, run an **IIS (Irreducible Infeasible Subset)** search — iteratively relax constraints to find a minimal conflicting set — then hand that set to the AI copilot to phrase in plain English ("Room-capacity and the no-Saturday rule can't both hold for CS-Lab-2; relax one"). This converts the worst UX (blank screen) into the best feature (guided fix).

### 5.4 Scenario comparison

Let the coordinator generate 2–3 timetables under different soft-weight profiles ("minimize gaps" vs "maximize utilization" vs "balance faculty load") and compare them side-by-side on objective metrics. Cheap to build (re-run solver with different weights), very persuasive in a demo.

---

## Part 6 — The AI Copilot (Ollama), Correctly Scoped

The local model does five things, none of which is _deciding the schedule_:

1. **Explain** — "why is Tuesday heavy for SY-CSE?" → it reads the current timetable JSON and answers.
2. **Query in natural language** — "who can cover Prof. Rao's Thursday DBMS lab?" → it calls the substitution endpoint and phrases the result.
3. **Translate infeasibility** — turns the IIS output into human guidance.
4. **Draft** — timetable-change notices, faculty emails, summaries.
5. **Recommend (human-approved)** — fuzzy faculty↔new-course qualification suggestions.

**Grounding:** stuff the current schedule, enabled constraints, and relevant policy snippets into the prompt context (a light RAG step with LlamaIndex/Chroma if you want retrieval, or direct context-injection for a demo). Recommend **llama3.1:8b** or **qwen2.5:7b** — capable enough to reason over structured schedule data, small enough to run on a laptop. The model must always answer _from the engine's data_, never invent assignments.

---

## Part 7 — Data: Model, Synthetic Generator, Import/Export

### 7.1 Model (SQLite via SQLAlchemy)

Entities: `Institution → College → Department → Program → Course → Section → Session`; `Faculty(qualifications, designation, availability, load_caps)`; `Room(type, capacity, equipment, building, floor)`; `Cohort` and `ElectiveGroup(size, member_sections)`; `TimeSlot`; `Constraint(type, hard/soft, weight, enabled)`; `TimetableVersion → Assignment`; `SubstitutionEvent`; `AuditLog`. No student PII beyond enrollment counts and elective registrations — the prototype needs _numbers and memberships_, not identities.

### 7.2 Synthetic institution generator (a headline feature)

Ship a parameterized generator: _N_ departments, _M_ rooms of assorted types, faculty with realistic qualification distributions and availability, courses with credits/prereqs, and NEP elective baskets. This lets you **demo at 5,000-student, 120-classroom scale without any real data** — turning v1's biggest risk (data onboarding) into a strength. Add a "messy mode" that injects realistic conflicts so the solver visibly untangles them.

### 7.3 Import & export

- **Import:** CSV/Excel importers with a **dry-run validation preview** (flags bad capacities, unknown faculty, missing prereqs) before committing.
- **Export (followable timetables):** one-click to **PDF** (printable per-cohort / per-room / per-faculty grids), **Excel**, and **iCal** (`.ics`) so a schedule can be opened in any calendar. "Generate a timetable that can be followed" = these exports. Make them clean and print-ready; judges screenshot them.

---

## Part 8 — Algorithms & Data Structures (tightened)

- **CP-SAT (OR-Tools)** — core generation. Provably correct on hard constraints, optimizes soft objective.
- **Graph coloring** — mental model + fast feasibility pre-check (conflict graph, colors = slots).
- **Hungarian / min-cost bipartite matching** — substitution assignment.
- **IIS / constraint relaxation** — infeasibility diagnosis.
- **Genetic Algorithm / Simulated Annealing (optional)** — large-instance fallback and to seed CP-SAT via warm-start.
- **Topological sort** over the **prerequisite DAG** — sequencing validation.

**Data structures:** conflict graph (adjacency list); prerequisite DAG; **bitsets** for per-resource slot occupancy (O(1) clash checks in the drag-drop editor); hash maps for faculty→qualified-courses / room→capacity / group→sessions; priority queue for "most-constrained-first" seeding; sparse matrix for group×section membership.

**Datasets:** no public Indian timetable dataset exists — your **synthetic generator is the dataset**. Validate solver correctness against public **ITC-2007/2019** competition instances so you can claim benchmarked correctness.

---

## Part 9 — Build Phase Instructions

Concrete, milestone-ordered, buildable on one laptop. Build the engine before the UI — a beautiful UI over a broken solver is a dead project; a headless solver that works is already a demonstrator.

### 9.1 Prerequisites

- **Python 3.11+**, **Node.js 20+**, **Ollama** installed (`ollama pull llama3.1:8b`).
- Core Python deps: `ortools`, `fastapi`, `uvicorn`, `sqlalchemy`, `alembic`, `pydantic`, `pandas`, `openpyxl`, `reportlab` (PDF), `icalendar`, `pytest`, `hypothesis`.
- Desktop deps: `electron`, `react`, `zustand`, `vite`, a grid lib (e.g. custom or `react-dnd` for drag-drop), `electron-builder`, `electron-updater` (optional).

### 9.2 Repo layout (monorepo)

```
/engine        # Python: solver, FastAPI, models, generator, exporters
  /solver      # CP-SAT model, substitution, IIS
  /api         # FastAPI routes
  /data        # SQLAlchemy models, Alembic migrations, generator
  /export      # pdf, excel, ical
  /tests       # pytest + hypothesis property tests
/desktop       # Electron + React + Zustand
  /main        # electron main: spawn sidecar, IPC
  /renderer    # UI: grid, editor, dashboards, AI panel
/shared        # JSON schemas / type contracts
```

### 9.3 Milestones

- **M0 — Scaffold & data (week 1).** Monorepo, SQLite schema via SQLAlchemy + Alembic, and the **synthetic institution generator**. Deliverable: `generate_institution(departments=6, students=5000)` writes a valid DB. _Test it before building anything on top._

- **M1 — Headless solver (weeks 2–3, the crux).** CP-SAT model in `/solver`: variables, hard constraints (A1–5, C29–31, E61–62, G87–89), a soft objective (gaps + utilization + load balance), 30s time budget. CLI: DB in → conflict-free timetable out. Validate against ITC instances + your synthetic "messy mode." **If M1 works, you already have a defensible project.**

- **M2 — FastAPI sidecar (week 3).** Wrap the solver in REST: `POST /generate`, `GET /timetable`, `POST /substitute`, `POST /validate`, `GET /metrics`. Bind to `127.0.0.1`. Add `POST /explain-infeasibility` (IIS).

- **M3 — Electron shell + grid (weeks 4–5).** Main process **spawns the sidecar** as a child process on a random localhost port, health-checks it, then renders. React UI: data view, "Generate" button, timetable grid (per-cohort/room/faculty toggle), and **exports** (PDF/Excel/iCal). First end-to-end demo.

- **M4 — Drag-drop + live clash detection (week 5).** Bitset occupancy in the renderer; drag → green/red cell feedback; invalid drop snaps back naming the constraint. Manual override with clash warnings.

- **M5 — Substitution + infeasibility (week 6).** "Mark absent" → Hungarian repair → one-click substitute, stability preserved. Wire the IIS explainer into the UI.

- **M6 — Ollama copilot (week 7).** Chat panel calling `http://localhost:11434`, grounded on current schedule + constraints. The five scoped tasks (Part 6). Plain-English infeasibility.

- **M7 — Dashboards, scenarios, polish (week 8).** Utilization heatmaps (before/after), faculty-load charts, scenario comparison, and a rehearsed **demo script** that hits the six wow moments in order.

### 9.4 Key wiring notes

- **Electron ↔ Python:** spawn the FastAPI engine (frozen with **PyInstaller** for packaging, or `python -m uvicorn` in dev) as a child process; pass the chosen port via arg/env; renderer talks REST/WS to `127.0.0.1:<port>`. This is your ScoobyBench sidecar pattern.
- **CP-SAT tips:** prune room domains by capacity/type _before_ solving; add symmetry-breaking on identical rooms; set `max_time_in_seconds`; read back the best solution even on timeout.
- **Ollama:** always inject the engine's data as context; never let the model output an assignment the engine didn't produce.

### 9.5 Testing & CI

- **Property tests (hypothesis):** for any generated institution, a produced timetable must violate **zero** enabled hard constraints. This is your correctness guarantee.
- **Golden-file tests** on exports; **regression** on ITC instances.
- **GitHub Actions** (your comfort zone): lint (`ruff`) → type (`mypy`) → `pytest` → solver regression → build Electron artifact. Matrix on OS if you want Windows-first packaging.

### 9.6 Packaging

`electron-builder` bundles the frozen Python engine as an `extraResource`; the app ships as a single installer. Ollama stays a documented prerequisite (or bundle a first-run "pull model" step). Windows-first, matching your usual target.

---

## Part 10 — Critique Revisited: What the Rework Fixed

| v1 weakness                                | Status in this rework                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| LLM "at the core deciding"                 | **Fixed by design** — CP-SAT decides, Ollama assists. (The one v1 rule worth keeping.) |
| Desktop-only vs mobile fleet contradiction | **Eliminated** — no mobile; one clean desktop app.                                     |
| Developer-only backend / RBAC drama        | **Eliminated** — single local operator, nothing to gate.                               |
| DPDP / compliance / deployment surface     | **Eliminated** — no real PII, no deployment.                                           |
| Postgres + Docker setup friction           | **Replaced** — embedded SQLite, zero-config, SQLAlchemy keeps the upgrade path.        |
| Data-onboarding = 80% of effort            | **Neutralized** — synthetic generator demos at scale without real data.                |
| "More constraints = better"                | **Reframed** — configurable menu + infeasibility explainer as the real feature.        |
| Real-time substitution via full re-solve   | **Fixed** — Hungarian local repair, separate module.                                   |

**Remaining honest limits (fine for a demonstrator, name them proactively):** individual-per-student optimization is scoped to elective-_group_ level; the synthetic data isn't real institutional data; the AI copilot is a convenience layer, not a verified oracle. Stating these _increases_ credibility with technical judges — it signals you know exactly where the edges are.

---

## Part 11 — Summary

Build a **single desktop application** where a **deterministic OR-Tools CP-SAT engine** (Python/FastAPI sidecar + embedded SQLite) generates provably conflict-free, utilization-optimized, multi-department, NEP-aware timetables; a **drag-and-drop editor** with live clash detection lets a coordinator tweak them; a **Hungarian-matching repair module** handles sudden faculty absence without touching the rest of the schedule; an **infeasibility explainer** turns dead-ends into guided fixes; a **local Ollama copilot** explains and advises without ever deciding; and **one-click PDF/Excel/iCal export** produces timetables people can actually follow — all seeded by a **synthetic institution generator** so it demos at full scale on day one. Build the solver first, wrap it, then make it beautiful. That is a technology demonstrator that both _works_ and _wins_.
