/**
 * Staff workload and the limits an employer is held to.
 *
 * Weekly and daily ceilings, overnight rest, lunch, sabbatical, contractual
 * campus days. Ceilings are per designation rather than a flat figure, so a
 * professor and a teaching assistant are not held to the same load.
 */

import type { RuleKey } from '../../data/constraints/types'
import { type RuleImpl } from '../context'
import { consecutiveRun, num, slotEndMinutes } from '../context'
import { coversAny, longestRun, ok } from './kit'

export const StaffWorkloadRules: Partial<Record<RuleKey, RuleImpl>> = {
  facultyMaxWeekly: {
    check: (c, occ, _ctx, p) => {
      const cap = Math.min(num(p, 'maxHours', 18), c.staff.maxPerWeek)
      return occ.staffWeekHours(c.staff.id) + c.length > cap
        ? `${c.staff.name} would exceed ${cap} teaching hours this week`
        : ok
    },
  },

  facultyMaxPerDay: {
    check: (c, occ) =>
      occ.staffDayHours(c.staff.id, c.day) + c.length > c.staff.maxPerDay
        ? `${c.staff.name} would exceed ${c.staff.maxPerDay} hours on this day`
        : ok,
  },

  adjunctMaxWeekly: {
    check: (c, occ, _ctx, p) => {
      if (c.staff.rank !== 'Adjunct') return ok
      const cap = num(p, 'maxHours', 9)
      return occ.staffWeekHours(c.staff.id) + c.length > cap
        ? `Adjunct ${c.staff.name} would exceed the ${cap} h part-time limit`
        : ok
    },
  },

  taMaxWeekly: {
    check: (c, occ, _ctx, p) => {
      if (c.staff.rank !== 'Teaching Assistant') return ok
      const cap = num(p, 'maxHours', 12)
      return occ.staffWeekHours(c.staff.id) + c.length > cap
        ? `TA ${c.staff.name} would exceed the ${cap} h union limit`
        : ok
    },
  },

  facultyBlockedDays: {
    check: c =>
      c.staff.blockedDays.includes(c.day)
        ? `${c.staff.name} has a protected research/administrative day`
        : ok,
  },

  facultyBlockedSlots: {
    check: c =>
      coversAny(c.day, c.slot, c.length, c.staff.blockedSlots)
        ? `${c.staff.name} is unavailable in this slot`
        : ok,
  },

  visitingCampusDays: {
    check: c =>
      c.staff.campusDays.length > 0 && !c.staff.campusDays.includes(c.day)
        ? `${c.staff.name} is not on campus this day`
        : ok,
  },

  facultyQualified: {
    check: c => {
      if (!c.staff.subjects.includes(c.course.id)) {
        return `${c.staff.name} is not qualified for ${c.course.code}`
      }
      /* A tutor engaged for small groups is not qualified for a 200-seat
         combined lecture, whatever their subject expertise says. Programme
         eligibility and session-kind authorisation are already resolved into
         `subjects` by the generator; headcount cannot be, because it belongs to
         the cohort rather than the course. */
      const cap = c.staff.maxHeadcount
      return cap > 0 && c.headcount > cap
        ? `${c.staff.name} takes groups of up to ${cap}; this one is ${c.headcount}`
        : ok
    },
  },

  facultyMinRest: {
    check: (c, occ, ctx, p) => {
      const restMinutes = num(p, 'restHours', 12) * 60
      const dayIdx = ctx.grid.days.indexOf(c.day)
      if (dayIdx < 0) return ok

      const start = ctx.grid.starts[c.slot]
      if (start === undefined) return ok
      const end = slotEndMinutes(ctx.grid, c.slot, c.length)

      const prevDay = ctx.grid.days[dayIdx - 1]
      if (prevDay !== undefined) {
        for (const s of occ.staffOnDay(c.staff.id, prevDay)) {
          const prevEnd = slotEndMinutes(ctx.grid, s.slot, s.length)
          if (start + 24 * 60 - prevEnd < restMinutes) {
            return `${c.staff.name} would get under ${num(p, 'restHours', 12)} h rest after the previous evening`
          }
        }
      }
      const nextDay = ctx.grid.days[dayIdx + 1]
      if (nextDay !== undefined) {
        for (const s of occ.staffOnDay(c.staff.id, nextDay)) {
          const nextStart = ctx.grid.starts[s.slot]
          if (nextStart !== undefined && nextStart + 24 * 60 - end < restMinutes) {
            return `${c.staff.name} would get under ${num(p, 'restHours', 12)} h rest before the next morning`
          }
        }
      }
      return ok
    },
  },

  facultyMaxConsecutive: {
    check: (c, occ, _ctx, p) => {
      const policy = num(p, 'maxConsecutive', 3)
      // a personal limit only ever tightens the institutional one
      const personal = c.staff.maxConsecutive
      const cap = personal > 0 ? Math.min(policy, personal) : policy
      const run = consecutiveRun(occ.staffOnDay(c.staff.id, c.day), c.slot, c.length)
      return run > cap ? `${c.staff.name} would teach ${run} hours back-to-back (cap ${cap})` : ok
    },
  },

  /*
   * C017 reads: "Instructors must be granted a guaranteed lunch break **if
   * teaching across the midday block**." The qualifier is the whole rule. This
   * previously protected the midday slots for everyone who taught at all that
   * day, including someone whose entire day ended before lunch began — wider
   * than the constraint it implements, and, on a two-shift grid where the
   * boundary sits at midday, the single largest source of refusals.
   *
   * Someone teaching only one side of the break takes lunch on the other side
   * by construction. Someone spanning it does not, and is the person C017 is
   * about.
   */
  facultyLunch: {
    check: (c, occ, ctx) => {
      const lunch = ctx.grid.lunchSlots
      if (lunch.length === 0) return ok

      const taken = new Set<number>()
      for (const s of occ.staffOnDay(c.staff.id, c.day)) {
        for (let k = 0; k < s.length; k++) taken.add(s.slot + k)
      }
      for (let k = 0; k < c.length; k++) taken.add(c.slot + k)

      const first = lunch[0]
      const last = lunch.at(-1)
      if (first === undefined || last === undefined) return ok
      let before = false
      let after = false
      for (const s of taken) {
        if (s < first) before = true
        else if (s > last) after = true
      }
      if (!before || !after) return ok

      return lunch.every(s => taken.has(s))
        ? `${c.staff.name} teaches either side of the midday block and would lose the protected lunch break`
        : ok
    },
  },

  facultyAccessibleRoom: {
    check: (c, _occ, ctx) => {
      if (!c.staff.needsAccessibleRoom || !c.room) return ok
      const b = ctx.buildingById.get(c.room.buildingId)
      const stepFree =
        c.room.features.includes('wheelchairAccess') ||
        c.room.floor === 0 ||
        c.room.floor === 1 ||
        !!b?.hasElevator
      return stepFree && b?.accessible !== false
        ? ok
        : `${c.room.name} does not meet ${c.staff.name}'s access accommodation`
    },
  },

  labSupervisionCap: {
    check: (c, occ, _ctx, p) => {
      if (c.course.kind !== 'Lab') return ok
      const cap = num(p, 'maxLabHours', 8)
      return occ.staffLabWeekHours(c.staff.id) + c.length > cap
        ? `${c.staff.name} would exceed ${cap} h of lab supervision`
        : ok
    },
  },

  newFacultyLoad: {
    check: (c, occ, _ctx, p) => {
      if (!c.staff.isNew) return ok
      const cap = num(p, 'maxHours', 12)
      return occ.staffWeekHours(c.staff.id) + c.length > cap
        ? `${c.staff.name} is in their first year (cap ${cap} h)`
        : ok
    },
  },

  newPreparationCap: {
    check: (c, _occ, _ctx, p) => {
      const cap = num(p, 'maxNew', 2)
      return c.staff.newPreparations > cap
        ? `${c.staff.name} already carries ${c.staff.newPreparations} new preparations (cap ${cap})`
        : ok
    },
  },

  adjunctSpreadCap: {
    check: (c, occ, _ctx, p) => {
      if (c.staff.rank !== 'Adjunct') return ok
      const cap = num(p, 'maxDays', 3)
      const days = occ.staffTeachingDays(c.staff.id)
      return !days.has(c.day) && days.size >= cap
        ? `Adjunct ${c.staff.name} would be on campus more than ${cap} days`
        : ok
    },
  },

  consecutiveDayCap: {
    cost: (c, occ, ctx, p) => {
      const cap = num(p, 'maxDays', 3)
      const best = longestRun([...occ.staffTeachingDays(c.staff.id), c.day])
      return best > cap ? Math.min(1, (best - cap) / ctx.grid.days.length) : 0
    },
  },

  overtimeAvoid: {
    cost: (c, occ, _ctx, p) => {
      const threshold = num(p, 'threshold', 16)
      const after = occ.staffWeekHours(c.staff.id) + c.length
      return after > threshold ? Math.min(1, (after - threshold) / 6) : 0
    },
  },

  seniorityLoadFloor: {
    cost: (c, occ, _ctx, p) => {
      if (c.staff.rank !== 'Adjunct') return 0
      const floor = num(p, 'floorHours', 8)
      // penalise loading adjuncts while the ranked staff are still light
      return occ.staffWeekHours(c.staff.id) < floor ? 0.2 : 0.5
    },
  },

  taRatio: {
    cost: c => (c.staff.rank === 'Teaching Assistant' && c.headcount > 50 ? 0.6 : 0),
  },
}
