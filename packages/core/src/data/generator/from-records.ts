/**
 * Generator — turns a `SetupConfig` into a schedulable `Institution`.
 *
 * Two rules govern this file:
 *  1. Deterministic. The same config and seed always produce the same
 *     institution, so a saved project reopens identically.
 *  2. Never emit a structurally impossible demand. If the configured rooms
 *     have no fume hood, no course is given a fume-hood requirement — the
 *     solver should fail on real scarcity, never on generator fiction.
 */

import type { SetupConfig } from '../config'
import type { CourseRecord, StaffRecord, RoomRecord } from '../records'
import {
  type Building,
  type Course,
  type Department,
  type Staff,
  type StaffRank,
  type Room,
  type RoomKind,
  type TimeGrid,
} from '../model'
import { buildingPrefixes, isFeature } from './distribution'
import { buildGrid } from './grid'

/**
 * Building from explicit records.
 *
 * Once an entity type has been edited or imported, its records are
 * authoritative and the generator stops inventing that type (D-22). These
 * mappers are the other half of that contract.
 */

/* ------------------------------------------------------------------ *
 * Record-driven construction
 *
 * Once an entity type has been edited, its records are authoritative and the
 * generator stops inventing that type. Anything a record does not carry (exam
 * capacity, seniority) is derived here, so the rest of the engine always sees a
 * complete `Institution` whichever path produced it.
 * ------------------------------------------------------------------ */

export function roomsFromGroups(cfg: SetupConfig, buildings: Building[]): Room[] {
  const rooms: Room[] = []
  let roomIndex = 0
  /* Door numbers run per building and floor, across every group in that
     building. Numbering per group instead produced two rooms called LC101 —
     one lab, one computer lab — which then collided in the room picker, the
     CSV export and every printed timetable. */
  const doorNumber = new Map<string, number>()
  const prefix = buildingPrefixes(buildings)

  for (const group of cfg.roomGroups) {
    const building = buildings.find(b => b.id === group.buildingId)
    if (!building) continue
    const cfgBuilding = cfg.buildings.find(b => b.id === group.buildingId)
    const floorCount = Math.max(1, cfgBuilding?.floors ?? 1)
    const features = group.features.filter(isFeature)
    const count = Math.max(0, group.count)
    /* A group now names the storey it sits on, because a real block is not a
       uniform stack: lecture halls on the ground, tutorial rooms above, labs
       wherever the services run. The clamp matters — a building can be shrunk
       to two storeys after its rooms were laid out on four. */
    const floor = Math.min(floorCount, Math.max(1, group.floor || 1))

    for (let i = 0; i < count; i++) {
      const key = `${building.id}:${floor}`
      const door = (doorNumber.get(key) ?? 0) + 1
      doorNumber.set(key, door)
      rooms.push({
        id: `r-${roomIndex++}`,
        name: `${prefix.get(building.id) ?? 'BL'}${floor}${String(door).padStart(2, '0')}`,
        buildingId: building.id,
        floor,
        kind: group.kind,
        capacity: Math.max(1, group.capacity),
        examCapacity: Math.max(1, Math.floor(group.capacity / 2)),
        features:
          floor === 1 && !features.includes('groundFloor')
            ? [...features, 'groundFloor']
            : features,
        turnoverMinutes: Math.max(0, group.turnoverMinutes),
        blocked: [],
        restricted: false,
      })
    }
  }
  return rooms
}

export function roomsFromRecords(records: RoomRecord[], cfg: SetupConfig): Room[] {
  const grid = buildGrid(cfg)
  return records.map(r => {
    // A closed day expands to every slot of that day, so one tick in the
    // availability grid reaches the same rule that handles individual slots.
    const blocked = new Set(r.blockedSlots)
    for (const day of r.closedDays) {
      for (let slot = 0; slot < grid.slots; slot++) blocked.add(`${day}:${slot}`)
    }
    const features = (
      r.floor <= 1 && !r.features.includes('groundFloor')
        ? [...r.features, 'groundFloor']
        : r.features
    ).filter(isFeature)

    return {
      id: r.id,
      name: r.name,
      buildingId: r.buildingId,
      floor: Math.max(0, r.floor),
      kind: r.kind,
      capacity: Math.max(1, r.capacity),
      examCapacity: Math.max(1, Math.floor(r.capacity / 2)),
      features,
      turnoverMinutes: Math.max(0, r.turnoverMinutes),
      blocked: [...blocked],
      restricted: r.restricted,
    }
  })
}

