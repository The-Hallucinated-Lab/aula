import type { Institution, Session } from './model'

export interface Metrics {
  /** share of room-slots occupied, 0..1 */
  utilization: number
  sessionCount: number
  /** contact hours placed (a 2-slot lab counts as 2) */
  contactHours: number
  hardClashes: number
  loadStdDev: number
  avgGapsPerCohort: number
  /** share of contact hours in the first half of the day */
  morningShare: number
  /** [dayIndexInWeek][slot] = rooms occupied */
  heatmap: number[][]
  deptLoad: { deptId: string; sessions: number }[]
  staffLoad: Map<string, number>
  roomUsage: { roomId: string; used: number }[]
  /** cohorts with at least one lunch-free day, as a share */
  lunchProtected: number
}

export function computeMetrics(inst: Institution, sessions: Session[]): Metrics {
  const grid = inst.grid
  const dayIndex = new Map(grid.days.map((d, i) => [d, i]))
  const totalRoomSlots = inst.rooms.length * grid.days.length * grid.slots

  const heatmap: number[][] = Array.from({ length: grid.days.length }, () => Array(grid.slots).fill(0))
  const staffLoad = new Map<string, number>()
  const roomUsed = new Map<string, number>()
  const deptSessions = new Map<string, number>()
  const courseDept = new Map(inst.courses.map(c => [c.id, c.deptId]))

  let contactHours = 0

  for (const s of sessions) {
    contactHours += s.length
    const di = dayIndex.get(s.day)
    if (di !== undefined) {
      for (let k = 0; k < s.length; k++) {
        const slot = s.slot + k
        if (slot < grid.slots) heatmap[di][slot]++
      }
    }
    staffLoad.set(s.staffId, (staffLoad.get(s.staffId) ?? 0) + s.length)
    if (s.roomId) roomUsed.set(s.roomId, (roomUsed.get(s.roomId) ?? 0) + s.length)
    const d = courseDept.get(s.courseId)
    if (d) deptSessions.set(d, (deptSessions.get(d) ?? 0) + s.length)
  }

  const loads = inst.staff.map(f => staffLoad.get(f.id) ?? 0)
  const mean = loads.reduce((a, b) => a + b, 0) / Math.max(loads.length, 1)
  const loadStdDev = Math.sqrt(
    loads.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(loads.length, 1),
  )

  // gaps: free slots strictly between a cohort's first and last class each day
  let gaps = 0
  const byCohortDay = new Map<string, Session[]>()
  for (const s of sessions) {
    const k = `${s.cohortId}:${s.day}`
    const list = byCohortDay.get(k)
    if (list) list.push(s); else byCohortDay.set(k, [s])
  }
  for (const list of byCohortDay.values()) {
    const first = Math.min(...list.map(s => s.slot))
    const last = Math.max(...list.map(s => s.slot + s.length))
    const taught = list.reduce((a, s) => a + s.length, 0)
    gaps += (last - first) - taught
  }

  // verified, not assumed: any resource booked twice in one slot is a clash
  const seen = new Set<string>()
  let hardClashes = 0
  for (const s of sessions) {
    for (let k = 0; k < s.length; k++) {
      const slot = s.slot + k
      const keys = [
        `f:${s.staffId}:${s.day}:${slot}`,
        `g:${s.cohortId}:${s.day}:${slot}`,
      ]
      if (s.roomId) keys.push(`r:${s.roomId}:${s.day}:${slot}`)
      for (const key of keys) {
        if (seen.has(key)) hardClashes++
        seen.add(key)
      }
    }
  }

  // lunch protection: cohort-days where at least one lunch slot stays free
  let protectedDays = 0
  let totalCohortDays = 0
  if (grid.lunchSlots.length > 0) {
    for (const cohort of inst.cohorts) {
      for (const day of grid.days) {
        const list = byCohortDay.get(`${cohort.id}:${day}`)
        if (!list || list.length === 0) continue
        totalCohortDays++
        const busy = new Set<number>()
        for (const s of list) for (let k = 0; k < s.length; k++) busy.add(s.slot + k)
        if (grid.lunchSlots.some(l => !busy.has(l))) protectedDays++
      }
    }
  }

  const morningCutoff = grid.slots / 2
  const morningHours = sessions
    .filter(s => s.slot < morningCutoff)
    .reduce((a, s) => a + s.length, 0)

  return {
    utilization: totalRoomSlots > 0 ? contactHours / totalRoomSlots : 0,
    sessionCount: sessions.length,
    contactHours,
    hardClashes,
    loadStdDev,
    avgGapsPerCohort: gaps / Math.max(inst.cohorts.length, 1),
    morningShare: contactHours > 0 ? morningHours / contactHours : 0,
    heatmap,
    deptLoad: inst.departments.map(d => ({ deptId: d.id, sessions: deptSessions.get(d.id) ?? 0 })),
    staffLoad,
    roomUsage: inst.rooms.map(r => ({ roomId: r.id, used: roomUsed.get(r.id) ?? 0 })),
    lunchProtected: totalCohortDays > 0 ? protectedDays / totalCohortDays : 1,
  }
}
