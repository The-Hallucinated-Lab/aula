/**
 * Evaluator for user-defined constraints.
 *
 * Same contract as the catalogue rules: a `check` returns a message to refuse a
 * placement, a `cost` returns 0..1 to price a soft preference. The solver runs
 * these in the same loop, so a custom rule is exactly as binding as a
 * catalogue rule of the same hardness.
 */

import type { CustomConstraint } from '../data/constraints/custom'
import type { Candidate, EngineCtx } from './context'
import { consecutiveRun, overlaps } from './context'
import type { Occupancy } from './occupancy'

/** Does this candidate fall inside the constraint's scope? */
function inScope(c: Candidate, ctx: EngineCtx, k: CustomConstraint): boolean {
  const { kind, id } = k.scope
  switch (kind) {
    case 'all':
      return true
    case 'cohort':
      return c.cohort.id === id
    case 'staff':
      return c.staff.id === id
    case 'course':
      return c.course.id === id
    case 'room':
      return c.room?.id === id
    case 'department': {
      const dept = ctx.inst.departments.find(d => d.id === id || d.code === id)
      if (!dept) return false
      return (
        c.cohort.deptId === dept.id || c.course.deptId === dept.id || c.staff.deptId === dept.id
      )
    }
    default:
      return false
  }
}

const num = (k: CustomConstraint, key: string, d = 0) =>
  typeof k.params[key] === 'number' ? (k.params[key] as number) : d

const str = (k: CustomConstraint, key: string, d = '') =>
  typeof k.params[key] === 'string' ? (k.params[key] as string) : d

/** Sessions already placed for whatever this rule is scoped to, on one day. */
function scopedOnDay(c: Candidate, occ: Occupancy, k: CustomConstraint, day: number) {
  switch (k.scope.kind) {
    case 'staff':
      return occ.staffOnDay(c.staff.id, day)
    case 'cohort':
      return occ.cohortOnDay(c.cohort.id, day)
    default:
      // department / all: approximate with the cohort's own day, which is the
      // series a per-day cap is actually about
      return occ.cohortOnDay(c.cohort.id, day)
  }
}

/**
 * Returns a refusal message when the placement breaks the rule, else null.
 * Used for hard custom rules and, via `customCost`, for soft ones.
 */
export function customViolation(
  k: CustomConstraint,
  c: Candidate,
  occ: Occupancy,
  ctx: EngineCtx,
): string | null {
  if (!k.enabled || !inScope(c, ctx, k)) return null

  switch (k.template) {
    case 'blockSlot': {
      const day = num(k, 'day', -1)
      const slot = num(k, 'slot', -1)
      if (day < 0 || slot < 0 || c.day !== day) return null
      return overlaps(c.slot, c.length, slot, 1) ? `${k.id}: reserved slot` : null
    }

    case 'dayOff': {
      const day = num(k, 'day', -1)
      return c.day === day ? `${k.id}: protected day` : null
    }

    case 'noEarlierThan': {
      const slot = num(k, 'slot', 0)
      return c.slot < slot ? `${k.id}: starts too early` : null
    }

    case 'noLaterThan': {
      const slot = num(k, 'slot', 99)
      return c.slot + c.length - 1 > slot ? `${k.id}: finishes too late` : null
    }

    case 'maxPerDay': {
      const cap = num(k, 'hours', 99)
      const existing = scopedOnDay(c, occ, k, c.day)
      const hours = existing.reduce((a, s) => a + s.length, 0) + c.length
      return hours > cap ? `${k.id}: would exceed ${cap} hours that day` : null
    }

    case 'maxConsecutive': {
      const cap = num(k, 'hours', 99)
      const run = consecutiveRun(scopedOnDay(c, occ, k, c.day), c.slot, c.length)
      return run > cap ? `${k.id}: ${run} consecutive hours (cap ${cap})` : null
    }

    case 'requireBuilding': {
      const want = str(k, 'buildingId')
      if (!want || !c.room) return null
      return c.room.buildingId === want ? null : `${k.id}: must use the required building`
    }

    case 'avoidBuilding': {
      const avoid = str(k, 'buildingId')
      if (!avoid || !c.room) return null
      return c.room.buildingId === avoid ? `${k.id}: building is excluded` : null
    }

    default:
      return null
  }
}

/** Weighted penalty for a soft custom rule; 0 when satisfied. */
export function customCost(
  k: CustomConstraint,
  c: Candidate,
  occ: Occupancy,
  ctx: EngineCtx,
): number {
  return customViolation(k, c, occ, ctx) ? k.weight : 0
}
