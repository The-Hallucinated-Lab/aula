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

import type { SetupConfig } from './config'
import { loadForRank, policyFor, slotPlan, slotsPerDay } from './config'
import type { CourseRecord, StaffRecord, RoomRecord } from './records'
import { buildAcademicCalendar, lostWeekdays } from './academicCalendar'
import {
  labelToMinutes, minutesToLabel, mulberry32, shuffled,
  type Building, type Campus, type Cohort, type Course, type Department,
  type Faculty, type School, type ShiftWindow,
  type EmploymentType, type EquipmentPool, type Staff, type StaffRank,
  type Institution, type Room, type RoomFeature, type RoomKind, type TimeGrid,
} from './model'

/* ------------------------------------------------------------------ *
 * Time grid
 * ------------------------------------------------------------------ */

export function buildGrid(cfg: SetupConfig): TimeGrid {
  const cal = cfg.calendar
  const count = Math.max(0, slotsPerDay(cal))
  /* A weekday every one of whose dates falls in a holiday is not a thin day,
     it is not a teaching day. Dropping it here rather than penalising it later
     is what makes `holidayBlackout` (C010) a real constraint instead of a
     tautology: nothing can be offered on a day the grid does not contain. */
  const lost = lostWeekdays(cal, cal.workingDays, count)

  const { starts, durations } = slotPlan(cal)
  const labels = starts.map(minutesToLabel)
  const endOf = (i: number) => starts[i] + durations[i]

  const lunchFrom = labelToMinutes(cal.lunchStart)
  const lunchTo = lunchFrom + cal.lunchMinutes
  const lunchSlots = starts
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s < lunchTo && endOf(i) > lunchFrom)
    .map(({ i }) => i)

  const eveningMins = labelToMinutes(cal.eveningStart)
  let eveningFrom = count
  for (let i = 0; i < count; i++) if (starts[i] >= eveningMins) { eveningFrom = i; break }

  const earlyMins = labelToMinutes(cal.earlyMorningUntil)
  let earlyUntil = 0
  for (let i = 0; i < count; i++) if (starts[i] < earlyMins) earlyUntil = i + 1

  const primeSlots = starts
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s >= 10 * 60 && endOf(i) <= 14 * 60)
    .map(({ i }) => i)

  /* Never return an empty week: a calendar that cancels everything is a
     configuration error `summarise()` already names, and a grid with no days
     would make every downstream screen divide by zero instead. */
  const surviving = cal.workingDays.filter(d => !lost.includes(d))
  const days = (surviving.length > 0 ? surviving : cal.workingDays).slice().sort((a, b) => a - b)

  /* Shift windows, resolved from clock times to slot indices.
     A configuration with no shifts is not "shifts off" — it is one shift that
     happens to span the whole day. Keeping exactly one code path means the
     confinement check in the solver never needs a null case. */
  const shifts: ShiftWindow[] = []
  for (const s of cal.shifts) {
    const from = labelToMinutes(s.start)
    const to = labelToMinutes(s.end)
    let fromSlot = -1
    let toSlot = -1
    for (let i = 0; i < count; i++) {
      if (starts[i] >= from && endOf(i) <= to) {
        if (fromSlot < 0) fromSlot = i
        toSlot = i
      }
    }
    if (fromSlot >= 0) shifts.push({ id: s.id, name: s.name, fromSlot, toSlot })
  }
  if (shifts.length === 0 && count > 0) {
    shifts.push({ id: 'all-day', name: 'Full day', fromSlot: 0, toSlot: count - 1 })
  }

  return {
    days,
    slots: count,
    labels,
    starts,
    durations,
    shifts,
    slotMinutes: cal.slotMinutes,
    passingMinutes: cal.passingMinutes,
    lunchSlots,
    eveningFrom,
    earlyUntil,
    primeSlots: primeSlots.length ? primeSlots : starts.map((_, i) => i).slice(1, 4),
  }
}

/* ------------------------------------------------------------------ *
 * Curriculum naming
 * ------------------------------------------------------------------ */

