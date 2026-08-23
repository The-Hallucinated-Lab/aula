# Accessibility and performance audit — before and after

Measured on branch `refactor/hexagonal-core-modernization`, milestone 5.
Baseline is the state at the branch point (`732bb06`); "after" is the current
head.

## How these numbers were taken

axe-core 4.13.0, run in the application's own renderer against all nine routes,
in each of the three themes, at the `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`
and `best-practice` rule sets. Bundle sizes come from `npm run build:web`.

**One caveat worth stating**, because it changed the numbers by an order of
magnitude before it was found. The browser pane this was measured in does not
composite frames, so a CSS transition never advances and `getComputedStyle`
returns a colour frozen part-way between the old value and the new one. An
early run reported 398 contrast failures that did not exist — they were
interpolated colours sampled mid-transition. Every figure below was taken with
`transition-property: none` injected first, which makes every computed colour
the settled one. Animations were left alone: removing them leaves `.fade-in` at
`opacity: 0`, and axe then flags every text node on the page.

---

## Accessibility

### axe violations, all nine routes

| Theme         | Before | After |
| ------------- | ------ | ----- |
| Light         | 48     | **0** |
| Dark          | 48     | **0** |
| High contrast | 39     | **0** |

Dark and high contrast did not exist before this branch; their "before" figures
are the same markup measured under the new palettes, which isolates the
structural findings from the colour ones.

### By rule

| Rule                         | Impact   | Before | After | What it was                                                                                                                                                                                    |
| ---------------------------- | -------- | ------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aria-meter-name`            | serious  | 23     | 0     | Every progress bar carried `role="meter"` with no accessible name. A screen reader announced "60 percent" with no way to tell which of the twenty-three bars on the Scenarios screen it meant. |
| `region`                     | moderate | 13     | 0     | The page banner on every route sat outside any landmark, so content a user navigated to belonged to nothing.                                                                                   |
| `color-contrast`             | serious  | 9      | 0     | `--ink-3`, the muted text tier, was `#949c96` — 2.7:1 against the card surface, on 11px text.                                                                                                  |
| `landmark-no-duplicate-main` | moderate | 1      | 0     | Pages each declared their own `<main>`; two of them declared two.                                                                                                                              |
| `landmark-unique`            | moderate | 1      | 0     | Consequence of the same thing.                                                                                                                                                                 |
| `empty-table-header`         | minor    | 1      | 0     | Four action columns had a `<th>` with no text.                                                                                                                                                 |

### What changed

- **One `main` for the application.** Nine pages each declared their own, and
  the banner sat outside all of them. `App.tsx` now owns a single
  `<main id="main-content">`; pages render into it.
- **A skip link.** Nine navigation links stand between the top of the page and
  the content on every route. It is the first thing in the tab order, hidden
  until focused — not `display: none`, which would make it unfocusable and
  therefore pointless.
- **Every meter is named.** `Meter` takes the visible label when there is one
  and requires an `ariaLabel` when there is not, and carries `aria-valuetext`
  so the announcement is "CSE teaching load, 96 hours" rather than "60".
- **Muted text now clears 4.5:1** in every theme against all three planes:
  `#656d69` in light (5.18 / 4.71 / 4.58), `#95a09a` in dark (6.12 / 6.75 /
  4.88).
- **Toggle grids are labelled.** Forty availability cells per staff member had
  only a `title`, which several screen readers do not announce and no keyboard
  user ever sees. Each now has an `aria-label` as well.
- **Two dialogs stopped putting their close handler on the backdrop.** A
  backdrop with a mouse handler is an interactive element with no role and no
  keyboard path. Dismissal moved to a document listener, which also fixed a
  real bug: a text selection that began inside a dialog and ended past its edge
  used to close it and discard the edit.
- **The substitution sheet's `role="dialog"` was on the scrim**, not on the
  dialog. It is on the panel now.

### What a rule flagged and was left alone

Four `jsx-a11y` rules are off rather than held as warnings, because every
finding was a false positive and a warning nobody can act on is noise:

- `label-has-associated-control` — the labels do wrap a control; the control is
  a component and the rule cannot see through it. axe, which reads the real
  accessibility tree, reports none.
