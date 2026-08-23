/**
 * Aula — setup configuration.
 *
 * This is the entire surface the administrator fills in. The generator turns a
 * `SetupConfig` into an `Institution`; the solver never reads this file. Keep
 * it serialisable: it is what gets written to an `.aula.json` project file.
 */

import type { CalendarEvent, RoomKind, StaffRank } from '../model'
import type { CustomConstraint } from '../constraints/custom'
import type { EntityOverrides } from '../records'

/**
 * The shape of everything an administrator fills in.
 *
 * `SetupConfig` is the whole input surface: the generator turns one of these
 * into an `Institution`, and nothing downstream reads anything else. Split from
 * the defaults and the derived figures so the vocabulary can be imported
 * without pulling a 300-line default institution along with it.
 */

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
