# Lint promotion ladder

`.oxlintrc.json` enables seven plugins, but not every rule they bring is set to
`error` yet. A gate nobody can pass is not a gate — it gets bypassed with
`--no-verify` and stops meaning anything. So each deferred class is held at
`warn` and owned by the milestone that clears it.

Promoting a class means: fix every occurrence, flip the rule to `error`, and
delete its row here.

| Rules held at `warn`                    | Occurrences at M1 | Why deferred                                                                                                                                                               | Promoted by                  |
| --------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `unicorn/no-array-sort`                 | 33                | `Array#sort` mutates in place. Each site needs deciding on its merits — several sort arrays owned by the institution model, which is a real aliasing bug, not a style nit. | M2 · correctness audit       |
| `eslint/no-shadow`                      | 2                 | Shadowed `staff` bindings; renaming needs the surrounding logic read.                                                                                                      | M2 · correctness audit       |
| `promise/always-return`                 | 1                 | A `then()` with no return value.                                                                                                                                           | M2 · correctness audit       |
| `react/set-state-in-effect`             | 1                 | Synchronous `setState` in an effect; cascading render.                                                                                                                     | M2 · correctness audit       |
| `oxc/no-map-spread`                     | 8                 | Object spread inside `map`; allocation churn on hot render paths.                                                                                                          | M4 · architecture            |
| `unicorn/prefer-add-event-listener`     | 4                 | `on*` assignment clobbers other listeners.                                                                                                                                 | M4 · architecture            |
| `unicorn/no-useless-fallback-in-spread` | 4                 | `...(x ?? {})`.                                                                                                                                                            | M4 · architecture            |
| `unicorn/consistent-function-scoping`   | 2                 | Closures that capture nothing, re-created per render.                                                                                                                      | M4 · architecture            |
| `unicorn/prefer-array-find`             | 1                 | `filter()[0]`.                                                                                                                                                             | M4 · architecture            |
| `react/capitalized-calls`               | 4                 | Components invoked as functions rather than rendered as elements.                                                                                                          | M4 · architecture            |
| `react/no-array-index-key`              | 8                 | Index keys defeat reconciliation on reorder.                                                                                                                               | M4 · architecture            |
| `import/no-unassigned-import`           | 2                 | Bare CSS imports — legitimate here; the rule is kept visible rather than switched off so a genuine unassigned module import still shows up.                                | never (documented exception) |
| `jsx-a11y/*`                            | 26                | The whole accessibility pass is one coherent job.                                                                                                                          | M5 · accessibility           |

## Promoted so far

**M1** — everything in `correctness` and `suspicious`, plus
`typescript/no-explicit-any`, `eqeqeq`, the three code-injection rules,
`unicorn/no-empty-file` and `unicorn/require-post-message-target-origin`.

**M2** — `unicorn/no-array-sort`, `eslint/no-shadow`, `promise/always-return`
and `react/set-state-in-effect`. The shadowing class was worth the most: renaming
the inner `staff` in `solver.ts` turned up a candidate being built from the
enclosing `string[]` rather than the `Staff` it looked like, which only
type-checked because the shadow hid it.
