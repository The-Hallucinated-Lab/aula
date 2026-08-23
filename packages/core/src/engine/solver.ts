/**
 * The scheduler.
 *
 * A constraint-guided greedy placer with least-slack ordering and a bounded
 * candidate search. It is deterministic for a given seed, guarantees every
 * enabled hard rule, and minimises the weighted sum of enabled soft rules.
 *
 * It is not a CP-SAT solver — it does not prove optimality. What it does give
 * you is: no hard violation ever survives, every rejection is attributed to a
 * named constraint, and the run finishes inside a stated time budget.
 */

import {
  canTeach,
  fitsShift,
  minutesToLabel,
  mulberry32,
  shuffled,
  type Bottleneck,
  type Cohort,
  type Course,
  type Institution,
  type Session,
  type SolveReport,
  type TimeGrid,
  type Unplaced,
  type Violation,
} from '../data/model'
import type { ConstraintDef, ConstraintState, RuleKey } from '../data/constraints/types'
import { CATALOGUE } from '../data/constraints/catalogue'
import type { CustomConstraint } from '../data/constraints/custom'
import { customCost, customViolation } from './customRules'
import { Occupancy } from './occupancy'
import { RULES, isImplemented } from './rules'
import {
  buildContext,
  slotEndMinutes,
  type ActiveRule,
  type Candidate,
  type EngineCtx,
} from './context'

export interface SolveInput {
  institution: Institution
  /** constraint states keyed by catalogue id ("C001") */
  states: Record<string, ConstraintState>
  seed: number
  /** soft-weight emphasis from the active scenario */
  emphasis?: { gaps: number; utilization: number; loadBalance: number; welfare: number }
  /** institution-specific rules, evaluated alongside the catalogue */
  custom?: CustomConstraint[]
  /** session ids the user pinned */
  locked?: string[]
  /** sessions to keep as-is (pinned placements) */
  keep?: Session[]
  /** wall-clock budget in milliseconds */
  timeBudgetMs?: number
}

/* ------------------------------------------------------------------ *
 * Active rule assembly
 * ------------------------------------------------------------------ */

function activeRules(states: Record<string, ConstraintState>) {
  const hard: ActiveRule[] = []
  const soft: ActiveRule[] = []

  for (const def of CATALOGUE) {
    const state = states[def.id]
    if (!state || !state.enabled) continue
    if (!isImplemented(def.rule)) continue
    const impl = RULES[def.rule as RuleKey]
    if (!impl) continue

    const params = { ...(def.args ?? {}), ...state.values }
    const entry: ActiveRule = { def, state, params }

    if (def.hard && impl.check) hard.push(entry)
    else if (impl.cost || impl.check) soft.push(entry)
  }

  // cheapest, most-discriminating checks first so rejection is fast
  return { hard: hard.toSorted((a, b) => rank(a.def) - rank(b.def)), soft }
}

const FAST_FIRST: Record<string, number> = {
  facultyNoOverlap: 0,
  roomNoOverlap: 0,
  cohortNoOverlap: 0,
  roomCapacity: 1,
  roomKindMatch: 1,
  operatingHours: 1,
  facultyQualified: 1,
  facultyBlockedDays: 2,
  facultyBlockedSlots: 2,
  facultySabbatical: 2,
  courseSuspended: 2,
}
const rank = (d: ConstraintDef) => FAST_FIRST[d.rule ?? ''] ?? 5

/* ------------------------------------------------------------------ *
 * Demand model
 * ------------------------------------------------------------------ */

interface Demand {
  courseId: string
  cohortId: string
  /** meetings still to place */
  remaining: number
  length: number
  headcount: number
  /** pre-filtered rooms that could physically host it */
  rooms: string[]
  /** qualified instructors, least-loaded first at build time */
  staff: string[]
  /** lower = place earlier */
  slack: number
}

