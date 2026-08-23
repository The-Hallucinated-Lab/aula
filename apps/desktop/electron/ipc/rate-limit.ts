/**
 * Per-channel rate limiting for IPC.
 *
 * Aula has no server and no attacker on the network, so this is not about
 * abuse from outside. It is about blast radius: if a bug or injected script in
 * the renderer starts calling `file:save` in a loop, an unthrottled main
 * process will open native dialogs faster than a person can dismiss them and
 * the window becomes unusable. A limiter turns that from a lockout into a
 * refused call with a message.
 *
 * A fixed window is enough here. The limits are far above anything a human
 * generates and far below anything a loop does, so the precision a sliding
 * window would buy has nothing to distinguish.
 */

interface Window {
  windowStartedAt: number
  count: number
}

export interface Limit {
  /** how many calls are allowed per window */
  max: number
  /** window length in milliseconds */
  windowMs: number
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>()
  private readonly now: () => number

  /** `now` is injectable so a test can drive the clock rather than sleep. */
  constructor(now: () => number = Date.now) {
    this.now = now
  }

  /**
   * Record a call and say whether it is allowed.
   *
   * Returns `null` when allowed, or a sentence naming the channel and the
   * limit when not — the caller passes that straight back to the renderer,
   * which is a far better outcome than a silent drop.
   */
  check(channel: string, limit: Limit): string | null {
    const at = this.now()
    const current = this.windows.get(channel)

    if (!current || at - current.windowStartedAt >= limit.windowMs) {
      this.windows.set(channel, { windowStartedAt: at, count: 1 })
      return null
    }

    current.count += 1
    if (current.count <= limit.max) return null

    const seconds = Math.ceil(limit.windowMs / 1000)
    return `Too many ${channel} requests — the limit is ${limit.max} every ${seconds}s. This usually means the interface is stuck in a loop; reopen the window.`
  }
}

/**
 * Ceilings per channel.
 *
 * Chosen from what the interface can actually produce. Exporting every view of
 * a timetable in quick succession is a handful of saves; a person typing into
 * the assistant produces a chat every few seconds at most.
 */
export const LIMITS: Record<string, Limit> = {
  'file:save': { max: 20, windowMs: 60_000 },
  'file:open': { max: 20, windowMs: 60_000 },
  'assistant:probe': { max: 30, windowMs: 60_000 },
  'assistant:chat': { max: 40, windowMs: 60_000 },
}
