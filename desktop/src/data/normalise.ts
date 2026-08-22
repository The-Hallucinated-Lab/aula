/**
 * Config normalisation.
 *
 * A `SetupConfig` reaches the app from three places the type system cannot
 * vouch for: localStorage, an `.aula.json` the user picked from disk, and a
 * project written by an older build. Until this module existed those values
 * went straight to the UI, so a project saved before `overrides` was added
 * took the whole window down on the first `config.overrides.faculty` read.
 *
 * `normaliseConfig` is the single gate. It merges whatever arrived over the
 * defaults field by field, keeping every value that is usable and replacing
 * every value that is not, and it never throws.
 */

import {
  DEFAULT_CONFIG,
  type BuildingConfig, type CalendarConfig, type CampusConfig, type DeptConfig,
  type EquipmentConfig, type FacultyConfig, type ProgramConfig, type RoomGroupConfig,
  type SetupConfig,
} from './config'
import type { CustomConstraint } from './constraints/custom'
import type { CourseRecord, EntityOverrides, FacultyRecord } from './records'
import { isValidDate } from './academicCalendar'
import {
  CALENDAR_KINDS, COURSE_KINDS, EMPLOYMENT_TYPES, ROOM_KINDS,
  type CalendarEvent, type CourseKind, type EmploymentType, type RoomKind,
} from './model'

type Unknown = Record<string, unknown>

const asObject = (v: unknown): Unknown =>
  (v && typeof v === 'object' && !Array.isArray(v) ? v as Unknown : {})

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

const asString = (v: unknown, fallback: string): string =>
  (typeof v === 'string' && v.trim() !== '' ? v : fallback)

const asNumber = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

const asBool = (v: unknown, fallback: boolean): boolean =>
  (typeof v === 'boolean' ? v : fallback)

/** A "09:00"-style clock label; anything else falls back. */
const asTime = (v: unknown, fallback: string): string =>
  (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) ? v : fallback)

const asStringList = (v: unknown): string[] =>
  asArray(v).filter((x): x is string => typeof x === 'string')

const asPercent = (v: unknown, fallback: number): number =>
  Math.min(100, Math.max(0, asNumber(v, fallback)))

const asDayList = (v: unknown): number[] =>
  [...new Set(
    asArray(v)
      .map(d => Math.trunc(asNumber(d, -1)))
      .filter(d => d >= 0 && d <= 6),
  )].sort((a, b) => a - b)

/** A `yyyy-mm-dd` date; anything else falls back. */
const asDate = (v: unknown, fallback: string): string =>
  (typeof v === 'string' && isValidDate(v) ? v : fallback)

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v as T : fallback)

/** Make `id` unique within `seen`, then claim it. */
function claimId(seen: Set<string>, wanted: string): string {
  let id = wanted
  let n = 2
  while (seen.has(id)) id = `${wanted}-${n++}`
  seen.add(id)
  return id
}

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

function normaliseCalendar(v: unknown): CalendarConfig {
  const c = asObject(v)
  const d = DEFAULT_CONFIG.calendar
  const days = asDayList(c.workingDays)
  return {
    workingDays: days.length > 0 ? days : [...d.workingDays],
    dayStart: asTime(c.dayStart, d.dayStart),
    dayEnd: asTime(c.dayEnd, d.dayEnd),
    slotMinutes: Math.max(5, asNumber(c.slotMinutes, d.slotMinutes)),
    passingMinutes: Math.max(0, asNumber(c.passingMinutes, d.passingMinutes)),
    lunchStart: asTime(c.lunchStart, d.lunchStart),
    lunchMinutes: Math.max(0, asNumber(c.lunchMinutes, d.lunchMinutes)),
    eveningStart: asTime(c.eveningStart, d.eveningStart),
    earlyMorningUntil: asTime(c.earlyMorningUntil, d.earlyMorningUntil),
    /* Migrated below rather than kept: `holidays` was a bare list of dates with
       no name, no duration and no idea whether it closed the campus. Leaving
       both fields live would mean two answers to "is the 15th a teaching day". */
    holidays: [],
    termWeeks: Math.max(1, asNumber(c.termWeeks, d.termWeeks)),
    termStart: asDate(c.termStart, d.termStart),
    termEnd: asDate(c.termEnd, d.termEnd),
    events: normaliseEvents(c.events, asStringList(c.holidays)),
  }
}

