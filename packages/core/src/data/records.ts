/**
 * Editable entity records.
 *
 * The wizard's numbers generate a starting institution. The moment an
 * administrator edits a person, a room or a course, that entity type is
 * "materialised": the generated list is snapshotted into the project file as
 * explicit records, and from then on those records are the source of truth and
 * the generator no longer invents that entity type.
 *
 * This is what makes "everything is editable" true without throwing away the
 * convenience of describing an institution by its numbers.
 */

import type { CourseKind, EmploymentType, StaffRank, Institution, RoomKind } from './model'

/* ------------------------------------------------------------------ *
 * Records
 * ------------------------------------------------------------------ */

/**
 * One member of teaching staff.
 *
 * The fields are grouped the way an institution actually collects them:
 * identity and affiliation, what they are qualified to teach, what their
 * contract and availability allow, and where they are based. Every field
 * reaches the solver — see `staffFromRecords` in `generator.ts` for the
 * mapping, and `engine/rules.ts` for the constraints that read it.
 */
export interface StaffRecord {
  /* --- identity & affiliation --- */
  id: string
  /** institutional staff code shown on rosters, e.g. "CSE-114" */
  staffCode: string
  name: string
  /** department code, e.g. "CSE" */
  dept: string
  /** designation — decides which weekly cap applies and seniority tie-breaks */
  rank: StaffRank
  employment: EmploymentType
  email: string

  /* --- teaching capability --- */
  /** programme ids they may teach on; empty means every programme */
  programIds: string[]
  /** primary expertise: course ids this person is the preferred instructor for */
  courseIds: string[]
  /** cover-only expertise: allowed, but the solver reaches for it last */
  secondaryCourseIds: string[]
  /** session kinds they are authorised to run; empty means all of them */
  sessionKinds: CourseKind[]
  /** largest group they will take; 0 means no ceiling */
  maxAudience: number

  /* --- workload & availability --- */
  maxPerDay: number
  maxPerWeek: number
  /** most back-to-back slots; 0 defers to the institution-wide cap */
  maxConsecutive: number
  /** day indices (0 = Monday) this person does not teach at all */
  unavailableDays: number[]
  /**
   * Days they are physically on campus. Empty means the whole teaching week -
   * this is the field that matters for visiting and part-time staff.
   */
  availableDays: number[]
  /** `${day}:${slot}` cells held for admin, research or clinical duties */
  blockedSlots: string[]
  preferredShift: 'any' | 'morning' | 'afternoon' | 'evening'

  /* --- location --- */
  /** room kind they teach best in; a preference, never a gate */
  preferredRoomKind?: RoomKind
  /** building they are based in — classes elsewhere carry a small cost */
  homeBuildingId?: string

  onSabbatical: boolean
  needsAccessibleRoom: boolean
  /**
   * Still on the staff. People who have left are marked inactive rather than
   * deleted: removing them would orphan the timetables they already appear on,
   * but leaving them selectable is how a departed colleague ends up teaching
   * next semester. Inactive staff are not offered and are not scheduled.
   */
  active: boolean
}

export const PREFERRED_SHIFTS: { id: StaffRecord['preferredShift']; label: string }[] = [
  { id: 'any', label: 'No preference' },
  { id: 'morning', label: 'Mornings' },
  { id: 'afternoon', label: 'Afternoons' },
  { id: 'evening', label: 'Evenings' },
]

export interface CourseRecord {
  id: string
  code: string
  name: string
  /** department code */
  dept: string
  programId: string
  /** year of study, also used as the semester grouping */
  year: number
  kind: CourseKind
  /** meetings per week */
  weekly: number
  /** consecutive slots per meeting */
  blockLength: number
  roomKind: RoomKind
  /** room capabilities this course cannot run without */
  requires: string[]
  suspended: boolean
}

export interface RoomRecord {
  id: string
  name: string
  buildingId: string
  floor: number
  kind: RoomKind
  capacity: number
  turnoverMinutes: number
  features: string[]
  /** day indices the room is closed for the whole day */
  closedDays: number[]
  /** `${day}:${slot}` entries the room is unavailable */
  blockedSlots: string[]
  /** kept out of the bookable pool entirely */
  restricted: boolean
}

