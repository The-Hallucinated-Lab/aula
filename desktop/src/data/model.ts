/**
 * Aula — domain model.
 *
 * Everything here is derived from a `SetupConfig` the administrator fills in
 * (see `config.ts`). Nothing is hardcoded to a particular institution: the
 * scheduler reads only these structures, so importing real records later is a
 * matter of producing an `Institution`, not touching the engine.
 */

/* ------------------------------------------------------------------ *
 * Time grid
 * ------------------------------------------------------------------ */

export const DAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Resolved time grid — how many days/slots exist and what each slot means. */
export interface TimeGrid {
  /** indices into DAY_NAMES, in teaching order, e.g. [0,1,2,3,4] */
  days: number[]
  /** number of teaching slots per day */
  slots: number
  /** "09:00" style label per slot index */
  labels: string[]
  /** minutes from midnight at which each slot starts */
  starts: number[]
  slotMinutes: number
  passingMinutes: number
  /** slot indices that fall inside the protected lunch window */
  lunchSlots: number[]
  /** slot index at/after which a session counts as "evening" */
  eveningFrom: number
  /** slot index below which a session counts as "early morning" */
  earlyUntil: number
  /** slot indices considered prime learning hours */
  primeSlots: number[]
}

/* ------------------------------------------------------------------ *
 * Academic calendar
 *
 * The timetable is a repeating week; a calendar is a run of dates. The two
 * meet in exactly three places, and nowhere else:
 *   - a dated closure removes one occurrence of a weekday, which changes how
 *     many times a course actually meets over the term;
 *   - a weekday that loses every one of its dates is no longer a teaching day;
 *   - an event that repeats every week blocks the same slots in every week,
 *     so it can be enforced on the weekly grid as a blackout.
 * ------------------------------------------------------------------ */

export type CalendarEventKind = 'holiday' | 'observance' | 'exam' | 'event' | 'break'

export const CALENDAR_KINDS: { id: CalendarEventKind; label: string; blurb: string }[] = [
  { id: 'holiday', label: 'Holiday', blurb: 'Institution closed — no teaching at all' },
  { id: 'observance', label: 'Observance', blurb: 'Religious or cultural — mandatory classes avoided' },
  { id: 'exam', label: 'Examination', blurb: 'Assessment window; teaching usually suspended' },
  { id: 'event', label: 'Institution event', blurb: 'Convocation, fest, inspection, assembly' },
  { id: 'break', label: 'Break', blurb: 'Mid-term or vacation block' },
]

export interface CalendarEvent {
  id: string
  name: string
  kind: CalendarEventKind
  /** ISO `yyyy-mm-dd`, inclusive */
  start: string
  /** ISO `yyyy-mm-dd`, inclusive; equal to `start` for a single day */
  end: string
  /** teaching is cancelled on these dates */
  blocksTeaching: boolean
  /**
   * Repeats on the same weekday in every week of the term. A weekly event is
   * the only kind the weekly grid can enforce directly, so it becomes a hard
   * blackout of its slots rather than an attrition figure.
   */
  weekly: boolean
  /** first slot index the event occupies; -1 means the whole teaching day */
  fromSlot: number
  /** last slot index the event occupies, inclusive */
  toSlot: number
  note: string
}

/** One `${day}:${slot}` cell the calendar takes off the weekly grid. */
export interface CalendarBlackout {
  key: string
  day: number
  slot: number
  eventId: string
  name: string
  kind: CalendarEventKind
  /** only mandatory teaching is refused; electives and seminars may proceed */
  coreOnly: boolean
}

/** What the dated calendar does to one weekday of the repeating week. */
export interface WeekdayImpact {
  /** index into DAY_NAMES */
  day: number
  /** dates of this weekday inside the term */
  totalDates: number
  /** of those, cancelled outright */
  lostDates: number
  teachingDates: number
  /** names of the events that took dates away, most recent first */
  causes: string[]
}