/**
 * Calendar events, with any pre-calendar `holidays` list folded in.
 *
 * A project written before the calendar existed carries bare ISO dates. Each
 * becomes a named one-day closure so it keeps meaning instead of quietly
 * vanishing the first time the project is saved again.
 */
function normaliseEvents(v: unknown, legacyHolidays: string[]): CalendarEvent[] {
  const seen = new Set<string>()
  const kinds = CALENDAR_KINDS.map(k => k.id)

  const out: CalendarEvent[] = asArray(v).flatMap((raw, i) => {
    const e = asObject(raw)
    const start = asDate(e.start, '')
    if (!start) return []
    const end = asDate(e.end, start)
    return [{
      id: claimId(seen, asString(e.id, `ev-${i + 1}`)),
      name: asString(e.name, 'Untitled entry'),
      kind: oneOf(e.kind, kinds, 'holiday'),
      start,
      // an inverted range would silently expand to nothing
      end: end >= start ? end : start,
      blocksTeaching: asBool(e.blocksTeaching, true),
      weekly: asBool(e.weekly, false),
      fromSlot: Math.max(-1, Math.trunc(asNumber(e.fromSlot, -1))),
      toSlot: Math.max(-1, Math.trunc(asNumber(e.toSlot, -1))),
      note: asString(e.note, ''),
    }]
  })

  for (const date of legacyHolidays) {
    if (!isValidDate(date) || out.some(e => e.start === date && e.end === date)) continue
    out.push({
      id: claimId(seen, `ev-legacy-${date}`),
      name: 'Holiday',
      kind: 'holiday',
      start: date,
      end: date,
      blocksTeaching: true,
      weekly: false,
      fromSlot: -1,
      toSlot: -1,
      note: 'Imported from an earlier project file',
    })
  }

  return out.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))
}

function normaliseCampuses(v: unknown): CampusConfig[] {
  const seen = new Set<string>()
  const list = asArray(v).map((raw, i) => {
    const c = asObject(raw)
    return {
      id: claimId(seen, asString(c.id, `campus-${i + 1}`)),
      name: asString(c.name, `Campus ${i + 1}`),
      travelMinutes: Math.max(0, asNumber(c.travelMinutes, 0)),
    }
  })
  return list.length > 0 ? list : DEFAULT_CONFIG.campuses.map(c => ({ ...c }))
}

function normaliseDepartments(v: unknown): DeptConfig[] {
  // Department codes are the join key for programmes, staff and courses, so a
  // duplicate would silently merge two departments into one.
  const seen = new Set<string>()
  const list: DeptConfig[] = []
  for (const [i, raw] of asArray(v).entries()) {
    const d = asObject(raw)
    const code = asString(d.code, `D${i + 1}`).toUpperCase()
    if (seen.has(code)) continue
    seen.add(code)
    list.push({ code, name: asString(d.name, `Department ${i + 1}`) })
  }
  return list.length > 0 ? list : DEFAULT_CONFIG.departments.map(d => ({ ...d }))
}

function normalisePrograms(v: unknown, depts: DeptConfig[]): ProgramConfig[] {
  const codes = new Set(depts.map(d => d.code))
  const fallbackDept = depts[0]?.code ?? 'GEN'
  const seen = new Set<string>()
  const list = asArray(v).map((raw, i) => {
    const p = asObject(raw)
    const dept = asString(p.dept, fallbackDept)
    const mode = p.mode === 'evening' || p.mode === 'weekend' ? p.mode : 'day'
    return {
      id: claimId(seen, asString(p.id, `p-${i + 1}`)),
      code: asString(p.code, `Programme ${i + 1}`),
      name: asString(p.name, `Programme ${i + 1}`),
      dept: codes.has(dept) ? dept : fallbackDept,
      years: Math.max(1, Math.trunc(asNumber(p.years, 3))),
      sectionsPerYear: Math.max(0, Math.trunc(asNumber(p.sectionsPerYear, 1))),
      studentsPerSection: Math.max(1, Math.trunc(asNumber(p.studentsPerSection, 60))),
      mode: mode as ProgramConfig['mode'],
      coreCourses: Math.max(0, Math.trunc(asNumber(p.coreCourses, 4))),
      labCourses: Math.max(0, Math.trunc(asNumber(p.labCourses, 1))),
      electiveCourses: Math.max(0, Math.trunc(asNumber(p.electiveCourses, 1))),
      coreWeekly: Math.max(1, Math.trunc(asNumber(p.coreWeekly, 3))),
      labBlock: Math.max(1, Math.trunc(asNumber(p.labBlock, 2))),
    }
  })
  return list.length > 0 ? list : DEFAULT_CONFIG.programs.map(p => ({ ...p }))
}