/** Present in a project file only once the user has edited that entity type. */
export interface EntityOverrides {
  staff?: StaffRecord[]
  courses?: CourseRecord[]
  rooms?: RoomRecord[]
  /** `${programId}:${year}` -> section count, overriding the programme default */
  sections?: Record<string, number>
  /**
   * `${programId}:${year}:${section}` or `${programId}:${year}` -> shift id.
   * Real intakes split a year across shifts — 4A and 4B in the morning, 4C in
   * the evening — so the more specific key wins over the year-level one.
   */
  shifts?: Record<string, string>
  /** `${programId}:${year}` -> profile id, when a year follows a different batch policy */
  profiles?: Record<string, string>
}

/* ------------------------------------------------------------------ *
 * Materialisation — generated institution -> editable records
 * ------------------------------------------------------------------ */

export function staffRecordsFrom(inst: Institution): StaffRecord[] {
  const deptCode = new Map(inst.departments.map(d => [d.id, d.code]))
  const half = Math.max(1, Math.floor(inst.grid.slots / 2))

  /* The model expresses a shift preference as an earliest/latest slot pair,
     which is what the rules read. Materialising has to turn that back into the
     single choice the editor offers, or every generated person would come back
     reading "no preference" and their preference would be silently discarded
     the first time anybody opened the list. */
  const shiftOf = (earliest: number, latest: number): StaffRecord['preferredShift'] => {
    if (earliest >= inst.grid.eveningFrom) return 'evening'
    if (earliest >= half) return 'afternoon'
    if (latest <= half) return 'morning'
    return 'any'
  }

  return inst.staff.map(f => ({
    id: f.id,
    staffCode: f.id.toUpperCase(),
    name: f.name,
    dept: deptCode.get(f.deptId) ?? '',
    rank: f.rank,
    employment: f.employment,
    email: '',
    programIds: [],
    courseIds: [...f.subjects],
    secondaryCourseIds: [...f.secondarySubjects],
    sessionKinds: [...f.sessionKinds],
    maxAudience: f.maxHeadcount,
    maxPerDay: f.maxPerDay,
    maxPerWeek: f.maxPerWeek,
    maxConsecutive: f.maxConsecutive,
    unavailableDays: [...f.blockedDays],
    availableDays: [...f.campusDays],
    blockedSlots: [...f.blockedSlots],
    preferredShift: shiftOf(f.earliestSlot, f.latestSlot),
    preferredRoomKind: f.preferredRoomKind,
    homeBuildingId: f.homeBuildingId,
    onSabbatical: f.onSabbatical,
    needsAccessibleRoom: f.needsAccessibleRoom,
    active: true,
  }))
}

export function courseRecordsFrom(inst: Institution): CourseRecord[] {
  const deptCode = new Map(inst.departments.map(d => [d.id, d.code]))
  return inst.courses.map(c => ({
    id: c.id,
    code: c.code,
    name: c.name,
    dept: deptCode.get(c.deptId) ?? '',
    programId: c.programId,
    year: c.year,
    kind: c.kind,
    weekly: c.weekly,
    blockLength: c.blockLength,
    roomKind: c.roomKind,
    requires: [...c.requires],
    suspended: c.suspended,
  }))
}

export function roomRecordsFrom(inst: Institution): RoomRecord[] {
  return inst.rooms.map(r => ({
    id: r.id,
    name: r.name,
    buildingId: r.buildingId,
    floor: r.floor,
    kind: r.kind,
    capacity: r.capacity,
    turnoverMinutes: r.turnoverMinutes,
    features: [...r.features],
    closedDays: [],
    blockedSlots: [...r.blocked],
    restricted: r.restricted,
  }))
}

/* ------------------------------------------------------------------ *
 * Blank records for the "add" buttons
 * ------------------------------------------------------------------ */

let seq = 0
const uid = (prefix: string) => `${prefix}-u${Date.now().toString(36)}${seq++}`

export const blankStaff = (dept: string): StaffRecord => ({
  id: uid('f'),
  staffCode: '',
  name: '',
  dept,
  rank: 'Assistant Professor',
  employment: 'Full-time',
  email: '',
  programIds: [],
  courseIds: [],
  secondaryCourseIds: [],
  sessionKinds: [],
  maxAudience: 0,
  maxPerDay: 5,
  maxPerWeek: 18,
  maxConsecutive: 0,
  unavailableDays: [],
  availableDays: [],
  blockedSlots: [],
  preferredShift: 'any',
  preferredRoomKind: undefined,
  homeBuildingId: undefined,
  onSabbatical: false,
  needsAccessibleRoom: false,
  active: true,
})

