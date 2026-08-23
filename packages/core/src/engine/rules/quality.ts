/**
 * Scheduling quality and institutional policy.
 *
 * The rules that shape a week rather than make it legal: prime hours for
 * foundational courses, morning stagger, reserved free hours, daylight limits,
 * and the solver’s own time budget.
 */

import type { RuleKey } from '../../data/constraints/types'
import { type RuleImpl } from '../context'
import { num, overlaps, slotAtOrAfter, slotEndingBefore, str } from '../context'
import { ok } from './kit'

export const QualityRules: Partial<Record<RuleKey, RuleImpl>> = {
  primeHoursFoundational: {
    cost: (c, _occ, ctx, p) => {
      if (c.course.year > 1) return 0
      const from = slotAtOrAfter(ctx.grid, str(p, 'from', '10:00'), 1)
      const to = slotEndingBefore(ctx.grid, str(p, 'to', '14:00'), ctx.grid.slots - 1)
      return c.slot >= from && c.slot + c.length - 1 <= to ? 0 : 0.5
    },
  },

  avoidEarlyStem: {
    cost: (c, _occ, ctx) => {
      if (c.course.year > 1 || c.course.kind !== 'Core') return 0
      return c.slot < ctx.grid.earlyUntil ? 0.8 : 0
    },
  },

  staggerMorningStarts: {
    cost: (c, occ, ctx) => {
      if (c.slot !== 0) return 0
      const concurrent = ctx.inst.rooms.filter(r => occ.roomBusy(r.id, c.day, 0, 1)).length
      const capacity = Math.max(1, ctx.inst.rooms.length)
      return Math.min(1, concurrent / capacity)
    },
  },

  weekendConsolidation: {
    cost: (c, occ, ctx) => {
      if (c.day < 5 || !c.room) return 0
      const buildings = new Set(
        ctx.inst.rooms.filter(r => occ.roomOnDay(r.id, c.day).length > 0).map(r => r.buildingId),
      )
      return buildings.size === 0 || buildings.has(c.room.buildingId) ? 0 : 0.9
    },
  },

  zoneClustering: {
    cost: (c, occ, ctx) => {
      if (!c.room) return 0
      const active = new Set(
        ctx.inst.rooms
          .filter(r => occ.roomBusy(r.id, c.day, c.slot, c.length))
          .map(r => r.buildingId),
      )
      if (active.size === 0) return 0
      return active.has(c.room.buildingId) ? 0 : Math.min(1, active.size / 4)
    },
  },

  dayFreeReserve: {
    cost: (c, _occ, _ctx, p) => {
      const day = num(p, 'day', -1)
      if (day < 0 || c.day !== day) return 0
      const from = num(p, 'fromSlot', 0)
      const to = num(p, 'toSlot', 99)
      return c.slot >= from && c.slot <= to ? 1 : 0
    },
  },

  reservedFreeHour: {
    check: (c, _occ, _ctx, p) => {
      const day = num(p, 'day', -1)
      const slot = num(p, 'slot', -1)
      if (day < 0 || slot < 0 || c.day !== day) return ok
      return overlaps(c.slot, c.length, slot, 1) ? 'Reserved institution-wide free hour' : ok
    },
  },

  wellnessHour: {
    check: (c, _occ, _ctx, p) => {
      const day = num(p, 'day', -1)
      const slot = num(p, 'slot', -1)
      if (day < 0 || slot < 0 || c.day !== day) return ok
      return overlaps(c.slot, c.length, slot, 1) ? 'Protected campus wellness hour' : ok
    },
  },

  daylightOnly: {
    check: (c, _occ, ctx) => {
      if (!c.course.daylightOnly) return ok
      return c.slot + c.length <= ctx.grid.eveningFrom
        ? ok
        : `${c.course.code} must run in daylight hours`
    },
  },

  solarNoon: {
    cost: (c, _occ, ctx, p) => {
      if (!c.course.daylightOnly) return 0
      const target = slotAtOrAfter(ctx.grid, str(p, 'at', '12:00'), Math.floor(ctx.grid.slots / 2))
      return c.slot === target ? 0 : 0.6
    },
  },

  dawnClass: {
    cost: (c, _occ, ctx) => {
      if (!c.course.daylightOnly) return 0
      void ctx
      return c.slot === 0 ? 0 : 0.5
    },
  },

  nightClass: {
    cost: (c, _occ, ctx) => {
      if (!c.course.eveningOnly) return 0
      return c.slot >= ctx.grid.eveningFrom ? 0 : 0.8
    },
  },

  gateCurfew: {
    check: (c, _occ, ctx, p) => {
      const close = slotEndingBefore(ctx.grid, str(p, 'closes', '21:00'), ctx.grid.slots - 1)
      return c.slot + c.length - 1 <= close
        ? ok
        : `Zone gates close at ${str(p, 'closes', '21:00')}`
    },
  },

  gridSlack: {
    audit: (sessions, ctx, p) => {
      const buffer = num(p, 'bufferShare', 5) / 100
      const capacity = ctx.inst.rooms.length * ctx.grid.days.length * ctx.grid.slots
      if (capacity === 0) return []
      const used = sessions.reduce((a, s) => a + s.length, 0)
      const utilisation = used / capacity
      return utilisation > 1 - buffer
        ? [
            `Grid utilisation is ${(utilisation * 100).toFixed(1)}% — under the ${(buffer * 100).toFixed(0)}% slack floor`,
          ]
        : []
    },
  },

  creditContactHours: {
    audit: (sessions, ctx) => {
      const out: string[] = []
      const byCourse = new Map<string, number>()
      for (const s of sessions) byCourse.set(s.courseId, (byCourse.get(s.courseId) ?? 0) + s.length)
      for (const course of ctx.inst.courses) {
        if (course.suspended) continue
        const got = byCourse.get(course.id) ?? 0
        const cohorts = ctx.inst.cohorts.filter(
          c => c.programId === course.programId && c.year === course.year,
        )
        const want = course.weekly * Math.max(1, cohorts.length)
        if (got < want) out.push(`${course.code} has ${got} of ${want} weekly contact hours`)
      }
      return out
    },
  },

  annualOffering: {
    audit: (sessions, ctx) => {
      const placed = new Set(sessions.map(s => s.courseId))
      return ctx.inst.courses
        .filter(c => !c.suspended && c.kind === 'Core' && !placed.has(c.id))
        .map(c => `${c.code} ${c.name} is a core requirement with no sessions scheduled`)
    },
  },

  transitionGap: {
    audit: (_sessions, ctx, p) => {
      const need = num(p, 'gapMinutes', 10)
      return ctx.grid.passingMinutes < need
        ? [
            `Grid allows ${ctx.grid.passingMinutes} min between classes; policy asks for ${need} min`,
          ]
        : []
    },
  },

  solveTimeLimit: { audit: () => [] },
}
