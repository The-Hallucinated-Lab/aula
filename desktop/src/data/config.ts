/**
 * Aula — setup configuration.
 *
 * This is the entire surface the administrator fills in. The generator turns a
 * `SetupConfig` into an `Institution`; the solver never reads this file. Keep
 * it serialisable: it is what gets written to an `.aula.json` project file.
 */

import { DAY_NAMES } from './model'
import type { CalendarEvent, RoomKind } from './model'
import {
  isValidDate, lostWeekdays, weekdayAttrition, weeklyBlackoutCells,
} from './academicCalendar'
import type { CustomConstraint } from './constraints/custom'
import type { EntityOverrides } from './records'

export interface CalendarConfig {
  /** day indices (0 = Monday) that carry teaching */
  workingDays: number[]
  /** "09:00" */
  dayStart: string
  /** "17:00" — exclusive end of the last slot */
  dayEnd: string
  /** length of one teaching slot, minutes */
  slotMinutes: number
  /** transition time between classes, minutes */
  passingMinutes: number
  /** "13:00" */
  lunchStart: string
  lunchMinutes: number
  /** earliest start for evening-mode programmes, "17:30" */
  eveningStart: string
  /** a session at or before this time counts as early morning, "09:00" */
  earlyMorningUntil: string
  /**
   * ISO dates with no teaching.
   * @deprecated Superseded by `events`; `normaliseConfig` migrates any entries
   * here into one-day holiday events and leaves this empty.
   */
  holidays: string[]
  /** weeks in the term — used when the term dates below are not set */
  termWeeks: number
  /** first teaching date of the term, `yyyy-mm-dd` */
  termStart: string
  /** last teaching date of the term, inclusive, `yyyy-mm-dd` */
  termEnd: string
  /** holidays, observances, exam windows and institution events */
  events: CalendarEvent[]
}

export interface ProgramConfig {
  id: string
  code: string
  name: string
  /** department code this programme belongs to */
  dept: string
  years: number
  sectionsPerYear: number
  studentsPerSection: number
  mode: 'day' | 'evening' | 'weekend'
  /** core courses per year */
  coreCourses: number
  /** lab courses per year */
  labCourses: number
  /** elective courses per year */
  electiveCourses: number
  /** weekly meetings for a core course */
  coreWeekly: number
  /** consecutive slots a lab occupies */
  labBlock: number
}

export interface DeptConfig {
  code: string
  name: string
}

export interface BuildingConfig {
  id: string
  name: string
  campus: string
  /** minutes to walk from this building to another on the same campus */
  walkMinutes: number
  /** how many storeys the building has; rooms are spread across them */
  floors: number
  hasElevator: boolean
  accessible: boolean
}

/**
 * A batch of rooms of one kind on one floor of one building.
 *
 * The wizard collects counts rather than individual rooms, and a real block
 * mixes types floor by floor — lecture halls on the ground, tutorial rooms
 * above, the specialised labs wherever the services run. `floor` is what makes
 * that expressible; `specialisation` names a facility and carries the feature
 * bundle that goes with it.
 */
export interface RoomGroupConfig {
  id: string
  buildingId: string
  /** storey these rooms sit on; 1 is the ground floor */
  floor: number
  kind: RoomKind
  count: number
  capacity: number
  /** minutes of turnover needed between bookings */
  turnoverMinutes: number
  /** feature keys, comma-free list */
  features: string[]
  /** id from `ROOM_SPECIALISATIONS`; empty for an ordinary room */
  specialisation?: string
}

export interface CampusConfig {
  id: string
  name: string
  /** minutes to travel to the main campus */
  travelMinutes: number
}

export interface FacultyConfig {
  /** total teaching staff; the generator distributes them across departments */
  total: number
  /** percentage splits, must sum to 100 */
  mix: {
    professor: number
    associate: number
    assistant: number
    adjunct: number
    visiting: number
    ta: number
  }
  maxPerDay: number
  maxPerWeek: number
  adjunctMaxPerWeek: number
  taMaxPerWeek: number
  /** how many courses each person is qualified for */
  qualificationsMin: number
  qualificationsMax: number
  /** share (%) with a protected research/admin day */
  researchDayShare: number
  /** share (%) on sabbatical this term */
  sabbaticalShare: number
  /** share (%) requiring step-free rooms */
  accessibilityShare: number
}

export interface EquipmentConfig {
  id: string
  name: string
  units: number
}

