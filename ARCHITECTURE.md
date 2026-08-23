# Architecture

How Aula is put together, which patterns it actually uses, and — more usefully
— which it does not and why.

This is a description of the code as it stands, not an aspiration. Where a
pattern is applied partially, it says so. `docs/decisions.md` holds the
numbered decision log (D-01 … D-57); this document is the shape those decisions
add up to.

---

## 1. What kind of system this is

Aula is an **offline desktop application**. One user, one machine, no server,
no database, no account, no tenancy. Everything is in memory, derived from a
configuration the user typed, and saved as a single JSON file when they ask.

That matters more than any pattern name, because most architectural advice
assumes the opposite. There is no network partition to survive, no cache to
invalidate, no race between two writers. What there _is_, uniquely, is a hard
requirement that the program be able to justify its output: a timetable a
registrar cannot defend to a head of department is worthless.

So the architecture optimises for one thing above all — **the explanation has
to be true**. Everything below follows from that.

---

## 2. Hexagonal architecture, enforced by the compiler

The system is a hexagon: a pure domain core with adapters at every edge.

```
                   ┌─────────────────────────────┐
   React UI  ─────▶│                             │
   Web Worker ────▶│        @aula/core           │◀──── Verification harness
   Node (CI) ─────▶│                             │
                   │  no DOM · no Node · no fetch│
                   └─────────────────────────────┘
```

What makes this real rather than decorative is that it is **checked**:

```jsonc
// packages/core/tsconfig.json
{
  "lib": ["ES2023"],
  "types": [],
}
```

With no ambient types, `fetch`, `document`, `window`, `localStorage` and
`node:*` do not exist inside the core. Reaching for one is a compile error, not
a code-review conversation.

That is not theoretical. The day the boundary was introduced it immediately
caught `engine/assistant.ts` calling `fetch` — and the code it caught turned
out to be dead, duplicating an Electron IPC relay that already existed for the
same purpose. A convention would not have found that; a type error did on the
first compile.

### The three drivers

The same core runs in three hosts, which is the test of whether a hexagon is
real:

| Driver         | Adapter                            | Why it exists                                  |
| -------------- | ---------------------------------- | ---------------------------------------------- |
| React renderer | `store/`, `components/`            | the interface                                  |
| Web Worker     | `adapters/solver/`                 | solving is CPU-bound and must not block the UI |
| Node, headless | `packages/core/scripts/harness.ts` | 159 checks in CI, no browser                   |

If the core reached for a host API, the third would be impossible — and the
third is the one that catches solver regressions.

### Ports as data, not interfaces

The core defines almost no interfaces for its callers to implement. It does not
need to: it computes, and computation has no dependencies to invert.

The one real port is `ScheduleView` in `engine/explain.ts` — the explainer
needs a solved institution, a report and its metrics, and it names that shape
rather than importing the store. The store satisfies it structurally. That is
dependency inversion where inversion buys something, and its absence
everywhere else is deliberate rather than an oversight.

---

## 3. Domain-Driven Design — the parts that apply

The vocabulary is genuinely ubiquitous. `Cohort`, `Session`, `Slot`, `Shift`,
`Programme`, `Constraint` mean the same thing in the code, in the interface, in
the exports and in conversation with a registrar. `Cohort` is called a
_section_ on screen because that is what institutions say, and the mapping is
recorded rather than left to be inferred.

What is used:

- **Value objects.** `TimeGrid`, `ShiftWindow`, `SlotSpan` are immutable and
  compared by value.
- **Aggregate.** `Institution` is the consistency boundary. Nothing mutates
  part of one; the generator produces a whole institution from a configuration.
- **Domain services.** `solve`, `generateInstitution` and `explainSchedule` are
  operations that belong to no single entity, which is exactly the case for a
  domain service.
- **Anti-corruption layer.** `normalise.ts` is the boundary between a saved
  file — possibly written by an older version, possibly hand-edited, possibly
  hostile — and the model. Every field is validated and clamped. The harness
  feeds it deliberate junk.

What is **not** used, and why:

