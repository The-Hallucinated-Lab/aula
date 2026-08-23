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
import { EMPLOYMENT_TYPES, STAFF_RANKS, type EmploymentType, type StaffRank } from '../model'
import { type StaffRecord } from '../records'
import {
  asFlag,
  readInt,
  asList,
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
 * Importing a staff roster.
 */

export const STAFF_COLUMNS: Column[] = [
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

  const [header = [], ...body] = table
  const { at, missing, ignored } = indexColumns(header, STAFF_COLUMNS)
  if (missing.length > 0) {
    return { rows, problems, ignoredColumns: ignored, missingColumns: missing }
  }

  const deptCodes = new Set(config.departments.map(d => d.code.toUpperCase()))
  // Course codes are what a human writes; ids are what the model uses.
  const courseIdByCode = new Map(
    (config.overrides?.courses ?? []).map(c => [canonical(c.code), c.id]),
  )
  const seenCodes = new Set<string>()

  for (const [index, row] of body.entries()) {
    const line = index + 2
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

    /* `readInt`, not `asInt`. The two differ on exactly the case that matters:
       `asInt` cannot tell "blank, so use the default" from "somebody typed
       *sixty*", and silently returns the default for both. A weekly cap that
       quietly becomes 18 because of a typo is the kind of successful-looking
       import this module exists to prevent — the rooms importer already read
       its numbers this way; the roster did not. */
    const rawWeek = cell(row, at, 'maxPerWeek')
    const weekly = readInt(rawWeek, 18)
    if (weekly.bad || weekly.value <= 0) {
      problems.push({
        line,
        message: `${name}: weekly cap "${rawWeek}" is not a usable number — assumed 18.`,
      })
    }
    const maxPerWeek = weekly.bad || weekly.value <= 0 ? 18 : weekly.value

    const rawDay = cell(row, at, 'maxPerDay')
    const daily = readInt(rawDay, 5)
    if (daily.bad || daily.value <= 0) {
      problems.push({
        line,
        message: `${name}: daily cap "${rawDay}" is not a usable number — assumed 5.`,
      })
    }
    const maxPerDay = daily.bad || daily.value <= 0 ? 5 : daily.value

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
      // `preferredRoomKind` and `homeBuildingId` are omitted rather than set to
      // `undefined`: a CSV never carries them, and an absent key and a present
      // undefined one are not the same thing to `in`, `Object.keys` or JSON.
      onSabbatical: false,
      needsAccessibleRoom: false,
      active: asFlag(cell(row, at, 'active'), true),
    })
  }

  return { rows, problems, ignoredColumns: ignored, missingColumns: [] }
}
