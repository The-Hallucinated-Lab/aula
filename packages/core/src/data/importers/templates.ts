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
import { type ImportKind } from './kit'
import { COURSE_COLUMNS } from './courses'
import { ROOM_COLUMNS } from './rooms'
import { STAFF_COLUMNS } from './staff'

/**
 * Blank CSVs with the right headers.
 *
 * Offered as a download because the fastest way to explain an expected format
 * is to hand someone a file that already has it.
 */

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
