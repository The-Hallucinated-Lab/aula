/**
 * Aula — setup configuration.
 *
 * This is the entire surface the administrator fills in. The generator turns a
 * `SetupConfig` into an `Institution`; the solver never reads this file. Keep
 * it serialisable: it is what gets written to an `.aula.json` project file.
 */

import { DEFAULT_RANK_LOADS } from './types'
import type {
  BuildingConfig,
  DeptConfig,
  EquipmentConfig,
  FacultyConfig,
  ProgramConfig,
  RoomGroupConfig,
  SchoolConfig,
  SetupConfig,
} from './types'

/**
 * A worked example to start from.
 *
 * Every figure here is editable in the Setup wizard — the point of shipping a
 * complete institution rather than an empty form is that a new project is
 * schedulable in a minute, and the wizard's live feasibility numbers have
 * something to talk about from the first screen.
 */

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
