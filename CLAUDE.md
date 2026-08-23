# CLAUDE.md — working agreement for this repository

Aula (SIH25028, "Smart Classroom & AI Timetable Scheduler"). A Windows desktop
timetable planner: Electron shell, React renderer, bespoke constraint engine in
a Web Worker. No server, no database, no network call except `localhost:11434`
for the optional local assistant.

This file is the operating contract for any agent working here.
`tools/orchestrator/*.sh` cites it by section number — keep the numbering stable.

---

## 1. Ground rules

1. **Never claim a number you have not measured.** Run `npm run verify` and quote
   its output. Prose files (`docs/explanation.md`, `docs/CONTEXT.md`) go stale; the code and
   the harness do not.
2. **Never mark a constraint as enforced unless `isImplemented(rule)` is true.**
   Advisory rows are labelled advisory in the UI, in exports and in every document.
3. **The generator must never emit a structurally impossible demand.** If no room
   has a fume hood, no course may require one. Scarcity must be real, or the
   explanation the app gives the user is a lie.
4. **Failure is loud.** No empty `catch`. No silent fallback that hides a broken
   bridge, a missing preload or an unreachable model.
5. Finish with `npm run typecheck`, `npm run lint`, `npm run verify`. If the user
   runs the packaged app, finish with `npm run package` and verify the artifact.

## 2. Repository layout

An npm-workspaces monorepo. The split is not filing — it is how the
architectural boundaries below are made checkable by a compiler instead of by
code review.

```
packages/core/          @aula/core — the domain. Institution model, 500-row
                        constraint catalogue, rule registry, solver.
  src/data/             pure data and types
  src/engine/           rules and the solver
  scripts/harness.ts    headless verification (`npm run verify`)
  tsconfig.json         lib ES2023, types [] — no DOM, no Node, enforced

apps/desktop/           @aula/desktop — the Electron application
  electron/             main process, preload, validated env
  src/adapters/         host-specific edges (the solver Web Worker)
  src/pages/            screens
  src/components/       shared UI
  src/content/          UI microcopy

tools/orchestrator/     local-model delegation harness (§3) and session log
tools/scripts/          workspace scripts (git hooks, licence audit)
docs/                   CONTEXT.md, decisions.md, explanation.md, reviews
.githooks/              native Git hooks (`core.hooksPath`)
```

Three boundaries are load-bearing and must not be crossed:

- `packages/core/src/data/**` is pure data and types. It never imports
  `src/engine` or React.
- `packages/core/src/engine/**` may import `src/data`, never React or the DOM.
- **`@aula/core` as a whole reaches no host API** — no `fetch`, no
  `document`, no `node:*`. Its tsconfig sets `"types": []` and `lib` to
  `ES2023` alone, so a violation is a compile error rather than a convention.
  This is what lets the same code run in the renderer, in a Web Worker, and
  headless under Node in the harness.

Anything that must touch a host goes in `apps/desktop/src/adapters/` or the
main process. The assistant is the worked example: the briefing and the
grounding prompt are domain knowledge and live in
`packages/core/src/engine/assistant.ts`; reaching the model server is a
main-process relay, because the packaged renderer's origin is `file://`.

### 2.1 Commands

Every command runs from the repository root.

| Command                  | What it does                                      |
| ------------------------ | ------------------------------------------------- |
| `npm run dev`            | Vite + Electron against the dev server            |
| `npm run dev:web`        | renderer only, in a browser                       |
| `npm run typecheck`      | both workspaces, both TS projects each            |
| `npm run lint`           | oxlint over the whole tree                        |
| `npm run format`         | Prettier, write                                   |
| `npm run test`           | Vitest (`core` in Node, `desktop` in happy-dom)   |
| `npm run verify`         | the headless harness — the number that counts     |
| `npm run audit:licenses` | fails on strong copyleft in the shipped graph     |
| `npm run check`          | all of the above, in the order the hooks run them |
| `npm run package`        | electron-builder, NSIS + portable                 |

Commits must be Conventional Commits — `.githooks/commit-msg` rejects anything
else, and the release pipeline derives the version and changelog from them.

## 3. Local model orchestration

Delegation runs against Ollama on this machine. Start it with
`ollama serve` if `curl localhost:11434/api/tags` is silent.

| Script                                                                    | Purpose                                                          |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `tools/orchestrator/warm.sh`                                              | keep the reader resident (`keep_alive: 8h`)                      |
| `tools/orchestrator/ask.sh <file\|-> "<question>" [lines]`                | extraction from a file; answers `NOT_FOUND` rather than guessing |
| `tools/orchestrator/delegate.sh <model> <prompt-file> <out-file> [think]` | one generation packet                                            |

### 3.1 Thinking mode

