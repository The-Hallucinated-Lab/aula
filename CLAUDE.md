# CLAUDE.md — working agreement for this repository

Aula (SIH25028, "Smart Classroom & AI Timetable Scheduler"). A Windows desktop
timetable planner: Electron shell, React renderer, bespoke constraint engine in
a Web Worker. No server, no database, no network call except `localhost:11434`
for the optional local assistant.

This file is the operating contract for any agent working here. `.orchestrator/*.sh`
cites it by section number — keep the numbering stable.

---

## 1. Ground rules

1. **Never claim a number you have not measured.** Run `npm run verify` and quote
   its output. Prose files (`explanation.md`, `CONTEXT.md`) go stale; the code and
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

```
CONTEXT.md      immutable execution timeline + bug log; append, never rewrite
decisions.md    numbered architecture decisions (D-01…)
explanation.md  long-form prose explainer (may lag the code — verify before quoting)
docs/           review notes
.orchestrator/  local-model delegation harness (§3) and session log
desktop/        the application (see explanation.md §3 for the src tree)
```

Two boundaries are load-bearing and must not be crossed:

- `src/data/**` is pure data and types. It never imports `src/engine` or React.
- `src/engine/**` may import `src/data`, never React or the DOM. This is what lets
  `scripts/harness.ts` bundle the whole engine with esbuild and exercise it in Node.

## 3. Local model orchestration

Delegation runs against Ollama on this machine. Start it with
`ollama serve` if `curl localhost:11434/api/tags` is silent.

| Script | Purpose |
|---|---|
| `.orchestrator/warm.sh` | keep the reader resident (`keep_alive: 8h`) |
| `.orchestrator/ask.sh <file\|-> "<question>" [lines]` | extraction from a file; answers `NOT_FOUND` rather than guessing |
| `.orchestrator/delegate.sh <model> <prompt-file> <out-file> [think]` | one generation packet |

### 3.1 Thinking mode

Thinking is **off** by default and must be passed explicitly as `"think": false` —
the Modelfile alone does not disable it. Enable it only for code generation.
For extraction and prose it makes output slower and more likely to truncate.

### 3.2 Transport

Always `/api/generate` or `/api/chat` over HTTP. **Never pipe `ollama run` into a
file** — it injects terminal control sequences (`\e[5D\e[K`) mid-word and silently
corrupts the output ("their\e[5D\e[Ktheir").

### 3.3 Model routing

| Task | Model |
|---|---|
| Extraction / file Q&A | `orch-reader` (gemma4:e4b, 64K ctx build) |
| Prose, structured markdown | `gemma4:e4b` |
| Anything structural | **not** `llama3` — it drops fenced blocks and ignores bullet-format instructions across correction passes |

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
5. Log every unit in `.orchestrator/session.md` with route, model, attempts, status.
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

### 11.1 Measured baseline (2026-08-21)

78 checks pass. Default configuration: 1 campus, 4 buildings, 28 rooms, 5
departments, 5 programmes, 90 courses, 24 cohorts, 1,365 students, 68 staff,
5 days × 8 × 60-minute slots. 360 sessions, 384 contact hours, room utilisation
34.3%, load spread ±2.35 h, lunch protected on 100% of cohort-days, solved in
~2.4 s, soft penalty 1714.

Catalogue: 500 rows — 410 hard / 90 soft, 301 enforced / 199 advisory, 72
parameterised rows carrying 88 knobs. Registry: 124 rule keys, all implemented;
69 `check`, 47 `cost`, 8 `audit`, disjoint. 121 keys are referenced by at least
one row; `roomRestricted`, `facultyMaxPerDay` and `facultyQualified` are declared
but referenced by none.

### 11.2 Known gaps

Recorded in `CONTEXT.md §4` (GAP-01…GAP-07). The load-bearing ones: the solver is
greedy and does not prove optimality; 199 constraints cannot be decided from a
weekly-teaching data model; there is no exam-scheduling entity; there is no
CSV/SIS import; the assistant needs Ollama installed locally.

### 11.3 The reader is a map, not a verdict

A delegated inventory of `rules.ts` missed `lowEnrolmentFlag`; an independent grep
missed the one-line `solveTimeLimit: { audit: () => [] }`. Only cross-checking the
two produced the right answer. Use the reader to find where to look, never as the
final count.