const SUBJECTS: Record<string, string[][]> = {
  CSE: [
    ['Programming Fundamentals', 'Discrete Mathematics', 'Digital Logic', 'Data Structures', 'Computer Organisation', 'Linear Algebra'],
    ['Algorithms', 'Operating Systems', 'Database Systems', 'Computer Networks', 'Theory of Computation', 'Software Engineering'],
    ['Machine Learning', 'Compiler Design', 'Distributed Systems', 'Information Security', 'Cloud Architecture', 'Computer Graphics'],
    ['Advanced Algorithms', 'Natural Language Processing', 'Reinforcement Learning', 'Systems Security', 'Data Mining', 'Quantum Computing'],
  ],
  ECE: [
    ['Circuit Theory', 'Semiconductor Devices', 'Signals & Systems', 'Network Analysis', 'Electromagnetics', 'Applied Mathematics'],
    ['Analog Circuits', 'Digital Communication', 'Control Systems', 'Microprocessors', 'Transmission Lines', 'Measurements'],
    ['VLSI Design', 'Embedded Systems', 'Antennas & Wave Propagation', 'Digital Signal Processing', 'Optical Communication', 'RF Design'],
    ['Advanced VLSI', 'Wireless Networks', 'Radar Systems', 'Photonics', 'MEMS', 'Satellite Systems'],
  ],
  ME: [
    ['Engineering Mechanics', 'Thermodynamics', 'Material Science', 'Engineering Drawing', 'Applied Mathematics', 'Manufacturing Basics'],
    ['Fluid Mechanics', 'Kinematics of Machinery', 'Manufacturing Processes', 'Heat Transfer', 'Strength of Materials', 'Metrology'],
    ['Machine Design', 'Automobile Engineering', 'Robotics', 'Industrial Engineering', 'Refrigeration', 'Finite Element Methods'],
    ['Advanced Manufacturing', 'Computational Fluid Dynamics', 'Tribology', 'Mechatronics', 'Turbomachinery', 'Composites'],
  ],
  CE: [
    ['Surveying', 'Building Materials', 'Engineering Geology', 'Strength of Materials', 'Applied Mathematics', 'Engineering Drawing'],
    ['Structural Analysis', 'Geotechnical Engineering', 'Hydraulics', 'Concrete Technology', 'Fluid Mechanics', 'Surveying II'],
    ['Steel Structures', 'Transportation Engineering', 'Environmental Engineering', 'Estimation & Costing', 'Foundation Design', 'Water Resources'],
    ['Earthquake Engineering', 'Bridge Design', 'Urban Planning', 'Pavement Design', 'Coastal Engineering', 'Construction Management'],
  ],
  SH: [
    ['Engineering Mathematics I', 'Engineering Physics', 'Engineering Chemistry', 'Professional English', 'Environmental Studies', 'Basic Electrical'],
    ['Engineering Mathematics III', 'Numerical Methods', 'Probability & Statistics', 'Economics for Engineers', 'Technical Communication', 'Discrete Structures'],
    ['Operations Research', 'Technical Writing', 'Ethics & Governance', 'Entrepreneurship', 'Organisational Behaviour', 'Project Management'],
    ['Advanced Statistics', 'Public Policy', 'Behavioural Economics', 'Research Methods', 'Science & Society', 'Data Ethics'],
  ],
}

const GENERIC = ['Foundations', 'Principles', 'Methods', 'Systems', 'Applications', 'Advanced Topics']

const LAB_NAMES: Record<string, string[]> = {
  CSE: ['Programming Lab', 'Systems Lab', 'AI/ML Lab', 'Security Lab'],
  ECE: ['Circuits Lab', 'Communication Lab', 'VLSI Lab', 'RF Lab'],
  ME: ['Workshop Practice', 'Thermal Lab', 'CAD/CAM Lab', 'Metrology Lab'],
  CE: ['Surveying Lab', 'Materials Testing Lab', 'Environmental Lab', 'Geotech Lab'],
  SH: ['Physics Lab', 'Chemistry Lab', 'Language Lab', 'Statistics Lab'],
}

const ELECTIVES: Record<string, string[]> = {
  CSE: ['Cloud Computing', 'Cyber Security', 'Data Visualisation', 'Edge Computing'],
  ECE: ['IoT Systems', 'Satellite Communication', 'Nano Electronics', 'Bio-signals'],
  ME: ['Renewable Energy', 'Mechatronics', 'Additive Manufacturing', 'Automotive Design'],
  CE: ['Smart Cities', 'Remote Sensing & GIS', 'Green Buildings', 'Disaster Management'],
  SH: ['Design Thinking', 'Cognitive Science', 'Public Policy', 'Science Communication'],
}

