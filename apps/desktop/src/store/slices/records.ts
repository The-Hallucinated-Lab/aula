import { type SetupConfig } from '@aula/core/data/config'
import {
  blankCourse,
  blankRoom,
  type CourseRecord,
  type StaffRecord,
  type RoomRecord,
} from '@aula/core/data/records'
import type { Slice } from '../types'
import { applyConfig, withCourses, withRooms, withStaff } from '../editing'

/**
 * Entity records.
 *
 * The first explicit edit to a type snapshots the whole generated list into
 * `overrides`, and the generator stops inventing that type (D-22). Imports use
 * the same seam, so an imported row inherits the entire validation and editing
 * path.
 */

/** The members of `AppState` this slice is responsible for. */
type Owned =
  | 'addCourse'
  | 'addRoom'
  | 'addStaff'
  | 'editCourse'
  | 'editRoom'
  | 'editStaff'
  | 'importEntity'
  | 'removeCourse'
  | 'removeRoom'
  | 'removeStaff'
  | 'resetEntity'
  | 'setSections'

export const recordsActions: Slice<Owned> = (set, get) => ({
  editStaff(rec) {
    const config = withStaff(get(), list =>
      list.some(f => f.id === rec.id) ? list.map(f => (f.id === rec.id ? rec : f)) : [...list, rec],
    )
    applyConfig(set, get, config, 'setup', `Updated ${rec.name}`)
  },

  addStaff(rec) {
    const config = withStaff(get(), list => [...list, rec])
    applyConfig(set, get, config, 'setup', `Added ${rec.name} to ${rec.dept}`)
  },

  removeStaff(id) {
    const state = get()
    const name = state.institution.staff.find(f => f.id === id)?.name ?? id
    const config = withStaff(state, list => list.filter(f => f.id !== id))
    applyConfig(set, get, config, 'setup', `Removed ${name}`)
  },

  editCourse(rec) {
    const config = withCourses(get(), list =>
      list.some(c => c.id === rec.id) ? list.map(c => (c.id === rec.id ? rec : c)) : [...list, rec],
    )
    applyConfig(set, get, config, 'setup', `Updated ${rec.code}`)
  },

  addCourse(deptCode, programId, year) {
    const rec = blankCourse(deptCode, programId, year)
    const config = withCourses(get(), list => [...list, rec])
    applyConfig(set, get, config, 'setup', `Added a course to ${deptCode} year ${year}`)
  },

  removeCourse(id) {
    const state = get()
    const code = state.institution.courses.find(c => c.id === id)?.code ?? id
    // dropping a course also drops it from every teaching assignment
    let config = withCourses(state, list => list.filter(c => c.id !== id))
    if (config.overrides?.staff) {
      config = {
        ...config,
        overrides: {
          ...config.overrides,
          staff: config.overrides.staff.map(f => ({
            ...f,
            courseIds: f.courseIds.filter(c => c !== id),
          })),
        },
      }
    }
    applyConfig(set, get, config, 'setup', `Removed ${code}`)
  },

  editRoom(rec) {
    const config = withRooms(get(), list =>
      list.some(r => r.id === rec.id) ? list.map(r => (r.id === rec.id ? rec : r)) : [...list, rec],
    )
    applyConfig(set, get, config, 'setup', `Updated room ${rec.name}`)
  },

  addRoom(buildingId) {
    const rec = blankRoom(buildingId)
    const config = withRooms(get(), list => [...list, rec])
    applyConfig(set, get, config, 'setup', 'Added a room')
  },

  removeRoom(id) {
    const state = get()
    const name = state.institution.rooms.find(r => r.id === id)?.name ?? id
    const config = withRooms(state, list => list.filter(r => r.id !== id))
    applyConfig(set, get, config, 'setup', `Removed room ${name}`)
  },

  setSections(programId, year, count) {
    const state = get()
    const config: SetupConfig = {
      ...state.config,
      overrides: {
        ...state.config.overrides,
        sections: {
          ...state.config.overrides?.sections,
          [`${programId}:${year}`]: Math.max(0, count),
        },
      },
    }
    applyConfig(set, get, config, 'setup', `Year ${year} now has ${Math.max(0, count)} section(s)`)
  },

  importEntity(kind, rows) {
    /* An import is a materialisation like any other (D-22): from this point the
       generator stops inventing this entity type and these records are the
       source of truth. It is deliberately a replacement rather than a merge —
       a half-merged roster is not something anybody can reason about. */
    const overrides = { ...get().config.overrides }
    if (kind === 'staff') overrides.staff = rows as StaffRecord[]
    else if (kind === 'rooms') overrides.rooms = rows as RoomRecord[]
    else overrides.courses = rows as CourseRecord[]
    applyConfig(
      set,
      get,
      { ...get().config, overrides },
      'io',
      `Imported ${rows.length} ${kind === 'staff' ? 'staff' : kind === 'rooms' ? 'rooms' : 'courses'}`,
    )
  },

  resetEntity(kind) {
    const state = get()
    const overrides = { ...state.config.overrides }
    delete overrides[kind]
    const config: SetupConfig = { ...state.config, overrides }
    applyConfig(set, get, config, 'setup', `Reset ${kind} to the generated values`)
  },
})