function normaliseBuildings(v: unknown, campuses: CampusConfig[]): BuildingConfig[] {
  const campusIds = new Set(campuses.map(c => c.id))
  const fallbackCampus = campuses[0]?.id ?? 'main'
  const seen = new Set<string>()
  const list = asArray(v).map((raw, i) => {
    const b = asObject(raw)
    const campus = asString(b.campus, fallbackCampus)
    return {
      id: claimId(seen, asString(b.id, `b-${i + 1}`)),
      name: asString(b.name, `Building ${i + 1}`),
      campus: campusIds.has(campus) ? campus : fallbackCampus,
      walkMinutes: Math.max(0, asNumber(b.walkMinutes, 5)),
      floors: Math.max(1, Math.trunc(asNumber(b.floors, 1))),
      hasElevator: asBool(b.hasElevator, false),
      accessible: asBool(b.accessible, true),
    }
  })
  return list.length > 0 ? list : DEFAULT_CONFIG.buildings.map(b => ({ ...b }))
}

function normaliseRoomGroups(v: unknown, buildings: BuildingConfig[]): RoomGroupConfig[] {
  const byId = new Map(buildings.map(b => [b.id, b]))
  const fallbackBuilding = buildings[0]?.id ?? 'b-a'
  const seen = new Set<string>()
  const list = asArray(v).map((raw, i) => {
    const g = asObject(raw)
    const wanted = asString(g.buildingId, fallbackBuilding)
    // a group pointing at a deleted building would produce no rooms at all
    const buildingId = byId.has(wanted) ? wanted : fallbackBuilding
    /* Storeys can be reduced after the rooms were laid out. Clamping here keeps
       a two-storey block from claiming rooms on its fourth floor, which the
       Data screen would then file under a floor heading nobody can reach. */
    const floors = Math.max(1, byId.get(buildingId)?.floors ?? 1)
    return {
      id: claimId(seen, asString(g.id, `rg-${i + 1}`)),
      buildingId,
      floor: Math.min(floors, Math.max(1, Math.trunc(asNumber(g.floor, 1)))),
      kind: oneOf(g.kind, ROOM_KINDS, 'Lecture'),
      count: Math.max(0, Math.trunc(asNumber(g.count, 0))),
      capacity: Math.max(1, Math.trunc(asNumber(g.capacity, 60))),
      turnoverMinutes: Math.max(0, asNumber(g.turnoverMinutes, 0)),
      features: asStringList(g.features),
      specialisation: typeof g.specialisation === 'string' ? g.specialisation : undefined,
    }
  })
  return list.length > 0
    ? list
    : DEFAULT_CONFIG.roomGroups.map(g => ({ ...g, features: [...g.features] }))
}

function normaliseFaculty(v: unknown): FacultyConfig {
  const f = asObject(v)
  const d = DEFAULT_CONFIG.faculty
  const mix = asObject(f.mix)
  return {
    total: Math.max(0, Math.trunc(asNumber(f.total, d.total))),
    mix: {
      professor: Math.max(0, asNumber(mix.professor, d.mix.professor)),
      associate: Math.max(0, asNumber(mix.associate, d.mix.associate)),
      assistant: Math.max(0, asNumber(mix.assistant, d.mix.assistant)),
      adjunct: Math.max(0, asNumber(mix.adjunct, d.mix.adjunct)),
      visiting: Math.max(0, asNumber(mix.visiting, d.mix.visiting)),
      ta: Math.max(0, asNumber(mix.ta, d.mix.ta)),
    },
    maxPerDay: Math.max(1, asNumber(f.maxPerDay, d.maxPerDay)),
    maxPerWeek: Math.max(1, asNumber(f.maxPerWeek, d.maxPerWeek)),
    adjunctMaxPerWeek: Math.max(1, asNumber(f.adjunctMaxPerWeek, d.adjunctMaxPerWeek)),
    taMaxPerWeek: Math.max(1, asNumber(f.taMaxPerWeek, d.taMaxPerWeek)),
    qualificationsMin: Math.max(1, asNumber(f.qualificationsMin, d.qualificationsMin)),
    qualificationsMax: Math.max(1, asNumber(f.qualificationsMax, d.qualificationsMax)),
    researchDayShare: asPercent(f.researchDayShare, d.researchDayShare),
    sabbaticalShare: asPercent(f.sabbaticalShare, d.sabbaticalShare),
    accessibilityShare: asPercent(f.accessibilityShare, d.accessibilityShare),
  }
}