- **No repositories.** There is no persistence to abstract. One `localStorage`
  key and one JSON file, both written from one place.
- **No bounded contexts.** The domain is one context. Splitting a
  single-purpose desktop application into contexts would be paperwork.
- **No domain events.** Nothing is asynchronous within the domain and nothing
  subscribes.
- **No entity/aggregate base classes.** Plain data and functions over it. The
  ceremony would buy nothing here and would cost the harness its ability to
  bundle the whole engine with esbuild.

Adopting the vocabulary without the machinery is a choice, and it is the honest
one for a system this size.

---

## 4. Data-driven constraints — the load-bearing decision

The 500 constraints are **data**, not code:

```
packages/core/src/data/constraints/rows{1,2,3}.ts   500 numbered rows
packages/core/src/engine/rules/                     124 implementations
```

A row names a rule key, a hardness, a weight and up to a few parameters. A rule
reads parameters — never prose. That separation is what lets an administrator
change "minimum overnight rest" from 12 hours to 10 without anybody touching
TypeScript, and it is why the catalogue can be exported as a register somebody
signs.

The consequence that matters: **301 of the 500 are enforced and 199 are
advisory**, and the difference is visible everywhere. `isImplemented(rule)`
decides how a row is labelled in the interface and in every export. A row that
claims a rule the registry does not implement fails `npm run verify`.

This is the mechanism behind the promise in §1. An application that showed all
500 as "checked" would be lying about 199 of them.

### The registry

124 keys across 11 subject modules — availability, staff workload, staff
preferences, cohort, sequencing, rooms, geography, accessibility,
administrative, quality, plus a shared kit. Each rule implements **exactly one**
of:

|         |                                                          |
| ------- | -------------------------------------------------------- |
| `check` | gate one candidate placement — return a sentence or `ok` |
| `cost`  | score one candidate placement, 0 … 1                     |
| `audit` | inspect the finished schedule                            |

A rule implementing two would be counted twice in every report. That is
asserted by a test, not trusted.

---

## 5. The solver

A constraint-guided greedy placer, in three passes:

1. **Least-slack ordering.** Demands are sorted by how few (room × staff)
   options they have. The most constrained thing is placed first, because
   placing it last means placing it never.
2. **Bounded candidate search.** For each demand, a shuffled pool of at most 14
   rooms and the 6 least-loaded eligible staff. Bounded because the search is
   the hot loop and an exhaustive one buys accuracy nobody can perceive.
3. **Displacement.** When a placement's _only_ obstacle is an occupied room,
   the occupant is moved and both sessions are re-checked against every rule.
   Capped at 60 attempts.

It guarantees every enabled hard constraint and minimises weighted soft cost.
It does **not** prove optimality, and the README says so. A CP-SAT backend
would; it would also be a different program.

Soft costs are normalised to 0…1 so that a rule's weight, not its
implementation, decides its influence. A rule returning 40 would silently
outrank the entire rest of the catalogue.

---

## 6. Trust boundaries

Three, in decreasing privilege.

**Main process** — filesystem, dialogs, the one outbound HTTP call. Small on
purpose.

**Renderer** — sandboxed (`sandbox: true`), context-isolated,
`nodeIntegration: false`, `default-src 'none'` with `connect-src 'none'`. It is
the largest body of code and the only part an attacker can realistically reach,
so it is allowed to reach nothing.

**Worker** — pure computation, no privileges to have.

Every IPC channel does three things before any work: confirms the call came
from this window, checks a per-channel rate limit, and parses the payload
against a Zod schema. A TypeScript interface on a handler parameter describes a
value that arrived over a serialisation boundary — it enforces nothing at
runtime, which was the state of things before milestone 3.

`docs/security-audit-owasp.md` has the full reasoning, including what was found
and what was accepted.

---

## 7. State

One Zustand store, eight slices, each typed `Slice<K extends keyof AppState>`
returning `Pick<AppState, K>`. A slice that forgets one of its actions is a
compile error; so is an action no slice provides.

Slices are plain factories rather than Zustand `StateCreator`s. The split is
organisational — every slice still reads the whole state through `get()`. It
changes where an action is written, never what it can reach, and pretending
otherwise would be a boundary that is not real.

