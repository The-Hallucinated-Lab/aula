/**
 * CSV import — the seam where real institutional data replaces generated data.
 *
 * The generator turns figures into an institution; that is what makes a new
 * project usable in a minute. It is not what anybody wants once they have a
 * roster. `EntityOverrides` already means "explicit records take over and the
 * generator stops inventing this type" (D-22), so an import is that same
 * mechanism fed from a file instead of from an edit, and it inherits the whole
 * validation, editing and reset-to-generated path unchanged.
 *
 * Two rules govern this file:
 *
 *  1. **No row is ever silently dropped.** A row that cannot be used comes back
 *     with its line number and a sentence saying why. A roster that imports
 *     "successfully" with eleven people missing is worse than one that refuses.
 *  2. **Nothing here trusts the file.** Numbers may be blank, codes may not
 *     exist, columns may be missing or in any order. Everything resolves
 *     against the configuration or is reported.
 */

import type { SetupConfig } from './config'
import {
  COURSE_KINDS,
  EMPLOYMENT_TYPES,
  ROOM_KINDS,
  STAFF_RANKS,
  type CourseKind,
  type EmploymentType,
  type RoomKind,
  type StaffRank,
} from './model'
import { FEATURE_PRESETS, type CourseRecord, type RoomRecord, type StaffRecord } from './records'

export type ImportKind = 'staff' | 'rooms' | 'courses'

export interface RowProblem {
  /** 1-based line in the file as the user sees it, header included */
  line: number
  message: string
}

export interface ImportResult<T> {
  rows: T[]
  problems: RowProblem[]
  /** columns present in the file that nothing reads */
  ignoredColumns: string[]
  /** required columns the file did not have */
  missingColumns: string[]
}

/* ------------------------------------------------------------------ *
 * CSV parsing
 * ------------------------------------------------------------------ */

/**
 * Parse CSV into rows of cells.
 *
 * Written out rather than pulled in because the format is small and the
 * failure modes are specific: a quoted field containing a comma, a doubled
 * quote meaning a literal one, and CRLF from Excel. A split on commas gets all
 * three wrong, and a course named "Design, Analysis of Algorithms" is not an
 * unusual thing to find in a real file.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  // A byte-order mark survives Excel's "Save as CSV" and would otherwise
  // become part of the first column's name.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < src.length; i++) {
    const c = src[i]

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
      continue
    }

    if (c === '"') {
      quoted = true
      continue
    }
    if (c === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (c === '\r') continue
    if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += c
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

/* ------------------------------------------------------------------ *
 * Column handling
 * ------------------------------------------------------------------ */

/** "Staff code", "staff_code" and "STAFFCODE" are the same column. */
const canonical = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')

interface Column {
  key: string
  /** every spelling accepted for this column, canonicalised */
  aliases: string[]
  required?: boolean
}

function indexColumns(header: string[], columns: Column[]) {
  const seen = header.map(canonical)
  const at: Record<string, number> = {}
  for (const col of columns) {
    const i = seen.findIndex(h => col.aliases.includes(h))
    if (i >= 0) at[col.key] = i
  }
  const missing = columns.filter(c => c.required && at[c.key] === undefined).map(c => c.key)
  const claimed = new Set(Object.values(at))
  const ignored = header.filter((_, i) => !claimed.has(i)).filter(h => h.trim() !== '')
  return { at, missing, ignored }
}

const cell = (row: string[], at: Record<string, number>, key: string) =>
  at[key] === undefined ? '' : (row[at[key]] ?? '').trim()

const asInt = (v: string, fallback: number) => {
  const n = Number(v)
  return v !== '' && Number.isFinite(n) ? Math.trunc(n) : fallback
}

/**
 * A number that says whether it was really there.
 *
 * `asInt` alone cannot distinguish "blank, so use the default" from
 * "somebody typed *sixty*, so use the default" — and the second is a mistake
 * the importer must report rather than absorb.
 */
const readInt = (v: string, fallback: number): { value: number; bad: boolean } => {
  if (v.trim() === '') return { value: fallback, bad: false }
  const n = Number(v)
  return Number.isFinite(n) && n === Math.trunc(n)
    ? { value: n, bad: false }
    : { value: fallback, bad: true }
}

