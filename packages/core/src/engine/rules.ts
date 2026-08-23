/**
 * Rule registry.
 *
 * One entry per enforced constraint family. `check` gates hard placements,
 * `cost` scores soft preferences, `audit` catches whole-schedule properties.
 *
 * Rules never read the catalogue text — they read parameters. That is what
 * lets an administrator change "minimum overnight rest" from 12 h to 10 h
 * without anybody touching this file.
 */

import type { RoomFeature, Session } from '../data/model'
import { blackoutsCovering, meetingsInTerm } from '../data/academicCalendar'
import type { RuleKey } from '../data/constraints/types'
import {
  bool,
  consecutiveRun,
  num,
  overlaps,
  slotAtOrAfter,
  slotEndMinutes,
  slotEndingBefore,
  str,
  type Candidate,
  type RuleImpl,
} from './context'

const ok = null

/** Does this course actually ask for the feature this constraint governs? */
function needsFeature(c: Candidate, feature: string): boolean {
  return c.course.requires.includes(feature as RoomFeature)
}

function hasFeature(c: Candidate, feature: string): boolean {
  return !!c.room && c.room.features.includes(feature as RoomFeature)
}

const key = (day: number, slot: number) => `${day}:${slot}`

function coversAny(day: number, slot: number, length: number, set: string[]): boolean {
  for (let k = 0; k < length; k++) if (set.includes(key(day, slot + k))) return true
  return false
}

/* ================================================================== *
 * Registry
 * ================================================================== */