export interface AcademicCalendar {
  termStart: string
  termEnd: string
  /** valid, in-term events, earliest first */
  events: CalendarEvent[]
  blackouts: CalendarBlackout[]
  /** one entry per teaching weekday, in teaching order */
  impact: WeekdayImpact[]
  /** teaching weekdays the calendar wipes out completely */
  lostDays: number[]
  /** teaching dates left in the term across every weekday */
  teachingDates: number
  /** whole weeks the term spans; 0 when the dates are unusable */
  weeks: number
  /** dates are missing or inverted, so only `weeks` from Setup is meaningful */
  dated: boolean
}

/* ------------------------------------------------------------------ *
 * Physical plant
 * ------------------------------------------------------------------ */

/** Room capabilities. Constraints 91–125 resolve to these feature flags. */
export const ROOM_FEATURES = [
  'tiered', 'flatFloor', 'movableFurniture', 'fixedSeating', 'centralTable',
  'wetLab', 'fumeHood', 'computers', 'macLab', 'windowsLab', 'sprungFloor',
  'mirrors', 'acoustic', 'grandPiano', 'makerSpace', 'draftingTables',
  'biosafety', 'gymnasium', 'projectorHiRes', 'dualProjection', 'lectureCapture',
  'mootCourt', 'mediaStudio', 'kitchen', 'observatory', 'auditorium',
  'groundFloor', 'reinforcedFloor', 'soundproof', 'blackoutBlinds',
  'threeDPrinters', 'languageLab', 'vrTracking', 'esports', 'financeTerminals',
  'colorCalibrated', 'medicalDisplays', 'animalSafe', 'twoWayMirror',
  'floorDrains', 'ventilation', 'wiredNetwork', 'hyflex', 'chalkboard',
  'wrapWhiteboard', 'largeDesks', 'podTables', 'cleanRoom', 'emiShielded',
  'wheelchairAccess', 'adjustablePodium', 'brailleSignage', 'lowStimulus',
] as const
export type RoomFeature = typeof ROOM_FEATURES[number]

export type RoomKind =
  | 'Lecture' | 'Lab' | 'Seminar' | 'Studio' | 'Computer Lab'
  | 'Auditorium' | 'Workshop' | 'Gymnasium' | 'Special'

export const ROOM_KINDS: RoomKind[] = [
  'Lecture', 'Lab', 'Seminar', 'Studio', 'Computer Lab',
  'Auditorium', 'Workshop', 'Gymnasium', 'Special',
]

export interface Campus {
  id: string
  name: string
  /** minutes needed to travel to each other campus, by campus id */
  travelMinutes: Record<string, number>
}

export interface Building {
  id: string
  name: string
  campusId: string
  /** minutes to walk to another building on the same campus */
  walkMinutes: number
  /** department that owns / has booking priority on this building */
  ownerDeptId?: string
  /** `${day}:${slot}` entries blocked for maintenance */
  maintenance: string[]
  hasElevator: boolean
  accessible: boolean
  /** building is noisy (construction, workshops) */
  noisy: boolean
}

export interface Room {
  id: string
  name: string
  buildingId: string
  floor: number
  kind: RoomKind
  capacity: number
  /** capacity when used for examinations (alternate seating) */
  examCapacity: number
  features: RoomFeature[]
  /** minutes of turnover required before the next booking */
  turnoverMinutes: number
  /** `${day}:${slot}` entries the room is unavailable (cleaning, lockout) */
  blocked: string[]
  ownerDeptId?: string
  /** excluded from the general pool (studios, chapels, lounges) */
  restricted: boolean
}

/** Portable/unique equipment two sessions cannot share (constraint 9). */
export interface EquipmentPool {
  id: string
  name: string
  units: number
}

/* ------------------------------------------------------------------ *
 * People and curriculum
 * ------------------------------------------------------------------ */

export type FacultyRank =
  | 'Professor' | 'Associate Professor' | 'Assistant Professor'
  | 'Adjunct' | 'Visiting' | 'Teaching Assistant' | 'Clinical'