export interface SetupConfig {
  version: 1
  institution: {
    name: string
    academicYear: string
    term: string
  }
  calendar: CalendarConfig
  campuses: CampusConfig[]
  departments: DeptConfig[]
  programs: ProgramConfig[]
  buildings: BuildingConfig[]
  roomGroups: RoomGroupConfig[]
  faculty: FacultyConfig
  equipment: EquipmentConfig[]
  /** seed for the deterministic generator */
  seed: number
  /**
   * Explicit records that take over from generation. Empty until the
   * administrator edits an entity of that type; see `records.ts`.
   */
  overrides: EntityOverrides
  /** institution-specific rules, numbered U001 upwards */
  customConstraints: CustomConstraint[]
}

/* ------------------------------------------------------------------ *
 * Defaults — a mid-size Indian engineering college, ~2,500 students.
 * Every number here is editable in the Setup wizard.
 * ------------------------------------------------------------------ */

const DEFAULT_DEPTS: DeptConfig[] = [
  { code: 'CSE', name: 'Computer Science & Engineering' },
  { code: 'ECE', name: 'Electronics & Communication' },
  { code: 'ME', name: 'Mechanical Engineering' },
  { code: 'CE', name: 'Civil Engineering' },
  { code: 'SH', name: 'Sciences & Humanities' },
]

const DEFAULT_PROGRAMS: ProgramConfig[] = [
  {
    id: 'p-cse', code: 'B.Tech CSE', name: 'B.Tech Computer Science', dept: 'CSE',
    years: 3, sectionsPerYear: 2, studentsPerSection: 60, mode: 'day',
    coreCourses: 4, labCourses: 1, electiveCourses: 1, coreWeekly: 3, labBlock: 2,
  },
  {
    id: 'p-ece', code: 'B.Tech ECE', name: 'B.Tech Electronics & Communication', dept: 'ECE',
    years: 3, sectionsPerYear: 2, studentsPerSection: 60, mode: 'day',
    coreCourses: 4, labCourses: 1, electiveCourses: 1, coreWeekly: 3, labBlock: 2,
  },
  {
    id: 'p-me', code: 'B.Tech ME', name: 'B.Tech Mechanical', dept: 'ME',
    years: 3, sectionsPerYear: 2, studentsPerSection: 55, mode: 'day',
    coreCourses: 4, labCourses: 1, electiveCourses: 1, coreWeekly: 3, labBlock: 2,
  },
  {
    id: 'p-ce', code: 'B.Tech CE', name: 'B.Tech Civil', dept: 'CE',
    years: 3, sectionsPerYear: 1, studentsPerSection: 55, mode: 'day',
    coreCourses: 4, labCourses: 1, electiveCourses: 1, coreWeekly: 3, labBlock: 2,
  },
  {
    id: 'p-sh', code: 'B.Sc', name: 'B.Sc Sciences & Humanities', dept: 'SH',
    years: 3, sectionsPerYear: 1, studentsPerSection: 50, mode: 'day',
    coreCourses: 4, labCourses: 1, electiveCourses: 1, coreWeekly: 3, labBlock: 2,
  },
]

const DEFAULT_BUILDINGS: BuildingConfig[] = [
  { id: 'b-a', name: 'Block A', campus: 'main', walkMinutes: 6, floors: 3, hasElevator: true, accessible: true },
  { id: 'b-b', name: 'Block B', campus: 'main', walkMinutes: 8, floors: 2, hasElevator: false, accessible: true },
  { id: 'b-c', name: 'Block C', campus: 'main', walkMinutes: 10, floors: 4, hasElevator: true, accessible: true },
  { id: 'b-lab', name: 'Lab Complex', campus: 'main', walkMinutes: 12, floors: 2, hasElevator: false, accessible: true },
]

