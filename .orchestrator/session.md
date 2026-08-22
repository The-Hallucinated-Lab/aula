## Session 2026-08-18 — Aula v1.0.0

Models available (`ollama list`): `orch-reader:latest` (gemma4:e4b, 64K ctx build),
`gemma4:e4b`, `llama3:latest`. GPU: RTX 4060 Laptop, 8 GB VRAM.

Goal: turn the SIH25028 front-end demonstrator into a real Windows desktop
application driven by all 500 constraints and by the administrator's own figures.

### Units

| # | Task | Route | Model | Attempts | Status | Notes |
|---|------|-------|-------|----------|--------|-------|
| 1 | Domain model + setup config | RETAIN | — | 1 | merged | architecture; schema design |
| 2 | 500-constraint catalogue | RETAIN | — | 1 | merged | packet would have exceeded the data itself (§4 rule 7) |
| 3 | Rule registry + solver + worker | RETAIN | — | 1 | merged | algorithmic core; not delegable |
| 4 | Setup wizard, Constraints page, all pages | RETAIN | — | 1 | merged | UI architecture and state design |
| 5 | Electron shell, preload, packaging | RETAIN | — | 1 | merged | security-sensitive; contextIsolation, IPC surface |
| 6 | Audit-rule inventory of `rules.ts` (1,262 lines) | DELEGATE | orch-reader | 1 | used | 7 of 8 correct; cross-checked before use |
| 7 | README prose draft | DELEGATE | llama3 → gemma4:e4b | 3 | merged after review | see failure patterns |

### Failure patterns (fold into future packets)

- **Harness, not model:** piping `ollama run` into a file injects terminal control
  sequences (`\e[5D\e[K`) mid-word and silently corrupts output — "their\e[5D\e[Ktheir".
  Fixed by moving both `delegate.sh` and `ask.sh` to `/api/generate` via Python.
- **Thinking mode on by default** for the reader made extraction slow and truncated.
  Must pass `"think": false` explicitly; the Modelfile alone does not do it.
- **VRAM ceiling:** with the 64K-context reader resident, a second 8B model at
  `num_ctx` 32768 returns HTTP 500. Cap coder calls at 8192 ctx on this machine.
- **llama3 ignores structural constraints** in long packets: dropped fenced command
  blocks and kept `•` bullets across two attempts, including an explicit correction
  pass. Do not route structured-markdown tasks to it; escalate to `gemma4:e4b`.
- **Naive fence extraction truncates markdown** that itself contains code fences.
  `extract.py` now takes the outermost block when the fence is tagged `markdown`.
- **The reader is a map, not a verdict** (§11.3): it missed `lowEnrolmentFlag`, while
  my own grep missed the one-line `solveTimeLimit: { audit: () => [] }`. Only the
  cross-check produced the right answer (8 audit rules of 124 implementations).

### Decisions

- 199 of 500 constraints are labelled advisory rather than faked as enforced. Exam
  seating, hazardous-waste windows and catering rotas cannot be decided from a
  weekly-teaching data model; they stay switchable and are exported for sign-off.
- The generator must never emit an impossible demand — feature requirements and
  accessibility flags are only applied when the configured plant can satisfy them.
  Scarcity should be real, not manufactured.
- Verification re-derives hard invariants independently of the solver, so the
  solver cannot mark its own homework.


## Session 2 — 2026-08-18 — review response

Goal: act on 27 handwritten review items decoded from a reMarkable PDF.

### Units

| # | Task | Route | Model | Attempts | Status | Notes |
|---|------|-------|-------|----------|--------|-------|
| 8 | Decode the PDF (Identity-H subset fonts) | RETAIN | — | 3 | done | needed per-font ToUnicode CMaps and array-form bfrange |
| 9 | Editable-record layer, generator, store CRUD | RETAIN | — | 1 | merged | architecture and state design |
| 10 | Custom-rule templates and evaluator | RETAIN | — | 1 | merged | engine work |
| 11 | Assistant relay through Electron main | RETAIN | — | 1 | merged | security-sensitive IPC surface |
| 12 | Solver displacement pass | RETAIN | — | 1 | merged | algorithmic; found by verification |
| 13 | Twelve field-help sentences | DELEGATE | gemma4:e4b | 1 | merged after correction | one sentence factually inverted; see below |
| 14 | Inventory of audit rules in rules.ts | DELEGATE | orch-reader | 1 | used | cross-checked; see session 1 |

