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
import { policyFor } from '../config'
import { buildAcademicCalendar } from '../academicCalendar'
import {
  mulberry32,
  type Building,
  type Campus,
  type Cohort,
  type Course,
  type Department,
  type Faculty,
  type School,
  type EquipmentPool,
  type Institution,
  type Room,
  type RoomFeature,
  type RoomKind,
} from '../model'
import {
  coursesFromRecords,
  roomsFromGroups,
  roomsFromRecords,
  staffFromRecords,
} from './from-records'
import { buildGrid } from './grid'
import { electiveName, labName, subjectName } from './naming'
import { generateStaff } from './staff'

/**
 * The main generator.
 *
 * Turns a `SetupConfig` into a schedulable `Institution`. The rule that governs
 * it: never emit a structurally impossible demand. If no configured room has a
 * fume hood, no course may require one — scarcity has to be real, or the
 * explanation the app gives the user is a lie.
 */

export function generateInstitution(cfg: SetupConfig): Institution {
  const rng = mulberry32(cfg.seed || 1)
  const grid = buildGrid(cfg)

  /* --- campuses & buildings --- */
  const campuses: Campus[] = cfg.campuses.map(c => ({
    id: c.id,
    name: c.name,
    travelMinutes: Object.fromEntries(
      cfg.campuses
        .filter(o => o.id !== c.id)
        .map(o => [o.id, Math.max(c.travelMinutes, o.travelMinutes)]),
    ),
  }))

  const buildings: Building[] = cfg.buildings.map(b => ({
    id: b.id,
    name: b.name,
    campusId: campuses.some(c => c.id === b.campus) ? b.campus : (campuses[0]?.id ?? 'main'),
    walkMinutes: b.walkMinutes,
    maintenance: [],
    hasElevator: b.hasElevator,
    accessible: b.accessible,
    noisy: false,
  }))

  /* --- rooms --- */
  const rooms: Room[] = cfg.overrides?.rooms
    ? roomsFromRecords(cfg.overrides.rooms, cfg)
    : roomsFromGroups(cfg, buildings)
  const availableFeatures = new Set<RoomFeature>(rooms.flatMap(r => r.features))
  const kindsAvailable = new Set<RoomKind>(rooms.map(r => r.kind))

  /* Room kinds that have at least one room an access-needs cohort can use.
     A cohort is only flagged as needing accessible rooms when every kind it
     will be taught in is covered — otherwise the demand is unsatisfiable by
     construction, which is a configuration problem, not a solver problem. */
  const accessibleKinds = new Set<RoomKind>(
    rooms
      .filter(r => {
        if (r.restricted) return false
        const b = buildings.find(x => x.id === r.buildingId)
        if (b?.accessible === false) return false
        /* Mirrors what C147 and C384 actually check. A `wheelchairAccess` flag
           on a second-floor room in a block with no lift is a promise the rules
           will not honour, and believing it here is how a cohort gets flagged
           for a need the estate cannot meet — which the solver can only report
           as an unplaceable lab with no explanation anyone can act on. */
        const stepFree = r.floor <= 1 || !!b?.hasElevator
        if (!stepFree) return false
        return r.features.includes('wheelchairAccess') || r.features.includes('brailleSignage')
      })
      .map(r => r.kind),
  )

  /* --- faculties, schools, departments --- */
  const faculties: Faculty[] = cfg.faculties.map(f => ({
    id: f.id,
    code: f.code,
    name: f.name,
  }))
  const schools: School[] = cfg.schools.map(s => ({
    id: s.id,
    code: s.code,
    name: s.name,
    facultyId: s.faculty,
  }))
  const departments: Department[] = cfg.departments.map((d, i) => ({
    id: `dept-${d.code}`,
    code: d.code,
    name: d.name,
    colorIndex: i,
    schoolId: d.school,
    homeBuildingIds: [],
  }))
  const deptByCode = new Map(departments.map(d => [d.code, d]))

  /* --- programmes, courses, cohorts --- */
  const courses: Course[] = []
  const cohorts: Cohort[] = []
  const sectionOverrides = cfg.overrides?.sections ?? {}

  /* Which shift a section is taught in. An explicit per-section override wins;
     failing that a per-year one; failing that an evening-mode programme goes to
     the last shift and everything else to the first. With one configured shift
     every branch lands in the same place, which is why single-shift
     institutions never have to think about this. */
  const shiftOverrides = cfg.overrides?.shifts ?? {}
  const shiftIds = new Set(grid.shifts.map(s => s.id))
  const firstShift = grid.shifts[0]?.id ?? 'all-day'
  const lastShift = grid.shifts[grid.shifts.length - 1]?.id ?? firstShift
  const shiftFor = (p: (typeof cfg.programs)[number], year: number, section: string): string => {
    const explicit =
      shiftOverrides[`${p.id}:${year}:${section}`] ?? shiftOverrides[`${p.id}:${year}`]
    if (explicit && shiftIds.has(explicit)) return explicit
    return p.mode === 'evening' ? lastShift : firstShift
  }
  const programs = cfg.programs.map(p => {
    const dept = deptByCode.get(p.dept) ?? departments[0]
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      deptId: dept?.id ?? 'dept-GEN',
      years: p.years,
      sectionsPerYear: p.sectionsPerYear,
      mode: p.mode,
    }
  })

  const lectureKind: RoomKind = kindsAvailable.has('Lecture')
    ? 'Lecture'
    : kindsAvailable.has('Seminar')
      ? 'Seminar'
      : ([...kindsAvailable][0] ?? 'Lecture')
  const seminarKind: RoomKind = kindsAvailable.has('Seminar') ? 'Seminar' : lectureKind
  const labKind: RoomKind = kindsAvailable.has('Lab')
    ? 'Lab'
    : kindsAvailable.has('Computer Lab')
      ? 'Computer Lab'
      : lectureKind
  const computerKind: RoomKind = kindsAvailable.has('Computer Lab') ? 'Computer Lab' : labKind

  for (const p of cfg.programs) {
    const dept = deptByCode.get(p.dept) ?? departments[0]
    if (!dept) continue

    for (let year = 1; year <= Math.max(1, p.years); year++) {
      // Curriculum policy comes from the batch profile in force for this year,
      // falling back to the programme's own figures.
      const policy = policyFor(cfg, p, year)

      for (let i = 0; i < Math.max(0, policy.coreCourses); i++) {
        courses.push({
          id: `c-${p.id}-${year}-core${i}`,
          code: `${p.dept}${year}${String(i + 1).padStart(2, '0')}`,
          name: subjectName(p.dept, year, i),
          deptId: dept.id,
          programId: p.id,
          year,
          credits: 4,
          kind: 'Core',
          weekly: Math.max(1, policy.coreWeekly),
          blockLength: 1,
          roomKind: lectureKind,
          requires: [],
          after: [],
          suspended: false,
          eveningOnly: p.mode === 'evening',
          heavyLoad: i < 2,
          daylightOnly: false,
        })
      }

      for (let i = 0; i < Math.max(0, policy.labCourses); i++) {
        const isComputing = p.dept === 'CSE'
        const kind = isComputing ? computerKind : labKind
        const wants: RoomFeature[] = []
        if (isComputing && availableFeatures.has('computers')) wants.push('computers')
        else if (availableFeatures.has('ventilation') && kind === 'Lab') wants.push('ventilation')

        courses.push({
          id: `c-${p.id}-${year}-lab${i}`,
          code: `${p.dept}${year}L${i + 1}`,
          name: labName(p.dept, year, i),
          deptId: dept.id,
          programId: p.id,
          year,
          credits: 2,
          kind: 'Lab',
          weekly: 1,
          blockLength: Math.max(1, Math.min(policy.labBlock, grid.slots)),
          roomKind: kind,
          requires: wants,
          after: [],
          suspended: false,
          eveningOnly: false,
          heavyLoad: false,
          daylightOnly: false,
        })
      }

      for (let i = 0; i < Math.max(0, policy.electiveCourses); i++) {
        /* An elective draws a fraction of a section, not all of it. Left at
           the section size it demands a full-size room and competes with core
           lectures for the few of those there are. Clamped to the section size
           so a policy figure can never invent students.

           Omitted rather than set to `undefined` when the policy does not give
           a figure: `enrolment` is optional, and an absent key and a present
           undefined one are different things to `in` and to JSON. */
        const enrolment =
          policy.electiveEnrolment > 0
            ? Math.min(policy.electiveEnrolment, Math.max(1, p.studentsPerSection))
            : undefined
        courses.push({
          id: `c-${p.id}-${year}-el${i}`,
          code: `${p.dept}${year}E${i + 1}`,
          name: electiveName(p.dept, year, i),
          deptId: dept.id,
          programId: p.id,
          year,
          credits: 3,
          kind: 'Elective',
          weekly: 2,
          blockLength: 1,
          roomKind: seminarKind,
          requires: [],
          after: [],
          ...(enrolment === undefined ? {} : { enrolment }),
          electiveGroup: `EG-${p.dept}-${year}`,
          suspended: false,
          eveningOnly: p.mode === 'evening',
          heavyLoad: false,
          daylightOnly: false,
        })
      }

      const teachingKinds: RoomKind[] = [lectureKind]
      if (policy.labCourses > 0) teachingKinds.push(p.dept === 'CSE' ? computerKind : labKind)
      if (policy.electiveCourses > 0) teachingKinds.push(seminarKind)
      const accessServable = teachingKinds.every(k => accessibleKinds.has(k))

      const sectionCount = Math.max(0, sectionOverrides[`${p.id}:${year}`] ?? p.sectionsPerYear)
      for (let s = 0; s < sectionCount; s++) {
        const section = String.fromCharCode(65 + s)
        cohorts.push({
          id: `g-${p.id}-${year}${section}`,
          name: `${p.dept} ${year}${section}`,
          shiftId: shiftFor(p, year, section),
          deptId: dept.id,
          programId: p.id,
          year,
          size: Math.max(1, p.studentsPerSection),
          mode: p.mode,
          needsAccessibleRooms: accessServable && s === 0 && year === 1,
          protectedSlots: [],
        })
      }
    }
  }

  /* --- courses and staff may have been edited directly --- */
  const finalCourses: Course[] = cfg.overrides?.courses
    ? coursesFromRecords(cfg.overrides.courses, departments, lectureKind)
    : courses

  const staff = cfg.overrides?.staff
    ? staffFromRecords(cfg.overrides.staff, departments, finalCourses, grid)
    : generateStaff(cfg, rng, departments, finalCourses, cohorts)

  /* --- equipment --- */
  const equipment: EquipmentPool[] = cfg.equipment.map(e => ({
    id: e.id,
    name: e.name,
    units: Math.max(1, e.units),
  }))

  return {
    campuses,
    buildings,
    faculties,
    schools,
    departments,
    programs,
    staff,
    rooms,
    courses: finalCourses,
    cohorts,
    equipment,
    grid,
    calendar: buildAcademicCalendar(cfg.calendar, grid),
  }
}
