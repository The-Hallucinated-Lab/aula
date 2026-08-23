/**
 * Engine context — the lookups and helpers every rule shares.
 */

import { sessionMinutes } from '../data/model'
import type {
  Building, Cohort, Course, Staff, Institution, Room, Session, ShiftWindow, TimeGrid,
} from '../data/model'
import type { ConstraintDef, ConstraintState, ParamValue } from '../data/constraints/types'
import type { CustomConstraint } from '../data/constraints/custom'
import type { Occupancy } from './occupancy'

/** A placement the solver is considering. */
export interface Candidate {
  course: Course
  cohort: Cohort
  staff: Staff
  /** null for sessions that need no room (online, independent study) */
  room: Room | null
  day: number
  slot: number
  length: number
  /** headcount to seat */
  headcount: number
}

export type Params = Record<string, ParamValue>

/** One active constraint: its definition, the user's state, merged params. */
export interface ActiveRule {
  def: ConstraintDef
  state: ConstraintState
  params: Params
}

export interface EngineCtx {
  inst: Institution
  grid: TimeGrid
  courseById: Map<string, Course>
  cohortById: Map<string, Cohort>
  roomById: Map<string, Room>
  staffById: Map<string, Staff>
  buildingById: Map<string, Building>
  /** shift windows by id, for the structural confinement gate */
  shiftById: Map<string, ShiftWindow>
  /** enabled hard rules, in evaluation order (cheapest first) */
  hard: ActiveRule[]
  /** enabled soft rules */
  soft: ActiveRule[]
  /** enabled institution-specific hard rules */
  customHard: CustomConstraint[]
  /** enabled institution-specific soft rules */
  customSoft: CustomConstraint[]
  /** sessions the user pinned; the solver must not move them */
  locked: Set<string>
}

/**
 * A rule implementation.
 *  - `check` gates a placement. Returning a string rejects it with that reason.
 *  - `cost`  scores a placement, 0 (perfect) .. 1 (bad). Multiplied by weight.
 *  - `audit` inspects the finished schedule for things only visible globally.
 */
export interface RuleImpl {
  check?(c: Candidate, occ: Occupancy, ctx: EngineCtx, p: Params): string | null
  cost?(c: Candidate, occ: Occupancy, ctx: EngineCtx, p: Params): number
  audit?(sessions: Session[], ctx: EngineCtx, p: Params): string[]
}

/* ------------------------------------------------------------------ *
 * Parameter readers — tolerant, because values come from user input
 * ------------------------------------------------------------------ */

export const num = (p: Params, key: string, fallback: number): number => {
  const v = p[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export const str = (p: Params, key: string, fallback = ''): string => {
  const v = p[key]
  return typeof v === 'string' ? v : fallback
}

export const bool = (p: Params, key: string, fallback = false): boolean => {
  const v = p[key]
  return typeof v === 'boolean' ? v : fallback
}

/* ------------------------------------------------------------------ *
 * Grid helpers
 * ------------------------------------------------------------------ */

export const slotStartMinutes = (grid: TimeGrid, slot: number) =>
  grid.starts[Math.min(slot, grid.starts.length - 1)] ?? 0

/**
 * When a session starting at `slot` and running `length` slots actually ends.
 *
 * Sums the real durations rather than multiplying by the nominal slot length,
 * because the last period of the day can be shorter. Every end-of-session time
 * in the engine goes through here so a short final slot cannot be reported as
 * running past the close of the day.
 */
export const slotEndMinutes = (grid: TimeGrid, slot: number, length = 1) =>
  slotStartMinutes(grid, slot) + sessionMinutes(grid, slot, length)

/** Real length of one slot, in minutes. */
export const slotDuration = (grid: TimeGrid, slot: number) =>
  grid.durations[slot] ?? grid.slotMinutes

/** Convert "17:30" into the first slot index at or after that time. */
export function slotAtOrAfter(grid: TimeGrid, time: string, fallback: number): number {
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h)) return fallback
  const mins = h * 60 + (m || 0)
  for (let i = 0; i < grid.slots; i++) {
    if (grid.starts[i] >= mins) return i
  }
  return grid.slots
}

/** Convert "17:30" into the last slot index that ends at or before it. */
export function slotEndingBefore(grid: TimeGrid, time: string, fallback: number): number {
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h)) return fallback
  const mins = h * 60 + (m || 0)
  let last = -1
  for (let i = 0; i < grid.slots; i++) {
    if (grid.starts[i] + (grid.durations[i] ?? grid.slotMinutes) <= mins) last = i
  }
  return last
}

/** Do two [slot, slot+len) ranges touch or overlap? */
export const rangesAdjacent = (aSlot: number, aLen: number, bSlot: number, bLen: number) =>
  aSlot + aLen === bSlot || bSlot + bLen === aSlot

export const overlaps = (aSlot: number, aLen: number, bSlot: number, bLen: number) =>
  aSlot < bSlot + bLen && bSlot < aSlot + aLen

/** Longest run of back-to-back teaching once `extra` is added. */
export function consecutiveRun(
  existing: { slot: number; length: number }[],
  extraSlot: number,
  extraLen: number,
): number {
  const occupied = new Set<number>()
  for (const s of existing) for (let k = 0; k < s.length; k++) occupied.add(s.slot + k)
  for (let k = 0; k < extraLen; k++) occupied.add(extraSlot + k)

  let best = 0
  let run = 0
  const max = Math.max(...occupied) + 1
  for (let i = 0; i < max; i++) {
    if (occupied.has(i)) { run++; best = Math.max(best, run) } else run = 0
  }
  return best
}

export function buildContext(
  inst: Institution,
  hard: ActiveRule[],
  soft: ActiveRule[],
  locked: Set<string> = new Set(),
  custom: CustomConstraint[] = [],
): EngineCtx {
  const active = custom.filter(c => c.enabled)
  return {
    inst,
    grid: inst.grid,
    courseById: new Map(inst.courses.map(c => [c.id, c])),
    cohortById: new Map(inst.cohorts.map(c => [c.id, c])),
    roomById: new Map(inst.rooms.map(r => [r.id, r])),
    staffById: new Map(inst.staff.map(f => [f.id, f])),
    buildingById: new Map(inst.buildings.map(b => [b.id, b])),
    shiftById: new Map(inst.grid.shifts.map(s => [s.id, s])),
    hard, soft, locked,
    customHard: active.filter(c => c.hard),
    customSoft: active.filter(c => !c.hard),
  }
}