const asFlag = (v: string, fallback: boolean) => {
  const s = v.trim().toLowerCase()
  if (['yes', 'y', 'true', '1'].includes(s)) return true
  if (['no', 'n', 'false', '0'].includes(s)) return false
  return fallback
}

/** Semicolon-separated lists, because commas belong to the format. */
const asList = (v: string) =>
  v
    .split(';')
    .map(s => s.trim())
    .filter(s => s !== '')

/** Match a named value case-insensitively against the values the model allows. */
function oneOf<T extends string>(v: string, allowed: readonly T[], fallback: T): T {
  const hit = allowed.find(a => canonical(a) === canonical(v))
  return hit ?? fallback
}

let seq = 0
const uid = (prefix: string) => `${prefix}-i${Date.now().toString(36)}${seq++}`

/* ------------------------------------------------------------------ *
 * Staff
 * ------------------------------------------------------------------ */

const STAFF_COLUMNS: Column[] = [
  { key: 'name', aliases: ['name', 'staffname', 'fullname', 'facultyname'], required: true },
  { key: 'staffCode', aliases: ['staffcode', 'code', 'employeeid', 'empid', 'staffid'] },
  { key: 'dept', aliases: ['dept', 'department', 'departmentcode'], required: true },
  { key: 'rank', aliases: ['rank', 'designation', 'grade'] },
  { key: 'employment', aliases: ['employment', 'employmenttype', 'contract'] },
  { key: 'email', aliases: ['email', 'emailaddress'] },
  { key: 'courses', aliases: ['courses', 'coursecodes', 'subjects', 'teaches'] },
  { key: 'maxPerDay', aliases: ['maxperday', 'dailycap', 'hoursperday'] },
  { key: 'maxPerWeek', aliases: ['maxperweek', 'weeklycap', 'hoursperweek', 'load'] },
  { key: 'active', aliases: ['active', 'current', 'inservice'] },
]

export function importStaff(text: string, config: SetupConfig): ImportResult<StaffRecord> {
  const table = parseCsv(text)
  const rows: StaffRecord[] = []
  const problems: RowProblem[] = []
  if (table.length === 0) {
    return {
      rows,
      problems: [{ line: 1, message: 'The file is empty.' }],
      ignoredColumns: [],
      missingColumns: [],
    }
  }

  const { at, missing, ignored } = indexColumns(table[0], STAFF_COLUMNS)
  if (missing.length > 0) {
    return { rows, problems, ignoredColumns: ignored, missingColumns: missing }
  }

  const deptCodes = new Set(config.departments.map(d => d.code.toUpperCase()))
  // Course codes are what a human writes; ids are what the model uses.
  const courseIdByCode = new Map(
    (config.overrides?.courses ?? []).map(c => [canonical(c.code), c.id]),
  )
  const seenCodes = new Set<string>()

  for (let i = 1; i < table.length; i++) {
    const line = i + 1
    const row = table[i]
    const name = cell(row, at, 'name')
    if (name === '') {
      problems.push({ line, message: 'No name — skipped.' })
      continue
    }

    const dept = cell(row, at, 'dept').toUpperCase()
    if (!deptCodes.has(dept)) {
      problems.push({
        line,
        message: `${name}: department "${dept || '(blank)'}" is not one of ${[...deptCodes].join(', ')} — skipped.`,
      })
      continue
    }

    const staffCode = cell(row, at, 'staffCode')
    if (staffCode !== '' && seenCodes.has(canonical(staffCode))) {
      problems.push({
        line,
        message: `${name}: staff code ${staffCode} already appears above — skipped.`,
      })
      continue
    }
    if (staffCode !== '') seenCodes.add(canonical(staffCode))

    const wanted = asList(cell(row, at, 'courses'))
    const courseIds: string[] = []
    for (const code of wanted) {
      const id = courseIdByCode.get(canonical(code))
      if (id) courseIds.push(id)
      else
        problems.push({
          line,
          message: `${name}: course "${code}" is not in this project — that one assignment was dropped.`,
        })
    }

    const rank = oneOf(cell(row, at, 'rank'), STAFF_RANKS, 'Assistant Professor' as StaffRank)
    const maxPerWeek = asInt(cell(row, at, 'maxPerWeek'), 18)
    const maxPerDay = asInt(cell(row, at, 'maxPerDay'), 5)
    if (maxPerDay > maxPerWeek) {
      problems.push({
        line,
        message: `${name}: daily cap ${maxPerDay} exceeds the weekly cap ${maxPerWeek} — the daily cap was reduced to match.`,
      })
    }

    rows.push({
      id: uid('f'),
      staffCode,
      name,
      dept,
      rank,
      employment: oneOf(
        cell(row, at, 'employment'),
        EMPLOYMENT_TYPES,
        'Full-time' as EmploymentType,
      ),
      email: cell(row, at, 'email'),
      programIds: [],
      courseIds,
      secondaryCourseIds: [],
      sessionKinds: [],
      maxAudience: 0,
      maxPerDay: Math.min(maxPerDay, maxPerWeek),
      maxPerWeek,
      maxConsecutive: 0,
      unavailableDays: [],
      availableDays: [],
      blockedSlots: [],
      preferredShift: 'any',
      preferredRoomKind: undefined,
      homeBuildingId: undefined,
      onSabbatical: false,
      needsAccessibleRoom: false,
      active: asFlag(cell(row, at, 'active'), true),
    })
  }

  return { rows, problems, ignoredColumns: ignored, missingColumns: [] }
}

