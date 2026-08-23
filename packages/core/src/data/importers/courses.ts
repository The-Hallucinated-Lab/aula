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

import type { SetupConfig } from '../config'
import { COURSE_KINDS, ROOM_KINDS, type CourseKind, type RoomKind } from '../model'
import { type CourseRecord } from '../records'
import {
  asInt,
  canonical,
  cell,
  indexColumns,
  oneOf,
  parseCsv,
  uid,
  type Column,
  type ImportResult,
  type RowProblem,
} from './kit'

/**
 * Importing a course catalogue.
 */

export const COURSE_COLUMNS: Column[] = [
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

  const [header = [], ...body] = table
  const { at, missing, ignored } = indexColumns(header, COURSE_COLUMNS)
  if (missing.length > 0) {
    return { rows, problems, ignoredColumns: ignored, missingColumns: missing }
  }

  const deptCodes = new Set(config.departments.map(d => d.code.toUpperCase()))
  const programByCode = new Map(
    config.programs.flatMap(p => [[canonical(p.code), p] as const, [canonical(p.id), p] as const]),
  )
  const seenCodes = new Set<string>()

  for (const [index, row] of body.entries()) {
    const line = index + 2
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
