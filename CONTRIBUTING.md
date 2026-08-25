# Contributing

## Before anything else

Read [`CLAUDE.md`](CLAUDE.md). It is short, it is the operating contract for
this repository, and its first rule is the one that matters most:

> **Never claim a number you have not measured.**

Aula's entire value is that when it says a class cannot be scheduled, the
reason is true. A comment that quotes a stale figure, a constraint labelled
"enforced" with nothing behind it, or a README that rounds up — each of those
is the same defect as a wrong answer, and this project treats them that way.

## Setup

Node **24.18.1** (see `.nvmrc`) and npm 10.9+.

```bash
npm install
npm run dev
```

`npm install` installs Git hooks via `core.hooksPath`. No wrapper package —
they are plain scripts in `.githooks/` that you can read.

## The loop

```bash
npm run new -- page Reports     # scaffold, if you are adding something
# ... work ...
npm run format
npm run check                   # format, lint, typecheck, test, verify
```

`npm run check` is exactly what CI runs. If it passes locally it passes there.

### Adding something new

Use the generator. It is not a convenience — it registers things in the four or
five places that are easy to forget:

```bash
npm run new -- page Reports
npm run new -- rule roomTurnoverGap --group rooms --kind cost
npm run new -- slice exports
npm run new -- component EmptyState
npm run new -- page Reports --dry-run    # see the plan first
```

## The gates, and why each exists

| Gate            | Why                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format:check`  | Prettier. Not taste — a formatting argument in review is time not spent on the change.                                                                                                                        |
| `lint`          | oxlint, seven plugins. Rules are at `error` or documented as off in `docs/lint-promotion-ladder.md`. Nothing sits at `warn` without an owner.                                                                 |
| `typecheck`     | Four projects, full strict including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.                                                                                                             |
| `test`          | 210 Vitest cases across four projects.                                                                                                                                                                        |
| **`verify`**    | **159 headless checks that re-derive every hard invariant.** This is the one that counts.                                                                                                                     |
| `release:check` | Renders release notes from a synthetic commit of every type. `semantic-release --dry-run` stops before this step on a non-release branch, so a broken changelog preset otherwise only surfaces after a merge. |

Hooks run a subset: `pre-commit` does format and lint (fast), `pre-push` does
typecheck, test and verify. `--no-verify` exists; CI does not have it.

## Commits

Conventional Commits. `.githooks/commit-msg` rejects anything else, because
`semantic-release` derives the version and the changelog from these subjects —
a malformed subject is a broken release.

```
feat(solver): add bounded displacement pass
fix(desktop)!: drop the legacy holidays field from saved projects
```

| Type                                            | Release |
| ----------------------------------------------- | ------- |
| `feat`                                          | minor   |
| `fix`, `perf`, `refactor`, `revert`             | patch   |
| `docs`, `test`, `build`, `ci`, `chore`, `style` | none    |
| any type with `!`                               | major   |

Write the body for somebody reading `git log` in a year with no context. What
was wrong, what you did, what you decided not to do. The commits on this
repository are long on purpose.

## Standards that are not obvious

### Never mark a constraint enforced unless it is

A row is shown as engine-enforced only when `isImplemented(rule)` is true.
Advisory rows are labelled advisory in the interface, in exports and in every
document. `npm run verify` fails if a row references a rule the registry does
not implement.

### The generator must not invent scarcity

If no configured room has a fume hood, no course may be given a fume-hood
requirement. The solver should fail on real scarcity, never on generator
fiction — otherwise the explanation the application gives is a lie about a
problem that does not exist.

### Failure is loud

No empty `catch`. No fallback that hides a broken bridge, a missing preload or
an unreachable model. If something cannot work, say so where the user is.

### The core reaches no host API

`packages/core` compiles with `"types": []` and `lib: ["ES2023"]`. No `fetch`,
no `document`, no `node:*`. Anything that must touch a host goes in
`apps/desktop/src/adapters/` or the main process. This is what lets the same
code run in the renderer, in a Web Worker and headless in CI.

### Optional props

UI components declare optional props as `?: T | undefined`. Passing `undefined`
to an optional prop is idiomatic React and means nothing.

Domain records do **not**. There, an absent key and a key set to `undefined`
are different states that survive a save and load round trip, so clearing a
field deletes the key — see `applyPatch` in `src/lib/records.ts`.

### Translations

New interface copy goes in `src/i18n/locales/en.ts`. Keys are checked at
compile time: `t('nav.timtable')` is a build error listing the valid keys, not
a string that renders as itself.

Constraint texts are **not** translated. They are domain data quoted verbatim
in exports somebody signs off, and translating them is a job for a person who
knows the vocabulary in the target language.

## Tests

Write the test that would have caught the bug, and name the bug in it. Most of
the suite reads like this:

```ts
/**
 * Regression: this function claimed in its own comment to mirror `buildGrid`
 * and did not. It rebuilt the day by hand assuming every period is
 * `slotMinutes` long, which stopped being true once `slotPlan` gained a
 * shorter final one.
 */
it.each([...])('agrees with buildGrid for %i-minute periods', ...)
```

Four projects: `core` (Node — which is itself a check that the domain needs no
DOM), `desktop` (happy-dom), `electron` (Node), `cli` (Node).

Coverage is 33%. It is not a target; the harness covers the engine far more
thoroughly than the line count suggests. Do not chase the number.

## Accessibility

Zero axe violations across nine routes and three themes. Keep it there.

- Every colour is a token in `styles/themes.css`. A literal colour in a rule is
  a bug: it will look right in one theme and wrong in another, and nothing will
  catch it.
- Any control without visible text needs an `aria-label`. A `title` is a
  tooltip — several screen readers skip it and no keyboard user sees it.
- Four `jsx-a11y` rules are off because every finding was a false positive.
  Reasons are in `docs/audit-accessibility-performance.md`. Do not switch them
  back on without reading it.

## Security

- Every IPC payload is parsed with Zod at the main-process boundary. A
  TypeScript interface on a handler parameter enforces nothing at runtime.
- Nothing in the shipped dependency graph may be strong copyleft.
  `npm run audit:licenses` fails the build on one, because Aula statically
  links what it ships.
- Adding a runtime dependency: check the licence, check the size, and check
  whether the platform already does it. `dotenv` was not added because Node has
  `process.loadEnvFile`.

Report a vulnerability privately to the maintainers rather than in an issue.

## Pull requests

- One concern per PR.
- `npm run check` green.
- Say what you measured, not what you expect.
- An AI reviewer comments on every PR. It is a reviewer, not a gate — argue
  with it if it is wrong.

## Where things live

|                     |                                                       |
| ------------------- | ----------------------------------------------------- |
| `packages/core/`    | the domain — no DOM, no Node, no fetch                |
| `apps/desktop/`     | the Electron application                              |
| `tools/cli/`        | `npm run new`                                         |
| `docs/decisions.md` | why anything is the way it is (D-01 … D-57)           |
| `docs/CONTEXT.md`   | execution log and bug history — append, never rewrite |
| `ARCHITECTURE.md`   | the patterns and the boundaries                       |
