/**
 * Curriculum sequencing and session shape.
 *
 * Ordering (a lab after its lecture), block structure (a two-hour lab is
 * contiguous or it is two labs), and how a course’s meetings spread across the
 * week.
 */

import type { RuleKey } from '../../data/constraints/types'
import { type RuleImpl } from '../context'
import { meetingsInTerm } from '../../data/academicCalendar'
import { num, str } from '../context'
import { earliestAcross, ok } from './kit'

export const SequencingRules: Partial<Record<RuleKey, RuleImpl>> = {
  coursePrerequisiteOrder: {
    check: (c, occ, ctx) => {
      if (c.course.after.length === 0) return ok
      for (const prereqId of c.course.after) {
        const days = occ.cohortCourseMeetsOn(c.cohort.id, prereqId)
        if (days.size === 0) continue // not yet placed — the solver orders these
        const earliest = Math.min(...days)
        if (c.day < earliest) {
          const prereq = ctx.courseById.get(prereqId)
          return `${c.course.code} must follow ${prereq?.code ?? prereqId} in the week`
        }
      }
      return ok
    },
  },

  labAfterLecture: {
    cost: (c, occ, ctx) => {
      if (c.course.kind !== 'Lab') return 0
      // find the lecture course for the same cohort-year with the same dept
      const lectures = ctx.inst.courses.filter(
        x => x.programId === c.course.programId && x.year === c.course.year && x.kind === 'Core',
      )
      // `Math.min`, not sort-and-take-first: this runs once per candidate
      // placement, and the whole ordering is thrown away to read one value.
      const earliest = earliestAcross(lectures.map(l => occ.cohortCourseMeetsOn(c.cohort.id, l.id)))
      if (earliest === undefined) return 0.3
      return c.day > earliest ? 0 : 0.7
    },
  },

  tutorialAfterLecture: {
    cost: (c, occ, ctx) => {
      if (c.course.kind !== 'Tutorial') return 0
      const parents = ctx.inst.courses.filter(
        x => x.programId === c.course.programId && x.year === c.course.year && x.kind === 'Core',
      )
      const earliest = earliestAcross(parents.map(l => occ.cohortCourseMeetsOn(c.cohort.id, l.id)))
      return earliest !== undefined && c.day > earliest ? 0 : 0.6
    },
  },

  linkedCoursesSameDay: {
    cost: (c, occ) => {
      const linked = c.course.after
      if (linked.length === 0) return 0
      const sameDay = linked.some(id => occ.cohortCourseMeetsOn(c.cohort.id, id).has(c.day))
      return sameDay ? 0 : 0.5
    },
  },

  spreadSectionsAcrossWeek: {
    cost: (c, occ) => (occ.courseMeetsOn(c.course.id).has(c.day) ? 0.6 : 0),
  },

  spreadAcrossWeek: {
    cost: (c, occ, ctx) => {
      const repeat = occ.cohortCourseMeetsOn(c.cohort.id, c.course.id).has(c.day) ? 0.9 : 0

      /* Spreading across the grid is not the same as spreading across the term.
         A Thursday carrying four public holidays delivers four fewer meetings
         than a Tuesday, so a course parked there quietly finishes the syllabus
         short. Costing the shortfall pushes meetings onto the weekdays that
         survive, without ever refusing the thin one. */
      const cal = ctx.inst.calendar
      let thin = 0
      if (cal.dated && cal.impact.length > 1) {
        const best = Math.max(...cal.impact.map(i => i.teachingDates))
        if (best > 0) {
          thin = Math.min(0.6, (best - meetingsInTerm(cal, c.day)) / best)
        }
      }
      return Math.min(1, repeat + thin)
    },
  },

  shortBurstsPerWeek: {
    cost: (c, occ, _ctx, p) => {
      const want = num(p, 'minDays', 4)
      const days = occ.cohortCourseMeetsOn(c.cohort.id, c.course.id)
      if (days.has(c.day)) return Math.min(1, 1 / Math.max(1, want - days.size))
      return 0
    },
  },

  contiguousBlock: {
    check: (c, _occ, _ctx, p) => {
      const min = num(p, 'minBlock', 0)
      if (min <= 1) return ok
      // only applies to courses that declare they need a long block
      if (c.course.blockLength < min) return ok
      return c.length >= min ? ok : `${c.course.code} needs an uninterrupted ${min}-slot block`
    },
  },

  blockLengthAllowed: {
    check: (c, _occ, _ctx, p) => {
      const kind = str(p, 'kind')
      if (kind && c.course.kind !== kind) return ok
      const min = num(p, 'minBlock', 1)
      const max = num(p, 'maxBlock', 4)
      if (c.length < min) return `${c.course.code} block is shorter than ${min} slots`
      if (c.length > max) return `${c.course.code} block is longer than ${max} slots`
      return ok
    },
  },

  gridAlignment: {
    check: (c, _occ, ctx) => {
      // a multi-slot block must not straddle the protected lunch window
      if (c.length < 2 || ctx.grid.lunchSlots.length === 0) return ok
      const covered: number[] = []
      for (let k = 0; k < c.length; k++) covered.push(c.slot + k)
      const straddles =
        ctx.grid.lunchSlots.some(l => covered.includes(l)) &&
        covered.some(s => s < Math.min(...ctx.grid.lunchSlots))
      return straddles ? 'Block would straddle the lunch break' : ok
    },
  },

  noRoomNeeded: {
    check: c =>
      c.course.kind === 'Online' && c.room ? 'Online sessions must not consume a room' : ok,
  },

  hybridOnlineNoRoom: {
    check: c =>
      c.course.kind === 'Online' && c.room ? 'Hybrid online days must not hold a room booking' : ok,
  },

  fieldworkFreeDay: {
    check: (c, occ) => {
      if (c.course.kind !== 'Fieldwork') return ok
      return occ.cohortOnDay(c.cohort.id, c.day).length > 0
        ? `${c.cohort.name} already has on-campus classes that day`
        : ok
    },
  },

  avoidBackToBackHeavy: {
    cost: (c, occ, ctx) => {
      if (!c.course.heavyLoad) return 0
      const adjacent = occ
        .cohortOnDay(c.cohort.id, c.day)
        .filter(s => s.slot + s.length === c.slot || c.slot + c.length === s.slot)
      return adjacent.some(s => ctx.courseById.get(s.courseId)?.heavyLoad) ? 0.9 : 0
    },
  },

  rehearsalAfterHours: {
    check: (c, _occ, ctx) => {
      if (c.course.kind !== 'Studio') return ok
      return c.slot >= ctx.grid.eveningFrom ? ok : 'Rehearsals run after standard lecture hours'
    },
  },
}