export const FACULTY_RANKS: FacultyRank[] = [
  'Professor', 'Associate Professor', 'Assistant Professor',
  'Adjunct', 'Visiting', 'Teaching Assistant', 'Clinical',
]

export type EmploymentType = 'Full-time' | 'Part-time' | 'Visiting' | 'Contract' | 'Guest'

export const EMPLOYMENT_TYPES: EmploymentType[] = [
  'Full-time', 'Part-time', 'Visiting', 'Contract', 'Guest',
]

export interface Faculty {
  id: string
  name: string
  deptId: string
  rank: FacultyRank
  /** course ids this person is qualified to teach */
  subjects: string[]
  maxPerDay: number
  maxPerWeek: number
  /** day indices this person is unavailable (research days, rotations) */
  blockedDays: number[]
  /** `${day}:${slot}` entries this person cannot teach */
  blockedSlots: string[]
  /** days a visiting instructor is on campus; empty means all days */
  campusDays: number[]
  onSabbatical: boolean
  /** prefers not to teach before this slot index */
  earliestSlot: number
  /** prefers not to teach at or after this slot index */
  latestSlot: number
  preferredDays: number[]
  /** wants classes packed together rather than spread out */
  prefersBackToBack: boolean
  /** needs a free slot between classes for preparation */
  needsPrepGap: boolean
  /** requires step-free / accessible rooms */
  needsAccessibleRoom: boolean
  /** first-year appointment — reduced load */
  isNew: boolean
  /** how many brand-new syllabi this person already carries */
  newPreparations: number
  /** 0 = most junior; used for priority tie-breaks */
  seniority: number
  /** contract shape; visiting and part-time staff carry tighter availability */
  employment: EmploymentType
  /** courses they can cover at a push — allowed, but penalised */
  secondarySubjects: string[]
  /** session kinds they are authorised to run; empty means all of them */
  sessionKinds: CourseKind[]
  /** largest group they will take; 0 means no ceiling */
  maxHeadcount: number
  /** most back-to-back slots; 0 falls back to the institution-wide cap */
  maxConsecutive: number
  /** room kind they teach best in — a preference, never a gate */
  preferredRoomKind?: RoomKind
  /** building they are based in; classes elsewhere carry a small cost */
  homeBuildingId?: string
}

export type CourseKind =
  | 'Core' | 'Lab' | 'Elective' | 'Seminar' | 'Studio'
  | 'Tutorial' | 'Workshop' | 'Fieldwork' | 'Online'

export const COURSE_KINDS: CourseKind[] = [
  'Core', 'Lab', 'Elective', 'Seminar', 'Studio',
  'Tutorial', 'Workshop', 'Fieldwork', 'Online',
]

export interface Course {
  id: string
  code: string
  name: string
  deptId: string
  programId: string
  year: number
  credits: number
  kind: CourseKind
  /** meetings required per week */
  weekly: number
  /** consecutive slots each meeting occupies */
  blockLength: number
  /** room kind that can host it */
  roomKind: RoomKind
  /** room features the session cannot run without */
  requires: RoomFeature[]
  /** unique equipment pool this course consumes */
  equipmentId?: string
  /** course ids that must be scheduled earlier in the week */
  after: string[]
  /** expected headcount; falls back to cohort size */
  enrolment?: number
  /** suspended courses must not consume room time */
  suspended: boolean
  /** evening-only (working professionals) */
  eveningOnly: boolean
  /** heavy cognitive load — avoid stacking with another such course */
  heavyLoad: boolean
  /** requires daylight (surveying, flight hours, field work) */
  daylightOnly: boolean
  /** elective group id — members must not clash with each other */
  electiveGroup?: string
  crossListedWith?: string
}

export interface Program {
  id: string
  code: string
  name: string
  deptId: string
  years: number
  sectionsPerYear: number
  /** 'day' cohorts follow the standard grid; others shift later */
  mode: 'day' | 'evening' | 'weekend'
}