export const blankCourse = (dept: string, programId: string, year: number): CourseRecord => ({
  id: uid('c'),
  code: `${dept}${year}NEW`,
  name: 'New course',
  dept,
  programId,
  year,
  kind: 'Core',
  weekly: 3,
  blockLength: 1,
  roomKind: 'Lecture',
  requires: [],
  suspended: false,
})

export const blankRoom = (buildingId: string): RoomRecord => ({
  id: uid('r'),
  name: 'New room',
  buildingId,
  floor: 1,
  kind: 'Lecture',
  capacity: 60,
  turnoverMinutes: 0,
  features: [],
  closedDays: [],
  blockedSlots: [],
  restricted: false,
})

/* ------------------------------------------------------------------ *
 * Room capability presets
 *
 * The full 53-flag list was removed from the editor on review: it was noise
 * for the 95% case. These presets cover what the enforced constraints actually
 * read, and the underlying model still accepts any flag from an import.
 * ------------------------------------------------------------------ */

export interface FeaturePreset {
  key: string
  label: string
  hint: string
}

export const FEATURE_PRESETS: FeaturePreset[] = [
  { key: 'projectorHiRes', label: 'Projector', hint: 'High-resolution projection' },
  { key: 'computers', label: 'Computers', hint: 'Desktop terminals for every seat' },
  { key: 'wetLab', label: 'Wet lab', hint: 'Benches, sinks and services' },
  { key: 'fumeHood', label: 'Fume hood', hint: 'Required for chemistry practicals' },
  {
    key: 'ventilation',
    label: 'Heavy ventilation',
    hint: 'Extraction for welding, soldering, fumes',
  },
  { key: 'wheelchairAccess', label: 'Step-free access', hint: 'Reachable without stairs' },
  { key: 'brailleSignage', label: 'Braille signage', hint: 'Braille and auditory wayfinding' },
  { key: 'movableFurniture', label: 'Movable furniture', hint: 'Can be rearranged for group work' },
  {
    key: 'fixedSeating',
    label: 'Fixed seating',
    hint: 'Bolted, forward-facing — blocks group work',
  },
  { key: 'tiered', label: 'Tiered', hint: 'Raked lecture theatre' },
  { key: 'acoustic', label: 'Acoustically treated', hint: 'Music, recording, quiet work' },
  { key: 'soundproof', label: 'Soundproofed', hint: 'Isolated from neighbouring rooms' },
  { key: 'lectureCapture', label: 'Lecture capture', hint: 'Recording and streaming installed' },
  { key: 'wiredNetwork', label: 'Wired network', hint: 'Hardwired, for bandwidth-heavy classes' },
]

const PRESET_KEYS = new Set(FEATURE_PRESETS.map(f => f.key))

/** Flags an imported room may carry that the simplified editor does not show. */
export const hiddenFeatures = (features: string[]) => features.filter(f => !PRESET_KEYS.has(f))

/* ------------------------------------------------------------------ *
 * Specialised facilities
 *
 * A block is not a uniform stack of classrooms. Picking a specialisation on a
 * room group sets the room kind and the capabilities that facility cannot work
 * without, so an administrator describing "two electronics labs on the second
 * floor" does not also have to know that this means `largeDesks`,
 * `wiredNetwork` and `ventilation` to the constraint engine.
 * ------------------------------------------------------------------ */

export interface RoomSpecialisation {
  id: string
  label: string
  kind: RoomKind
  /** feature keys the facility implies */
  features: string[]
  /** typical seats, used as the default when the specialisation is chosen */
  capacity: number
  /** minutes of turnover the facility needs between bookings */
  turnoverMinutes: number
  hint: string
}

