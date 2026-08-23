/**
 * Getting from one room to the next.
 *
 * Inter-campus travel, walk windows between buildings, and keeping a person
 * with limited mobility inside one block for a day.
 */

import type { RuleKey } from '../../data/constraints/types'
import { type RuleImpl } from '../context'
import { bool, num } from '../context'
import { ok } from './kit'

export const GeographyRules: Partial<Record<RuleKey, RuleImpl>> = {
  interCampusTravel: {
    check: (c, occ, ctx, p) => {
      if (!c.room) return ok
      const need = num(p, 'travelMinutes', 60)
      const campus = ctx.buildingById.get(c.room.buildingId)?.campusId
      if (!campus) return ok
      for (const s of occ.staffOnDay(c.staff.id, c.day)) {
        const other = ctx.roomById.get(s.roomId)
        const otherCampus = other ? ctx.buildingById.get(other.buildingId)?.campusId : undefined
        if (!otherCampus || otherCampus === campus) continue
        const gapSlots =
          c.slot >= s.slot + s.length ? c.slot - (s.slot + s.length) : s.slot - (c.slot + c.length)
        if (gapSlots < 0) continue
        if (gapSlots * ctx.grid.slotMinutes + ctx.grid.passingMinutes < need) {
          return `${c.staff.name} cannot cross campuses in under ${need} min`
        }
      }
      return ok
    },
  },

  crossCampusGap: {
    check: (c, occ, ctx, p) => {
      if (!c.room) return ok
      const need = num(p, 'travelMinutes', 30)
      const campus = ctx.buildingById.get(c.room.buildingId)?.campusId
      for (const s of occ.cohortOnDay(c.cohort.id, c.day)) {
        const other = ctx.roomById.get(s.roomId)
        const otherCampus = other ? ctx.buildingById.get(other.buildingId)?.campusId : undefined
        if (!otherCampus || otherCampus === campus) continue
        const gapSlots =
          c.slot >= s.slot + s.length ? c.slot - (s.slot + s.length) : s.slot - (c.slot + c.length)
        if (gapSlots < 0) continue
        if (gapSlots * ctx.grid.slotMinutes + ctx.grid.passingMinutes < need) {
          return `${c.cohort.name} cannot cross campuses in under ${need} min`
        }
      }
      return ok
    },
  },

  walkWindow: {
    check: (c, occ, ctx, p) => {
      if (!c.room) return ok
      const need = num(p, 'walkMinutes', 15)
      const exemptSameBuilding = bool(p, 'sameBuildingExempt', true)
      for (const s of occ.staffOnDay(c.staff.id, c.day)) {
        const other = ctx.roomById.get(s.roomId)
        if (!other) continue
        if (exemptSameBuilding && other.buildingId === c.room.buildingId) continue
        const adjacentBefore = s.slot + s.length === c.slot
        const adjacentAfter = c.slot + c.length === s.slot
        if (!adjacentBefore && !adjacentAfter) continue
        const walk = ctx.buildingById.get(other.buildingId)?.walkMinutes ?? 0
        if (Math.max(walk, need) > ctx.grid.passingMinutes) {
          return `${c.staff.name} needs ${Math.max(walk, need)} min to walk between these rooms`
        }
      }
      return ok
    },
  },

  mobilityLocalised: {
    check: (c, occ) => {
      if (!c.staff.needsAccessibleRoom || !c.room) return ok
      const buildings = occ.staffBuildingsOn(c.staff.id, c.day)
      return buildings.size === 0 || buildings.has(c.room.buildingId)
        ? ok
        : `${c.staff.name} needs a localised, low-travel day`
    },
  },

  homeCampusPreference: {
    cost: (c, _occ, ctx) => {
      if (!c.room) return 0
      let cost = 0
      const dept = ctx.inst.departments.find(d => d.id === c.cohort.deptId)
      if (
        dept &&
        dept.homeBuildingIds.length > 0 &&
        !dept.homeBuildingIds.includes(c.room.buildingId)
      ) {
        cost += 0.4
      }
      /* An instructor anchored to a block keeps their office, their equipment
         and their between-class minutes there. Teaching them out of it is not
         forbidden, it just costs something. */
      if (c.staff.homeBuildingId && c.staff.homeBuildingId !== c.room.buildingId) {
        cost += 0.4
      }
      return Math.min(1, cost)
    },
  },

  rushHourAvoid: {
    cost: (c, _occ, ctx) => {
      const first = c.slot === 0
      const last = c.slot + c.length >= ctx.grid.slots
      return first || last ? 0.3 : 0
    },
  },
}
