# OWASP Top 10 audit — Aula

Assessed against **OWASP Top 10 (2021)** for the branch
`refactor/hexagonal-core-modernization`, milestone 3.

## What is actually being assessed

The Top 10 describes web applications: a server, a session, a database, an
authenticated user, an attacker who can reach an endpoint. Aula has none of
those. It is an offline Electron desktop application — no server, no database,
no account, no listening socket, and exactly one network destination, a model
server on loopback that the user chooses to install.

Most categories therefore do not map directly, and writing "N/A — mitigated"
against eight of ten would be theatre. Each section below states what the
category _becomes_ in a desktop application of this shape, and what was found.

The renderer is the interesting surface. It is the largest body of code, it is
where any injected content would land, and under Electron a compromised
renderer is one bad configuration away from arbitrary code execution on the
user's machine. Everything below is really about that.

---

## A01 · Broken access control

**Here:** the IPC boundary. The renderer is unprivileged; the main process can
touch the filesystem and the network. Every channel the renderer can invoke is
an access-control decision.

| Finding                                                                                                                | Severity | Status                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| No handler checked which frame the call came from, so any frame the renderer hosted could invoke a privileged channel. | Medium   | Fixed — every handler calls `fromMainWindow(event)` first and refuses anything else. |
| `assistant:cancel` took a request id straight from the payload and aborted it.                                         | Low      | Fixed — sender checked, id parsed.                                                   |

Aula has no users, roles or permissions, so there is nothing to escalate
_within_ the application. The boundary that matters is process-to-process.

## A02 · Cryptographic failures

**Here:** data at rest, and data leaving the machine.

| Finding                                                                           | Severity | Status                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project data is stored unencrypted in `localStorage` and in files the user saves. | Accepted | Unchanged. It is the user's own timetable on their own machine, saved where they chose. Encrypting it needs a key, and a key with nowhere to live is worse than no encryption. Recorded so the decision is visible rather than implicit. |
| No secrets exist to leak — Aula holds no credentials, tokens or API keys.         | —        | Confirmed by inspection. `.env.example` states that the file carries configuration, never secrets.                                                                                                                                       |

## A03 · Injection

**Here:** three sinks — the filesystem, the local model server, and the DOM.

| Finding                                                                                                                                                                                                                                          | Severity | Status                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file:save` accepted any `suggestedName`; `../../../.bashrc` was a valid suggestion. The native dialog still gated the real write, so this is social engineering rather than traversal — but the filename box is a poor place to lie to someone. | Medium   | Fixed — path separators, null bytes, `.`/`..` and Windows reserved device names refused. Tested.                                                                                                        |
| `assistant:chat` interpolated an unvalidated `model` string into a JSON body sent to the model server.                                                                                                                                           | Medium   | Fixed — constrained to `^[a-zA-Z0-9._/-]+(:[a-zA-Z0-9._-]+)?$`. Tested.                                                                                                                                 |
| CSV import parses untrusted files.                                                                                                                                                                                                               | Low      | Already sound: a hand-written parser that treats every cell as text, resolves every reference against the configuration, and reports each refused row by line number. No `eval`, no formula evaluation. |
| DOM injection.                                                                                                                                                                                                                                   | Low      | No `dangerouslySetInnerHTML`, no `eval`, no `new Function` anywhere in the tree. The lint config now makes all three an error.                                                                          |

## A04 · Insecure design

**Here:** the shape of the trust boundary itself.

The pre-existing design is sound and was kept: no server to attack, no account
to compromise, no data to exfiltrate, and CPU-bound work isolated in a Web
Worker. Two design-level gaps were closed.

- Handlers typed their payloads with TypeScript interfaces. That is a
  compile-time claim about a value arriving over a serialisation boundary — it
  enforces nothing at runtime. Payloads are now parsed with Zod at the
  boundary.
- Nothing limited how often the renderer could call a privileged channel. A
  loop in the renderer opens native dialogs faster than a person can dismiss
  them, which locks the user out of their own window. Now rate limited per
  channel.

## A05 · Security misconfiguration

The category with the most findings, all in the Electron configuration.

| Finding                                                                                                                             | Severity | Status                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No Content-Security-Policy at all.**                                                                                              | High     | Fixed — `default-src 'none'` with an enumerated allowlist, injected at build time. `connect-src 'none'`: the renderer talks to nothing. Development gets a separate, relaxed policy so the shipped one cannot be loosened by accident. |
| **`sandbox: false`** — the renderer ran outside the OS sandbox, so a renderer compromise carried the process's full privileges.     | High     | Fixed — `sandbox: true`. The preload uses only `contextBridge` and `ipcRenderer`, both available to a sandboxed preload. Verified by launching the app.                                                                                |
| No permission handler. A renderer could request camera, microphone, geolocation or notifications and raise a prompt in Aula's name. | Medium   | Fixed — every request and check denied. Requests are logged; checks are not, because Chromium fires several on every launch and logging them would train the reader to ignore the log.                                                 |
| `nodeIntegrationInWorker` and `nodeIntegrationInSubFrames` unset.                                                                   | Low      | Fixed — both explicitly `false`.                                                                                                                                                                                                       |
| `webSecurity` and `allowRunningInsecureContent` relied on defaults.                                                                 | Low      | Fixed — both stated explicitly. A default that can change silently is not a control.                                                                                                                                                   |
| No `X-Content-Type-Options`, `X-Frame-Options` or `Referrer-Policy`.                                                                | Low      | Added via `onHeadersReceived`. Only meaningful for the dev server — `file://` has no headers — which is why the CSP travels in the document.                                                                                           |
| Environment variables read ad hoc and unvalidated.                                                                                  | Low      | Fixed — validated once at startup with Zod; a bad value aborts the launch with a named error.                                                                                                                                          |

