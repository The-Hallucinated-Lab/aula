/**
 * Rooms, their features and the equipment they hold.
 *
 * Room kind, required and forbidden features, right-sizing, turnover between
 * bookings, and acoustic adjacency.
 */

import type { RuleKey } from '../../data/constraints/types'
import { type RuleImpl } from '../context'
import { type RoomFeature } from '../../data/model'
import { bool, num, str } from '../context'
import { hasFeature, needsFeature, ok } from './kit'

export const RoomsRules: Partial<Record<RuleKey, RuleImpl>> = {
  roomKindMatch: {
    check: (c, _occ, _ctx, p) => {
      if (!c.room) return ok
      const kind = str(p, 'kind')
      if (kind) {
        return c.course.roomKind === kind && c.room.kind !== kind
          ? `${c.course.code} needs a ${kind}`
          : ok
      }
      return c.room.kind === c.course.roomKind
        ? ok
        : `${c.room.name} is a ${c.room.kind}; ${c.course.code} needs a ${c.course.roomKind}`
    },
  },

  roomFeatureRequired: {
    check: (c, _occ, _ctx, p) => {
      const feature = str(p, 'feature')
      if (!feature || !c.room) return ok
      const sizeGate = num(p, 'whenSizeAbove', 0)
      if (sizeGate > 0 && c.headcount <= sizeGate) return ok
      if (!needsFeature(c, feature)) return ok
      return hasFeature(c, feature)
        ? ok
        : `${c.room.name} lacks the required capability: ${feature}`
    },
  },

  roomForbiddenFeature: {
    check: (c, _occ, _ctx, p) => {
      const feature = str(p, 'feature')
      if (!feature || !c.room) return ok
      // only applies to courses that declare they need the opposite
      const wantsOpposite =
        c.course.requires.includes('movableFurniture') ||
        c.course.requires.includes('podTables') ||
        c.course.requires.includes('largeDesks')
      if (!wantsOpposite) return ok
      return c.room.features.includes(feature as RoomFeature)
        ? `${c.room.name} has ${feature}, which this course cannot use`
        : ok
    },
  },

  roomRightSize: {
    cost: c => {
      if (!c.room || c.room.capacity <= 0) return 0
      const waste = 1 - c.headcount / c.room.capacity
      return waste > 0.5 ? Math.min(1, (waste - 0.5) * 2) : 0
    },
  },

  distancingCapacity: {
    check: (c, _occ, _ctx, p) => {
      if (!bool(p, 'active', false) || !c.room) return ok
      const share = num(p, 'capacityShare', 40) / 100
      const allowed = Math.floor(c.room.capacity * share)
      return c.headcount > allowed ? `Health mandate caps ${c.room.name} at ${allowed} seats` : ok
    },
  },

  roomTurnover: {
    check: (c, occ, ctx, p) => {
      if (!c.room) return ok
      const feature = str(p, 'feature')
      const kind = str(p, 'kind')
      const minCapacity = num(p, 'minCapacity', 0)
      if (bool(p, 'requiresEquipment', false) && !c.course.equipmentId) return ok
      if (feature && !c.room.features.includes(feature as RoomFeature)) return ok
      if (kind && c.room.kind !== kind) return ok
      if (minCapacity > 0 && c.room.capacity < minCapacity) return ok

      const need = Math.max(num(p, 'turnover', 0), c.room.turnoverMinutes)
      if (need <= 0) return ok
      const gapSlots = Math.ceil((need - ctx.grid.passingMinutes) / ctx.grid.slotMinutes)
      if (gapSlots <= 0) return ok

      for (const s of occ.roomOnDay(c.room.id, c.day)) {
        const before = c.slot - (s.slot + s.length)
        const after = s.slot - (c.slot + c.length)
        if (before >= 0 && before < gapSlots) return `${c.room.name} needs ${need} min turnover`
        if (after >= 0 && after < gapSlots) return `${c.room.name} needs ${need} min turnover`
      }
      return ok
    },
  },

  sameRoomGap: {
    check: (c, occ, ctx, p) => {
      if (!c.room) return ok
      const need = num(p, 'gapMinutes', 10)
      if (need <= ctx.grid.passingMinutes) return ok
      const gapSlots = Math.ceil((need - ctx.grid.passingMinutes) / ctx.grid.slotMinutes)
      for (const s of occ.roomOnDay(c.room.id, c.day)) {
        const before = c.slot - (s.slot + s.length)
        const after = s.slot - (c.slot + c.length)
        if ((before >= 0 && before < gapSlots) || (after >= 0 && after < gapSlots)) {
          return `${c.room.name} needs a ${need} min gap between bookings`
        }
      }
      return ok
    },
  },

  noisyAdjacency: {
    cost: (c, occ, ctx) => {
      if (!c.room) return 0
      const noisy = c.course.kind === 'Workshop' || c.course.kind === 'Studio'
      if (!noisy) return 0
      const neighbours = ctx.inst.rooms.filter(
        r =>
          r.id !== c.room!.id && r.buildingId === c.room!.buildingId && r.floor === c.room!.floor,
      )
      const busy = neighbours.some(r => occ.roomBusy(r.id, c.day, c.slot, c.length))
      return busy ? 0.7 : 0
    },
  },

  quietExamAdjacency: {
    cost: (c, occ, ctx) => {
      if (!c.room || !c.room.features.includes('acoustic')) return 0
      const neighbours = ctx.inst.rooms.filter(
        r => r.id !== c.room!.id && r.buildingId === c.room!.buildingId,
      )
      return neighbours.some(r => occ.roomBusy(r.id, c.day, c.slot, c.length)) ? 0.4 : 0
    },
  },

  noisyBuildingAvoid: {
    cost: (c, _occ, ctx) => {
      if (!c.room) return 0
      return ctx.buildingById.get(c.room.buildingId)?.noisy ? 0.8 : 0
    },
  },

  ventilationPriority: {
    cost: c => {
      if (!c.room) return 0
      const wants = c.course.kind === 'Lab' || c.course.requires.includes('ventilation')
      return wants && !c.room.features.includes('ventilation') ? 0.5 : 0
    },
  },
}