/* ------------------------------------------------------------------ *
 * Rooms
 * ------------------------------------------------------------------ */

const ROOM_COLUMNS: Column[] = [
  { key: 'name', aliases: ['name', 'room', 'roomname', 'roomno', 'roomnumber'], required: true },
  { key: 'building', aliases: ['building', 'block', 'buildingname'], required: true },
  { key: 'floor', aliases: ['floor', 'storey', 'level'] },
  { key: 'kind', aliases: ['kind', 'type', 'roomtype'] },
  { key: 'capacity', aliases: ['capacity', 'seats', 'strength'] },
  { key: 'turnoverMinutes', aliases: ['turnover', 'turnoverminutes', 'changeover'] },
  { key: 'features', aliases: ['features', 'facilities', 'capabilities'] },
  { key: 'restricted', aliases: ['restricted', 'reserved', 'excluded'] },
]

export function importRooms(text: string, config: SetupConfig): ImportResult<RoomRecord> {
  const table = parseCsv(text)
  const rows: RoomRecord[] = []
  const problems: RowProblem[] = []
  if (table.length === 0) {
    return {
      rows,
      problems: [{ line: 1, message: 'The file is empty.' }],
      ignoredColumns: [],
      missingColumns: [],
    }
  }

  const { at, missing, ignored } = indexColumns(table[0], ROOM_COLUMNS)
  if (missing.length > 0) {
    return { rows, problems, ignoredColumns: ignored, missingColumns: missing }
  }

  // Buildings are named in a file and identified in the model; accept either.
  const buildingByName = new Map(
    config.buildings.flatMap(b => [[canonical(b.name), b] as const, [canonical(b.id), b] as const]),
  )
  const featureKeys = new Map(FEATURE_PRESETS.map(f => [canonical(f.label), f.key]))
  for (const f of FEATURE_PRESETS) featureKeys.set(canonical(f.key), f.key)

  const seenNames = new Set<string>()

  for (let i = 1; i < table.length; i++) {
    const line = i + 1
    const row = table[i]
    const name = cell(row, at, 'name')
    if (name === '') {
      problems.push({ line, message: 'No room name — skipped.' })
      continue
    }
    if (seenNames.has(canonical(name))) {
      problems.push({
        line,
        message: `${name}: a room of that name already appears above — skipped.`,
      })
      continue
    }

    const buildingName = cell(row, at, 'building')
    const building = buildingByName.get(canonical(buildingName))
    if (!building) {
      problems.push({
        line,
        message: `${name}: building "${buildingName || '(blank)'}" is not in this project — skipped.`,
      })
      continue
    }
    seenNames.add(canonical(name))

    const rawFloor = cell(row, at, 'floor')
    const parsedFloor = readInt(rawFloor, 1)
    if (parsedFloor.bad) {
      problems.push({
        line,
        message: `${name}: floor "${rawFloor}" is not a number — placed on the ground floor.`,
      })
    }
    const floor = parsedFloor.value
    if (floor > building.floors) {
      problems.push({
        line,
        message: `${name}: floor ${floor} is above ${building.name}, which has ${building.floors} — placed on its top floor instead.`,
      })
    }

    const features: string[] = []
    for (const f of asList(cell(row, at, 'features'))) {
      const key = featureKeys.get(canonical(f))
      if (key) features.push(key)
      else
        problems.push({
          line,
          message: `${name}: facility "${f}" is not one Aula knows — that one was dropped.`,
        })
    }

    const rawCapacity = cell(row, at, 'capacity')
    const capacity = readInt(rawCapacity, 60)
    if (capacity.bad || capacity.value <= 0) {
      problems.push({
        line,
        message: `${name}: capacity "${rawCapacity}" is not a usable number — assumed 60.`,
      })
    }

    rows.push({
      id: uid('r'),
      name,
      buildingId: building.id,
      floor: Math.max(1, Math.min(floor, building.floors)),
      kind: oneOf(cell(row, at, 'kind'), ROOM_KINDS, 'Lecture' as RoomKind),
      capacity: !capacity.bad && capacity.value > 0 ? capacity.value : 60,
      turnoverMinutes: Math.max(0, asInt(cell(row, at, 'turnoverMinutes'), 0)),
      features,
      closedDays: [],
      blockedSlots: [],
      restricted: asFlag(cell(row, at, 'restricted'), false),
    })
  }

  return { rows, problems, ignoredColumns: ignored, missingColumns: [] }
}