export const ROOM_SPECIALISATIONS: RoomSpecialisation[] = [
  {
    id: 'classroom',
    label: 'General classroom',
    kind: 'Lecture',
    features: ['projectorHiRes'],
    capacity: 60,
    turnoverMinutes: 0,
    hint: 'Ordinary teaching room with projection',
  },
  {
    id: 'lectureHall',
    label: 'Lecture hall',
    kind: 'Lecture',
    features: ['tiered', 'fixedSeating', 'projectorHiRes', 'lectureCapture'],
    capacity: 120,
    turnoverMinutes: 0,
    hint: 'Raked theatre for combined sections',
  },
  {
    id: 'tutorial',
    label: 'Tutorial / seminar room',
    kind: 'Seminar',
    features: ['movableFurniture', 'projectorHiRes'],
    capacity: 40,
    turnoverMinutes: 0,
    hint: 'Small group teaching, furniture rearranges',
  },
  {
    id: 'computerLab',
    label: 'Computer lab',
    kind: 'Computer Lab',
    features: ['computers', 'wiredNetwork', 'projectorHiRes'],
    capacity: 60,
    turnoverMinutes: 15,
    hint: 'A terminal at every seat',
  },
  {
    id: 'networkLab',
    label: 'Networking / server lab',
    kind: 'Computer Lab',
    features: ['computers', 'wiredNetwork', 'ventilation'],
    capacity: 40,
    turnoverMinutes: 15,
    hint: 'Racks, structured cabling, cooling',
  },
  {
    id: 'chemistryLab',
    label: 'Chemistry / wet lab',
    kind: 'Lab',
    features: ['wetLab', 'fumeHood', 'ventilation'],
    capacity: 48,
    turnoverMinutes: 30,
    hint: 'Benches, services and extraction',
  },
  {
    id: 'physicsLab',
    label: 'Physics lab',
    kind: 'Lab',
    features: ['wetLab', 'wiredNetwork'],
    capacity: 48,
    turnoverMinutes: 15,
    hint: 'Optical benches and blackout',
  },
  {
    id: 'biologyLab',
    label: 'Biology / biosafety lab',
    kind: 'Lab',
    features: ['wetLab', 'ventilation'],
    capacity: 40,
    turnoverMinutes: 30,
    hint: 'Containment and controlled disposal',
  },
  {
    id: 'electronicsLab',
    label: 'Electronics / circuits lab',
    kind: 'Lab',
    features: ['wiredNetwork', 'ventilation'],
    capacity: 48,
    turnoverMinutes: 15,
    hint: 'Soldering, instrumentation, extraction',
  },
  {
    id: 'mechanicalWorkshop',
    label: 'Mechanical workshop',
    kind: 'Workshop',
    features: ['ventilation', 'soundproof'],
    capacity: 40,
    turnoverMinutes: 30,
    hint: 'Machine tools — ground floor, noisy',
  },
  {
    id: 'cadStudio',
    label: 'CAD / drafting studio',
    kind: 'Studio',
    features: ['computers', 'projectorHiRes'],
    capacity: 40,
    turnoverMinutes: 0,
    hint: 'Drawing boards and workstations',
  },
  {
    id: 'makerSpace',
    label: 'Maker space / fabrication',
    kind: 'Workshop',
    features: ['ventilation'],
    capacity: 30,
    turnoverMinutes: 30,
    hint: 'Prototyping, printers, extraction',
  },
  {
    id: 'languageLab',
    label: 'Language lab',
    kind: 'Computer Lab',
    features: ['computers', 'acoustic', 'soundproof'],
    capacity: 40,
    turnoverMinutes: 0,
    hint: 'Booths and audio isolation',
  },
  {
    id: 'designStudio',
    label: 'Design / art studio',
    kind: 'Studio',
    features: ['movableFurniture'],
    capacity: 30,
    turnoverMinutes: 15,
    hint: 'Open floor, controlled light',
  },
  {
    id: 'mediaStudio',
    label: 'Media / recording studio',
    kind: 'Studio',
    features: ['acoustic', 'soundproof'],
    capacity: 24,
    turnoverMinutes: 15,
    hint: 'Recording, editing, isolation',
  },
  {
    id: 'vrLab',
    label: 'VR / simulation lab',
    kind: 'Special',
    features: ['computers', 'wiredNetwork'],
    capacity: 24,
    turnoverMinutes: 15,
    hint: 'Tracked floor area per station',
  },
  {
    id: 'surveyLab',
    label: 'Surveying / geotech lab',
    kind: 'Lab',
    features: ['wetLab'],
    capacity: 40,
    turnoverMinutes: 15,
    hint: 'Heavy instruments, ground access',
  },
  {
    id: 'quiet',
    label: 'Low-stimulus room',
    kind: 'Seminar',
    features: ['acoustic', 'wheelchairAccess', 'brailleSignage'],
    capacity: 24,
    turnoverMinutes: 0,
    hint: 'Reduced sensory load, accessible',
  },
]

export const specialisationById = (id?: string): RoomSpecialisation | undefined =>
  id ? ROOM_SPECIALISATIONS.find(x => x.id === id) : undefined