function normaliseEquipment(v: unknown): EquipmentConfig[] {
  const seen = new Set<string>()
  return asArray(v).map((raw, i) => {
    const e = asObject(raw)
    return {
      id: claimId(seen, asString(e.id, `eq-${i + 1}`)),
      name: asString(e.name, `Equipment ${i + 1}`),
      units: Math.max(1, Math.trunc(asNumber(e.units, 1))),
    }
  })
}

function normaliseOverrides(
  v: unknown,
  ctx: { departments: DeptConfig[]; buildings: BuildingConfig[]; programs: ProgramConfig[] },
): EntityOverrides {
  const o = asObject(v)
  const out: EntityOverrides = {}
  const deptCodes = new Set(ctx.departments.map(d => d.code))
  const buildingIds = new Set(ctx.buildings.map(b => b.id))
  const programIds = new Set(ctx.programs.map(p => p.id))
  const fallbackDept = ctx.departments[0]?.code ?? 'GEN'
  const fallbackBuilding = ctx.buildings[0]?.id ?? 'b-a'
  const fallbackProgram = ctx.programs[0]?.id ?? 'p-1'

  /* Each key is only materialised when the project actually carried a list.
     An absent key means "still generated", which is not the same as "empty". */

  if (Array.isArray(o.faculty)) {
    const seen = new Set<string>()
    out.faculty = o.faculty.map((raw, i) => {
      const f = asObject(raw)
      const dept = asString(f.dept, fallbackDept)
      const primary = [...new Set(asStringList(f.courseIds))]
      /* A course cannot be both the first choice and the fallback for the same
         person: the solver would then read one preference twice and the editor
         would show the same chip lit in two lists. */
      const secondary = [...new Set(asStringList(f.secondaryCourseIds))]
        .filter(id => !primary.includes(id))
      return {
        id: claimId(seen, asString(f.id, `f-r${i}`)),
        staffCode: asString(f.staffCode, ''),
        name: asString(f.name, `Staff member ${i + 1}`),
        dept: deptCodes.has(dept) ? dept : fallbackDept,
        rank: asString(f.rank, 'Assistant Professor') as FacultyRecord['rank'],
        employment: oneOf<EmploymentType>(f.employment, EMPLOYMENT_TYPES, 'Full-time'),
        email: asString(f.email, ''),
        programIds: [...new Set(asStringList(f.programIds))].filter(id => programIds.has(id)),
        courseIds: primary,
        secondaryCourseIds: secondary,
        sessionKinds: [...new Set(
          asStringList(f.sessionKinds).filter((k): k is CourseKind =>
            (COURSE_KINDS as readonly string[]).includes(k)),
        )],
        maxAudience: Math.max(0, Math.trunc(asNumber(f.maxAudience, 0))),
        maxPerDay: Math.max(1, Math.trunc(asNumber(f.maxPerDay, 5))),
        maxPerWeek: Math.max(1, Math.trunc(asNumber(f.maxPerWeek, 18))),
        maxConsecutive: Math.max(0, Math.trunc(asNumber(f.maxConsecutive, 0))),
        unavailableDays: asDayList(f.unavailableDays),
        availableDays: asDayList(f.availableDays),
        blockedSlots: [...new Set(asStringList(f.blockedSlots).filter(x => /^\d+:\d+$/.test(x)))],
        preferredShift: oneOf(
          f.preferredShift, ['any', 'morning', 'afternoon', 'evening'] as const, 'any',
        ),
        preferredRoomKind: typeof f.preferredRoomKind === 'string'
          && (ROOM_KINDS as readonly string[]).includes(f.preferredRoomKind)
          ? f.preferredRoomKind as RoomKind
          : undefined,
        homeBuildingId: typeof f.homeBuildingId === 'string' && buildingIds.has(f.homeBuildingId)
          ? f.homeBuildingId
          : undefined,
        onSabbatical: asBool(f.onSabbatical, false),
        needsAccessibleRoom: asBool(f.needsAccessibleRoom, false),
      }
    })
  }

  if (Array.isArray(o.courses)) {
    const seen = new Set<string>()
    out.courses = o.courses.map((raw, i) => {
      const c = asObject(raw)
      const dept = asString(c.dept, fallbackDept)
      const programId = asString(c.programId, fallbackProgram)
      return {
        id: claimId(seen, asString(c.id, `c-r${i}`)),
        code: asString(c.code, `COURSE${i + 1}`),
        name: asString(c.name, `Course ${i + 1}`),
        dept: deptCodes.has(dept) ? dept : fallbackDept,
        programId: programIds.has(programId) ? programId : fallbackProgram,
        year: Math.max(1, Math.trunc(asNumber(c.year, 1))),
        kind: asString(c.kind, 'Core') as CourseRecord['kind'],
        weekly: Math.max(0, Math.trunc(asNumber(c.weekly, 3))),
        blockLength: Math.max(1, Math.trunc(asNumber(c.blockLength, 1))),
        roomKind: oneOf(c.roomKind, ROOM_KINDS, 'Lecture'),
        requires: [...new Set(asStringList(c.requires))],
        suspended: asBool(c.suspended, false),
      }
    })
  }

  if (Array.isArray(o.rooms)) {
    const seen = new Set<string>()
    out.rooms = o.rooms.map((raw, i) => {
      const r = asObject(raw)
      const buildingId = asString(r.buildingId, fallbackBuilding)
      return {
        id: claimId(seen, asString(r.id, `r-r${i}`)),
        name: asString(r.name, `Room ${i + 1}`),
        buildingId: buildingIds.has(buildingId) ? buildingId : fallbackBuilding,
        floor: Math.max(0, Math.trunc(asNumber(r.floor, 1))),
        kind: oneOf(r.kind, ROOM_KINDS, 'Lecture'),
        capacity: Math.max(1, Math.trunc(asNumber(r.capacity, 60))),
        turnoverMinutes: Math.max(0, asNumber(r.turnoverMinutes, 0)),
        features: [...new Set(asStringList(r.features))],
        closedDays: asDayList(r.closedDays),
        blockedSlots: [...new Set(asStringList(r.blockedSlots).filter(s => /^\d+:\d+$/.test(s)))],
        restricted: asBool(r.restricted, false),
      }
    })
  }

  if (o.sections && typeof o.sections === 'object' && !Array.isArray(o.sections)) {
    const sections: Record<string, number> = {}
    for (const [key, value] of Object.entries(o.sections as Unknown)) {
      const n = asNumber(value, NaN)
      if (Number.isFinite(n)) sections[key] = Math.max(0, Math.trunc(n))
    }
    out.sections = sections
  }

  return out
}