export interface Department {
  id: string
  code: string
  name: string
  colorIndex: number
  /** buildings this department has booking priority over */
  homeBuildingIds: string[]
}

export interface Cohort {
  id: string
  name: string
  deptId: string
  programId: string
  year: number
  size: number
  mode: Program['mode']
  /** cohort contains students needing step-free access */
  needsAccessibleRooms: boolean
  /** `${day}:${slot}` entries protected (athletics, prayer, ROTC) */
  protectedSlots: string[]
}

export interface Institution {
  campuses: Campus[]
  buildings: Building[]
  departments: Department[]
  programs: Program[]
  faculty: Faculty[]
  rooms: Room[]
  courses: Course[]
  cohorts: Cohort[]
  equipment: EquipmentPool[]
  grid: TimeGrid
  calendar: AcademicCalendar
}

/* ------------------------------------------------------------------ *
 * Schedule
 * ------------------------------------------------------------------ */

export interface Session {
  id: string
  courseId: string
  facultyId: string
  cohortId: string
  roomId: string
  day: number
  slot: number
  /** consecutive slots occupied, at least 1 */
  length: number
  /** original faculty id when a substitution has been applied */
  substitutedFor?: string
}

export interface Violation {
  /** catalogue constraint id, e.g. "C001" */
  code: string
  /** short human sentence naming what went wrong */
  message: string
  hard: boolean
  sessionIds: string[]
  weight: number
}

export interface Unplaced {
  courseId: string
  courseLabel: string
  cohortId: string
  cohortLabel: string
  missing: number
  reason: string
  /** constraint codes that blocked it, most frequent first */
  blockedBy: string[]
}

export interface Bottleneck {
  code: string
  label: string
  blocked: number
  hard: boolean
}

export interface SolveReport {
  sessions: Session[]
  violations: Violation[]
  unplaced: Unplaced[]
  bottlenecks: Bottleneck[]
  elapsedMs: number
  /** total soft penalty; lower is better */
  penalty: number
  seed: number
  /** how many placements were requested vs achieved */
  requested: number
  placed: number
  /** bounded search failed and an exhaustive sweep was tried */
  repairs: number
  /** of those, how many the exhaustive sweep rescued */
  repaired: number
  /** placements that required moving an existing session out of the way */
  displacements: number
}

export interface ActivityEntry {
  id: number
  time: string
  kind: 'generate' | 'move' | 'substitute' | 'constraint' | 'scenario' | 'reject' | 'setup' | 'io'
  text: string
}

export interface ScenarioProfile {
  id: 'balanced' | 'utilization' | 'compact' | 'welfare'
  name: string
  tagline: string
  weights: { gaps: number; utilization: number; loadBalance: number; welfare: number }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * May this person be given this class?
 *
 * Subject expertise alone is not qualification: a tutor engaged for small
 * groups is not qualified for a 200-seat combined lecture, whatever their
 * subject list says. Programme eligibility and session-type authorisation are
 * already resolved into `subjects` when the roster is built, because they
 * depend only on the course; group size cannot be, because it belongs to the
 * cohort. Both the solver's candidate filter and the substitution finder read
 * this, so the two can never disagree about who is allowed to teach what.
 */
export function canTeach(f: Faculty, course: Course, headcount: number): boolean {
  if (f.onSabbatical) return false
  if (!f.subjects.includes(course.id)) return false
  return f.maxHeadcount <= 0 || headcount <= f.maxHeadcount
}

export const minutesToLabel = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export const labelToMinutes = (s: string) => {
  const [h, m] = s.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Deterministic PRNG so a given seed always reproduces the same schedule. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <T,>(rng: () => number, arr: readonly T[]) =>
  arr[Math.floor(rng() * arr.length)]

export const shuffled = <T,>(rng: () => number, arr: readonly T[]) => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