const subjectName = (dept: string, year: number, i: number): string => {
  const bank = SUBJECTS[dept]
  if (bank) {
    const row = bank[Math.min(year - 1, bank.length - 1)]
    if (row && row[i]) return row[i]
  }
  return `${dept} ${GENERIC[i % GENERIC.length]} ${year}`
}

const labName = (dept: string, year: number, i: number): string => {
  const bank = LAB_NAMES[dept]
  if (bank) return bank[(year - 1 + i) % bank.length]
  return `${dept} Laboratory ${year}.${i + 1}`
}

const electiveName = (dept: string, year: number, i: number): string => {
  const bank = ELECTIVES[dept]
  if (bank) return bank[(year - 1 + i) % bank.length]
  return `${dept} Elective ${year}.${i + 1}`
}

const FIRST = ['Ananya', 'Rohan', 'Priya', 'Arjun', 'Kavya', 'Vikram', 'Meera', 'Aditya', 'Sneha', 'Rahul',
  'Divya', 'Karthik', 'Pooja', 'Nikhil', 'Shreya', 'Sanjay', 'Lakshmi', 'Varun', 'Ishita', 'Manoj',
  'Farhan', 'Ritika', 'Devika', 'Imran', 'Tanvi', 'Gaurav', 'Neha', 'Abhinav', 'Swati', 'Rajesh']
const LAST = ['Sharma', 'Iyer', 'Reddy', 'Patel', 'Nair', 'Gupta', 'Rao', 'Menon', 'Kulkarni', 'Das',
  'Joshi', 'Bose', 'Mishra', 'Pillai', 'Chandra', 'Verma', 'Hegde', 'Saxena', 'Banerjee', 'Naidu',
  'Qureshi', 'Deshpande', 'Chatterjee', 'Bhat', 'Sethi', 'Trivedi', 'Kapoor', 'Ganguly', 'Shetty', 'Prasad']

/* ------------------------------------------------------------------ *
 * Main generator
 * ------------------------------------------------------------------ */