function buildDemands(inst: Institution): Demand[] {
  const demands: Demand[] = []

  for (const cohort of inst.cohorts) {
    const courses = inst.courses.filter(
      c => c.programId === cohort.programId && c.year === cohort.year && !c.suspended,
    )
    for (const course of courses) {
      const headcount = course.enrolment ?? cohort.size
      const rooms = inst.rooms.filter(r => {
        if (r.restricted) return false
        if (course.kind === 'Online') return false
        if (r.kind !== course.roomKind) return false
        if (r.capacity < headcount) return false
        return course.requires.every(f => r.features.includes(f))
      })
      const staff = inst.staff.filter(f => canTeach(f, course, headcount))

      demands.push({
        courseId: course.id,
        cohortId: cohort.id,
        remaining: course.weekly,
        length: Math.max(1, course.blockLength),
        headcount,
        rooms: rooms.map(r => r.id),
        staff: staff.map(f => f.id),
        // fewer options and bigger rooms => schedule first
        slack: (rooms.length || 0.2) * (staff.length || 0.2) - headcount / 100,
      })
    }
  }

  return demands.toSorted((a, b) => a.slack - b.slack)
}

/* ------------------------------------------------------------------ *
 * Placement evaluation
 * ------------------------------------------------------------------ */

export interface Rejection {
  code: string
  label: string
  message: string
}

/** Reported like a constraint code, but not one — see `structuralFailure`. */
export const SHIFT_CODE = 'SHIFT'

/**
 * Gates that are properties of the institution rather than catalogue rules.
 *
 * Shift membership belongs here for the same reason qualification does (D-41):
 * a morning-shift section has no students on campus in the evening, so an
 * evening placement is not a low-scoring option, it is not an option. It also
 * *cannot* be a catalogue rule — `activeRules` only ever activates rules a
 * numbered row references, and the published 1–500 range is closed.
 *
 * Every placement path in this file funnels through `firstHardFailure` or
 * `allHardFailures`, so checking here covers the solver, the exhaustive sweep,
 * the displacement pass and interactive drag-and-drop alike. Adding it to only
 * the search loop would leave the user able to drag a class out of its shift.
 */
export function structuralFailure(cand: Candidate, ctx: EngineCtx): Rejection | null {
  const w = ctx.shiftById.get(cand.cohort.shiftId)
  if (w && !fitsShift(w, cand.slot, cand.length)) {
    const from = ctx.grid.labels[w.fromSlot] ?? '—'
    const to = minutesToLabel(slotEndMinutes(ctx.grid, w.toSlot, 1))
    return {
      code: SHIFT_CODE,
      label: `${w.name} — ${cand.cohort.name}`,
      message: `${cand.cohort.name} is taught in the ${w.name} (${from}–${to}); this slot falls outside it`,
    }
  }
  return null
}

/** Run every enabled hard rule. Returns the first failure, or null. */
export function firstHardFailure(
  cand: Candidate,
  occ: Occupancy,
  ctx: EngineCtx,
): Rejection | null {
  const structural = structuralFailure(cand, ctx)
  if (structural) return structural
  for (const rule of ctx.hard) {
    const impl = RULES[rule.def.rule as RuleKey]
    const msg = impl?.check?.(cand, occ, ctx, rule.params)
    if (msg) return { code: rule.def.id, label: rule.def.text, message: msg }
  }
  for (const k of ctx.customHard) {
    const msg = customViolation(k, cand, occ, ctx)
    if (msg) return { code: k.id, label: k.text, message: msg }
  }
  return null
}

/** Collect every enabled hard rule that rejects — used by the explainer. */
export function allHardFailures(cand: Candidate, occ: Occupancy, ctx: EngineCtx): Rejection[] {
  const out: Rejection[] = []
  const structural = structuralFailure(cand, ctx)
  if (structural) out.push(structural)
  for (const rule of ctx.hard) {
    const impl = RULES[rule.def.rule as RuleKey]
    const msg = impl?.check?.(cand, occ, ctx, rule.params)
    if (msg) out.push({ code: rule.def.id, label: rule.def.text, message: msg })
  }
  for (const k of ctx.customHard) {
    const msg = customViolation(k, cand, occ, ctx)
    if (msg) out.push({ code: k.id, label: k.text, message: msg })
  }
  return out
}

export function softCost(cand: Candidate, occ: Occupancy, ctx: EngineCtx): number {
  let total = 0
  for (const rule of ctx.soft) {
    const impl = RULES[rule.def.rule as RuleKey]
    if (!impl) continue
    if (impl.cost) {
      total += impl.cost(cand, occ, ctx, rule.params) * rule.state.weight
    } else if (impl.check) {
      // a soft-flagged rule with only a gate: treat a failure as full penalty
      if (impl.check(cand, occ, ctx, rule.params)) total += rule.state.weight
    }
  }
  for (const k of ctx.customSoft) total += customCost(k, cand, occ, ctx)
  return total
}