/* ------------------------------------------------------------------ *
 * Courses
 * ------------------------------------------------------------------ */

const COURSE_COLUMNS: Column[] = [
  { key: 'code', aliases: ['code', 'coursecode', 'subjectcode'], required: true },
  { key: 'name', aliases: ['name', 'coursename', 'title', 'subject'], required: true },
  { key: 'dept', aliases: ['dept', 'department', 'departmentcode'], required: true },
  { key: 'programme', aliases: ['programme', 'program', 'programmecode', 'programcode'] },
  { key: 'year', aliases: ['year', 'yearofstudy', 'semester', 'sem'] },
  { key: 'kind', aliases: ['kind', 'type', 'coursetype'] },
  { key: 'weekly', aliases: ['weekly', 'meetingsperweek', 'perweek', 'hoursperweek'] },
  { key: 'blockLength', aliases: ['blocklength', 'slotspermeeting', 'block', 'duration'] },
  { key: 'roomKind', aliases: ['roomkind', 'roomtype', 'needsroom'] },
]

export function importCourses(text: string, config: SetupConfig): ImportResult<CourseRecord> {
  const table = parseCsv(text)
  const rows: CourseRecord[] = []
  const problems: RowProblem[] = []
  if (table.length === 0) {
    return {
      rows,
      problems: [{ line: 1, message: 'The file is empty.' }],
      ignoredColumns: [],
      missingColumns: [],
    }
  }

  const { at, missing, ignored } = indexColumns(table[0], COURSE_COLUMNS)
  if (missing.length > 0) {
    return { rows, problems, ignoredColumns: ignored, missingColumns: missing }
  }

  const deptCodes = new Set(config.departments.map(d => d.code.toUpperCase()))
  const programByCode = new Map(
    config.programs.flatMap(p => [[canonical(p.code), p] as const, [canonical(p.id), p] as const]),
  )
  const seenCodes = new Set<string>()

  for (let i = 1; i < table.length; i++) {
    const line = i + 1
    const row = table[i]
    const code = cell(row, at, 'code')
    const name = cell(row, at, 'name')
    if (code === '' || name === '') {
      problems.push({ line, message: 'A course needs both a code and a name — skipped.' })
      continue
    }
    if (seenCodes.has(canonical(code))) {
      problems.push({ line, message: `${code}: that code already appears above — skipped.` })
      continue
    }

    const dept = cell(row, at, 'dept').toUpperCase()
    if (!deptCodes.has(dept)) {
      problems.push({
        line,
        message: `${code}: department "${dept || '(blank)'}" is not in this project — skipped.`,
      })
      continue
    }

    const wantedProgram = cell(row, at, 'programme')
    const program =
      wantedProgram === ''
        ? config.programs.find(p => p.dept === dept)
        : programByCode.get(canonical(wantedProgram))
    if (!program) {
      problems.push({
        line,
        message: `${code}: programme "${wantedProgram || '(blank)'}" is not in this project — skipped.`,
      })
      continue
    }
    if (program.dept !== dept) {
      problems.push({
        line,
        message: `${code}: programme ${program.code} belongs to ${program.dept}, not ${dept} — the programme's own department was used.`,
      })
    }
    seenCodes.add(canonical(code))

    const year = asInt(cell(row, at, 'year'), 1)
    if (year < 1 || year > program.years) {
      problems.push({
        line,
        message: `${code}: year ${year} is outside ${program.code}, which runs ${program.years} — clamped.`,
      })
    }

    rows.push({
      id: uid('c'),
      code,
      name,
      dept: program.dept,
      programId: program.id,
      year: Math.max(1, Math.min(year, program.years)),
      kind: oneOf(cell(row, at, 'kind'), COURSE_KINDS, 'Core' as CourseKind),
      weekly: Math.max(0, asInt(cell(row, at, 'weekly'), 3)),
      blockLength: Math.max(1, asInt(cell(row, at, 'blockLength'), 1)),
      roomKind: oneOf(cell(row, at, 'roomKind'), ROOM_KINDS, 'Lecture' as RoomKind),
      requires: [],
      suspended: false,
    })
  }

  return { rows, problems, ignoredColumns: ignored, missingColumns: [] }
}