function normaliseCustom(v: unknown): CustomConstraint[] {
  // Custom rules are re-checked against the template registry when they are
  // compiled; here we only guarantee a list of plausibly-shaped entries.
  const seen = new Set<string>()
  return asArray(v).filter((raw): raw is CustomConstraint => {
    const c = asObject(raw)
    if (typeof c.id !== 'string' || typeof c.template !== 'string') return false
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Turn anything that claims to be a `SetupConfig` into one every consumer can
 * rely on: every array present, every id unique, every cross-reference
 * resolvable, every number finite.
 */
export function normaliseConfig(input: unknown): SetupConfig {
  const raw = asObject(input)
  const inst = asObject(raw.institution)
  const d = DEFAULT_CONFIG

  const campuses = normaliseCampuses(raw.campuses)
  const departments = normaliseDepartments(raw.departments)
  const programs = normalisePrograms(raw.programs, departments)
  const buildings = normaliseBuildings(raw.buildings, campuses)
  const roomGroups = normaliseRoomGroups(raw.roomGroups, buildings)

  return {
    version: 1,
    institution: {
      name: asString(inst.name, d.institution.name),
      academicYear: asString(inst.academicYear, d.institution.academicYear),
      term: asString(inst.term, d.institution.term),
    },
    calendar: normaliseCalendar(raw.calendar),
    campuses,
    departments,
    programs,
    buildings,
    roomGroups,
    faculty: normaliseFaculty(raw.faculty),
    equipment: normaliseEquipment(raw.equipment),
    seed: Math.trunc(asNumber(raw.seed, d.seed)) || d.seed,
    overrides: normaliseOverrides(raw.overrides, { departments, buildings, programs }),
    customConstraints: normaliseCustom(raw.customConstraints),
  }
}