/* ------------------------------------------------------------------ *
 * Main entry point
 * ------------------------------------------------------------------ */

export function solve(input: SolveInput): SolveReport {
  const started = Date.now()
  const budget = input.timeBudgetMs ?? 20_000
  const inst = input.institution
  const grid = inst.grid
  const rng = mulberry32(input.seed || 1)

  const { hard, soft } = activeRules(input.states)
  const ctx = buildContext(inst, hard, soft, new Set(input.locked ?? []), input.custom ?? [])

  let occ = new Occupancy(inst)
  for (const s of input.keep ?? []) occ.add(s)

  const demands = buildDemands(inst)
  const blockedCount = new Map<string, number>()
  const unplaced: Unplaced[] = []

  let sid = input.keep?.length ?? 0
  let requested = 0
  let placed = input.keep?.length ?? 0
  let penalty = 0
  let repairs = 0
  let repaired = 0
  let displacements = 0

  const dayOrder = grid.days
  const slotOrder = Array.from({ length: grid.slots }, (_, i) => i)

  for (const demand of demands) {
    requested += demand.remaining
    const course = ctx.courseById.get(demand.courseId)!
    const cohort = ctx.cohortById.get(demand.cohortId)!

    // Rooms and instructors, shuffled per demand so the seed genuinely varies
    // the outcome without ever loosening a constraint.
    const roomPool = shuffled(rng, demand.rooms).slice(0, 14)
    const staffPool = demand.staff
      .toSorted((a, b) => occ.staffWeekHours(a) - occ.staffWeekHours(b))
      .slice(0, 6)

    let toPlace = demand.remaining
    const localReasons = new Map<string, { count: number; message: string }>()

    // Structural impossibility: say so precisely instead of burning the search
    // budget and reporting "no feasible slot".
    if (course.kind !== 'Online' && demand.rooms.length === 0) {
      unplaced.push({
        courseId: course.id,
        courseLabel: `${course.code} ${course.name}`,
        cohortId: cohort.id,
        cohortLabel: cohort.name,
        missing: toPlace,
        reason:
          `No ${course.roomKind} seats ${demand.headcount} students` +
          (course.requires.length ? ` with ${course.requires.join(', ')}` : ''),
        blockedBy: ['C004'],
      })
      bump(blockedCount, 'C004')
      continue
    }
    if (demand.staff.length === 0) {
      unplaced.push({
        courseId: course.id,
        courseLabel: `${course.code} ${course.name}`,
        cohortId: cohort.id,
        cohortLabel: cohort.name,
        missing: toPlace,
        reason: 'No available instructor is qualified for this course',
        blockedBy: ['C007'],
      })
      bump(blockedCount, 'C007')
      continue
    }

    /**
     * Look for a legal placement.
     *
     * The normal pass is bounded: it stops once it has priced enough good
     * candidates, which keeps a solve to a couple of seconds. That bound can
     * strand a hard-to-place session, because breaking early may mean whole
     * days were never examined. So when the bounded pass finds nothing, the
     * caller retries exhaustively — every day, every slot, every room and
     * instructor, taking the first legal placement rather than the prettiest.
     */
    const shiftWindow = ctx.shiftById.get(cohort.shiftId)

    const findPlacement = (exhaustive: boolean): { cand: Candidate; cost: number } | null => {
      let best: { cand: Candidate; cost: number } | null = null
      let evaluated = 0

      // an exhaustive sweep is deterministic; the bounded one is seed-shuffled
      const days = exhaustive ? dayOrder : shuffled(rng, dayOrder)
      const rooms: (string | null)[] =
        course.kind === 'Online' ? [null] : exhaustive ? demand.rooms : roomPool
      const staff = exhaustive ? demand.staff : staffPool

      search: for (const day of days) {
        for (const slot of slotOrder) {
          if (slot + demand.length > grid.slots) continue
          // Cheaper here than as a rejection: the shift is fixed for the whole
          // demand, so slots outside it are never worth building a candidate for.
          if (shiftWindow && !fitsShift(shiftWindow, slot, demand.length)) continue

          for (const fid of staff) {
            const person = ctx.staffById.get(fid)
            if (!person) continue

            for (const rid of rooms) {
              const room = rid ? (ctx.roomById.get(rid) ?? null) : null

              const cand: Candidate = {
                course,
                cohort,
                staff: person,
                room,
                day,
                slot,
                length: demand.length,
                headcount: demand.headcount,
              }

              const fail = firstHardFailure(cand, occ, ctx)
              if (fail) {
                const seen = localReasons.get(fail.code)
                if (seen) seen.count++
                else localReasons.set(fail.code, { count: 1, message: fail.message })
                bump(blockedCount, fail.code)
                continue
              }

              if (exhaustive) return { cand, cost: softCost(cand, occ, ctx) }

              const cost = softCost(cand, occ, ctx)
              if (!best || cost < best.cost) best = { cand, cost }
              evaluated++
              if (cost === 0) break search
              if (evaluated >= 160 || Date.now() - started > budget) break search
            }
          }
        }
      }
      return best
    }

    while (toPlace > 0) {
      let best = findPlacement(false)
      if (!best && Date.now() - started <= budget) {
        repairs++
        best = findPlacement(true)
        if (best) repaired++
      }

      // Last resort: the only thing in the way may be another session holding
      // a room. Greedy placement has no backtracking, so without this a late
      // demand can be stranded by an early, arbitrary room choice. Move the
      // occupant to another room and take its place.
      if (!best && Date.now() - started <= budget) {
        const swap = tryDisplacement({ course, cohort, demand, sid }, occ, ctx, grid)
        if (swap) {
          occ = rebuild(inst, swap.sessions)
          sid = swap.nextSid
          displacements++
          placed++
          toPlace--
          continue
        }
      }

      if (!best) {
        const top = [...localReasons.entries()].toSorted((a, b) => b[1].count - a[1].count)
        unplaced.push({
          courseId: course.id,
          courseLabel: `${course.code} ${course.name}`,
          cohortId: cohort.id,
          cohortLabel: cohort.name,
          missing: toPlace,
          reason: top[0]?.[1].message ?? 'No feasible slot remained',
          blockedBy: top.slice(0, 4).map(([code]) => code),
        })
        break
      }

      const c = best.cand
      const session: Session = {
        id: `s-${sid++}`,
        courseId: c.course.id,
        staffId: c.staff.id,
        cohortId: c.cohort.id,
        roomId: c.room?.id ?? '',
        day: c.day,
        slot: c.slot,
        length: c.length,
      }
      occ.add(session)
      penalty += best.cost
      placed++
      toPlace--
    }
  }

  const violations = runAudits(occ.sessions, ctx, input.states)

  const bottlenecks: Bottleneck[] = [...blockedCount.entries()]
    .map(([code, blocked]) => {
      const def = CATALOGUE.find(c => c.id === code)
      return { code, label: def?.text ?? code, blocked, hard: def?.hard ?? true }
    })
    .toSorted((a, b) => b.blocked - a.blocked)
    .slice(0, 12)

  return {
    sessions: occ.sessions,
    violations,
    unplaced,
    bottlenecks,
    elapsedMs: Date.now() - started,
    repairs,
    repaired,
    displacements,
    penalty: Math.round(penalty),
    seed: input.seed,
    requested,
    placed,
  }
}

