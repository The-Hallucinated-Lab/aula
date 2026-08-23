# @aula/desktop

The Electron application: main process, preload, and the React renderer.

This package is not the whole project. Everything a reader usually wants is one
level up:

|                                 |                                                  |
| ------------------------------- | ------------------------------------------------ |
| What Aula is, and how to run it | [`../../README.md`](../../README.md)             |
| How it is put together          | [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) |
| How to work on it               | [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) |

Every command runs from the repository root, not from here — the workspace
scripts delegate down.

```bash
npm run dev        # Vite + Electron
npm run dev:web    # the renderer alone, in a browser
npm run package    # Windows installer, NSIS + portable
```

## What lives here

```
electron/          main process
  config/          validated environment, .env loading
  ipc/             Zod payload contracts and the per-channel rate limiter
  telemetry/       opt-in crash reporting, off unless configured and consented
  resilience.ts    renderer crash recovery
  preload.ts       the only bridge to the renderer

src/
  adapters/        host-specific edges — the solver Web Worker client
  components/      shared UI
  content/         microcopy
  i18n/            translation bundle; keys are compile-time checked
  lib/             immutable-update helpers
  pages/           9 screens, split into directories where they are large
  store/           Zustand: 8 slices, types, persistence, editing helpers
  styles/          themes.css owns every colour in the application
```

The domain — the model, the 500-row constraint catalogue, the rule registry and
the solver — is not here. It is `@aula/core`, which compiles with no DOM, no
Node and no `fetch`, and this package is one of its three drivers.

## The one thing to know before editing

A literal colour anywhere outside `styles/themes.css` is a bug. It will look
correct in one of the three themes and wrong in the others, and nothing will
catch it.
