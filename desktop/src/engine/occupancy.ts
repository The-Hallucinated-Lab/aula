/**
 * Occupancy index.
 *
 * Every rule needs to answer questions like "is this room free at Tue 11:00?"
 * or "how many hours has this instructor already got on Wednesday?" in
 * constant time. Recomputing that per candidate placement is what makes naive
 * schedulers quadratic, so all of it is maintained incrementally here.
 */

import type { Institution, Session } from '../data/model'

export class Occupancy {
  readonly sessions: Session[] = []

  /** `${facultyId}:${day}:${slot}` */
  private facultySlot = new Set<string>()
  /** `${roomId}:${day}:${slot}` */
  private roomSlot = new Set<string>()
  /** `${cohortId}:${day}:${slot}` */
  private cohortSlot = new Set<string>()
  /** `${equipmentId}:${day}:${slot}` -> units in use */
  private equipSlot = new Map<string, number>()

  /** `${facultyId}:${day}` -> sessions that day, slot-ascending */
  private facultyDay = new Map<string, Session[]>()
  private cohortDay = new Map<string, Session[]>()
  private roomDay = new Map<string, Session[]>()

  private facultyWeek = new Map<string, number>()
  private facultyDayCount = new Map<string, number>()
  private facultyRooms = new Map<string, Set<string>>()
  private facultyBuildings = new Map<string, Set<string>>()
  private facultyDays = new Map<string, Set<number>>()
  private facultyLabHours = new Map<string, number>()

  /** `${cohortId}:${courseId}` -> days that course already meets */
  private cohortCourseDays = new Map<string, Set<number>>()
  /** `${courseId}` -> days any section of the course meets */
  private courseDays = new Map<string, Set<number>>()
  /** `${cohortId}` -> count of sessions at/after the evening threshold */
  private cohortLate = new Map<string, number>()
  /** `${cohortId}` -> days whose first class is an early slot */
  private cohortEarlyDays = new Map<string, Set<number>>()

  private roomUse = new Map<string, number>()

  private readonly inst: Institution

  constructor(inst: Institution) {
    this.inst = inst
  }

  /* ---------------- mutation ---------------- */

  add(s: Session) {
    this.sessions.push(s)
    const course = this.inst.courses.find(c => c.id === s.courseId)
    const room = this.inst.rooms.find(r => r.id === s.roomId)

    for (let k = 0; k < s.length; k++) {
      const slot = s.slot + k
      this.facultySlot.add(`${s.facultyId}:${s.day}:${slot}`)
      this.roomSlot.add(`${s.roomId}:${s.day}:${slot}`)
      this.cohortSlot.add(`${s.cohortId}:${s.day}:${slot}`)
      if (course?.equipmentId) {
        const key = `${course.equipmentId}:${s.day}:${slot}`
        this.equipSlot.set(key, (this.equipSlot.get(key) ?? 0) + 1)
      }
    }

    push(this.facultyDay, `${s.facultyId}:${s.day}`, s)
    push(this.cohortDay, `${s.cohortId}:${s.day}`, s)
    push(this.roomDay, `${s.roomId}:${s.day}`, s)

    bump(this.facultyWeek, s.facultyId, s.length)
    bump(this.facultyDayCount, `${s.facultyId}:${s.day}`, s.length)
    bump(this.roomUse, s.roomId, s.length)
    if (course?.kind === 'Lab') bump(this.facultyLabHours, s.facultyId, s.length)

    addTo(this.facultyRooms, s.facultyId, s.roomId)
    if (room) addTo(this.facultyBuildings, `${s.facultyId}:${s.day}`, room.buildingId)
    addToNum(this.facultyDays, s.facultyId, s.day)
    addToNum(this.cohortCourseDays, `${s.cohortId}:${s.courseId}`, s.day)
    addToNum(this.courseDays, s.courseId, s.day)

    if (s.slot >= this.inst.grid.eveningFrom) bump(this.cohortLate, s.cohortId, 1)
    if (s.slot < this.inst.grid.earlyUntil) addToNum(this.cohortEarlyDays, s.cohortId, s.day)
  }

