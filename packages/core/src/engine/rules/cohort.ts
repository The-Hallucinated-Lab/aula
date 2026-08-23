/**
 * What a student cohort experiences across a week.
 *
 * Gaps, day-part balance, protected slots, night limits for first years, and
 * the elective-group clash freedom that makes a pathway choosable at all.
 */

import type { RuleKey } from '../../data/constraints/types'
import { type RuleImpl } from '../context'
import { consecutiveRun, num, overlaps, slotAtOrAfter, str } from '../context'
import { coversAny, longestRun, ok } from './kit'

export const CohortRules: Partial<Record<RuleKey, RuleImpl>> = {
  cohortMaxConsecutive: {
    check: (c, occ, _ctx, p) => {
      const kind = str(p, 'kind')
      if (kind && c.course.kind !== kind) return ok
      const cap = num(p, 'maxConsecutive', 4)
      const existing = kind
        ? occ.cohortOnDay(c.cohort.id, c.day).filter(s => s.courseId === c.course.id)
        : occ.cohortOnDay(c.cohort.id, c.day)
      const run = consecutiveRun(existing, c.slot, c.length)
      return run > cap ? `${c.cohort.name} would sit ${run} consecutive hours (cap ${cap})` : ok
    },
  },

  cohortLunch: {
    check: (c, occ, ctx) => {
      const lunch = ctx.grid.lunchSlots
      if (lunch.length === 0) return ok
      const taken = new Set<number>()
      for (const s of occ.cohortOnDay(c.cohort.id, c.day)) {
        for (let k = 0; k < s.length; k++) taken.add(s.slot + k)
      }
      for (let k = 0; k < c.length; k++) taken.add(c.slot + k)
      return lunch.every(s => taken.has(s))
        ? `${c.cohort.name} would lose the protected lunch break`
        : ok
    },
  },

  eveningProgramStart: {
    check: (c, _occ, ctx, p) => {
      if (c.cohort.mode !== 'evening' && !c.course.eveningOnly) return ok
      const first = slotAtOrAfter(ctx.grid, str(p, 'earliest', '17:30'), ctx.grid.eveningFrom)
      return c.slot < first
        ? `Evening programme cannot start before ${str(p, 'earliest', '17:30')}`
        : ok
    },
  },

  protectedCohortSlots: {
    check: c =>
      coversAny(c.day, c.slot, c.length, c.cohort.protectedSlots)
        ? `${c.cohort.name} has a protected block in this slot`
        : ok,
  },

  firstYearNoNight: {
    check: (c, _occ, ctx) =>
      c.cohort.year === 1 && c.slot >= ctx.grid.eveningFrom
        ? 'First-year cohorts are not scheduled into night slots'
        : ok,
  },

  lateNightCap: {
    check: (c, occ, ctx, p) => {
      const from = slotAtOrAfter(ctx.grid, str(p, 'after', '21:00'), ctx.grid.slots)
      if (c.slot + c.length <= from) return ok
      const cap = num(p, 'maxPerWeek', 2)
      return occ.cohortLateCount(c.cohort.id) >= cap
        ? `${c.cohort.name} already has ${cap} late-night sessions this week`
        : ok
    },
  },

  earlyStartStreakCap: {
    cost: (c, occ, ctx, p) => {
      if (c.slot >= ctx.grid.earlyUntil) return 0
      const cap = num(p, 'maxDays', 3)
      const best = longestRun([...occ.cohortEarlyDaySet(c.cohort.id), c.day])
      return best > cap ? 1 : 0
    },
  },

  cohortMaxGap: {
    cost: (c, occ, _ctx, p) => {
      const cap = num(p, 'maxGap', 3)
      const same = occ.cohortOnDay(c.cohort.id, c.day)
      if (same.length === 0) return 0
      const slots = [...same.map(s => s.slot), c.slot]
      const ends = [...same.map(s => s.slot + s.length), c.slot + c.length]
      const span = Math.max(...ends) - Math.min(...slots)
      const taught = same.reduce((a, s) => a + s.length, 0) + c.length
      const gap = span - taught
      return gap > cap ? Math.min(1, (gap - cap) / 4) : 0
    },
  },

  cohortMinGap: {
    cost: (c, occ) => {
      const same = occ.cohortOnDay(c.cohort.id, c.day)
      if (c.course.kind !== 'Lab' && c.course.kind !== 'Studio') return 0
      const adjacent = same.some(s => s.slot + s.length === c.slot || c.slot + c.length === s.slot)
      return adjacent ? 0.4 : 0
    },
  },

  cohortDayPartBalance: {
    cost: (c, occ, ctx) => {
      const all = ctx.grid.days.flatMap(d => occ.cohortOnDay(c.cohort.id, d))
      if (all.length < 4) return 0
      const morning = all.filter(s => s.slot < ctx.grid.slots / 2).length
      const share = morning / all.length
      const adding = c.slot < ctx.grid.slots / 2 ? 1 : 0
      const nextShare = (morning + adding) / (all.length + 1)
      // cost rises as the cohort's week collapses into one half of the day
      return Math.max(0, Math.abs(nextShare - 0.5) - Math.abs(share - 0.5)) * 2
    },
  },

  clusterCohortDays: {
    cost: (c, occ, ctx) => {
      if (c.cohort.mode === 'day') return 0
      const days = occ.staffTeachingDays(c.cohort.id)
      void days
      const used = new Set(ctx.grid.days.filter(d => occ.cohortOnDay(c.cohort.id, d).length > 0))
      return used.size === 0 || used.has(c.day) ? 0 : 0.8
    },
  },

  electiveGroupClashFree: {
    check: (c, occ, ctx) => {
      const group = c.course.electiveGroup
      if (!group) return ok
      for (let k = 0; k < c.length; k++) {
        const clash = occ.cohortOnDay(c.cohort.id, c.day).some(s => {
          const other = ctx.courseById.get(s.courseId)
          return (
            other?.electiveGroup === group &&
            other.id !== c.course.id &&
            overlaps(s.slot, s.length, c.slot, c.length)
          )
        })
        if (clash) return `Elective group ${group} already meets in this slot`
      }
      return ok
    },
  },
}
