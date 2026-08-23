/**
 * Accessibility.
 *
 * Step-free routes, lifts, interpreter space, braille signage, lighting and
 * low-stimulus adjacency — plus observances and after-dark ground-floor
 * placement, which are here because they are the same kind of obligation.
 */

import type { RuleKey } from '../../data/constraints/types'
import { type RuleImpl } from '../context'
import { blackoutsCovering } from '../../data/academicCalendar'
import { num, overlaps } from '../context'
import { ok } from './kit'

export const AccessibilityRules: Partial<Record<RuleKey, RuleImpl>> = {
  accessibleRoomForCohort: {
    check: (c, _occ, ctx) => {
      if (!c.cohort.needsAccessibleRooms || !c.room) return ok
      const b = ctx.buildingById.get(c.room.buildingId)
      const stepFree =
        c.room.features.includes('wheelchairAccess') || c.room.floor <= 1 || !!b?.hasElevator
      return stepFree && b?.accessible !== false
        ? ok
        : `${c.room.name} is not accessible for ${c.cohort.name}`
    },
  },

  elevatorFallbackGroundFloor: {
    check: (c, _occ, ctx) => {
      if (!c.cohort.needsAccessibleRooms || !c.room) return ok
      const b = ctx.buildingById.get(c.room.buildingId)
      if (b?.hasElevator) return ok
      return c.room.floor <= 1 ? ok : `${c.room.name} has no lift and is above ground floor`
    },
  },

  interpreterSpace: {
    check: (c, _occ, _ctx) => {
      if (!c.cohort.needsAccessibleRooms || !c.room) return ok
      // interpreters need sightlines and standing room: reject packed rooms
      return c.headcount <= c.room.capacity - 2
        ? ok
        : `${c.room.name} leaves no space for an interpreter`
    },
  },

  adjustablePodium: {
    check: c => {
      if (!c.staff.needsAccessibleRoom || !c.room) return ok
      return c.room.features.includes('adjustablePodium') ||
        c.room.features.includes('wheelchairAccess')
        ? ok
        : `${c.room.name} has no height-adjustable podium`
    },
  },

  brailleBuilding: {
    check: (c, _occ, _ctx) => {
      if (!c.cohort.needsAccessibleRooms || !c.room) return ok
      return c.room.features.includes('brailleSignage') ||
        c.room.features.includes('wheelchairAccess')
        ? ok
        : `${c.room.name} lacks braille signage and auditory signals`
    },
  },

  photosensitiveLighting: {
    cost: c => {
      if (!c.cohort.needsAccessibleRooms || !c.room) return 0
      return c.room.features.includes('lowStimulus') ? 0 : 0.3
    },
  },

  lowStimulusAdjacency: {
    cost: (c, occ, ctx) => {
      if (!c.room || !c.room.features.includes('lowStimulus')) return 0
      const neighbours = ctx.inst.rooms.filter(
        r =>
          r.id !== c.room!.id && r.buildingId === c.room!.buildingId && r.floor === c.room!.floor,
      )
      return neighbours.some(r => occ.roomBusy(r.id, c.day, c.slot, c.length)) ? 0.5 : 0
    },
  },

  /**
   * C151 — keep mandatory classes off a major observance.
   *
   * An observance is not a closure: the campus is open and an optional class
   * can still run for the students who want it. What must not happen is a core
   * or lab meeting that some of the cohort cannot attend without choosing
   * between their course and their faith.
   */
  religiousHoliday: {
    check: (c, _occ, ctx) => {
      if (!ctx.grid.days.includes(c.day)) return 'Declared religious holiday'
      if (c.course.kind !== 'Core' && c.course.kind !== 'Lab') return ok
      const hit = blackoutsCovering(ctx.inst.calendar, c.day, c.slot, c.length).find(
        b => b.coreOnly,
      )
      return hit ? `${hit.name} — mandatory teaching is not scheduled over an observance` : ok
    },
  },

  prayerWindow: {
    check: (c, _occ, _ctx, p) => {
      const day = num(p, 'day', -1)
      const slot = num(p, 'slot', -1)
      if (day < 0 || slot < 0 || c.day !== day) return ok
      return overlaps(c.slot, c.length, slot, 1) ? 'Protected prayer window' : ok
    },
  },

  groundFloorAfterDark: {
    cost: (c, _occ, ctx) => {
      if (!c.room || c.slot < ctx.grid.eveningFrom) return 0
      return c.room.floor <= 1 ? 0 : 0.4
    },
  },

  equityBlind: {
    audit: () => [],
  },
}
