/**
 * Departmental and administrative policy.
 *
 * Room priority within a department, after-hours restrictions, cross-listing,
 * capacity overrides and the manual locks a human has placed by hand.
 */

import type { RuleKey } from '../../data/constraints/types'
import { type RuleImpl } from '../context'
import { num, overlaps, slotAtOrAfter, str } from '../context'
import { ok } from './kit'

export const AdministrativeRules: Partial<Record<RuleKey, RuleImpl>> = {
  deptRoomPriority: {
    cost: (c, _occ, ctx) => {
      if (!c.room?.ownerDeptId) return 0
      void ctx
      return c.room.ownerDeptId === c.cohort.deptId ? 0 : 0.6
    },
  },

  deptAfterHoursOnly: {
    check: (c, _occ, ctx, p) => {
      if (!c.room?.ownerDeptId) return ok
      if (c.room.ownerDeptId === c.cohort.deptId) return ok
      const from = slotAtOrAfter(ctx.grid, str(p, 'after', '17:00'), ctx.grid.slots)
      return c.slot >= from
        ? ok
        : `${c.room.name} is departmentally controlled until ${str(p, 'after', '17:00')}`
    },
  },

  megaLectureFirst: {
    cost: (c, _occ, _ctx, p) => {
      const threshold = num(p, 'threshold', 200)
      // large cohorts should not be pushed into marginal slots
      return c.headcount >= threshold && c.slot > 0 ? 0.2 : 0
    },
  },

  lowEnrolmentFlag: {
    audit: (sessions, ctx, p) => {
      const min = num(p, 'minEnrolment', 10)
      const out: string[] = []
      const seen = new Set<string>()
      for (const s of sessions) {
        const cohort = ctx.cohortById.get(s.cohortId)
        const course = ctx.courseById.get(s.courseId)
        if (!cohort || !course) continue
        const size = course.enrolment ?? cohort.size
        const k = `${course.id}:${cohort.id}`
        if (size < min && !seen.has(k)) {
          seen.add(k)
          out.push(`${course.code} for ${cohort.name} has ${size} students (below ${min})`)
        }
      }
      return out
    },
  },

  manualLock: {
    check: (c, occ, ctx) => {
      if (!c.room) return ok
      const locked = occ
        .roomOnDay(c.room.id, c.day)
        .some(s => ctx.locked.has(s.id) && overlaps(s.slot, s.length, c.slot, c.length))
      return locked ? `${c.room.name} is locked by a department head in this slot` : ok
    },
  },

  crossListedShared: {
    check: (c, occ, ctx) => {
      const twin = c.course.crossListedWith
      if (!twin) return ok
      const placed = occ.sessions.filter(s => s.courseId === twin && s.cohortId === c.cohort.id)
      if (placed.length === 0) return ok
      const match = placed.some(
        s => s.day === c.day && s.slot === c.slot && s.roomId === c.room?.id,
      )
      void ctx
      return match ? ok : `${c.course.code} must share time and room with its cross-listed twin`
    },
  },

  capacityOverrideGuard: {
    check: c =>
      c.room && c.headcount > c.room.capacity
        ? `Override refused: ${c.room.name} capacity ${c.room.capacity} < enrolment ${c.headcount}`
        : ok,
  },

  overflowRoom: {
    audit: (sessions, ctx) => {
      const out: string[] = []
      for (const s of sessions) {
        const room = ctx.roomById.get(s.roomId)
        const cohort = ctx.cohortById.get(s.cohortId)
        if (room && cohort && cohort.size > room.capacity) {
          out.push(`${cohort.name} exceeds ${room.name} — assign an overflow room with a live feed`)
        }
      }
      return out
    },
  },

  lateNightClustering: {
    cost: (c, occ, ctx, p) => {
      const from = slotAtOrAfter(ctx.grid, str(p, 'after', '22:00'), ctx.grid.slots)
      if (c.slot < from || !c.room) return 0
      const others = ctx.inst.rooms.filter(r => r.buildingId === c.room!.buildingId)
      const anyLate = others.some(r => occ.roomOnDay(r.id, c.day).some(s => s.slot >= from))
      return anyLate ? 0 : 0.5
    },
  },
}
