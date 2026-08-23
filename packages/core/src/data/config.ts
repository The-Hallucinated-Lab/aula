/**
 * Aula — setup configuration.
 *
 * This is the entire surface the administrator fills in. The generator turns a
 * `SetupConfig` into an `Institution`; the solver never reads this file. Keep
 * it serialisable: it is what gets written to an `.aula.json` project file.
 */

import { DAY_NAMES, labelToMinutes, parseClock } from './model'
import type { CalendarEvent, RoomKind, StaffRank } from './model'
import {
  isValidDate,
  lostWeekdays,
  weekdayAttrition,
  weeklyBlackoutCells,
} from './academicCalendar'
import type { CustomConstraint } from './constraints/custom'
import type { EntityOverrides } from './records'

/**
 * A named teaching shift, as the administrator enters it.
 *
 * Replaces the generic `eveningStart` / `earlyMorningUntil` pair for the
 * purpose of deciding *where a section may be taught*. Those two remain,
 * because a handful of soft rules use them to talk about the time of day
 * rather than about shift membership.
 */
export interface ShiftConfig {
  id: string
  /** local name, e.g. "Morning Shift" */
  name: string
  /** "08:00" — first teaching minute of the shift */
  start: string
  /** "13:10" — exclusive end of the shift */
  end: string
}

/**
 * The morning/evening split, ready to apply.
 *
 * The boundary is the one institutions running two shifts actually use: the
 * morning shift ends and the evening shift begins at the same minute, so no
 * teaching time falls between them.
 */
export const TWO_SHIFT_PRESET: ShiftConfig[] = [
  { id: 'morning', name: 'Morning Shift', start: '08:00', end: '13:10' },
  { id: 'evening', name: 'Evening Shift', start: '13:10', end: '18:00' },
]