/* ------------------------------------------------------------------ *
 * Post-hoc audits
 * ------------------------------------------------------------------ */

function runAudits(
  sessions: Session[],
  ctx: EngineCtx,
  states: Record<string, ConstraintState>,
): Violation[] {
  const out: Violation[] = []

  for (const def of CATALOGUE) {
    const state = states[def.id]
    if (!state?.enabled || !isImplemented(def.rule)) continue
    const impl = RULES[def.rule as RuleKey]
    if (!impl?.audit) continue

    const params = { ...(def.args ?? {}), ...state.values }
    for (const message of impl.audit(sessions, ctx, params)) {
      out.push({
        code: def.id,
        message,
        hard: def.hard,
        sessionIds: [],
        weight: state.weight,
      })
    }
  }

  // independent verification: hard resource clashes must be zero. This is a
  // check on the solver itself, not on the schedule's authors.
  const seen = new Map<string, string>()
  for (const s of sessions) {
    for (let k = 0; k < s.length; k++) {
      const slot = s.slot + k
      const keys: [string, string][] = [
        [`f:${s.staffId}:${s.day}:${slot}`, 'Instructor double-booked'],
        [`g:${s.cohortId}:${s.day}:${slot}`, 'Cohort double-booked'],
      ]
      if (s.roomId) keys.push([`r:${s.roomId}:${s.day}:${slot}`, 'Room double-booked'])
      for (const [k2, label] of keys) {
        const prev = seen.get(k2)
        if (prev) {
          out.push({
            code: k2.startsWith('f') ? 'C001' : k2.startsWith('r') ? 'C002' : 'C003',
            message: `${label} — engine invariant broken`,
            hard: true,
            sessionIds: [prev, s.id],
            weight: 5,
          })
        } else seen.set(k2, s.id)
      }
    }
  }

  return out
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

/* ------------------------------------------------------------------ *
 * Interactive move checking — the same rules, one candidate
 * ------------------------------------------------------------------ */

export interface MoveCheck {
  ok: boolean
  rejections: Rejection[]
  /** a free, suitable room if the target room was the only problem */
  relocatedRoomId?: string
  softDelta: number
}

export function checkMove(
  inst: Institution,
  states: Record<string, ConstraintState>,
  sessions: Session[],
  sessionId: string,
  day: number,
  slot: number,
  locked: string[] = [],
  custom: CustomConstraint[] = [],
): MoveCheck {
  const { hard, soft } = activeRules(states)
  const ctx = buildContext(inst, hard, soft, new Set(locked), custom)

  const moving = sessions.find(s => s.id === sessionId)
  if (!moving) {
    return {
      ok: false,
      rejections: [{ code: '—', label: 'Unknown session', message: 'Session not found' }],
      softDelta: 0,
    }
  }

  const occ = new Occupancy(inst)
  for (const s of sessions) if (s.id !== sessionId) occ.add(s)

  const course = ctx.courseById.get(moving.courseId)!
  const cohort = ctx.cohortById.get(moving.cohortId)!
  const staff = ctx.staffById.get(moving.staffId)!
  const headcount = course.enrolment ?? cohort.size

  const base: Omit<Candidate, 'room'> = {
    course,
    cohort,
    staff,
    day,
    slot,
    length: moving.length,
    headcount,
  }

  const currentRoom = ctx.roomById.get(moving.roomId) ?? null
  let rejections = allHardFailures({ ...base, room: currentRoom }, occ, ctx)

  if (rejections.length === 0) {
    return {
      ok: true,
      rejections: [],
      softDelta: softCost({ ...base, room: currentRoom }, occ, ctx),
    }
  }

  // If every failure is about the room, try to relocate rather than refuse.
  const roomOnly = rejections.every(r => ROOM_CODES.has(r.code))
  if (roomOnly && currentRoom) {
    for (const alt of inst.rooms) {
      if (alt.id === currentRoom.id || alt.restricted) continue
      if (alt.kind !== course.roomKind || alt.capacity < headcount) continue
      if (!course.requires.every(f => alt.features.includes(f))) continue
      const altFailures = allHardFailures({ ...base, room: alt }, occ, ctx)
      if (altFailures.length === 0) {
        return {
          ok: true,
          rejections: [],
          relocatedRoomId: alt.id,
          softDelta: softCost({ ...base, room: alt }, occ, ctx),
        }
      }
    }
  }

  rejections = rejections.slice(0, 4)
  return { ok: false, rejections, softDelta: 0 }
}

/** Catalogue ids whose failures are purely about the chosen room. */
const ROOM_CODES = new Set([
  'C002',
  'C004',
  'C091',
  'C093',
  'C094',
  'C095',
  'C096',
  'C097',
  'C098',
  'C099',
  'C100',
  'C101',
  'C102',
  'C103',
  'C104',
  'C105',
  'C106',
  'C107',
  'C109',
  'C110',
  'C136',
  'C137',
  'C140',
  'C142',
  'C144',
  'C145',
  'C181',
])

/* ------------------------------------------------------------------ *
 * Displacement
 *
 * A single-level backtrack. The greedy pass commits to a room the moment it
 * finds a good one, which can leave a later session with nowhere to go even
 * though a legal arrangement exists. When that happens, this looks for a
 * placement whose only obstacle is an occupied room, moves the occupant to a
 * different room in the same slot, and puts the new session in its place.
 *
 * Every rule is re-checked for BOTH sessions, so a displacement can never
 * introduce a violation. It is bounded so a pathological case cannot spiral.
 * ------------------------------------------------------------------ */

const MAX_DISPLACEMENT_TRIES = 60

interface DisplacementRequest {
  course: Course
  cohort: Cohort
  demand: Demand
  sid: number
}

function rebuild(inst: Institution, sessions: Session[]): Occupancy {
  const next = new Occupancy(inst)
  for (const s of sessions) next.add(s)
  return next
}

function tryDisplacement(
  req: DisplacementRequest,
  occ: Occupancy,
  ctx: EngineCtx,
  grid: TimeGrid,
): { sessions: Session[]; nextSid: number } | null {
  const { course, cohort, demand } = req
  if (course.kind === 'Online') return null

  let tries = 0

  for (const day of grid.days) {
    for (let slot = 0; slot + demand.length <= grid.slots; slot++) {
      for (const fid of demand.staff) {
        const staff = ctx.staffById.get(fid)
        if (!staff) continue

        for (const rid of demand.rooms) {
          const room = ctx.roomById.get(rid)
          if (!room) continue

          // who is holding this room right now?
          const occupant = occ
            .roomOnDay(rid, day)
            .find(s => s.slot < slot + demand.length && slot < s.slot + s.length)
          if (!occupant) continue

          /* The budget counts displacements actually evaluated, not cells
             looked at. Counting the walk itself spent the whole allowance on
             empty rooms in the first day or two, so the pass reported "no
             displacement possible" without having tried one. */
          if (tries++ > MAX_DISPLACEMENT_TRIES) return null

          // everything except that occupant
          const without = occ.sessions.filter(s => s.id !== occupant.id)
          const trial = rebuild(ctx.inst, without)

          const candidate: Candidate = {
            course,
            cohort,
            staff,
            room,
            day,
            slot,
            length: demand.length,
            headcount: demand.headcount,
          }
          if (firstHardFailure(candidate, trial, ctx)) continue

          // provisionally place the new session, then rehome the occupant
          const placedSession: Session = {
            id: `s-${req.sid}`,
            courseId: course.id,
            staffId: staff.id,
            cohortId: cohort.id,
            roomId: room.id,
            day,
            slot,
            length: demand.length,
          }
          const withNew = rebuild(ctx.inst, [...without, placedSession])

          const moved = rehome(occupant, withNew, ctx, grid)
          if (!moved) continue

          return {
            sessions: [...without, placedSession, moved],
            nextSid: req.sid + 1,
          }
        }
      }
    }
  }
  return null
}

/** Find a legal new home for a displaced session, preferring its own slot. */
function rehome(session: Session, occ: Occupancy, ctx: EngineCtx, grid: TimeGrid): Session | null {
  const course = ctx.courseById.get(session.courseId)
  const cohort = ctx.cohortById.get(session.cohortId)
  const staff = ctx.staffById.get(session.staffId)
  if (!course || !cohort || !staff) return null

  const headcount = course.enrolment ?? cohort.size
  const rooms = ctx.inst.rooms.filter(
    r =>
      !r.restricted &&
      r.kind === course.roomKind &&
      r.capacity >= headcount &&
      course.requires.every(f => r.features.includes(f)),
  )

  // same day and slot in a different room is the least disruptive move
  const slots: [number, number][] = [[session.day, session.slot]]
  for (const day of grid.days) {
    for (let slot = 0; slot + session.length <= grid.slots; slot++) {
      if (day === session.day && slot === session.slot) continue
      slots.push([day, slot])
    }
  }

  for (const [day, slot] of slots) {
    for (const room of rooms) {
      if (day === session.day && slot === session.slot && room.id === session.roomId) continue
      const candidate: Candidate = {
        course,
        cohort,
        staff,
        room,
        day,
        slot,
        length: session.length,
        headcount,
      }
      if (firstHardFailure(candidate, occ, ctx)) continue
      return { ...session, roomId: room.id, day, slot }
    }
  }
  return null
}