export const RULES: Partial<Record<RuleKey, RuleImpl>> = {
  /* ---------- resource exclusivity & availability ---------- */

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

  /* ---------- staff workload & legal ---------- */

  facultyMaxWeekly: {
    check: (c, occ, _ctx, p) => {
      const cap = Math.min(num(p, 'maxHours', 18), c.staff.maxPerWeek)
      return occ.staffWeekHours(c.staff.id) + c.length > cap
        ? `${c.staff.name} would exceed ${cap} teaching hours this week`
        : ok
    },
  },

  facultyMaxPerDay: {
    check: (c, occ) =>
      occ.staffDayHours(c.staff.id, c.day) + c.length > c.staff.maxPerDay
        ? `${c.staff.name} would exceed ${c.staff.maxPerDay} hours on this day`
        : ok,
  },

  adjunctMaxWeekly: {
    check: (c, occ, _ctx, p) => {
      if (c.staff.rank !== 'Adjunct') return ok
      const cap = num(p, 'maxHours', 9)
      return occ.staffWeekHours(c.staff.id) + c.length > cap
        ? `Adjunct ${c.staff.name} would exceed the ${cap} h part-time limit`
        : ok
    },
  },

  taMaxWeekly: {
    check: (c, occ, _ctx, p) => {
      if (c.staff.rank !== 'Teaching Assistant') return ok
      const cap = num(p, 'maxHours', 12)
      return occ.staffWeekHours(c.staff.id) + c.length > cap
        ? `TA ${c.staff.name} would exceed the ${cap} h union limit`
        : ok
    },
  },

  facultyBlockedDays: {
    check: c =>
      c.staff.blockedDays.includes(c.day)
        ? `${c.staff.name} has a protected research/administrative day`
        : ok,
  },

  facultyBlockedSlots: {
    check: c =>
      coversAny(c.day, c.slot, c.length, c.staff.blockedSlots)
        ? `${c.staff.name} is unavailable in this slot`
        : ok,
  },

  visitingCampusDays: {
    check: c =>
      c.staff.campusDays.length > 0 && !c.staff.campusDays.includes(c.day)
        ? `${c.staff.name} is not on campus this day`
        : ok,
  },

  facultyQualified: {
    check: c => {
      if (!c.staff.subjects.includes(c.course.id)) {
        return `${c.staff.name} is not qualified for ${c.course.code}`
      }
      /* A tutor engaged for small groups is not qualified for a 200-seat
         combined lecture, whatever their subject expertise says. Programme
         eligibility and session-kind authorisation are already resolved into
         `subjects` by the generator; headcount cannot be, because it belongs to
         the cohort rather than the course. */
      const cap = c.staff.maxHeadcount
      return cap > 0 && c.headcount > cap
        ? `${c.staff.name} takes groups of up to ${cap}; this one is ${c.headcount}`
        : ok
    },
  },

  facultyMinRest: {
    check: (c, occ, ctx, p) => {
      const restMinutes = num(p, 'restHours', 12) * 60
      const dayIdx = ctx.grid.days.indexOf(c.day)
      if (dayIdx < 0) return ok

      const start = ctx.grid.starts[c.slot]
      const end = slotEndMinutes(ctx.grid, c.slot, c.length)

      const prevDay = ctx.grid.days[dayIdx - 1]
      if (prevDay !== undefined) {
        for (const s of occ.staffOnDay(c.staff.id, prevDay)) {
          const prevEnd = slotEndMinutes(ctx.grid, s.slot, s.length)
          if (start + 24 * 60 - prevEnd < restMinutes) {
            return `${c.staff.name} would get under ${num(p, 'restHours', 12)} h rest after the previous evening`
          }
        }
      }
      const nextDay = ctx.grid.days[dayIdx + 1]
      if (nextDay !== undefined) {
        for (const s of occ.staffOnDay(c.staff.id, nextDay)) {
          const nextStart = ctx.grid.starts[s.slot]
          if (nextStart + 24 * 60 - end < restMinutes) {
            return `${c.staff.name} would get under ${num(p, 'restHours', 12)} h rest before the next morning`
          }
        }
      }
      return ok
    },
  },

  facultyMaxConsecutive: {
    check: (c, occ, _ctx, p) => {
      const policy = num(p, 'maxConsecutive', 3)
      // a personal limit only ever tightens the institutional one
      const personal = c.staff.maxConsecutive
      const cap = personal > 0 ? Math.min(policy, personal) : policy
      const run = consecutiveRun(occ.staffOnDay(c.staff.id, c.day), c.slot, c.length)
      return run > cap ? `${c.staff.name} would teach ${run} hours back-to-back (cap ${cap})` : ok
    },
  },

  /*
   * C017 reads: "Instructors must be granted a guaranteed lunch break **if
   * teaching across the midday block**." The qualifier is the whole rule. This
   * previously protected the midday slots for everyone who taught at all that
   * day, including someone whose entire day ended before lunch began — wider
   * than the constraint it implements, and, on a two-shift grid where the
   * boundary sits at midday, the single largest source of refusals.
   *
   * Someone teaching only one side of the break takes lunch on the other side
   * by construction. Someone spanning it does not, and is the person C017 is
   * about.
   */
  facultyLunch: {
    check: (c, occ, ctx) => {
      const lunch = ctx.grid.lunchSlots
      if (lunch.length === 0) return ok

      const taken = new Set<number>()
      for (const s of occ.staffOnDay(c.staff.id, c.day)) {
        for (let k = 0; k < s.length; k++) taken.add(s.slot + k)
      }
      for (let k = 0; k < c.length; k++) taken.add(c.slot + k)

      const first = lunch[0]
      const last = lunch[lunch.length - 1]
      let before = false
      let after = false
      for (const s of taken) {
        if (s < first) before = true
        else if (s > last) after = true
      }
      if (!before || !after) return ok

      return lunch.every(s => taken.has(s))
        ? `${c.staff.name} teaches either side of the midday block and would lose the protected lunch break`
        : ok
    },
  },

  facultyAccessibleRoom: {
    check: (c, _occ, ctx) => {
      if (!c.staff.needsAccessibleRoom || !c.room) return ok
      const b = ctx.buildingById.get(c.room.buildingId)
      const stepFree =
        c.room.features.includes('wheelchairAccess') ||
        c.room.floor === 0 ||
        c.room.floor === 1 ||
        !!b?.hasElevator
      return stepFree && b?.accessible !== false
        ? ok
        : `${c.room.name} does not meet ${c.staff.name}'s access accommodation`
    },
  },

  labSupervisionCap: {
    check: (c, occ, _ctx, p) => {
      if (c.course.kind !== 'Lab') return ok
      const cap = num(p, 'maxLabHours', 8)
      return occ.staffLabWeekHours(c.staff.id) + c.length > cap
        ? `${c.staff.name} would exceed ${cap} h of lab supervision`
        : ok
    },
  },

  newFacultyLoad: {
    check: (c, occ, _ctx, p) => {
      if (!c.staff.isNew) return ok
      const cap = num(p, 'maxHours', 12)
      return occ.staffWeekHours(c.staff.id) + c.length > cap
        ? `${c.staff.name} is in their first year (cap ${cap} h)`
        : ok
    },
  },

  newPreparationCap: {
    check: (c, _occ, _ctx, p) => {
      const cap = num(p, 'maxNew', 2)
      return c.staff.newPreparations > cap
        ? `${c.staff.name} already carries ${c.staff.newPreparations} new preparations (cap ${cap})`
        : ok
    },
  },

  adjunctSpreadCap: {
    check: (c, occ, _ctx, p) => {
      if (c.staff.rank !== 'Adjunct') return ok
      const cap = num(p, 'maxDays', 3)
      const days = occ.staffTeachingDays(c.staff.id)
      return !days.has(c.day) && days.size >= cap
        ? `Adjunct ${c.staff.name} would be on campus more than ${cap} days`
        : ok
    },
  },

  consecutiveDayCap: {
    cost: (c, occ, ctx, p) => {
      const cap = num(p, 'maxDays', 3)
      const days = [...occ.staffTeachingDays(c.staff.id), c.day].sort((a, b) => a - b)
      let run = 1,
        best = 1
      for (let i = 1; i < days.length; i++) {
        run = days[i] === days[i - 1] + 1 ? run + 1 : 1
        best = Math.max(best, run)
      }
      void ctx
      return best > cap ? Math.min(1, (best - cap) / ctx.grid.days.length) : 0
    },
  },

  overtimeAvoid: {
    cost: (c, occ, _ctx, p) => {
      const threshold = num(p, 'threshold', 16)
      const after = occ.staffWeekHours(c.staff.id) + c.length
      return after > threshold ? Math.min(1, (after - threshold) / 6) : 0
    },
  },

  seniorityLoadFloor: {
    cost: (c, occ, _ctx, p) => {
      if (c.staff.rank !== 'Adjunct') return 0
      const floor = num(p, 'floorHours', 8)
      // penalise loading adjuncts while the ranked staff are still light
      return occ.staffWeekHours(c.staff.id) < floor ? 0.2 : 0.5
    },
  },

  taRatio: {
    cost: c => (c.staff.rank === 'Teaching Assistant' && c.headcount > 50 ? 0.6 : 0),
  },

  /* ---------- staff preferences (soft) ---------- */

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

  /* ---------- cohort & pathway ---------- */

  cohortMaxConsecutive: {
    check: (c, occ, _ctx, p) => {
      const kind = str(p, 'kind')
      if (kind && c.course.kind !== kind) return ok
      const cap = num(p, 'maxConsecutive', 4)
      const existing = kind
        ? occ.cohortOnDay(c.cohort.id, c.day).filter(s => s.courseId === c.course.id)
        : occ.cohortOnDay(c.cohort.id, c.day)
      const run = consecutiveRun(existing, c.slot, c.length)
      return run > cap ? `${c.cohort.name} would sit ${run} consecutive hours (cap ${cap})` : ok
    },
  },

  cohortLunch: {
    check: (c, occ, ctx) => {
      const lunch = ctx.grid.lunchSlots
      if (lunch.length === 0) return ok
      const taken = new Set<number>()
      for (const s of occ.cohortOnDay(c.cohort.id, c.day)) {
        for (let k = 0; k < s.length; k++) taken.add(s.slot + k)
      }
      for (let k = 0; k < c.length; k++) taken.add(c.slot + k)
      return lunch.every(s => taken.has(s))
        ? `${c.cohort.name} would lose the protected lunch break`
        : ok
    },
  },

  eveningProgramStart: {
    check: (c, _occ, ctx, p) => {
      if (c.cohort.mode !== 'evening' && !c.course.eveningOnly) return ok
      const first = slotAtOrAfter(ctx.grid, str(p, 'earliest', '17:30'), ctx.grid.eveningFrom)
      return c.slot < first
        ? `Evening programme cannot start before ${str(p, 'earliest', '17:30')}`
        : ok
    },
  },

  protectedCohortSlots: {
    check: c =>
      coversAny(c.day, c.slot, c.length, c.cohort.protectedSlots)
        ? `${c.cohort.name} has a protected block in this slot`
        : ok,
  },

  firstYearNoNight: {
    check: (c, _occ, ctx) =>
      c.cohort.year === 1 && c.slot >= ctx.grid.eveningFrom
        ? 'First-year cohorts are not scheduled into night slots'
        : ok,
  },

  lateNightCap: {
    check: (c, occ, ctx, p) => {
      const from = slotAtOrAfter(ctx.grid, str(p, 'after', '21:00'), ctx.grid.slots)
      if (c.slot + c.length <= from) return ok
      const cap = num(p, 'maxPerWeek', 2)
      return occ.cohortLateCount(c.cohort.id) >= cap
        ? `${c.cohort.name} already has ${cap} late-night sessions this week`
        : ok
    },
  },

  earlyStartStreakCap: {
    cost: (c, occ, ctx, p) => {
      if (c.slot >= ctx.grid.earlyUntil) return 0
      const cap = num(p, 'maxDays', 3)
      const days = [...occ.cohortEarlyDaySet(c.cohort.id), c.day].sort((a, b) => a - b)
      let run = 1,
        best = 1
      for (let i = 1; i < days.length; i++) {
        run = days[i] === days[i - 1] + 1 ? run + 1 : 1
        best = Math.max(best, run)
      }
      return best > cap ? 1 : 0
    },
  },

  cohortMaxGap: {
    cost: (c, occ, _ctx, p) => {
      const cap = num(p, 'maxGap', 3)
      const same = occ.cohortOnDay(c.cohort.id, c.day)
      if (same.length === 0) return 0
      const slots = [...same.map(s => s.slot), c.slot]
      const ends = [...same.map(s => s.slot + s.length), c.slot + c.length]
      const span = Math.max(...ends) - Math.min(...slots)
      const taught = same.reduce((a, s) => a + s.length, 0) + c.length
      const gap = span - taught
      return gap > cap ? Math.min(1, (gap - cap) / 4) : 0
    },
  },

  cohortMinGap: {
    cost: (c, occ) => {
      const same = occ.cohortOnDay(c.cohort.id, c.day)
      if (c.course.kind !== 'Lab' && c.course.kind !== 'Studio') return 0
      const adjacent = same.some(s => s.slot + s.length === c.slot || c.slot + c.length === s.slot)
      return adjacent ? 0.4 : 0
    },
  },

  cohortDayPartBalance: {
    cost: (c, occ, ctx) => {
      const all = ctx.grid.days.flatMap(d => occ.cohortOnDay(c.cohort.id, d))
      if (all.length < 4) return 0
      const morning = all.filter(s => s.slot < ctx.grid.slots / 2).length
      const share = morning / all.length
      const adding = c.slot < ctx.grid.slots / 2 ? 1 : 0
      const nextShare = (morning + adding) / (all.length + 1)
      // cost rises as the cohort's week collapses into one half of the day
      return Math.max(0, Math.abs(nextShare - 0.5) - Math.abs(share - 0.5)) * 2
    },
  },

  clusterCohortDays: {
    cost: (c, occ, ctx) => {
      if (c.cohort.mode === 'day') return 0
      const days = occ.staffTeachingDays(c.cohort.id)
      void days
      const used = new Set(ctx.grid.days.filter(d => occ.cohortOnDay(c.cohort.id, d).length > 0))
      return used.size === 0 || used.has(c.day) ? 0 : 0.8
    },
  },

  electiveGroupClashFree: {
    check: (c, occ, ctx) => {
      const group = c.course.electiveGroup
      if (!group) return ok
      for (let k = 0; k < c.length; k++) {
        const clash = occ.cohortOnDay(c.cohort.id, c.day).some(s => {
          const other = ctx.courseById.get(s.courseId)
          return (
            other?.electiveGroup === group &&
            other.id !== c.course.id &&
            overlaps(s.slot, s.length, c.slot, c.length)
          )
        })
        if (clash) return `Elective group ${group} already meets in this slot`
      }
      return ok
    },
  },

  /* ---------- curriculum sequencing ---------- */

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
      const earliest = lectures
        .flatMap(l => [...occ.cohortCourseMeetsOn(c.cohort.id, l.id)])
        .sort((a, b) => a - b)[0]
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
      const earliest = parents
        .flatMap(l => [...occ.cohortCourseMeetsOn(c.cohort.id, l.id)])
        .sort((a, b) => a - b)[0]
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

  /* ---------- rooms, features & equipment ---------- */

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

  /* ---------- geography & travel ---------- */

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

  /* ---------- accessibility ---------- */

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

  /* ---------- departmental & administrative ---------- */

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

  /* ---------- scheduling quality & policy ---------- */

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

/** Rule keys that actually have an implementation right now. */
export const IMPLEMENTED = new Set<RuleKey>(Object.keys(RULES) as RuleKey[])

export const isImplemented = (rule?: RuleKey): boolean => !!rule && IMPLEMENTED.has(rule)

/** Report rule keys referenced by the catalogue but not implemented here. */
export function unimplementedRules(referenced: (RuleKey | undefined)[]): RuleKey[] {
  const missing = new Set<RuleKey>()
  for (const r of referenced) if (r && !IMPLEMENTED.has(r)) missing.add(r)
  return [...missing]
}

export type { RuleImpl }
export type { Session }
