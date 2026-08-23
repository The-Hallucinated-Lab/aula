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
import { ROOM_KINDS, type RoomKind } from '../model'
import { FEATURE_PRESETS, type RoomRecord } from '../records'
import {
  asFlag,
  asInt,
  asList,
  canonical,
  cell,
  indexColumns,
  oneOf,
  parseCsv,
  readInt,
  uid,
  type Column,
  type ImportResult,
  type RowProblem,
} from './kit'

/**
 * Importing a room list.
 */

export const ROOM_COLUMNS: Column[] = [
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

  const [header = [], ...body] = table
  const { at, missing, ignored } = indexColumns(header, ROOM_COLUMNS)
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

  for (const [index, row] of body.entries()) {
    const line = index + 2
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