export function generateInstitution(cfg: SetupConfig): Institution {
  const rng = mulberry32(cfg.seed || 1)
  const grid = buildGrid(cfg)

  /* --- campuses & buildings --- */
  const campuses: Campus[] = cfg.campuses.map(c => ({
    id: c.id,
    name: c.name,
    travelMinutes: Object.fromEntries(
      cfg.campuses.filter(o => o.id !== c.id).map(o => [o.id, Math.max(c.travelMinutes, o.travelMinutes)]),
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
    id: f.id, code: f.code, name: f.name,
  }))
  const schools: School[] = cfg.schools.map(s => ({
    id: s.id, code: s.code, name: s.name, facultyId: s.faculty,
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
  const shiftFor = (p: typeof cfg.programs[number], year: number, section: string): string => {
    const explicit = shiftOverrides[`${p.id}:${year}:${section}`] ?? shiftOverrides[`${p.id}:${year}`]
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

  const lectureKind: RoomKind = kindsAvailable.has('Lecture') ? 'Lecture'
    : kindsAvailable.has('Seminar') ? 'Seminar' : [...kindsAvailable][0] ?? 'Lecture'
  const seminarKind: RoomKind = kindsAvailable.has('Seminar') ? 'Seminar' : lectureKind
  const labKind: RoomKind = kindsAvailable.has('Lab') ? 'Lab'
    : kindsAvailable.has('Computer Lab') ? 'Computer Lab' : lectureKind
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
          deptId: dept.id, programId: p.id, year,
          credits: 4, kind: 'Core', weekly: Math.max(1, policy.coreWeekly), blockLength: 1,
          roomKind: lectureKind, requires: [], after: [],
          suspended: false, eveningOnly: p.mode === 'evening',
          heavyLoad: i < 2, daylightOnly: false,
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
          deptId: dept.id, programId: p.id, year,
          credits: 2, kind: 'Lab', weekly: 1,
          blockLength: Math.max(1, Math.min(policy.labBlock, grid.slots)),
          roomKind: kind, requires: wants, after: [],
          suspended: false, eveningOnly: false, heavyLoad: false, daylightOnly: false,
        })
      }

      for (let i = 0; i < Math.max(0, policy.electiveCourses); i++) {
        courses.push({
          id: `c-${p.id}-${year}-el${i}`,
          code: `${p.dept}${year}E${i + 1}`,
          name: electiveName(p.dept, year, i),
          deptId: dept.id, programId: p.id, year,
          credits: 3, kind: 'Elective', weekly: 2, blockLength: 1,
          roomKind: seminarKind, requires: [], after: [],
          /* An elective draws a fraction of a section, not all of it. Left at
             the section size it demands a full-size room and competes with
             core lectures for the few of those there are. Clamped to the
             section size so a policy figure can never invent students. */
          enrolment: policy.electiveEnrolment > 0
            ? Math.min(policy.electiveEnrolment, Math.max(1, p.studentsPerSection))
            : undefined,
          electiveGroup: `EG-${p.dept}-${year}`,
          suspended: false, eveningOnly: p.mode === 'evening',
          heavyLoad: false, daylightOnly: false,
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
    id: e.id, name: e.name, units: Math.max(1, e.units),
  }))

  return {
    campuses, buildings, faculties, schools, departments, programs, staff, rooms,
    courses: finalCourses, cohorts, equipment, grid,
    calendar: buildAcademicCalendar(cfg.calendar, grid),
  }
}

/* ------------------------------------------------------------------ *
 * Staff
 * ------------------------------------------------------------------ */

function generateStaff(
  cfg: SetupConfig,
  rng: () => number,
  departments: Department[],
  courses: Course[],
  cohorts: Cohort[],
): Staff[] {
  const total = Math.max(1, cfg.staff.total)
  const mix = cfg.staff.mix
  const mixTotal = Object.values(mix).reduce((a, b) => a + b, 0) || 1

  // rank slots, proportional to the configured mix
  const ranks: StaffRank[] = []
  const spec: [StaffRank, number][] = [
    ['Professor', mix.professor],
    ['Associate Professor', mix.associate],
    ['Assistant Professor', mix.assistant],
    ['Adjunct', mix.adjunct],
    ['Visiting', mix.visiting],
    ['Teaching Assistant', mix.ta],
  ]
  for (const [rank, share] of spec) {
    const n = Math.round((share / mixTotal) * total)
    for (let i = 0; i < n; i++) ranks.push(rank)
  }
  while (ranks.length < total) ranks.push('Assistant Professor')
  ranks.length = total

  /* `ranks` is grouped by rank, so `deptSlots` below deals departments
     round-robin rather than in blocks. Pairing two grouped lists by index
     would hand the first department every professor and leave the last one
     staffed entirely by adjuncts and teaching assistants, whose weekly caps
     are half a professor's — giving it a fraction of the capacity its
     headcount implies. Dealing costs no randomness, so a seeded institution
     stays byte-for-byte reproducible. */

  /* Share staff across departments in proportion to the teaching they must
     actually cover, not to how many distinct courses they own. A department
     running eight sections of a year carries eight times the hours of one
     running a single section off the same course list; weighting by course
     count hands it a fraction of the staff it needs and the solver then fails
     to place hundreds of meetings for a reason no screen can explain. */
  const demandByDept = new Map<string, number>()
  for (const cohort of cohorts) {
    for (const c of courses) {
      if (c.programId !== cohort.programId || c.year !== cohort.year || c.suspended) continue
      demandByDept.set(c.deptId, (demandByDept.get(c.deptId) ?? 0) + c.weekly * Math.max(1, c.blockLength))
    }
  }
  // A department with cohorts but no demand still needs someone on the books.
  for (const c of courses) if (!demandByDept.has(c.deptId)) demandByDept.set(c.deptId, 0)

  // average weekly ceiling of this particular roster, so a department's share is
  // sized in hours it can actually teach rather than in bodies
  const capOf = (rank: StaffRank) => loadForRank(cfg.staff, rank).max
  const avgCap = ranks.reduce((a, r) => a + Math.max(1, capOf(r)), 0) / Math.max(1, ranks.length)

  const deptSlots = dealByDemand(departments, demandByDept, total, avgCap)

  const slotCount = Math.max(1, slotsPerDay(cfg.calendar))
  const halfDay = Math.max(1, Math.floor(slotCount / 2))

  const staff: Staff[] = []
  const used = new Set<string>()
  /* Rank is a designation; employment is a contract. They usually agree, and
     where they do not the record editor is the place to say so. */
  const employmentFor = (rank: StaffRank): EmploymentType =>
    rank === 'Visiting' ? 'Visiting'
      : rank === 'Adjunct' ? 'Part-time'
        : rank === 'Teaching Assistant' ? 'Contract'
          : 'Full-time'
  const seniorityOf: Record<StaffRank, number> = {
    Professor: 5, 'Associate Professor': 4, 'Assistant Professor': 3,
    Clinical: 3, Visiting: 2, Adjunct: 1, 'Teaching Assistant': 0,
  }

  for (let i = 0; i < total; i++) {
    const rank = ranks[i]
    const deptId = deptSlots[i]

    let name = ''
    for (let tries = 0; tries < 200; tries++) {
      const candidate = `${rank === 'Teaching Assistant' ? '' : 'Dr. '}${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`
      if (!used.has(candidate)) { name = candidate; break }
    }
    if (!name) name = `Staff ${i + 1}`
    used.add(name)

    const maxPerWeek = loadForRank(cfg.staff, rank).max

    /* A preference has to be one of the four the record editor offers, or
       materialising the roster would quietly round it to "no preference" and
       the schedule would shift the first time anybody opened the staff list.
       See `shiftOf` in records.ts for the other half of this contract. */
    const roll = rng()
    const [earliestSlot, latestSlot] =
      roll < 0.25 ? [0, halfDay]                    // prefers mornings
        : roll < 0.40 ? [halfDay, slotCount]        // prefers afternoons
          : [0, 99]                                 // no preference

    staff.push({
      id: `f-${i}`,
      name,
      deptId,
      rank,
      subjects: [],
      secondarySubjects: [],
      sessionKinds: [],
      maxHeadcount: 0,
      maxConsecutive: 0,
      employment: employmentFor(rank),
      maxPerDay: Math.max(1, cfg.staff.maxPerDay),
      maxPerWeek: Math.max(1, maxPerWeek),
      blockedDays: [],
      blockedSlots: [],
      campusDays: [],
      onSabbatical: false,
      earliestSlot,
      latestSlot,
      preferredDays: [],
      prefersBackToBack: rng() < 0.4,
      needsPrepGap: rng() < 0.25,
      needsAccessibleRoom: false,
      isNew: rank === 'Assistant Professor' && rng() < 0.2,
      newPreparations: rng() < 0.15 ? 2 : rng() < 0.4 ? 1 : 0,
      seniority: seniorityOf[rank] ?? 2,
    })
  }

  /* --- qualification coverage ---
     Every course must have at least one non-sabbatical instructor, otherwise
     the solver would fail on a fiction rather than on real scarcity. */
  const byDept = new Map<string, Staff[]>()
  for (const f of staff) {
    const list = byDept.get(f.deptId)
    if (list) list.push(f); else byDept.set(f.deptId, [f])
  }

  for (const [deptId, staff] of byDept) {
    const deptCourses = courses.filter(c => c.deptId === deptId)
    if (staff.length === 0 || deptCourses.length === 0) continue

    // round-robin guarantees coverage, twice over so absences are survivable
    deptCourses.forEach((course, idx) => {
      const primary = staff[idx % staff.length]
      const backup = staff[(idx + 1 + Math.floor(rng() * Math.max(1, staff.length - 1))) % staff.length]
      if (!primary.subjects.includes(course.id)) primary.subjects.push(course.id)
      if (backup !== primary && !backup.subjects.includes(course.id)) backup.subjects.push(course.id)
    })

    // then broaden each person's portfolio up to the configured range
    for (const f of staff) {
      const want = cfg.staff.qualificationsMin
        + Math.floor(rng() * Math.max(1, cfg.staff.qualificationsMax - cfg.staff.qualificationsMin + 1))
      for (const c of shuffled(rng, deptCourses)) {
        if (f.subjects.length >= want) break
        if (!f.subjects.includes(c.id)) f.subjects.push(c.id)
      }
    }
  }

  /* --- availability constraints, applied only where coverage survives --- */
  const coverage = new Map<string, number>()
  for (const f of staff) for (const cid of f.subjects) coverage.set(cid, (coverage.get(cid) ?? 0) + 1)

  const canRestrict = (f: Staff) => f.subjects.every(cid => (coverage.get(cid) ?? 0) > 1)

  const sabbaticalTarget = Math.floor((cfg.staff.sabbaticalShare / 100) * staff.length)
  const researchTarget = Math.floor((cfg.staff.researchDayShare / 100) * staff.length)
  const accessTarget = Math.floor((cfg.staff.accessibilityShare / 100) * staff.length)
  const days = [...cfg.calendar.workingDays]

  let sabbaticals = 0
  for (const f of shuffled(rng, staff)) {
    if (sabbaticals >= sabbaticalTarget) break
    if (!canRestrict(f)) continue
    f.onSabbatical = true
    for (const cid of f.subjects) coverage.set(cid, (coverage.get(cid) ?? 1) - 1)
    sabbaticals++
  }

  let research = 0
  for (const f of shuffled(rng, staff)) {
    if (research >= researchTarget) break
    if (f.onSabbatical || days.length < 3) continue
    f.blockedDays = [days[Math.floor(rng() * days.length)]]
    research++
  }

  let access = 0
  for (const f of shuffled(rng, staff)) {
    if (access >= accessTarget) break
    if (f.onSabbatical) continue
    f.needsAccessibleRoom = true
    access++
  }

  // visiting staff are only on campus part of the week
  for (const f of staff) {
    if (f.rank !== 'Visiting' || days.length < 3) continue
    f.campusDays = shuffled(rng, days).slice(0, Math.max(2, Math.floor(days.length / 2)))
  }

  return staff
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Decide which department each of the `total` staff places belongs to, in
 * proportion to `weight` (the teaching each department must actually cover).
 *
 * Largest-remainder keeps the parts summing to the whole, and the places are
 * then dealt round-robin rather than in per-department blocks, so that a
 * rank-ordered caller list spreads every rank evenly across departments.
 * Deterministic and free of randomness.
 */
function dealByDemand(
  departments: Department[],
  weight: Map<string, number>,
  total: number,
  avgCap: number,
): string[] {
  if (departments.length === 0 || total <= 0) {
    return Array.from({ length: Math.max(0, total) }, () => 'dept-GEN')
  }

  const teaching = departments.filter(d => (weight.get(d.id) ?? 0) > 0)
  const pool = teaching.length > 0 ? teaching : departments
  /* Cover each department's hours first, rounding UP: proportional shares get
     floored, and a department one body short of its own teaching cannot cover
     it however comfortable the institution looks in aggregate. */
  const counts = new Map(pool.map(d => [
    d.id,
    Math.max(1, Math.ceil((weight.get(d.id) ?? 0) / Math.max(1, avgCap))),
  ]))
  let assigned = [...counts.values()].reduce((a, b) => a + b, 0)

  // Genuinely short-staffed: scale everyone back proportionally and let
  // summarise() tell the user, rather than starving whoever sorts last.
  while (assigned > total) {
    const biggest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (!biggest || biggest[1] <= 1) break
    counts.set(biggest[0], biggest[1] - 1)
    assigned--
  }
  /* Spare staff are shared out in proportion to teaching, not one each in turn:
     round-robin flattens the roster and leaves the heaviest department with
     less than its share while the lightest sits on people it cannot use. */
  const surplus = total - assigned
  if (surplus > 0) {
    const sum = pool.reduce((a, d) => a + (weight.get(d.id) ?? 0), 0) || pool.length
    const shares = pool.map(d => ({
      id: d.id,
      want: ((weight.get(d.id) ?? 1) / sum) * surplus,
    }))
    for (const sh of shares) {
      const whole = Math.floor(sh.want)
      counts.set(sh.id, (counts.get(sh.id) ?? 0) + whole)
      assigned += whole
    }
    const byRemainder = shares
      .map(sh => ({ id: sh.id, rem: sh.want - Math.floor(sh.want) }))
      .sort((a, b) => b.rem - a.rem)
    for (let k = 0; assigned < total && byRemainder.length > 0; k++) {
      const id = byRemainder[k % byRemainder.length].id
      counts.set(id, (counts.get(id) ?? 0) + 1)
      assigned++
    }
  }

  const order = pool.map(d => d.id).filter(id => (counts.get(id) ?? 0) > 0)
  const slots: string[] = []
  let cursor = 0
  while (slots.length < total && order.length > 0) {
    let looked = 0
    while ((counts.get(order[cursor % order.length]) ?? 0) === 0 && looked <= order.length) {
      cursor++
      looked++
    }
    if (looked > order.length) break
    const id = order[cursor % order.length]
    counts.set(id, (counts.get(id) ?? 0) - 1)
    slots.push(id)
    cursor++
  }
  while (slots.length < total) slots.push(pool[0]?.id ?? 'dept-GEN')
  slots.length = total
  return slots
}

const FEATURE_SET = new Set<string>([
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
])

const isFeature = (s: string): s is RoomFeature => FEATURE_SET.has(s)

function abbreviate(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (name.slice(0, 2) || 'BL').toUpperCase()
}

/**
 * One unique room-name prefix per building. Two buildings can easily
 * abbreviate to the same pair of letters ("Lab Complex", "Lecture Centre"),
 * which would put identical room names on opposite sides of the campus.
 */
function buildingPrefixes(buildings: Building[]): Map<string, string> {
  const used = new Set<string>()
  const out = new Map<string, string>()
  for (const b of buildings) {
    const base = abbreviate(b.name)
    let prefix = base
    let n = 2
    while (used.has(prefix)) prefix = `${base}${n++}`
    used.add(prefix)
    out.set(b.id, prefix)
  }
  return out
}


/* ------------------------------------------------------------------ *
 * Record-driven construction
 *
 * Once an entity type has been edited, its records are authoritative and the
 * generator stops inventing that type. Anything a record does not carry (exam
 * capacity, seniority) is derived here, so the rest of the engine always sees a
 * complete `Institution` whichever path produced it.
 * ------------------------------------------------------------------ */

function roomsFromGroups(cfg: SetupConfig, buildings: Building[]): Room[] {
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
        features: floor === 1 && !features.includes('groundFloor')
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

function roomsFromRecords(records: RoomRecord[], cfg: SetupConfig): Room[] {
  const grid = buildGrid(cfg)
  return records.map(r => {
    // A closed day expands to every slot of that day, so one tick in the
    // availability grid reaches the same rule that handles individual slots.
    const blocked = new Set(r.blockedSlots)
    for (const day of r.closedDays) {
      for (let slot = 0; slot < grid.slots; slot++) blocked.add(`${day}:${slot}`)
    }
    const features = (r.floor <= 1 && !r.features.includes('groundFloor')
      ? [...r.features, 'groundFloor']
      : r.features).filter(isFeature)

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

function coursesFromRecords(
  records: CourseRecord[], departments: Department[], fallbackKind: RoomKind,
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
    electiveGroup: c.kind === 'Elective' ? `EG-${c.dept}-${c.year}` : undefined,
  }))
}

function staffFromRecords(
  records: StaffRecord[], departments: Department[], courses: Course[], grid: TimeGrid,
): Staff[] {
  const byCode = new Map(departments.map(d => [d.code, d]))
  const courseById = new Map(courses.map(c => [c.id, c]))
  const seniorityOf: Record<StaffRank, number> = {
    'Professor': 5, 'Associate Professor': 4, 'Assistant Professor': 3,
    'Clinical': 3, 'Visiting': 2, 'Adjunct': 1, 'Teaching Assistant': 0,
  }

  /* A shift preference is stored as one choice and read by the rules as an
     earliest/latest slot pair. Translating here rather than in each rule keeps
     `preferDayPart`, `facultyTimeWindow` and `avoidEarlySlot` reading the same
     two numbers whichever path built the roster. */
  const half = Math.max(1, Math.floor(grid.slots / 2))
  const windowFor = (shift: StaffRecord['preferredShift']): [number, number] => {
    switch (shift) {
      case 'morning': return [0, half]
      case 'afternoon': return [half, grid.slots]
      case 'evening': return [grid.eveningFrom, grid.slots]
      default: return [0, 99]
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
  const eligible = (f: StaffRecord, ids: string[]): string[] => ids.filter(id => {
    const course = courseById.get(id)
    if (!course) return false                                   // course was deleted
    if (f.programIds.length > 0 && !f.programIds.includes(course.programId)) return false
    if (f.sessionKinds.length > 0 && !f.sessionKinds.includes(course.kind)) return false
    return true
  })

  /* People who have left the institution stay on the roster so past timetables
     still resolve their name, but they are not schedulable. Filtering here
     keeps them out of the solver entirely rather than relying on every rule to
     remember to check. */
  return records.filter(f => f.active !== false).map(f => {
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
      preferredRoomKind: f.preferredRoomKind,
      homeBuildingId: f.homeBuildingId,
      isNew: false,
      newPreparations: 0,
      seniority: seniorityOf[f.rank] ?? 2,
    }
  })
}
