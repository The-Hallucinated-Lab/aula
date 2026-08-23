/**
 * Telemetry.
 *
 * Aula's About box says no data leaves this machine, and the licence audit,
 * the CSP and the loopback guard on the assistant all exist to keep that true.
 * Bolting an error reporter onto that would make the application a liar, so
 * this is built to keep the sentence honest rather than to quietly qualify it.
 *
 * Four things make that work.
 *
 *   Off unless configured. With no `AULA_TELEMETRY_DSN` there is no reporter,
 *   no SDK in memory, and no chunk loaded. The default build of Aula cannot
 *   send anything, because the code that would is never fetched.
 *
 *   Off unless consented, even when configured. A DSN set by an administrator
 *   is permission to *ask*; it is not the answer. The user is asked once, the
 *   answer is stored, and "no" is honoured until they change it.
 *
 *   Scrubbed at the source. What goes out is a stack trace and a version
 *   string. Never a course, a room, a person, a file path or a project. The
 *   scrubber below is deny-by-default: it copies the fields it recognises
 *   rather than removing the ones it fears.
 *
 *   Loaded lazily. `@sentry/electron` is a dynamic import, so Vite splits it
 *   into its own chunk: `main.js` is 107 kB and contains no reference to
 *   Sentry at all. The chunk is 393 kB and does ship in the installer — the
 *   DSN is runtime configuration, so the code has to be present to be
 *   reachable — but it is never read into memory unless a DSN is set and
 *   consent given. Disk, not attack surface.
 *
 * The interface is a port. The Sentry adapter is one implementation and there
 * is a no-op that is used everywhere else; a site that wants a self-hosted
 * GlitchTip or nothing at all changes a DSN, not this file.
 */

import { app } from 'electron'
import { env } from '../config/env'

export interface TelemetryEvent {
  kind: string
  reason: string
  exitCode?: number
}

export interface Telemetry {
  /** Whether anything is actually being sent right now. */
  readonly active: boolean
  /** Record a crash or an unhandled failure. */
  capture(event: TelemetryEvent): void
  /** Flush and shut down, before the process exits. */
  close(): Promise<void>
}

/** The implementation used whenever telemetry is off, which is the default. */
const NO_OP: Telemetry = {
  active: false,
  capture: () => undefined,
  close: async () => undefined,
}

/**
 * The whole payload.
 *
 * Deny-by-default: this function *constructs* what is sent from a known list,
 * so a field added to `TelemetryEvent` later is absent from the wire until
 * somebody adds it here on purpose. A scrubber that deletes known-bad keys
 * fails open the moment a new one appears.
 */
function safePayload(event: TelemetryEvent) {
  return {
    kind: event.kind,
    // A reason is a Chromium enum ("crashed", "oom") or a stack trace from our
    // own code. Truncated because a stack is all that is wanted and a long one
    // usually means a message was concatenated into it.
    reason: event.reason.slice(0, 2000),
    exitCode: event.exitCode,
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
    arch: process.arch,
  }
}

let instance: Telemetry = NO_OP

export const telemetry = (): Telemetry => instance

/**
 * Bring telemetry up, if it is both configured and consented to.
 *
 * `hasConsent` is supplied by the caller rather than read here, because
 * consent is a decision the application owns — it is stored with the user's
 * other preferences and revocable from the same place.
 */
export async function initTelemetry(hasConsent: () => boolean): Promise<Telemetry> {
  if (env.AULA_TELEMETRY_DSN === '') return NO_OP
  if (!hasConsent()) {
    console.warn('[Aula] telemetry is configured but has not been consented to — staying off')
    return NO_OP
  }

  try {
    // Dynamic, so the SDK is a separate chunk that a default build never loads.
    const Sentry = await import('@sentry/electron/main')

    Sentry.init({
      dsn: env.AULA_TELEMETRY_DSN,
      release: `aula@${app.getVersion()}`,
      environment: env.VITE_DEV_SERVER_URL === undefined ? 'production' : 'development',

      // No performance traces and no profiling. Both are usage analytics, and
      // that is not what consent was asked for.
      tracesSampleRate: 0,
      enableRendererProfiling: false,

      // The single most important line in this file. `attachScreenshot` would
      // send an image of the window with every event — which, in this
      // application, is a named institution's timetable.
      attachScreenshot: false,

      // The SDK collects a great deal by default. Everything below is a
      // deliberate refusal, and the comment says what it would otherwise send.
      sendDefaultPii: false,
      attachStacktrace: true,
      // Breadcrumbs record navigation, clicks and console output — which on
      // this application means room names, staff names and course codes.
      maxBreadcrumbs: 0,

      /**
       * The final gate.
       *
       * Even with everything above, the SDK enriches an event with the server
       * name (the machine's hostname, often a person's name), the username,
       * and the full command line. This strips all of it and replaces the
       * event's payload with the one `safePayload` built.
       */
      beforeSend(sentryEvent) {
        delete sentryEvent.server_name
        delete sentryEvent.user
        delete sentryEvent.request
        if (sentryEvent.contexts) {
          delete sentryEvent.contexts.device
          delete sentryEvent.contexts.culture
        }
        sentryEvent.breadcrumbs = []
        return sentryEvent
      },

      beforeBreadcrumb: () => null,
    })

    instance = {
      active: true,
      capture(event) {
        Sentry.captureEvent({
          message: `${event.kind}: ${event.reason.slice(0, 120)}`,
          level: 'error',
          extra: safePayload(event),
        })
      },
      async close() {
        await Sentry.close(2000)
        instance = NO_OP
      },
    }

    console.warn('[Aula] telemetry is on — crash reports only, no institutional data')
    return instance
  } catch (error) {
    // A reporter that cannot start must never stop the application. It is the
    // least important thing in the process.
    console.warn(
      '[Aula] telemetry could not start; continuing without it:',
      error instanceof Error ? error.message : error,
    )
    return NO_OP
  }
}

/** What the consent prompt should say, kept next to what it authorises. */
export const CONSENT_COPY = {
  title: 'Send crash reports?',
  message: 'Aula can report crashes to help fix them.',
  detail:
    'A report contains the error and the versions of Aula, Windows and ' +
    'Chromium. It never contains your timetable, your staff, your rooms, ' +
    'your courses, your file names or anything typed into Aula.\n\n' +
    'Aula works exactly the same either way, and you can change this later.',
  allow: 'Send crash reports',
  deny: 'No thanks',
} as const