const DEFAULT_ROOM_GROUPS: RoomGroupConfig[] = [
  {
    id: 'rg-1', buildingId: 'b-a', floor: 1, kind: 'Lecture', count: 4, capacity: 72,
    turnoverMinutes: 0, specialisation: 'classroom',
    features: ['projectorHiRes', 'wrapWhiteboard', 'groundFloor', 'wheelchairAccess'],
  },
  {
    id: 'rg-1b', buildingId: 'b-a', floor: 2, kind: 'Lecture', count: 2, capacity: 72,
    turnoverMinutes: 0, specialisation: 'classroom',
    features: ['projectorHiRes', 'wrapWhiteboard'],
  },
  {
    id: 'rg-2', buildingId: 'b-b', floor: 1, kind: 'Lecture', count: 6, capacity: 90,
    turnoverMinutes: 0, specialisation: 'lectureHall',
    features: ['tiered', 'projectorHiRes', 'lectureCapture', 'fixedSeating'],
  },
  {
    id: 'rg-3', buildingId: 'b-c', floor: 2, kind: 'Seminar', count: 5, capacity: 64,
    turnoverMinutes: 0, specialisation: 'tutorial',
    features: ['centralTable', 'movableFurniture', 'projectorHiRes', 'wheelchairAccess', 'brailleSignage'],
  },
  {
    id: 'rg-4', buildingId: 'b-lab', floor: 1, kind: 'Lab', count: 6, capacity: 64,
    turnoverMinutes: 30, specialisation: 'chemistryLab',
    features: ['wetLab', 'fumeHood', 'ventilation', 'floorDrains', 'groundFloor', 'wheelchairAccess', 'brailleSignage'],
  },
  {
    id: 'rg-5', buildingId: 'b-lab', floor: 2, kind: 'Computer Lab', count: 4, capacity: 64,
    turnoverMinutes: 15, specialisation: 'computerLab',
    features: ['computers', 'windowsLab', 'wiredNetwork', 'projectorHiRes', 'wheelchairAccess', 'brailleSignage'],
  },
  {
    id: 'rg-6', buildingId: 'b-c', floor: 1, kind: 'Auditorium', count: 1, capacity: 240,
    turnoverMinutes: 15, specialisation: 'auditorium',
    features: ['auditorium', 'tiered', 'projectorHiRes', 'lectureCapture', 'wheelchairAccess'],
  },
]

const DEFAULT_EQUIPMENT: EquipmentConfig[] = [
  { id: 'eq-cart', name: 'Portable smartboard cart', units: 2 },
  { id: 'eq-vr', name: 'VR headset kit', units: 1 },
  { id: 'eq-survey', name: 'Total station survey kit', units: 2 },
]

export const DEFAULT_CONFIG: SetupConfig = {
  version: 1,
  institution: {
    name: 'Aula Institute of Technology',
    academicYear: '2026–27',
    term: 'Odd Semester',
  },
  calendar: {
    workingDays: [0, 1, 2, 3, 4],
    dayStart: '09:00',
    dayEnd: '17:00',
    slotMinutes: 60,
    passingMinutes: 10,
    lunchStart: '13:00',
    lunchMinutes: 60,
    eveningStart: '17:30',
    earlyMorningUntil: '09:00',
    holidays: [],
    termWeeks: 16,
    /* Sixteen whole weeks starting on a Monday, so every weekday gets the same
       number of dates before any holiday is declared. */
    termStart: '2026-07-20',
    termEnd: '2026-11-08',
    events: [],
  },
  campuses: [{ id: 'main', name: 'Main Campus', travelMinutes: 0 }],
  departments: DEFAULT_DEPTS,
  programs: DEFAULT_PROGRAMS,
  buildings: DEFAULT_BUILDINGS,
  roomGroups: DEFAULT_ROOM_GROUPS,
  faculty: {
    total: 68,
    mix: { professor: 12, associate: 22, assistant: 40, adjunct: 12, visiting: 4, ta: 10 },
    maxPerDay: 5,
    maxPerWeek: 18,
    adjunctMaxPerWeek: 9,
    taMaxPerWeek: 12,
    qualificationsMin: 3,
    qualificationsMax: 5,
    researchDayShare: 20,
    sabbaticalShare: 3,
    accessibilityShare: 4,
  },
  equipment: DEFAULT_EQUIPMENT,
  seed: 20260818,
  overrides: {},
  customConstraints: [],
}

/* ------------------------------------------------------------------ *
 * Derived figures — shown live in the wizard so the numbers stay honest
 * ------------------------------------------------------------------ */

export interface ConfigSummary {
  students: number
  cohorts: number
  courses: number
  rooms: number
  roomSlotsPerWeek: number
  /** teaching sessions the schedule must place each week */
  demand: number
  facultyTotal: number
  /** demand / supply; above 1.0 is structurally infeasible */
  pressure: number
  slotsPerDay: number
  /** working days the academic calendar leaves standing, in teaching order */
  teachingDays: number[]
  /** working days the calendar wipes out completely */
  lostDays: number[]
  /** grid cells a weekly institution event takes off every room */
  blackoutSlots: number
  /** teaching dates left in the term across every weekday */
  teachingDates: number
  /** issues that make the configuration unusable */
  errors: string[]
  /** issues worth flagging but not fatal */
  warnings: string[]
}

