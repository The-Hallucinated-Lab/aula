/**
 * Resource exclusivity and availability.
 *
 * The rules that make a timetable a timetable: one thing in one place at one
 * time. They reject constantly by design, which is why they sit at the top of
 * every bottleneck report and why that is not a finding.
 */

import type { RuleKey } from '../../data/constraints/types'
import { type RuleImpl } from '../context'
import { blackoutsCovering } from '../../data/academicCalendar'
import { type RoomFeature } from '../../data/model'
import { str } from '../context'
import { coversAny, ok } from './kit'

export const AvailabilityRules: Partial<Record<RuleKey, RuleImpl>> = {
  facultyNoOverlap: {
    check: (c, occ) =>
      occ.staffBusy(c.staff.id, c.day, c.slot, c.length)
        ? `${c.staff.name} is already teaching in this slot`
        : ok,
  },

  roomNoOverlap: {
    check: (c, occ) =>
      c.room && occ.roomBusy(c.room.id, c.day, c.slot, c.length)
        ? `Room ${c.room.name} is already booked`
        : ok,
  },

  cohortNoOverlap: {
    check: (c, occ) =>
      occ.cohortBusy(c.cohort.id, c.day, c.slot, c.length)
        ? `${c.cohort.name} already has a class in this slot`
        : ok,
  },

  roomCapacity: {
    check: c =>
      c.room && c.headcount > c.room.capacity
        ? `${c.room.name} seats ${c.room.capacity}, cohort is ${c.headcount}`
        : ok,
  },

  operatingHours: {
    check: (c, _occ, ctx) => {
      if (!ctx.grid.days.includes(c.day)) return 'Day is outside the teaching week'
      if (c.slot < 0 || c.slot + c.length > ctx.grid.slots)
        return 'Session runs past the end of the teaching day'
      return ok
    },
  },

  buildingMaintenance: {
    check: (c, _occ, ctx) => {
      if (!c.room) return ok
      const b = ctx.buildingById.get(c.room.buildingId)
      return b && coversAny(c.day, c.slot, c.length, b.maintenance)
        ? `${b.name} is closed for maintenance in this slot`
        : ok
    },
  },

  facultySabbatical: {
    check: c => (c.staff.onSabbatical ? `${c.staff.name} is on sabbatical` : ok),
  },

  courseSuspended: {
    check: c => (c.course.suspended ? `${c.course.code} is suspended and must not hold rooms` : ok),
  },

  equipmentContention: {
    check: (c, occ, ctx) => {
      const id = c.course.equipmentId
      if (!id) return ok
      const pool = ctx.inst.equipment.find(e => e.id === id)
      if (!pool) return ok
      return occ.equipmentInUse(id, c.day, c.slot, c.length) >= pool.units
        ? `All ${pool.units} unit(s) of ${pool.name} are in use`
        : ok
    },
  },

  /**
   * C010 — no teaching on an official closure.
   *
   * Two shapes reach the weekly grid. A weekday whose every date is a holiday
   * is already gone: `buildGrid` never puts it in `grid.days`. What is left is
   * the recurring closure — a weekly assembly, a standing exam slot — which
   * falls in the same place every week and so can be blocked cell by cell.
   */
  holidayBlackout: {
    check: (c, _occ, ctx) => {
      if (!ctx.grid.days.includes(c.day)) return 'Day is a declared holiday'
      const hit = blackoutsCovering(ctx.inst.calendar, c.day, c.slot, c.length).find(
        b => !b.coreOnly,
      )
      return hit ? `Institution calendar: ${hit.name}` : ok
    },
  },

  roomBlocked: {
    check: (c, _occ, _ctx, p) => {
      if (!c.room) return ok
      const feature = str(p, 'feature')
      const kind = str(p, 'kind')
      if (feature && !c.room.features.includes(feature as RoomFeature)) return ok
      if (kind && c.room.kind !== kind) return ok
      return coversAny(c.day, c.slot, c.length, c.room.blocked)
        ? `${c.room.name} is blocked (cleaning, lockout or maintenance)`
        : ok
    },
  },

  roomRestricted: {
    check: c => (c.room?.restricted ? `${c.room.name} is outside the bookable pool` : ok),
  },

  restrictedSpaces: {
    check: c =>
      c.room?.restricted ? `${c.room.name} is reserved and cannot host scheduled classes` : ok,
  },
}