Thinking is **off** by default and must be passed explicitly as `"think": false` —
the Modelfile alone does not disable it. Enable it only for code generation.
For extraction and prose it makes output slower and more likely to truncate.

### 3.2 Transport

Always `/api/generate` or `/api/chat` over HTTP. **Never pipe `ollama run` into a
file** — it injects terminal control sequences (`\e[5D\e[K`) mid-word and silently
corrupts the output ("their\e[5D\e[Ktheir").

### 3.3 Model routing

| Task                       | Model                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| Extraction / file Q&A      | `orch-reader` (gemma4:e4b, 64K ctx build)                                                                 |
| Prose, structured markdown | `gemma4:e4b`                                                                                              |
| Anything structural        | **not** `llama3` — it drops fenced blocks and ignores bullet-format instructions across correction passes |

### 3.4 VRAM ceiling

RTX 4060 Laptop, 8 GB. With the 64K-context reader resident, a second 8B model at
`num_ctx` 32768 returns HTTP 500. Cap concurrent calls at 8192 ctx, or unload the
reader first.

## 4. What to delegate and what to keep

Delegate: prose drafts, inventories of a large file, extraction, restatement,
first-pass tables. Retain: architecture, schema design, the solver, the rule
registry, security-sensitive surfaces (IPC, preload, packaging), and anything
where being wrong is invisible.

Numbered rules:

1. A packet must carry every fact the model needs — it cannot read the repo.
2. State the output format exactly, and the length budget.
3. Forbid invention explicitly: "if it is not in the packet, omit it".
4. One unit of work per packet.
5. Log every unit in `tools/orchestrator/session.md` with route, model, attempts, status.
6. Two failed attempts on the same packet means the packet is wrong, not the model.
7. **If the packet would be longer than the artefact it produces, RETAIN it.**
   Delegating the 500-constraint catalogue would have meant writing the catalogue
   into the prompt.

## 5. Review of delegated output is mandatory

Structural gates cannot catch semantic errors. A delegated help-text pass once
satisfied every automated check — line count, key order, word limits, banned
words — and still described "walk time" as a maximum allowance when it is an
actual distance. Every delegated sentence gets read against the source before it
ships. Delegated microcopy also defaults to a dry verb formula ("Specifies…",
"Determines…"); ask for the subject of the sentence to be the thing itself.

## 6. Documentation tasks

Long-form documents (briefs, reports, decks) follow the same route: measure first,
delegate the prose, verify every claim against the code, then build the artefact.
State counts as of the run that produced them. Current measured baseline is in §11.

## 11. Verification

`npm run verify` bundles the engine with esbuild and runs it headless. It
**re-derives** hard invariants — recounting double bookings, capacity breaches,
room-type mismatches, unqualified assignments and cap breaches itself — so a
solver bug cannot mark its own homework.

### 11.1 Measured baseline (2026-08-23)

159 checks pass. Default configuration: 1 campus, 4 buildings, 28 rooms, 1
faculty, 4 schools, 5 departments, 5 programmes, 90 courses, 24 cohorts, 1,365
students, 68 staff, 5 days × 8 × 60-minute slots, one shift spanning the day.
360 sessions, 384 contact hours, room utilisation 34.3%, load spread ±2.35 h,
lunch protected on 100% of cohort-days, solved in ~1.8 s, soft penalty 1717.

The penalty moved from 1714 because weekly load ceilings are now per designation
rather than a flat 18 h (D-51), which is a real reduction in teaching capacity.

Catalogue: 500 rows — 410 hard / 90 soft, 301 enforced / 199 advisory, 72
parameterised rows carrying 88 knobs. Registry: 124 rule keys, all implemented;
69 `check`, 47 `cost`, 8 `audit`, disjoint. 121 keys are referenced by at least
one row; `roomRestricted`, `facultyMaxPerDay` and `facultyQualified` are declared
but referenced by none.

### 11.2 Known gaps

Recorded in `docs/CONTEXT.md §4` (GAP-01…GAP-07). The load-bearing ones: the solver is
greedy and does not prove optimality; 199 constraints cannot be decided from a
weekly-teaching data model; there is no exam-scheduling entity; the assistant
needs Ollama installed locally. GAP-04 (no CSV import) was closed on 2026-08-23.

`npm run verify` bundles `@aula/core` only, so anything in `store.ts` or a page
is outside it and still needs driving in the app (or covering with a Vitest
`desktop` test).

The harness is now type-checked: it moved to `packages/core/scripts/` under
`tsconfig.scripts.json`, closing the gap where a duplicate `const` there could
only surface as an esbuild failure.

### 11.3 The reader is a map, not a verdict

A delegated inventory of `rules.ts` missed `lowEnrolmentFlag`; an independent grep
missed the one-line `solveTimeLimit: { audit: () => [] }`. Only cross-checking the
two produced the right answer. Use the reader to find where to look, never as the
final count.