export function slotsPerDay(cal: CalendarConfig): number {
  const [sh, sm] = cal.dayStart.split(':').map(Number)
  const [eh, em] = cal.dayEnd.split(':').map(Number)
  const span = (eh * 60 + em) - (sh * 60 + sm)
  if (!Number.isFinite(span) || span <= 0 || cal.slotMinutes <= 0) return 0
  return Math.floor(span / cal.slotMinutes)
}

export function summarise(cfg: SetupConfig): ConfigSummary {
  const errors: string[] = []
  const warnings: string[] = []

  const perDay = slotsPerDay(cfg.calendar)

  /* The academic calendar comes first, because it decides what "a teaching
     week" even means here. A weekday every one of whose dates is a holiday is
     not a thin day, it is not a teaching day at all; and a weekly institution
     event takes its slots off every room in the estate, not off one booking.
     Costing both before the capacity arithmetic is what stops setup from
     green-lighting a week that does not exist. */
  const configuredDays = cfg.calendar.workingDays
  const lostDays = lostWeekdays(cfg.calendar, configuredDays, perDay)
  const teachingDays = configuredDays.filter(d => !lostDays.includes(d))
  const days = teachingDays.length

  const blackouts = weeklyBlackoutCells(cfg.calendar.events ?? [], teachingDays, perDay)
  const blackoutSlots = new Set(blackouts.filter(b => !b.coreOnly).map(b => b.key)).size
  const attrition = weekdayAttrition(cfg.calendar, teachingDays, perDay)
  const teachingDates = attrition.reduce((a, i) => a + i.teachingDates, 0)

  let students = 0
  let cohorts = 0
  let courses = 0
  let demand = 0

  const sectionOverride = cfg.overrides?.sections ?? {}
  const explicitCourses = cfg.overrides?.courses

  for (const p of cfg.programs) {
    let sections = 0
    for (let year = 1; year <= Math.max(0, p.years); year++) {
      sections += Math.max(0, sectionOverride[`${p.id}:${year}`] ?? p.sectionsPerYear)
    }
    cohorts += sections
    students += sections * Math.max(0, p.studentsPerSection)

    if (explicitCourses) {
      // demand comes from the edited course list, not the programme shape
      const mine = explicitCourses.filter(c => c.programId === p.id && !c.suspended)
      courses += mine.length
      const perSection = mine.reduce((a, c) => a + c.weekly * Math.max(1, c.blockLength), 0)
      const perYearAvg = p.years > 0 ? perSection / p.years : perSection
      demand += sections * perYearAvg
    } else {
      const perYear = p.coreCourses + p.labCourses + p.electiveCourses
      courses += perYear * p.years
      const weekly =
        p.coreCourses * p.coreWeekly +
        p.labCourses * p.labBlock +
        p.electiveCourses * 2
      demand += sections * weekly
    }
  }
  demand = Math.round(demand)

  const rooms = cfg.overrides?.rooms
    ? cfg.overrides.rooms.filter(r => !r.restricted).length
    : cfg.roomGroups.reduce((a, g) => a + Math.max(0, g.count), 0)
  const bookableSlotsPerRoom = Math.max(0, days * perDay - blackoutSlots)
  const roomSlotsPerWeek = rooms * bookableSlotsPerRoom
  const pressure = roomSlotsPerWeek > 0 ? demand / roomSlotsPerWeek : Infinity

  /* --- academic calendar --- */
  const hasTermDates = Boolean(cfg.calendar.termStart && cfg.calendar.termEnd)
  if (hasTermDates && !isValidDate(cfg.calendar.termStart)) {
    errors.push(`Term start "${cfg.calendar.termStart}" is not a valid date.`)
  } else if (hasTermDates && !isValidDate(cfg.calendar.termEnd)) {
    errors.push(`Term end "${cfg.calendar.termEnd}" is not a valid date.`)
  } else if (hasTermDates && cfg.calendar.termEnd < cfg.calendar.termStart) {
    errors.push('The term ends before it begins — check the dates in Calendar.')
  }

  if (configuredDays.length > 0 && teachingDays.length === 0) {
    errors.push(
      'The calendar cancels teaching on every working day of the term. Remove a holiday, extend the term, or add a working day.',
    )
  } else if (lostDays.length > 0) {
    warnings.push(
      `The calendar removes ${lostDays.map(d => DAY_NAMES[d]).join(', ')} entirely — no session is placed on ${lostDays.length === 1 ? 'that day' : 'those days'}.`,
    )
  }

  if (blackoutSlots > 0) {
    warnings.push(
      `Weekly institution events hold ${blackoutSlots} of the ${days * perDay} slots in the week, in every room.`,
    )
  }

  /* Two weekdays that carry the same course can end the term four meetings
     apart. Worth saying out loud: the timetable looks even, the syllabus is
     not. */
  const dated = attrition.some(i => i.totalDates > 0)
  if (dated && attrition.length > 1) {
    const most = Math.max(...attrition.map(i => i.teachingDates))
    const least = Math.min(...attrition.map(i => i.teachingDates))
    if (most - least >= 3) {
      const worst = attrition.find(i => i.teachingDates === least)
      warnings.push(
        `Holidays fall unevenly: ${DAY_NAMES[worst?.day ?? 0]} keeps ${least} teaching dates while the best weekday keeps ${most}. A course meeting only on the thin day loses ${most - least} sessions over the term.`,
      )
    }
  }

  if (perDay <= 0) errors.push('Day start must be before day end, and the slot length must divide the teaching day.')
  if (configuredDays.length === 0) errors.push('Select at least one working day.')
  if (cfg.programs.length === 0) errors.push('Add at least one programme.')
  if (rooms === 0) errors.push('Add at least one room group.')
  const facultyCount = cfg.overrides?.faculty ? cfg.overrides.faculty.length : cfg.faculty.total
  if (facultyCount <= 0) errors.push('Faculty headcount must be greater than zero.')

  const mixSum = Object.values(cfg.faculty.mix).reduce((a, b) => a + b, 0)
  if (mixSum !== 100) warnings.push(`Faculty rank mix sums to ${mixSum}%, not 100% — it will be normalised.`)

  if (pressure > 1) {
    errors.push(
      `Room demand exceeds supply: ${demand} sessions need placing into ${roomSlotsPerWeek} room-slots per week. Add rooms, add teaching days, or reduce weekly meetings.`,
    )
  } else if (pressure > 0.85) {
    warnings.push(`Room pressure is ${(pressure * 100).toFixed(0)}% — feasible but tight; expect soft-constraint compromises.`)
  }

  /* Faculty supply. Counting every member of staff at the full-professor cap
     overstates the roster by about a tenth: adjuncts and teaching assistants
     carry lower ceilings, and nobody on sabbatical teaches at all. */
  const facultyCapacity = cfg.overrides?.faculty
    ? cfg.overrides.faculty.filter(f => !f.onSabbatical).reduce((a, f) => a + f.maxPerWeek, 0)
    : expectedFacultyCapacity(cfg.faculty)
  if (facultyCapacity < demand) {
    errors.push(
      `Faculty capacity is short: ${demand} weekly sessions need teaching but the roster supplies only ${facultyCapacity} staff-hours per week.`,
    )
  } else if (facultyCapacity < demand * 1.15) {
    warnings.push('Faculty capacity has under 15% headroom — substitutions will be hard to satisfy.')
  }

  // cohort day check: a section cannot need more slots than the week holds
  for (const p of cfg.programs) {
    const weekly = p.coreCourses * p.coreWeekly + p.labCourses * p.labBlock + p.electiveCourses * 2
    if (weekly > days * perDay) {
      errors.push(`${p.code}: ${weekly} weekly meetings do not fit in ${days * perDay} available slots.`)
    }
  }

  // Room-kind capacity: the single most common reason a real configuration
  // turns out to be unschedulable. Checked per programme, not in aggregate.
  const biggestByKind = new Map<string, number>()
  if (cfg.overrides?.rooms) {
    for (const r of cfg.overrides.rooms) {
      if (r.restricted) continue
      biggestByKind.set(r.kind, Math.max(biggestByKind.get(r.kind) ?? 0, r.capacity))
    }
  } else {
    for (const g of cfg.roomGroups) {
      if (g.count <= 0) continue
      biggestByKind.set(g.kind, Math.max(biggestByKind.get(g.kind) ?? 0, g.capacity))
    }
  }
  const kindFor = (p: ProgramConfig, role: 'lecture' | 'lab' | 'seminar'): string => {
    if (role === 'lab') {
      if (p.dept === 'CSE' && biggestByKind.has('Computer Lab')) return 'Computer Lab'
      return biggestByKind.has('Lab') ? 'Lab' : 'Lecture'
    }
    if (role === 'seminar') return biggestByKind.has('Seminar') ? 'Seminar' : 'Lecture'
    return biggestByKind.has('Lecture') ? 'Lecture' : [...biggestByKind.keys()][0] ?? 'Lecture'
  }

  for (const p of cfg.programs) {
    const checks: [string, string, number][] = [
      ['Lectures', kindFor(p, 'lecture'), p.coreCourses],
      ['Labs', kindFor(p, 'lab'), p.labCourses],
      ['Electives', kindFor(p, 'seminar'), p.electiveCourses],
    ]
    for (const [role, kind, count] of checks) {
      if (count <= 0) continue
      const biggest = biggestByKind.get(kind) ?? 0
      if (biggest < p.studentsPerSection) {
        errors.push(
          `${p.code}: ${role.toLowerCase()} need a ${kind} seating ${p.studentsPerSection}, but the largest ${kind} holds ${biggest || 0}. Raise its capacity, split the section, or add rooms.`,
        )
      }
    }
  }

  /* Room-kind TIME capacity.
   *
   * The aggregate `pressure` figure above pools every room together, so an
   * institution can read as comfortably 59% full while one specialised kind is
   * oversubscribed several times over. That is exactly how a configuration ends
   * up passing setup and then losing hundreds of meetings in the solve with
   * nothing but "room already booked" to show for it. Checked per kind, in
   * slot-hours per week, counting multi-slot blocks at their true length.
   */
  const slotHoursByKind = new Map<string, number>()
  const bookingsByKind = new Map<string, number>()
  const addDemand = (kind: string, meetings: number, block: number) => {
    slotHoursByKind.set(kind, (slotHoursByKind.get(kind) ?? 0) + meetings * block)
    bookingsByKind.set(kind, (bookingsByKind.get(kind) ?? 0) + meetings)
  }

  for (const p of cfg.programs) {
    for (let year = 1; year <= Math.max(0, p.years); year++) {
      const sections = Math.max(0, sectionOverride[`${p.id}:${year}`] ?? p.sectionsPerYear)
      if (sections === 0) continue

      if (explicitCourses) {
        for (const c of explicitCourses) {
          if (c.programId !== p.id || c.year !== year || c.suspended) continue
          addDemand(c.roomKind, sections * c.weekly, Math.max(1, c.blockLength))
        }
      } else {
        addDemand(kindFor(p, 'lecture'), sections * p.coreCourses * p.coreWeekly, 1)
        addDemand(kindFor(p, 'lab'), sections * p.labCourses, Math.max(1, p.labBlock))
        addDemand(kindFor(p, 'seminar'), sections * p.electiveCourses * 2, 1)
      }
    }
  }

  const roomsByKind = new Map<string, number>()
  const turnoverByKind = new Map<string, number>()
  const noteRoom = (kind: string, turnover: number) => {
    roomsByKind.set(kind, (roomsByKind.get(kind) ?? 0) + 1)
    // best case across rooms of the kind, so one slow room never blocks setup
    const seen = turnoverByKind.get(kind)
    turnoverByKind.set(kind, seen === undefined ? turnover : Math.min(seen, turnover))
  }
  if (cfg.overrides?.rooms) {
    for (const r of cfg.overrides.rooms) {
      if (!r.restricted) noteRoom(r.kind, r.turnoverMinutes)
    }
  } else {
    for (const g of cfg.roomGroups) {
      for (let i = 0; i < Math.max(0, g.count); i++) noteRoom(g.kind, g.turnoverMinutes)
    }
  }

  /* Two things make the raw slot count a lie, and the engine enforces both, so
     the wizard has to price them in or it green-lights a configuration that
     then loses hundreds of meetings:
       - turnover forces whole empty slots between bookings in the same room;
       - the protected lunch slots are not really available for teaching. */
  const slotsPerRoom = bookableSlotsPerRoom
  const usablePerDay = Math.max(1, perDay - lunchSlotsPerDay(cfg.calendar))

  for (const [kind, rawNeeded] of [...slotHoursByKind].sort((a, b) => b[1] - a[1])) {
    if (rawNeeded <= 0 || slotsPerRoom <= 0) continue
    const count = roomsByKind.get(kind) ?? 0
    const available = count * slotsPerRoom
    const comfortable = Math.max(count, count * (days * usablePerDay - blackoutSlots))

    const turnover = turnoverByKind.get(kind) ?? 0
    const gapSlots = Math.max(0, Math.ceil((turnover - cfg.calendar.passingMinutes) / cfg.calendar.slotMinutes))
    // every booking but the last of each room-day drags its gap along
    const gapCost = Math.max(0, gapSlots * ((bookingsByKind.get(kind) ?? 0) - count * days))
    const needed = rawNeeded + gapCost

    if (needed > available) {
      const short = Math.ceil((needed - available) / slotsPerRoom)
      const because = gapCost > 0
        ? ` (${rawNeeded} of teaching, plus ${gapCost} lost to the ${turnover} min turnover between bookings)`
        : ''
      errors.push(
        `Not enough ${kind} time: ${needed} slot-hours are needed each week${because}, but ${count} ${kind}${count === 1 ? '' : 's'} only provide ${available}. Add ${short} more ${kind}${short === 1 ? '' : 's'}, cut the meetings that need one, or lengthen the teaching day.`,
      )
    } else if (needed > comfortable) {
      warnings.push(
        `${kind} rooms only work out if teaching spills into the protected lunch slots: ${needed} slot-hours needed against ${comfortable} outside lunch. Expect some meetings to go unplaced.`,
      )
    } else if (needed > comfortable * 0.9) {
      warnings.push(
        `${kind} rooms are ${(needed / comfortable * 100).toFixed(0)}% booked before the solver starts — expect compromises.`,
      )
    }
  }

  const knownBuildings = new Set(cfg.buildings.map(b => b.id))
  for (const g of cfg.roomGroups) {
    if (!knownBuildings.has(g.buildingId)) {
      errors.push(`Room group "${g.kind} ×${g.count}" points at a building that no longer exists.`)
    }
  }

  const knownDepts = new Set(cfg.departments.map(d => d.code))
  for (const p of cfg.programs) {
    if (!knownDepts.has(p.dept)) errors.push(`Programme ${p.code} references unknown department "${p.dept}".`)
  }

  return {
    students, cohorts, courses, rooms, roomSlotsPerWeek, demand,
    facultyTotal: facultyCount, pressure, slotsPerDay: perDay,
    teachingDays, lostDays, blackoutSlots, teachingDates,
    errors, warnings,
  }
}

