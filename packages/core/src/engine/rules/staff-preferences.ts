/**
 * Staff preferences.
 *
 * Every rule here is soft: it contributes cost, never a refusal. A preference
 * that could block a placement would make one person’s convenience outrank a
 * cohort’s degree.
 */

import type { RuleKey } from '../../data/constraints/types'
import { type RuleImpl } from '../context'

export const StaffPreferencesRules: Partial<Record<RuleKey, RuleImpl>> = {
  avoidEarlySlot: {
    cost: c => (c.slot < c.staff.earliestSlot ? 1 : 0),
  },

  facultyTimeWindow: {
    cost: c => {
      const early = c.slot < c.staff.earliestSlot
      const late = c.slot + c.length > c.staff.latestSlot
      return early || late ? 1 : 0
    },
  },

  compactTeachingDays: {
    cost: (c, occ, ctx) => {
      const days = occ.staffTeachingDays(c.staff.id)
      if (days.has(c.day) || days.size === 0) return 0
      return Math.min(1, (days.size + 1) / ctx.grid.days.length)
    },
  },

  sameBuildingPerDay: {
    cost: (c, occ) => {
      if (!c.room) return 0
      const used = occ.staffBuildingsOn(c.staff.id, c.day)
      if (used.size === 0 || used.has(c.room.buildingId)) return 0
      return 0.8
    },
  },

  minimiseRoomCount: {
    cost: (c, occ, ctx) => {
      if (!c.room) return 0
      const n = occ.staffRoomCount(c.staff.id)
      const sprawl = n === 0 ? 0 : Math.min(1, n / Math.max(3, ctx.inst.rooms.length / 4))
      /* Same question, second half: not just how many rooms this instructor is
         spread over but whether any of them is the kind they teach in. Both are
         preferences about the rooms one person is given, so they share a
         weight rather than competing for two. */
      const wrongKind =
        c.staff.preferredRoomKind && c.room.kind !== c.staff.preferredRoomKind ? 0.3 : 0
      return Math.min(1, sprawl + wrongKind)
    },
  },

  preferBackToBack: {
    cost: (c, occ) => {
      if (!c.staff.prefersBackToBack) return 0
      const same = occ.staffOnDay(c.staff.id, c.day)
      if (same.length === 0) return 0
      const adjacent = same.some(s => s.slot + s.length === c.slot || c.slot + c.length === s.slot)
      return adjacent ? 0 : 0.7
    },
  },

  preferPrepGap: {
    cost: (c, occ) => {
      if (!c.staff.needsPrepGap) return 0
      const same = occ.staffOnDay(c.staff.id, c.day)
      const adjacent = same.some(s => s.slot + s.length === c.slot || c.slot + c.length === s.slot)
      return adjacent ? 0.9 : 0
    },
  },

  preferDayPart: {
    cost: (c, _occ, ctx) => {
      const morning = c.slot < ctx.grid.slots / 2
      const wantsMorning = c.staff.latestSlot <= ctx.grid.slots / 2
      const wantsAfternoon = c.staff.earliestSlot >= ctx.grid.slots / 2
      if (wantsMorning && !morning) return 1
      if (wantsAfternoon && morning) return 1
      return 0
    },
  },

  seniorityPriority: {
    cost: (c, _occ, ctx) => {
      const prime = ctx.grid.primeSlots.includes(c.slot)
      if (!prime) return 0
      // junior staff occupying a prime slot carries a small cost
      return c.staff.seniority >= 3 ? 0 : (3 - c.staff.seniority) / 6
    },
  },
}
