/**
 * Crash recovery.
 *
 * PM2 and systemd have no desktop equivalent, and inventing one would be
 * theatre — nothing supervises a program a person double-clicked. What the
 * main process *can* do is notice when the renderer dies underneath it and put
 * it back, which is the same job at the only scale that exists here.
 *
 * Three ways the window can be lost, each needing a different answer:
 *
 *   render-process-gone   the renderer crashed or was killed. The main process
 *                         is fine and the window is blank. Reload it.
 *   child-process-gone    the GPU or a utility process died. Chromium usually
 *                         recovers on its own; a repeated GPU crash means the
 *                         driver, and the answer is to stop using it.
 *   unresponsive          the renderer is alive but not pumping its event
 *                         loop. It may still come back, so wait before acting.
 *
 * Two rules run through all of it. Recovery is bounded — a reload loop is
 * worse than a stopped application, because it destroys the evidence. And a
 * crash is never silent: the user is told what happened and what was lost.
 *
 * What is *not* lost is the project. The store writes configuration and
 * constraint state to `localStorage` on every change, so a reload comes back
 * where it was. The solved schedule does not survive, deliberately — it is
 * re-derived rather than restored, which is what keeps a recovered session
 * from showing a timetable the current rules would refuse to produce.
 */

import { app, BrowserWindow, dialog } from 'electron'
import type { WebContents } from 'electron'

/** How many automatic reloads before we stop and ask. */
const MAX_AUTOMATIC_RECOVERIES = 3

/**
 * The window over which those recoveries are counted.
 *
 * Without it, an application left open for a week accumulates three unrelated
 * crashes and then refuses to recover from the fourth. Crashes far enough
 * apart are separate incidents, not a loop.
 */
const RECOVERY_WINDOW_MS = 10 * 60 * 1000

/**
 * How long a renderer may be unresponsive before it is treated as hung.
 *
 * A large institution can block the UI thread briefly during a materialise, so
 * this is deliberately longer than any legitimate stall. The solver itself runs
 * in a worker and cannot cause one.
 */
const UNRESPONSIVE_GRACE_MS = 20_000

export interface RecoveryHooks {
  /** Recreate the window from scratch, when reloading is not enough. */
  recreateWindow: () => void
  /** Report a crash to telemetry, if the user has turned it on. */
  report?: (event: { kind: string; reason: string; exitCode?: number }) => void
}

interface Attempt {
  at: number
}

let attempts: Attempt[] = []

function recentAttempts(now: number): number {
  attempts = attempts.filter(a => now - a.at < RECOVERY_WINDOW_MS)
  return attempts.length
}

/**
 * Should we try again, or stop and tell the user?
 *
 * Recording the attempt before answering is deliberate: the count has to
 * include the recovery we are about to make, or the last one is never bounded.
 */
function mayRecover(): boolean {
  const now = Date.now()
  const already = recentAttempts(now)
  attempts.push({ at: now })
  return already < MAX_AUTOMATIC_RECOVERIES
}

async function askWhatToDo(window: BrowserWindow | null, detail: string): Promise<void> {
  const options = {
    type: 'error' as const,
    title: 'Aula stopped responding',
    message: 'The window closed unexpectedly more than once.',
    detail:
      `${detail}\n\n` +
      'Your institution setup and constraint settings are saved and will be ' +
      'there when Aula reopens. The generated timetable is not saved — it is ' +
      'produced again from the same figures, which takes a couple of seconds.\n\n' +
      'If this keeps happening, Help ▸ About names the Electron and Chromium ' +
      'versions, which is what a bug report needs.',
    buttons: ['Restart Aula', 'Close Aula'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  }

  const { response } = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options)

  if (response === 0) {
    attempts = []
    app.relaunch()
  }
  app.exit(0)
}

/**
 * Watch one window's renderer.
 *
 * Called for every window created, including one created by recovery — a
 * replacement can crash too, and the attempt counter is shared so it does not
 * get a fresh budget.
 */