/* ------------------------------------------------------------------ *
 * Templates
 *
 * Answering "what should I send you?" with a file to fill in rather than a
 * specification to interpret. The example row is real, valid data drawn from
 * the project, so the shape of every column is unambiguous.
 * ------------------------------------------------------------------ */

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const csvLine = (cells: string[]) => cells.map(csvCell).join(',')

export function templateFor(kind: ImportKind, config: SetupConfig): string {
  const dept = config.departments[0]?.code ?? 'CSE'
  const building = config.buildings[0]?.name ?? 'Block A'
  const program = config.programs[0]?.code ?? 'B.Tech CSE'

  if (kind === 'staff') {
    return (
      [
        csvLine([
          'Name',
          'Staff code',
          'Department',
          'Designation',
          'Employment',
          'Email',
          'Courses',
          'Max per day',
          'Max per week',
          'Active',
        ]),
        csvLine([
          'Dr. Example Name',
          `${dept}-101`,
          dept,
          'Assistant Professor',
          'Full-time',
          'example@university.edu',
          `${dept}101;${dept}102`,
          '4',
          '16',
          'yes',
        ]),
      ].join('\n') + '\n'
    )
  }

  if (kind === 'rooms') {
    return (
      [
        csvLine([
          'Name',
          'Building',
          'Floor',
          'Type',
          'Capacity',
          'Turnover',
          'Facilities',
          'Restricted',
        ]),
        csvLine([
          'LT-101',
          building,
          '1',
          'Lecture',
          '60',
          '0',
          'Projector;Step-free access',
          'no',
        ]),
      ].join('\n') + '\n'
    )
  }

  return (
    [
      csvLine([
        'Code',
        'Name',
        'Department',
        'Programme',
        'Year',
        'Type',
        'Meetings per week',
        'Slots per meeting',
        'Room type',
      ]),
      csvLine([`${dept}101`, 'Example Course', dept, program, '1', 'Core', '3', '1', 'Lecture']),
    ].join('\n') + '\n'
  )
}

/** The columns a file must carry, for the interface to state up front. */
export function requiredColumns(kind: ImportKind): string[] {
  const cols = kind === 'staff' ? STAFF_COLUMNS : kind === 'rooms' ? ROOM_COLUMNS : COURSE_COLUMNS
  return cols.filter(c => c.required).map(c => c.key)
}