### Materialise on edit (D-22)

The generator invents an institution from figures, which is what makes a new
project usable in a minute. The first explicit edit to an entity type snapshots
the whole generated list into `overrides`, and the generator stops inventing
that type.

CSV import uses the same seam. An imported row therefore inherits the entire
validation and editing path rather than needing a parallel one — which is why
the importer can refuse a row with a line number and a reason instead of
silently dropping it.

---

## 8. Failure

The repository's rule is that failure is loud (`CLAUDE.md` §1.4). Concretely:

| Failure                         | What happens                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| A page throws                   | contained by an error boundary keyed on the route, named, navigation stays usable                   |
| The preload fails               | logged by a `preload-error` listener — it once silently removed the title bar and every file dialog |
| The renderer crashes            | reloaded, bounded to three attempts in ten minutes, then the user is asked                          |
| The renderer hangs              | 20-second grace period, because a long materialise is not a crash                                   |
| The GPU dies three times        | hardware acceleration off, and the user told, because relaunching reproduces it                     |
| An IPC payload is malformed     | refused with a sentence naming the field — never a stack trace back to the renderer                 |
| The model server is unreachable | the deterministic explainer answers instead, and says it did                                        |

What is deliberately **not** recovered is the solved schedule. Configuration
and constraint state persist; the timetable is re-derived. Restoring a stored
schedule would risk showing one the current rules would refuse to produce.

---

## 9. Verification

Three layers, doing different jobs.

**`npm run verify`** — 159 checks, headless, the number that counts. It
**re-derives** every hard invariant from the output: it recounts double
bookings, capacity breaches, room-type mismatches and unqualified assignments
itself rather than believing the solver's report. A solver bug cannot mark its
own homework.

**Vitest** — 210 tests across four projects. `core` runs in Node, which is
itself a standing check that the domain needs no DOM. Most cases are regression
cover for specific defects, each naming the bug in the case that guards it.

**Types** — full strict, including `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. Turning those on produced 338 errors that were
worked through as a bug hunt, not silenced; several were real.

One documented exception: `noUncheckedIndexedAccess` is off for the harness
alone. In a test, an out-of-range read throws and fails the run, which is the
wanted behaviour — the flag would have bought 97 guard clauses and no safety.

---

## 10. What this architecture is bad at

Worth stating, because every structure trades something.

- **A very large institution has not been measured.** The default is 1,365
  students. Everything is in memory and single-threaded apart from the solver.
- **No multi-user anything.** Two people cannot edit one timetable. Adding that
  means a server, and a server means most of this document is wrong.
- **The catalogue is one flat namespace of 500.** Navigable by number and by
  domain, but it is a list, not a hierarchy.
- **`packages/core/scripts/harness.ts` is 1,910 lines** — a linear script
  rather than modules. Splitting it into suites belongs with the Vitest work
  and has not been done.
- **`DeptConfig` has no stable identifier.** A department is known by its code,
  which is editable, so the hierarchy table keys rows by index. Recorded as
  GAP-08 in `docs/CONTEXT.md`.
- **i18n is 24% complete.** The mechanism is in place and keys are compile-time
  checked; 376 interface strings are still literal.

---

## 11. Where to look

| Question                         | File                                            |
| -------------------------------- | ----------------------------------------------- |
| What is the domain?              | `packages/core/src/data/model.ts`               |
| What does the user fill in?      | `packages/core/src/data/config/types.ts`        |
| What are the constraints?        | `packages/core/src/data/constraints/rows1-3.ts` |
| How is one enforced?             | `packages/core/src/engine/rules/`               |
| How does solving work?           | `packages/core/src/engine/solver.ts`            |
| How is a saved file trusted?     | `packages/core/src/data/normalise.ts`           |
| Where is the privilege boundary? | `apps/desktop/electron/ipc/contracts.ts`        |
| Why is anything the way it is?   | `docs/decisions.md` (D-01 … D-57)               |
| What went wrong before?          | `docs/CONTEXT.md`                               |