/** Slots per day that overlap the protected lunch window. Mirrors buildGrid. */
export function lunchSlotsPerDay(cal: CalendarConfig): number {
  const count = slotsPerDay(cal)
  if (count <= 0 || cal.lunchMinutes <= 0) return 0
  const [sh, sm] = cal.dayStart.split(':').map(Number)
  const [lh, lm] = cal.lunchStart.split(':').map(Number)
  const dayStart = sh * 60 + sm
  const lunchFrom = lh * 60 + lm
  const lunchTo = lunchFrom + cal.lunchMinutes
  let n = 0
  for (let i = 0; i < count; i++) {
    const start = dayStart + i * cal.slotMinutes
    if (start < lunchTo && start + cal.slotMinutes > lunchFrom) n++
  }
  return n
}

/**
 * Weekly teaching hours the configured roster can really supply, weighting each
 * rank by its own ceiling and removing the share on sabbatical.
 */
export function expectedFacultyCapacity(f: FacultyConfig): number {
  const mixTotal = Object.values(f.mix).reduce((a, b) => a + b, 0) || 1
  const share = (n: number) => n / mixTotal
  const perHead =
    share(f.mix.professor) * f.maxPerWeek
    + share(f.mix.associate) * f.maxPerWeek
    + share(f.mix.assistant) * f.maxPerWeek
    + share(f.mix.visiting) * f.maxPerWeek
    + share(f.mix.adjunct) * f.adjunctMaxPerWeek
    + share(f.mix.ta) * f.taMaxPerWeek
  const teaching = Math.max(0, f.total) * (1 - Math.min(1, f.sabbaticalShare / 100))
  return Math.round(teaching * perHead)
}

export const cloneConfig = (cfg: SetupConfig): SetupConfig =>
  JSON.parse(JSON.stringify(cfg)) as SetupConfig