### Failure patterns (fold into future packets)

- **Structural gates cannot catch semantic errors.** The help-text delegation passed
  every automated check — line count, key order, word limits, banned words — and still
  described "walk time" as a maximum allowance rather than an actual distance. A human
  review pass on delegated prose is not optional.
- Delegated microcopy defaults to a dry verb formula ("Specifies…", "Determines…",
  "Calculates…"). Ask for the subject of the sentence to be the thing itself.

### Decisions

- Documented in full in `decisions.md` at the repository root (D-22 onward).


## Session 3 — 2026-08-21 — full project document

Goal: expand the two-page brief into a complete project document covering the
file system, stack, constraint-to-algorithm mapping, backend, agentic AI, a
multi-role server deployment and examination scheduling.

Ollama was not running at session start; `ollama serve` was launched before any
delegation. Reader was not warmed — only `gemma4:e4b` was resident, so calls ran
at `ORCH_CTX=16384` with no VRAM contention (§3.4).

### Units

| # | Task | Route | Model | Attempts | Status | Notes |
|---|------|-------|-------|----------|--------|-------|
| 15 | Measure catalogue/registry/institution counts | RETAIN | — | 1 | done | throwaway esbuild scripts; §11.1 baseline rewritten from output |
| 16 | Reconstruct CLAUDE.md | RETAIN | — | 1 | merged | scripts cite §3.1, §4 rule 7, §11.3 — anchors restored |
| 17 | Constraint→algorithm mapping prose | DELEGATE | gemma4:e4b | 1 | merged after correction | 91 s; see failures below |
| 18 | Agentic AI: today, path, restraints | DELEGATE | gemma4:e4b | 1 | merged after correction | 52 s; over-bulleted, one semantic slip |
| 19 | Desktop → multi-role server migration | DELEGATE | gemma4:e4b | 1 | merged after correction | 36 s; best of the four, spelling only |
| 20 | Examination scheduling gap and design | DELEGATE | gemma4:e4b | 1 | merged after correction | 35 s; accurate, spelling only |
| 21 | File system, stack, backend, solver sections | RETAIN | — | 1 | merged | architecture — §4 |

### Failure patterns (fold into future packets)

- **The packet was the defect, not the model.** The algorithms packet described
  `walkWindow` as converting the gap between two sessions into minutes and
  refusing what nobody could walk. It does not. It fires only on *adjacent*
  sessions in different buildings and compares `max(building.walkMinutes, need)`
  against `grid.passingMinutes`. The model paraphrased the error faithfully.
  `interCampusTravel` is the gap-based one. Verify the claim before writing it
  into a packet — a delegated section can be no more correct than its packet.
- **A fabricated illustration propagates.** The same packet illustrated
  `equipmentContention` with "a shared cart of 12 laptops". The real pools are
  2 smartboard carts, 1 VR headset kit, 2 survey kits. The model repeated the
  invented number verbatim, exactly as instructed to. Illustrations must be drawn
  from the configuration, not improvised.
- **Semantic inversion again, on the same rule shape as the v1.1 "walk time"
  incident.** `spreadAcrossWeek` prices a calendar-thinned weekday so meetings
  move to weekdays that survive. The draft rendered this as "preventing a course
  from completing its syllabus by only meeting on non-standard days", which is
  not what the code does. §5 holds: structural gates do not catch meaning.
- **Dropped supplied facts.** The 69 `check` / 47 `cost` / 8 `audit` disjoint
  split was in the packet and absent from the draft. Long fact lists get thinned;
  check for omission, not only for error.
- **Format drift toward all-bullets.** "Short paragraphs and bullets" produced a
  ~95% bullet draft for unit 18. State a paragraph-to-bullet ratio explicitly.
- **The dry verb formula returned** ("This check…", "This function…", "X is used
  by Y") despite an explicit ban, and American spellings ("authorization",
  "recognizes") despite an explicit British English instruction. Both are cheap
  to fix on review and should be expected rather than re-litigated.

### Decisions

- Every count in the document is taken from `npm run verify` and two throwaway
  analysis scripts run on 2026-08-21, not from `explanation.md`, which understates
  the check count (30 vs the current 78) and predates three sessions of work.