export function coursesFromRecords(
  records: CourseRecord[],
  departments: Department[],
  fallbackKind: RoomKind,
): Course[] {
  const byCode = new Map(departments.map(d => [d.code, d]))
  return records.map(c => ({
    id: c.id,
    code: c.code,
    name: c.name,
    deptId: byCode.get(c.dept)?.id ?? departments[0]?.id ?? 'dept-GEN',
    programId: c.programId,
    year: Math.max(1, c.year),
    credits: c.kind === 'Lab' ? 2 : c.kind === 'Elective' ? 3 : 4,
    kind: c.kind,
    weekly: Math.max(0, c.weekly),
    blockLength: Math.max(1, c.blockLength),
    roomKind: c.roomKind ?? fallbackKind,
    requires: c.requires.filter(isFeature),
    after: [],
    suspended: c.suspended,
    eveningOnly: false,
    heavyLoad: false,
    daylightOnly: false,
    // Spread in rather than assigned undefined: `electiveGroup` is optional and
    // a non-elective must not carry the key at all.
    ...(c.kind === 'Elective' ? { electiveGroup: `EG-${c.dept}-${c.year}` } : {}),
  }))
}

export function staffFromRecords(
  records: StaffRecord[],
  departments: Department[],
  courses: Course[],
  grid: TimeGrid,
): Staff[] {
  const byCode = new Map(departments.map(d => [d.code, d]))
  const courseById = new Map(courses.map(c => [c.id, c]))
  const seniorityOf: Record<StaffRank, number> = {
    Professor: 5,
    'Associate Professor': 4,
    'Assistant Professor': 3,
    Clinical: 3,
    Visiting: 2,
    Adjunct: 1,
    'Teaching Assistant': 0,
  }

  /* A shift preference is stored as one choice and read by the rules as an
     earliest/latest slot pair. Translating here rather than in each rule keeps
     `preferDayPart`, `facultyTimeWindow` and `avoidEarlySlot` reading the same
     two numbers whichever path built the roster. */
  const half = Math.max(1, Math.floor(grid.slots / 2))
  const windowFor = (shift: StaffRecord['preferredShift']): [number, number] => {
    switch (shift) {
      case 'morning':
        return [0, half]
      case 'afternoon':
        return [half, grid.slots]
      case 'evening':
        return [grid.eveningFrom, grid.slots]
      default:
        return [0, 99]
    }
  }

  /**
   * What this person may actually be given.
   *
   * An expertise list is a claim; eligibility is the intersection of that claim
   * with the programmes and session kinds they are authorised for. Filtering
   * here rather than inside a rule is deliberate — it shrinks the candidate
   * space before the search starts, which is the difference between the solver
   * exploring dead branches and never seeing them.
   */
  const eligible = (f: StaffRecord, ids: string[]): string[] =>
    ids.filter(id => {
      const course = courseById.get(id)
      if (!course) return false // course was deleted
      if (f.programIds.length > 0 && !f.programIds.includes(course.programId)) return false
      if (f.sessionKinds.length > 0 && !f.sessionKinds.includes(course.kind)) return false
      return true
    })

  /* People who have left the institution stay on the roster so past timetables
     still resolve their name, but they are not schedulable. Filtering here
     keeps them out of the solver entirely rather than relying on every rule to
     remember to check. */
  return records
    .filter(f => f.active !== false)
    .map(f => {
      const [earliestSlot, latestSlot] = windowFor(f.preferredShift)
      const primary = eligible(f, f.courseIds)
      const secondary = eligible(f, f.secondaryCourseIds).filter(id => !primary.includes(id))

      return {
        id: f.id,
        name: f.name,
        deptId: byCode.get(f.dept)?.id ?? departments[0]?.id ?? 'dept-GEN',
        rank: f.rank,
        subjects: [...primary, ...secondary],
        secondarySubjects: secondary,
        sessionKinds: [...f.sessionKinds],
        maxHeadcount: Math.max(0, f.maxAudience),
        maxPerDay: Math.max(1, f.maxPerDay),
        maxPerWeek: Math.max(1, f.maxPerWeek),
        maxConsecutive: Math.max(0, f.maxConsecutive),
        blockedDays: [...f.unavailableDays],
        blockedSlots: [...f.blockedSlots],
        campusDays: [...f.availableDays],
        employment: f.employment,
        onSabbatical: f.onSabbatical,
        earliestSlot,
        latestSlot,
        preferredDays: [],
        prefersBackToBack: false,
        needsPrepGap: false,
        needsAccessibleRoom: f.needsAccessibleRoom,
        ...(f.preferredRoomKind === undefined ? {} : { preferredRoomKind: f.preferredRoomKind }),
        ...(f.homeBuildingId === undefined ? {} : { homeBuildingId: f.homeBuildingId }),
        isNew: false,
        newPreparations: 0,
        seniority: seniorityOf[f.rank] ?? 2,
      }
    })
}