export function superviseWindow(window: BrowserWindow, hooks: RecoveryHooks) {
  const contents: WebContents = window.webContents

  contents.on('render-process-gone', (_event, details) => {
    const reason = details.reason
    console.error(`[Aula] renderer gone: ${reason} (exit ${details.exitCode})`)
    hooks.report?.({ kind: 'render-process-gone', reason, exitCode: details.exitCode })

    // `clean-exit` is the renderer closing on purpose; there is nothing to
    // recover from, and reloading would fight the shutdown.
    if (reason === 'clean-exit') return

    if (!mayRecover()) {
      void askWhatToDo(
        window.isDestroyed() ? null : window,
        `The display process stopped ${MAX_AUTOMATIC_RECOVERIES + 1} times (${reason}).`,
      )
      return
    }

    if (window.isDestroyed()) hooks.recreateWindow()
    else contents.reload()
  })

  contents.on('unresponsive', () => {
    console.warn('[Aula] renderer unresponsive')
    const timer = setTimeout(() => {
      if (window.isDestroyed()) return
      console.error('[Aula] renderer did not recover — forcing a reload')
      hooks.report?.({ kind: 'unresponsive', reason: 'no response within grace period' })
      if (mayRecover()) contents.reload()
      else void askWhatToDo(window, 'The window stopped responding and did not recover.')
    }, UNRESPONSIVE_GRACE_MS)

    // A renderer that comes back on its own is not a crash. Clearing the timer
    // is what stops a long materialise from being treated as one.
    contents.once('responsive', () => {
      clearTimeout(timer)
      console.warn('[Aula] renderer responsive again')
    })
    window.once('closed', () => clearTimeout(timer))
  })
}

/**
 * Watch the processes that are not the renderer.
 *
 * A dead GPU process is not fatal — Chromium falls back to software rendering.
 * It is worth logging, because a driver that crashes repeatedly is the actual
 * problem and the symptom a user reports is "Aula is slow".
 */
export function superviseChildProcesses(hooks: RecoveryHooks) {
  let gpuCrashes = 0

  app.on('child-process-gone', (_event, details) => {
    console.error(
      `[Aula] ${details.type} process gone: ${details.reason}` +
        (details.exitCode === undefined ? '' : ` (exit ${details.exitCode})`),
    )
    hooks.report?.({
      kind: `child-process-gone:${details.type}`,
      reason: details.reason,
      ...(details.exitCode === undefined ? {} : { exitCode: details.exitCode }),
    })

    if (details.type !== 'GPU' || details.reason === 'clean-exit') return

    gpuCrashes += 1
    if (gpuCrashes === 3) {
      // Not a restart: relaunching into the same driver reproduces the same
      // crash. Disabling acceleration is the fix, and the user has to know it
      // was applied because it changes how the application looks.
      console.error('[Aula] GPU process crashed three times — disabling acceleration')
      app.disableHardwareAcceleration()
      const window = BrowserWindow.getAllWindows()[0] ?? null
      const options = {
        type: 'warning' as const,
        title: 'Graphics acceleration turned off',
        message: 'Aula turned off graphics acceleration.',
        detail:
          'The graphics driver stopped three times. Aula will keep working and ' +
          'may render a little more slowly. Updating the display driver usually ' +
          'resolves this.',
        buttons: ['Continue'],
        noLink: true,
      }
      void (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options))
    }
  })
}

/**
 * Last resort for the main process itself.
 *
 * An unhandled rejection in main used to be a warning in a console nobody
 * reads, leaving the application running in a state its author never
 * considered. Logging is the minimum; the process is left alive because the
 * window is usually still perfectly usable and killing it would lose work for
 * a failure that may not touch the user at all.
 */
export function reportUnhandledFailures(hooks: RecoveryHooks) {
  process.on('unhandledRejection', (reason: unknown) => {
    const message = reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)
    console.error('[Aula] unhandled rejection in the main process:', message)
    hooks.report?.({ kind: 'unhandled-rejection', reason: message })
  })

  process.on('uncaughtException', (error: Error) => {
    console.error('[Aula] uncaught exception in the main process:', error.stack ?? error.message)
    hooks.report?.({ kind: 'uncaught-exception', reason: error.stack ?? error.message })
  })
}

/** Exposed for tests: forget the recovery history. */
export function resetRecoveryState() {
  attempts = []
}