## A06 · Vulnerable and outdated components

| Finding                                                                                                                                                                      | Status                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm audit` across 380 packages.                                                                                                                                             | **0 vulnerabilities**                                                                                                                                                                             |
| Every dependency at its latest release as of 2026-08-23. TypeScript held at 6.0.3 deliberately: 7.0.2 is the native port, and absorbing that risk belongs in its own change. | Current                                                                                                                                                                                           |
| Licence exposure. Aula statically links what it ships, so a strong-copyleft runtime dependency would relicense the application itself.                                       | Gated — `npm run audit:licenses` fails the build on GPL/AGPL/LGPL/SSPL/BUSL in the _runtime_ graph. 13 runtime packages, no violation.                                                            |
| Attribution. The two bundled typefaces are OFL-1.1, which requires the licence text to travel with the binary; electron-builder packages only `dist/**`, so it did not.      | Fixed — `THIRD-PARTY-NOTICES.md` is generated from the resolved graph and shipped as an extra resource. Regenerated during `npm run package`, so a new dependency cannot ship without its notice. |

## A07 · Identification and authentication failures

**Not applicable, deliberately.** Aula has no accounts, sessions, passwords or
identity provider. The user is whoever is logged into the machine. Adding
authentication would create a credential store that does not exist today and
could be stolen.

## A08 · Software and data integrity failures

| Finding                                                                                                                                                                                                                                                                                                                                                                                       | Severity | Status                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The renderer fetched fonts from `fonts.googleapis.com` on every launch.** Three failures in one: a remote resource loading into the renderer's context; the application's own About box claiming "no data leaves this machine" while announcing every launch to a third party with the user's IP and user agent; and a packaged desktop application silently losing its typography offline. | High     | Fixed — typefaces are npm dependencies bundled into `dist/assets`. Verified in a browser: **zero requests leave the origin.**                                                                                    |
| No integrity checking on saved project files.                                                                                                                                                                                                                                                                                                                                                 | Low      | Accepted. A malformed or hostile project file is handled by `normaliseConfig`, which validates and clamps every field and is exercised by the harness against deliberately junk input. Signing would need a key. |
| Build supply chain.                                                                                                                                                                                                                                                                                                                                                                           | Low      | `package-lock.json` committed. npm's `allowScripts` gate means install scripts are approved explicitly rather than run implicitly.                                                                               |

## A09 · Security logging and monitoring failures

**Here:** there is no server to monitor and nothing to alert on. What matters is
that a _local_ failure is visible rather than silent — already the repository's
stated rule (`CLAUDE.md §1.4`, "failure is loud").

| Finding                                                                                                                                                            | Status         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| Preload failures are logged by a `preload-error` listener, added after a past incident where a broken bridge silently removed the title bar and every file dialog. | Existing, kept |
| Denied permission requests are logged.                                                                                                                             | Added          |
| Refused IPC payloads return a sentence naming the offending field rather than throwing a stack trace back into the renderer.                                       | Added          |
| Every user action is recorded in the in-app activity log.                                                                                                          | Existing       |

## A10 · Server-side request forgery

**Here:** the main process makes exactly one outbound request, to the model
server, on the renderer's behalf. That is the SSRF shape, even without a server.

| Finding                                                                                                                                                                                                                                                       | Severity                                             | Status                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The endpoint was the hard-coded string `http://localhost:11434`. Making it configurable — which the environment work required — would have turned it into a genuine SSRF: a `.env` edit could point the relay at any host and forward institution data there. | Medium (introduced and closed in the same milestone) | The URL is validated at parse time and **must resolve to a loopback host**; a remote address aborts startup. The renderer cannot influence it at all — it is read from the environment once, in the main process. |
| No cap on a streamed response. A model that never emits a stop token would stream until the renderer ran out of memory.                                                                                                                                       | Low                                                  | Fixed — 512 kB ceiling, then the request is aborted and the user told why.                                                                                                                                        |
| No cap on concurrent chats.                                                                                                                                                                                                                                   | Low                                                  | Fixed — four, so abandoned `AbortController`s cannot accumulate.                                                                                                                                                  |

---

## Summary

| Severity              | Count                                               |
| --------------------- | --------------------------------------------------- |
| High                  | 3 — no CSP, unsandboxed renderer, remote font fetch |
| Medium                | 5                                                   |
| Low                   | 9                                                   |
| Accepted with reasons | 3                                                   |

Everything at High and Medium is fixed. The three accepted items are recorded
rather than quietly omitted: unencrypted local data, unsigned project files, and
no authentication. Each would require a key or a credential store that does not
exist today, and each would add a theft target to an application that currently
has none.

## What is covered by tests

`apps/desktop/electron/ipc/contracts.test.ts` and `rate-limit.test.ts` — 30
cases. Every one is a payload the previous unvalidated handlers would have
accepted and acted on: path traversal in a save name, a Windows reserved device
name, a null byte, shell metacharacters in a model name, an unknown message
role, an oversized file, an empty filter list that would open a picker for
anything.

## What is not covered

- No automated Electron end-to-end test drives the real IPC surface. The
  handlers were exercised by hand; their validators are tested in isolation.
- No dependency-confusion or typosquat check beyond the committed lockfile.
- The CSP is asserted by inspecting the built HTML, not by a test.

Recorded as follow-ups rather than claimed as done.