  /* ---------------- queries ---------------- */

  facultyBusy(id: string, day: number, slot: number, length = 1) {
    for (let k = 0; k < length; k++) if (this.facultySlot.has(`${id}:${day}:${slot + k}`)) return true
    return false
  }

  roomBusy(id: string, day: number, slot: number, length = 1) {
    for (let k = 0; k < length; k++) if (this.roomSlot.has(`${id}:${day}:${slot + k}`)) return true
    return false
  }

  cohortBusy(id: string, day: number, slot: number, length = 1) {
    for (let k = 0; k < length; k++) if (this.cohortSlot.has(`${id}:${day}:${slot + k}`)) return true
    return false
  }

  equipmentInUse(equipmentId: string, day: number, slot: number, length = 1) {
    let peak = 0
    for (let k = 0; k < length; k++) {
      peak = Math.max(peak, this.equipSlot.get(`${equipmentId}:${day}:${slot + k}`) ?? 0)
    }
    return peak
  }

  facultyOnDay(id: string, day: number): Session[] {
    return this.facultyDay.get(`${id}:${day}`) ?? []
  }

  cohortOnDay(id: string, day: number): Session[] {
    return this.cohortDay.get(`${id}:${day}`) ?? []
  }

  roomOnDay(id: string, day: number): Session[] {
    return this.roomDay.get(`${id}:${day}`) ?? []
  }

  facultyWeekHours(id: string) { return this.facultyWeek.get(id) ?? 0 }
  facultyDayHours(id: string, day: number) { return this.facultyDayCount.get(`${id}:${day}`) ?? 0 }
  facultyLabWeekHours(id: string) { return this.facultyLabHours.get(id) ?? 0 }
  facultyRoomCount(id: string) { return this.facultyRooms.get(id)?.size ?? 0 }
  facultyBuildingsOn(id: string, day: number) { return this.facultyBuildings.get(`${id}:${day}`) ?? EMPTY_STR }
  facultyTeachingDays(id: string) { return this.facultyDays.get(id) ?? EMPTY_NUM }
  cohortCourseMeetsOn(cohortId: string, courseId: string) {
    return this.cohortCourseDays.get(`${cohortId}:${courseId}`) ?? EMPTY_NUM
  }
  courseMeetsOn(courseId: string) { return this.courseDays.get(courseId) ?? EMPTY_NUM }
  cohortLateCount(id: string) { return this.cohortLate.get(id) ?? 0 }
  cohortEarlyDayCount(id: string) { return this.cohortEarlyDays.get(id)?.size ?? 0 }
  cohortEarlyDaySet(id: string) { return this.cohortEarlyDays.get(id) ?? EMPTY_NUM }
  roomHours(id: string) { return this.roomUse.get(id) ?? 0 }
}

const EMPTY_STR: ReadonlySet<string> = new Set()
const EMPTY_NUM: ReadonlySet<number> = new Set()

function push(map: Map<string, Session[]>, key: string, s: Session) {
  const list = map.get(key)
  if (!list) { map.set(key, [s]); return }
  // keep slot-ascending so gap/consecutive checks can scan linearly
  let i = list.length
  while (i > 0 && list[i - 1].slot > s.slot) i--
  list.splice(i, 0, s)
}

function bump(map: Map<string, number>, key: string, by: number) {
  map.set(key, (map.get(key) ?? 0) + by)
}

function addTo(map: Map<string, Set<string>>, key: string, value: string) {
  const set = map.get(key)
  if (set) set.add(value)
  else map.set(key, new Set([value]))
}

function addToNum(map: Map<string, Set<number>>, key: string, value: number) {
  const set = map.get(key)
  if (set) set.add(value)
  else map.set(key, new Set([value]))
}