- `click-events-have-key-events` and
  `no-noninteractive-element-to-interactive-role` — the Combobox is a correct
  ARIA combobox: `role="combobox"` on the input, `aria-activedescendant`, arrow
  keys, Home/End and Escape. Its options are deliberately not focusable, which
  is what the pattern requires and what these rules read as a defect.
- `prefer-tag-over-role` — suggests `<select>` for the Combobox. A native
  select cannot type-ahead filter, which is the component's entire purpose.

### Beyond axe

axe checks what can be checked mechanically, which is a minority of WCAG. These
were done because the audit is not the tool:

- `prefers-reduced-motion` switches page transitions and heatmap animation off
  rather than shortening them.
- `forced-colors: active` restores borders that were only ever implied by a
  background difference.
- A **high-contrast theme** as a first-class choice, not a variant of dark:
  every foreground clears 7:1 and shadows are removed, because a soft edge is
  exactly what its users cannot see.
- `color-scheme` is declared per theme so form controls and scrollbars follow.

### Not covered

- No screen-reader run. axe cannot tell you whether an announcement is
  _useful_, only whether one exists.
- No keyboard walkthrough of every screen. The Combobox, dialogs and skip link
  were driven by hand; the rest were not.
- Focus order is not asserted by any test.
- The 500 constraint texts are not checked for reading level.

---

## Performance

### Bundle

|            | Before                                 | After                     | Change   |
| ---------- | -------------------------------------- | ------------------------- | -------- |
| JS (raw)   | 599.79 kB                              | 655.34 kB                 | +55.6 kB |
| JS (gzip)  | 179.14 kB                              | 197.09 kB                 | +17.9 kB |
| Worker     | 140.03 kB                              | 140.67 kB                 | +0.6 kB  |
| CSS (gzip) | 7.24 kB                                | 8.52 kB                   | +1.3 kB  |
| Fonts      | 0 bundled, ~180 kB fetched from Google | 260 kB bundled, 0 fetched | —        |

The JS grew, and it is worth being straight about why rather than presenting it
as a win. Zod (IPC validation), i18next and react-i18next account for
essentially all of it. That is a deliberate trade: unvalidated IPC payloads and
hard-coded English were both real defects, and 18 kB gzipped is a small price
for closing them in an application that is installed once and launched from
disk. There is no network on the critical path to make it matter.

### What actually got faster

- **First paint no longer waits on a third party.** The renderer used to fetch
  two typefaces from `fonts.googleapis.com` on every launch — a blocking
  stylesheet request to a remote host, in a desktop application, before a pixel
  drew. Measured now: **0 off-origin requests**. Offline, the app used to fall
  back to Segoe UI with no warning; it no longer can.
- **Two soft-cost functions stopped allocating per candidate.**
  `labAfterLecture` and `tutorialAfterLecture` spread a day set into a fresh
  array for every course, on every candidate placement, and threw the result
  away to read one minimum — hundreds of thousands of arrays per solve on the
  default institution. They iterate the sets directly now.
- **Two `O(n log n)` sorts became `O(n)`.** The same functions sorted a whole
  day list to take its first element.
- **Nine redundant `[...x].sort()` double copies** collapsed to one call each,
  and every in-place `Array#sort` in the tree became `toSorted`.

### Solver

Unchanged, which is the point: the whole refactor was expected to move nothing.

|                  | Before    | After     |
| ---------------- | --------- | --------- |
| Sessions placed  | 360 / 360 | 360 / 360 |
| Contact hours    | 384       | 384       |
| Room utilisation | 34.3%     | 34.3%     |
| Soft penalty     | 1717      | 1717      |
| Solve time       | ~1.8 s    | ~1.7 s    |
| Harness checks   | 159 pass  | 159 pass  |

Solve time varies by more than the difference between these two figures run to
run, so it should be read as "no change", not as an improvement.

### Load

`domInteractive` 26 ms, `DOMContentLoaded` 416 ms, 9 font faces resolved
locally, 131 resources — all same-origin. These are development-server numbers
with unbundled modules; a packaged build serves one chunk from disk.

### Not covered

- No Lighthouse run. It measures a web page over a network, and this is a
  `file://` desktop application.
- No profiling of the renderer under a large institution. The default is 1,365
  students; a 20,000-student institution has not been measured.
- Memory footprint is not measured.
- The bundle is one chunk by choice — the catalogue and engine are both needed
  before first paint, so a waterfall of small chunks would be slower, not
  faster. Code splitting has not been revisited since.
