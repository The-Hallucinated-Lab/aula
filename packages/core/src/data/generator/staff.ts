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
import { loadForRank, slotsPerDay } from '../config'
import {
  shuffled,
  type Cohort,
  type Course,
  type Department,
  type Staff,
  type StaffRank,
} from '../model'
import { FALLBACK_DEPT_ID, dealByDemand } from './distribution'
import { employmentFor } from './grid'
import { FIRST, LAST } from './naming'

/**
 * The roster.
 *
 * Designations are dealt in the configured mix and departments round-robin, not
 * in blocks: pairing two grouped lists by index would hand the first department
 * every professor and staff the last one entirely with adjuncts, whose weekly
 * ceilings are half as high.
 */

export function generateStaff(
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
      demandByDept.set(
        c.deptId,
        (demandByDept.get(c.deptId) ?? 0) + c.weekly * Math.max(1, c.blockLength),
      )
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
  const seniorityOf: Record<StaffRank, number> = {
    Professor: 5,
    'Associate Professor': 4,
    'Assistant Professor': 3,
    Clinical: 3,
    Visiting: 2,
    Adjunct: 1,
    'Teaching Assistant': 0,
  }

  /* `ranks` and `deptSlots` are each exactly `total` long by construction —
     `ranks.length = total` above, `slots.length = total` at the end of
     `dealByDemand`. Zipping them once states that pairing in one place instead
     of leaving each index access to re-establish it. */
  const assignments = ranks.map((rank, index) => ({
    rank,
    deptId: deptSlots[index] ?? FALLBACK_DEPT_ID,
  }))

  for (const [i, { rank, deptId }] of assignments.entries()) {
    let name = ''
    for (let tries = 0; tries < 200; tries++) {
      const candidate = `${rank === 'Teaching Assistant' ? '' : 'Dr. '}${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`
      if (!used.has(candidate)) {
        name = candidate
        break
      }
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
      roll < 0.25
        ? [0, halfDay] // prefers mornings
        : roll < 0.4
          ? [halfDay, slotCount] // prefers afternoons
          : [0, 99] // no preference

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
    if (list) list.push(f)
    else byDept.set(f.deptId, [f])
  }

  for (const [deptId, deptStaff] of byDept) {
    const deptCourses = courses.filter(c => c.deptId === deptId)
    if (deptStaff.length === 0 || deptCourses.length === 0) continue

    // round-robin guarantees coverage, twice over so absences are survivable
    deptCourses.forEach((course, idx) => {
      const primary = deptStaff[idx % deptStaff.length]
      const backup =
        deptStaff[
          (idx + 1 + Math.floor(rng() * Math.max(1, deptStaff.length - 1))) % deptStaff.length
        ]
      if (!primary || !backup) return
      if (!primary.subjects.includes(course.id)) primary.subjects.push(course.id)
      if (backup !== primary && !backup.subjects.includes(course.id))
        backup.subjects.push(course.id)
    })

    // then broaden each person's portfolio up to the configured range
    for (const f of deptStaff) {
      const want =
        cfg.staff.qualificationsMin +
        Math.floor(
          rng() * Math.max(1, cfg.staff.qualificationsMax - cfg.staff.qualificationsMin + 1),
        )
      for (const c of shuffled(rng, deptCourses)) {
        if (f.subjects.length >= want) break
        if (!f.subjects.includes(c.id)) f.subjects.push(c.id)
      }
    }
  }

  /* --- availability constraints, applied only where coverage survives --- */
  const coverage = new Map<string, number>()
  for (const f of staff)
    for (const cid of f.subjects) coverage.set(cid, (coverage.get(cid) ?? 0) + 1)

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
    const day = days[Math.floor(rng() * days.length)]
    if (day === undefined) continue
    f.blockedDays = [day]
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
