/**
 * Shared vocabulary for the rule modules.
 *
 * The registry is split by subject — one file per constraint family — and
 * these are the pieces more than one of them needs. Nothing here decides
 * anything; they are the words the rules are written in.
 */

import type { RoomFeature } from '../../data/model'
import type { Candidate } from '../context'

/** A rule that found nothing wrong. Reads better than a bare `null` at 124 sites. */
const ok = null

/**
 * Longest run of consecutive day indices.
 *
 * Two soft rules — a staff member's consecutive teaching days and a cohort's
 * consecutive early starts — asked the same question with the same hand-rolled
 * loop. The input is not assumed sorted; both callers append today's day to a
 * set, which has no order.
 */
const earliestDay = (days: readonly number[]): number | undefined =>
  days.length === 0 ? undefined : Math.min(...days)

function longestRun(days: readonly number[]): number {
  const sorted = days.toSorted((a, b) => a - b)
  let best = 0
  let run = 0
  let previous: number | undefined
  for (const day of sorted) {
    if (previous === undefined || day !== previous + 1) run = 1
    else run += 1
    best = Math.max(best, run)
    previous = day
  }
  return best
}

/** Does this course actually ask for the feature this constraint governs? */
function needsFeature(c: Candidate, feature: string): boolean {
  return c.course.requires.includes(feature as RoomFeature)
}

function hasFeature(c: Candidate, feature: string): boolean {
  return !!c.room && c.room.features.includes(feature as RoomFeature)
}

const key = (day: number, slot: number) => `${day}:${slot}`

function coversAny(day: number, slot: number, length: number, set: string[]): boolean {
  for (let k = 0; k < length; k++) if (set.includes(key(day, slot + k))) return true
  return false
}

/* ================================================================== *
 * Registry
 * ================================================================== */

/**
 * The earliest day across several day sets, without materialising them.
 *
 * The callers are soft-cost functions, which run once per candidate placement —
 * on the default institution that is hundreds of thousands of calls per solve.
 * Spreading each set into an array to concatenate them allocated one array per
 * course per call and threw all of it away to read a single minimum.
 */
export function earliestAcross(sets: Iterable<Iterable<number>>): number | undefined {
  let best: number | undefined
  for (const set of sets) {
    for (const day of set) {
      if (best === undefined || day < best) best = day
    }
  }
  return best
}

export {
  coversAny,
  earliestAcross as earliestDayAcross,
  earliestDay,
  hasFeature,
  key,
  longestRun,
  needsFeature,
  ok,
}