export interface CalendarConfig {
  /** teaching shifts; an empty list means one shift covering the whole day */
  shifts: ShiftConfig[]
  /**
   * Shortest final period worth keeping, in minutes. 0 discards any remainder
   * that will not fit a whole slot before `dayEnd`; a positive value allows a
   * shorter last period rather than losing it. See `slotPlan`.
   */
  minFinalSlotMinutes: number
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

/** Top-level academic division, e.g. FOSTA — Faculty of Science & Technology. */
export interface FacultyConfig {
  id: string
  code: string
  name: string
}

/** A school inside a faculty, e.g. the School of Computer Science. */
export interface SchoolConfig {
  id: string
  code: string
  name: string
  /** `FacultyConfig.id` this school belongs to */
  faculty: string
}

/**
 * Curriculum policy for one programme — how many courses of each kind a year
 * carries and how often they meet.
 *
 * Every field is optional because a profile states only what *differs* from
 * the programme's own defaults. A batch that added a second elective and
 * changed nothing else is one field, not a whole curriculum restated.
 */
export interface CoursePolicy {
  coreCourses: number
  labCourses: number
  electiveCourses: number
  coreWeekly: number
  labBlock: number
  /**
   * Expected headcount for an elective. Electives draw a fraction of a
   * section, so treating them as full-size is what forces a 20-student
   * programme elective into a 60-seat room. 0 falls back to the section size.
   */
  electiveEnrolment: number
}

/**
 * An admissions batch's curriculum policy.
 *
 * Policy changes between intakes — one batch takes a single elective, the next
 * takes two — but the programme itself does not change, and neither do the
 * fifteen other things about it. A profile therefore sits *on top of* the
 * programme's own figures rather than replacing them, which is the same shape
 * as the per-year section override (D-28): the default remains, the override
 * states the difference.
 *
 * Old profiles are archived rather than deleted once their cohorts graduate,
 * so a timetable from three years ago still explains itself.
 */
export interface Profile {
  id: string
  name: string
  /** the intake this governs, e.g. "2025-2029" */
  batchLabel: string
  archived: boolean
  /** programme id -> the fields this batch changes */
  policy: Record<string, Partial<CoursePolicy>>
}

export interface DeptConfig {
  code: string
  name: string
  /** `SchoolConfig.id` this department sits under */
  school: string
}

export interface BuildingConfig {
  id: string
  name: string
  campus: string
  /**
   * Minutes to walk from this building to another on the same campus.
   *
   * No longer collected: real walk times vary far more between any two
   * specific blocks than a single per-building figure can express, and asking
   * for it per block bought accuracy nobody used. It stays in the model at a
   * uniform default because the back-to-back travel rules read it, and it can
   * still arrive from an import.
   */
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

export interface StaffConfig {
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
  /**
   * Institution-wide fallback ceiling, used for any designation not named in
   * `loadByRank`. Kept because a project saved before per-rank loads existed
   * has only this.
   */
  maxPerWeek: number
  adjunctMaxPerWeek: number
  taMaxPerWeek: number
  /**
   * Weekly teaching load by designation, which is how workload is actually
   * governed: a Professor and an Assistant Professor do not carry the same
   * hours, and the difference is a rule, not a preference.
   */
  loadByRank: Partial<Record<StaffRank, RankLoad>>
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

/**
 * Weekly teaching hours for one designation.
 *
 * A minimum matters as much as a maximum: constraint 19 ("tenured minimum
 * teaching loads must be met before assigning classes to adjuncts") is about
 * the floor, and until now nothing recorded one.
 */
export interface RankLoad {
  /** hours a person of this designation is expected to teach */
  min: number
  /** hours they may not exceed */
  max: number
}

/**
 * Defaults, pending confirmation.
 *
 * The two requirement sources disagree and neither is authoritative:
 * the internal review recorded Assistant Professor as 12 min / 16 max, while
 * the timetable coordinator gave Assistant ~14-16, Associate ~12, Professor ~8.
 * The mechanism is what matters here; these figures are editable in Setup and
 * should be confirmed with the department before anybody relies on them.
 */
export const DEFAULT_RANK_LOADS: Partial<Record<StaffRank, RankLoad>> = {
  Professor: { min: 6, max: 8 },
  'Associate Professor': { min: 10, max: 12 },
  'Assistant Professor': { min: 12, max: 16 },
  Clinical: { min: 8, max: 14 },
  Visiting: { min: 0, max: 12 },
  Adjunct: { min: 0, max: 9 },
  'Teaching Assistant': { min: 0, max: 12 },
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
  faculties: FacultyConfig[]
  schools: SchoolConfig[]
  departments: DeptConfig[]
  /** curriculum policy per admissions batch; the first live one is the default */
  profiles: Profile[]
  programs: ProgramConfig[]
  buildings: BuildingConfig[]
  roomGroups: RoomGroupConfig[]
  staff: StaffConfig
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

/* The shape of a real faculty/school/department tree. These particular names
   are a plausible default, not an authoritative structure — the institution's
   own hierarchy is entered in Institution Setup. */
const DEFAULT_FACULTIES: FacultyConfig[] = [
  { id: 'fac-st', code: 'FOSTA', name: 'Faculty of Science & Technology' },
]

const DEFAULT_SCHOOLS: SchoolConfig[] = [
  {
    id: 'sch-cs',
    code: 'SCS',
    name: 'School of Computer Science & Engineering',
    faculty: 'fac-st',
  },
  {
    id: 'sch-ee',
    code: 'SEE',
    name: 'School of Electrical & Electronics Engineering',
    faculty: 'fac-st',
  },
  {
    id: 'sch-am',
    code: 'SAM',
    name: 'School of Automobile, Mechanical & Mechatronics',
    faculty: 'fac-st',
  },
  { id: 'sch-bs', code: 'SBS', name: 'School of Basic Sciences', faculty: 'fac-st' },
]

const DEFAULT_DEPTS: DeptConfig[] = [
  { code: 'CSE', name: 'Computer Science & Engineering', school: 'sch-cs' },
  { code: 'ECE', name: 'Electronics & Communication', school: 'sch-ee' },
  { code: 'ME', name: 'Mechanical Engineering', school: 'sch-am' },
  { code: 'CE', name: 'Civil Engineering', school: 'sch-am' },
  { code: 'SH', name: 'Sciences & Humanities', school: 'sch-bs' },
]

const DEFAULT_PROGRAMS: ProgramConfig[] = [
  {
    id: 'p-cse',
    code: 'B.Tech CSE',
    name: 'B.Tech Computer Science',
    dept: 'CSE',
    years: 3,
    sectionsPerYear: 2,
    studentsPerSection: 60,
    mode: 'day',
    coreCourses: 4,
    labCourses: 1,
    electiveCourses: 1,
    coreWeekly: 3,
    labBlock: 2,
  },
  {
    id: 'p-ece',
    code: 'B.Tech ECE',
    name: 'B.Tech Electronics & Communication',
    dept: 'ECE',
    years: 3,
    sectionsPerYear: 2,
    studentsPerSection: 60,
    mode: 'day',
    coreCourses: 4,
    labCourses: 1,
    electiveCourses: 1,
    coreWeekly: 3,
    labBlock: 2,
  },
  {
    id: 'p-me',
    code: 'B.Tech ME',
    name: 'B.Tech Mechanical',
    dept: 'ME',
    years: 3,
    sectionsPerYear: 2,
    studentsPerSection: 55,
    mode: 'day',
    coreCourses: 4,
    labCourses: 1,
    electiveCourses: 1,
    coreWeekly: 3,
    labBlock: 2,
  },
  {
    id: 'p-ce',
    code: 'B.Tech CE',
    name: 'B.Tech Civil',
    dept: 'CE',
    years: 3,
    sectionsPerYear: 1,
    studentsPerSection: 55,
    mode: 'day',
    coreCourses: 4,
    labCourses: 1,
    electiveCourses: 1,
    coreWeekly: 3,
    labBlock: 2,
  },
  {
    id: 'p-sh',
    code: 'B.Sc',
    name: 'B.Sc Sciences & Humanities',
    dept: 'SH',
    years: 3,
    sectionsPerYear: 1,
    studentsPerSection: 50,
    mode: 'day',
    coreCourses: 4,
    labCourses: 1,
    electiveCourses: 1,
    coreWeekly: 3,
    labBlock: 2,
  },
]

const DEFAULT_BUILDINGS: BuildingConfig[] = [
  {
    id: 'b-a',
    name: 'Block A',
    campus: 'main',
    walkMinutes: 6,
    floors: 3,
    hasElevator: true,
    accessible: true,
  },
  {
    id: 'b-b',
    name: 'Block B',
    campus: 'main',
    walkMinutes: 8,
    floors: 2,
    hasElevator: false,
    accessible: true,
  },
  {
    id: 'b-c',
    name: 'Block C',
    campus: 'main',
    walkMinutes: 10,
    floors: 4,
    hasElevator: true,
    accessible: true,
  },
  {
    id: 'b-lab',
    name: 'Lab Complex',
    campus: 'main',
    walkMinutes: 12,
    floors: 2,
    hasElevator: false,
    accessible: true,
  },
]

const DEFAULT_ROOM_GROUPS: RoomGroupConfig[] = [
  {
    id: 'rg-1',
    buildingId: 'b-a',
    floor: 1,
    kind: 'Lecture',
    count: 4,
    capacity: 72,
    turnoverMinutes: 0,
    specialisation: 'classroom',
    features: ['projectorHiRes', 'wrapWhiteboard', 'groundFloor', 'wheelchairAccess'],
  },
  {
    id: 'rg-1b',
    buildingId: 'b-a',
    floor: 2,
    kind: 'Lecture',
    count: 2,
    capacity: 72,
    turnoverMinutes: 0,
    specialisation: 'classroom',
    features: ['projectorHiRes', 'wrapWhiteboard'],
  },
  {
    id: 'rg-2',
    buildingId: 'b-b',
    floor: 1,
    kind: 'Lecture',
    count: 6,
    capacity: 90,
    turnoverMinutes: 0,
    specialisation: 'lectureHall',
    features: ['tiered', 'projectorHiRes', 'lectureCapture', 'fixedSeating'],
  },
  {
    id: 'rg-3',
    buildingId: 'b-c',
    floor: 2,
    kind: 'Seminar',
    count: 5,
    capacity: 64,
    turnoverMinutes: 0,
    specialisation: 'tutorial',
    features: [
      'centralTable',
      'movableFurniture',
      'projectorHiRes',
      'wheelchairAccess',
      'brailleSignage',
    ],
  },
  {
    id: 'rg-4',
    buildingId: 'b-lab',
    floor: 1,
    kind: 'Lab',
    count: 6,
    capacity: 64,
    turnoverMinutes: 30,
    specialisation: 'chemistryLab',
    features: [
      'wetLab',
      'fumeHood',
      'ventilation',
      'floorDrains',
      'groundFloor',
      'wheelchairAccess',
      'brailleSignage',
    ],
  },
  {
    id: 'rg-5',
    buildingId: 'b-lab',
    floor: 2,
    kind: 'Computer Lab',
    count: 4,
    capacity: 64,
    turnoverMinutes: 15,
    specialisation: 'computerLab',
    features: [
      'computers',
      'windowsLab',
      'wiredNetwork',
      'projectorHiRes',
      'wheelchairAccess',
      'brailleSignage',
    ],
  },
  {
    id: 'rg-6',
    buildingId: 'b-c',
    floor: 1,
    kind: 'Auditorium',
    count: 1,
    capacity: 240,
    turnoverMinutes: 15,
    specialisation: 'auditorium',
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
    /* One shift spanning the whole day, which `buildGrid` supplies implicitly.
       A two-shift institution applies `TWO_SHIFT_PRESET` in Setup — it is left
       off by default because confining every section to half the grid is a
       real scheduling constraint, not a display preference. */
    shifts: [],
    minFinalSlotMinutes: 0,
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
  faculties: DEFAULT_FACULTIES,
  schools: DEFAULT_SCHOOLS,
  departments: DEFAULT_DEPTS,
  profiles: [
    {
      id: 'profile-current',
      name: 'Current curriculum',
      batchLabel: '',
      archived: false,
      policy: {},
    },
  ],
  programs: DEFAULT_PROGRAMS,
  buildings: DEFAULT_BUILDINGS,
  roomGroups: DEFAULT_ROOM_GROUPS,
  staff: {
    total: 68,
    mix: { professor: 12, associate: 22, assistant: 40, adjunct: 12, visiting: 4, ta: 10 },
    maxPerDay: 5,
    maxPerWeek: 18,
    adjunctMaxPerWeek: 9,
    taMaxPerWeek: 12,
    loadByRank: { ...DEFAULT_RANK_LOADS },
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
  staffTotal: number
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

/**
 * Where every teaching slot starts and how long it lasts.
 *
 * Slots are normally all `slotMinutes` long, but the last one of the day need
 * not be. A 50-minute grid from 09:00 does not divide into a day ending at
 * 18:00: the tenth slot would run 17:20-18:10, ten minutes past closing. The
 * old behaviour was to floor the count and simply lose the final period. That
 * is why a class scheduled to end at 18:10 could not be placed against an
 * 18:00 campus close, and why the last period of the day went missing.
 *
 * `minFinalSlotMinutes` decides what happens to the remainder: 0 keeps the old
 * behaviour, and any positive value admits a short final slot as long as it is
 * at least that long. The day never runs past `dayEnd` either way.
 */
/**
 * Resolve the curriculum policy in force for one programme-year.
 *
 * The programme's own figures are the base; the profile assigned to that year
 * states only its differences. `copyProfile` is what makes a new batch cheap:
 * clone the one it resembles and edit the fields that changed.
 */
/**
 * The weekly load a designation carries.
 *
 * One resolver, so the generator's rosters and `expectedStaffCapacity`'s
 * estimate can never disagree about what a Professor is allowed to teach.
 * Falls back through the pre-existing per-contract fields so a project saved
 * before `loadByRank` keeps the ceilings it was built with.
 */
export function loadForRank(staff: StaffConfig, rank: StaffRank): RankLoad {
  const named = staff.loadByRank?.[rank]
  if (named) return named
  const legacy =
    rank === 'Adjunct'
      ? staff.adjunctMaxPerWeek
      : rank === 'Teaching Assistant'
        ? staff.taMaxPerWeek
        : staff.maxPerWeek
  return { min: 0, max: legacy }
}

export function policyFor(cfg: SetupConfig, program: ProgramConfig, year: number): CoursePolicy {
  const base: CoursePolicy = {
    coreCourses: program.coreCourses,
    labCourses: program.labCourses,
    electiveCourses: program.electiveCourses,
    coreWeekly: program.coreWeekly,
    labBlock: program.labBlock,
    electiveEnrolment: 0,
  }
  const id = cfg.overrides?.profiles?.[`${program.id}:${year}`]
  const live = cfg.profiles.filter(p => !p.archived)
  const profile = (id && cfg.profiles.find(p => p.id === id)) || live[0]
  if (!profile) return base
  return { ...base, ...profile.policy[program.id] }
}

/* A clock alone is not an identity: two copies made in the same millisecond
   get the same id, and "Copy from" is exactly the button somebody clicks twice
   in a row. The counter is what makes each one distinct. */
let profileSeq = 0

/** Clone a profile under a new identity — the "Copy from" the review asked for. */
export function copyProfile(source: Profile, name: string, batchLabel: string): Profile {
  return {
    id: `profile-${Date.now().toString(36)}${profileSeq++}`,
    name,
    batchLabel,
    archived: false,
    policy: Object.fromEntries(Object.entries(source.policy).map(([k, v]) => [k, { ...v }])),
  }
}

/** One period in the day, with its start and end already resolved. */
export interface SlotSpan {
  /** minutes past midnight when the period starts */
  start: number
  /** how long the period runs, in minutes */
  duration: number
  /** minutes past midnight when the period ends */
  end: number
}

export interface SlotPlan {
  /** the periods themselves — start and duration paired by construction */
  slots: SlotSpan[]
  /** start times alone, for callers that only need the axis */
  starts: number[]
  /** durations alone, index-aligned with `starts` */
  durations: number[]
}

/**
 * Lay the teaching day out into periods.
 *
 * `slots` is the shape to prefer. `starts` and `durations` were the original
 * return and are kept because several callers only want one axis, but two
 * parallel arrays make a length mismatch expressible, and every consumer that
 * indexes both has to re-establish by hand that the indices line up.
 *
 * A malformed clock string yields an empty plan rather than a day of `NaN`
 * periods; `summarise()` is what turns that into a message for the user.
 */
export function slotPlan(cal: CalendarConfig): SlotPlan {
  /* `parseClock`, not `labelToMinutes`: the lenient reader turns a malformed
     string into midnight, which here would lay out a teaching day starting at
     00:00 rather than refusing the configuration. */
  const start = parseClock(cal.dayStart)
  const end = parseClock(cal.dayEnd)
  const empty: SlotPlan = { slots: [], starts: [], durations: [] }
  if (start === null || end === null || cal.slotMinutes <= 0) return empty

  const span = end - start
  if (span <= 0) return empty

  const slots: SlotSpan[] = []
  const whole = Math.floor(span / cal.slotMinutes)
  for (let i = 0; i < whole; i++) {
    const at = start + i * cal.slotMinutes
    slots.push({ start: at, duration: cal.slotMinutes, end: at + cal.slotMinutes })
  }

  /* A day that does not divide evenly leaves a remainder. Keeping it as a
     shorter final period is what lets a 09:00-18:00 day with 50-minute slots
     end at 18:00 instead of silently losing the 17:20 class. */
  const remainder = span - whole * cal.slotMinutes
  const floor = Math.max(0, cal.minFinalSlotMinutes ?? 0)
  if (floor > 0 && remainder >= floor) {
    const at = start + whole * cal.slotMinutes
    slots.push({ start: at, duration: remainder, end: at + remainder })
  }

  return {
    slots,
    starts: slots.map(s => s.start),
    durations: slots.map(s => s.duration),
  }
}

export function slotsPerDay(cal: CalendarConfig): number {
  return slotPlan(cal).starts.length
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
        p.coreCourses * p.coreWeekly + p.labCourses * p.labBlock + p.electiveCourses * 2
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

  if (perDay <= 0)
    errors.push(
      'Day start must be before day end, and the slot length must divide the teaching day.',
    )
  if (configuredDays.length === 0) errors.push('Select at least one working day.')
  if (cfg.programs.length === 0) errors.push('Add at least one programme.')
  if (rooms === 0) errors.push('Add at least one room group.')
  const staffCount = cfg.overrides?.staff ? cfg.overrides.staff.length : cfg.staff.total
  if (staffCount <= 0) errors.push('Staff headcount must be greater than zero.')

  const mixSum = Object.values(cfg.staff.mix).reduce((a, b) => a + b, 0)
  if (mixSum !== 100)
    warnings.push(`Staff rank mix sums to ${mixSum}%, not 100% — it will be normalised.`)

  if (pressure > 1) {
    errors.push(
      `Room demand exceeds supply: ${demand} sessions need placing into ${roomSlotsPerWeek} room-slots per week. Add rooms, add teaching days, or reduce weekly meetings.`,
    )
  } else if (pressure > 0.85) {
    warnings.push(
      `Room pressure is ${(pressure * 100).toFixed(0)}% — feasible but tight; expect soft-constraint compromises.`,
    )
  }

  /* Staff supply. Counting every member of staff at the full-professor cap
     overstates the roster by about a tenth: adjuncts and teaching assistants
     carry lower ceilings, and nobody on sabbatical teaches at all. */
  const staffCapacity = cfg.overrides?.staff
    ? cfg.overrides.staff.filter(f => !f.onSabbatical).reduce((a, f) => a + f.maxPerWeek, 0)
    : expectedStaffCapacity(cfg.staff)
  if (staffCapacity < demand) {
    errors.push(
      `Staff capacity is short: ${demand} weekly sessions need teaching but the roster supplies only ${staffCapacity} staff-hours per week.`,
    )
  } else if (staffCapacity < demand * 1.15) {
    warnings.push('Staff capacity has under 15% headroom — substitutions will be hard to satisfy.')
  }

  // cohort day check: a section cannot need more slots than the week holds
  for (const p of cfg.programs) {
    const weekly = p.coreCourses * p.coreWeekly + p.labCourses * p.labBlock + p.electiveCourses * 2
    if (weekly > days * perDay) {
      errors.push(
        `${p.code}: ${weekly} weekly meetings do not fit in ${days * perDay} available slots.`,
      )
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
    return biggestByKind.has('Lecture') ? 'Lecture' : ([...biggestByKind.keys()][0] ?? 'Lecture')
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

  for (const [kind, rawNeeded] of [...slotHoursByKind].toSorted((a, b) => b[1] - a[1])) {
    if (rawNeeded <= 0 || slotsPerRoom <= 0) continue
    const count = roomsByKind.get(kind) ?? 0
    const available = count * slotsPerRoom
    const comfortable = Math.max(count, count * (days * usablePerDay - blackoutSlots))

    const turnover = turnoverByKind.get(kind) ?? 0
    const gapSlots = Math.max(
      0,
      Math.ceil((turnover - cfg.calendar.passingMinutes) / cfg.calendar.slotMinutes),
    )
    // every booking but the last of each room-day drags its gap along
    const gapCost = Math.max(0, gapSlots * ((bookingsByKind.get(kind) ?? 0) - count * days))
    const needed = rawNeeded + gapCost

    if (needed > available) {
      const short = Math.ceil((needed - available) / slotsPerRoom)
      const because =
        gapCost > 0
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
        `${kind} rooms are ${((needed / comfortable) * 100).toFixed(0)}% booked before the solver starts — expect compromises.`,
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
    if (!knownDepts.has(p.dept))
      errors.push(`Programme ${p.code} references unknown department "${p.dept}".`)
  }

  return {
    students,
    cohorts,
    courses,
    rooms,
    roomSlotsPerWeek,
    demand,
    staffTotal: staffCount,
    pressure,
    slotsPerDay: perDay,
    teachingDays,
    lostDays,
    blackoutSlots,
    teachingDates,
    errors,
    warnings,
  }
}

/**
 * Periods per day that overlap the protected lunch window.
 *
 * This has to agree with `buildGrid`'s `lunchSlots` exactly — capacity
 * arithmetic in `summarise()` subtracts it, and the solver protects the
 * periods the grid names. It previously rebuilt the day by hand on the
 * assumption that every period is `slotMinutes` long, which stopped being true
 * when `slotPlan` gained a shorter final period: a day ending in a 40-minute
 * remainder that overlapped lunch was counted with the wrong span. Reading
 * `slotPlan` is both shorter and the only way the two can stay in step.
 */
export function lunchSlotsPerDay(cal: CalendarConfig): number {
  if (cal.lunchMinutes <= 0) return 0
  const lunchFrom = labelToMinutes(cal.lunchStart)
  const lunchTo = lunchFrom + cal.lunchMinutes
  return slotPlan(cal).slots.filter(s => s.start < lunchTo && s.end > lunchFrom).length
}

/**
 * Weekly teaching hours the configured roster can really supply, weighting each
 * rank by its own ceiling and removing the share on sabbatical.
 */
export function expectedStaffCapacity(f: StaffConfig): number {
  const mixTotal = Object.values(f.mix).reduce((a, b) => a + b, 0) || 1
  const share = (n: number) => n / mixTotal
  const perHead =
    share(f.mix.professor) * loadForRank(f, 'Professor').max +
    share(f.mix.associate) * loadForRank(f, 'Associate Professor').max +
    share(f.mix.assistant) * loadForRank(f, 'Assistant Professor').max +
    share(f.mix.visiting) * loadForRank(f, 'Visiting').max +
    share(f.mix.adjunct) * loadForRank(f, 'Adjunct').max +
    share(f.mix.ta) * loadForRank(f, 'Teaching Assistant').max
  const teaching = Math.max(0, f.total) * (1 - Math.min(1, f.sabbaticalShare / 100))
  return Math.round(teaching * perHead)
}

export const cloneConfig = (cfg: SetupConfig): SetupConfig =>
  JSON.parse(JSON.stringify(cfg)) as SetupConfig
