import { summarise, type SetupConfig } from '@aula/core/data/config'
import { generateInstitution } from '@aula/core/data/generator'
import {
  courseRecordsFrom,
  staffRecordsFrom,
  roomRecordsFrom,
  type CourseRecord,
  type StaffRecord,
  type RoomRecord,
} from '@aula/core/data/records'
import { computeMetrics } from '@aula/core/data/metrics'
import { type ActivityEntry, type CalendarEvent, type Session } from '@aula/core/data/model'
import type { AppState, StoreGet, StoreSet } from './types'
import { persist } from './persistence'

/**
 * Shared machinery for the mutating slices.
 *
 * The `with*` helpers implement the materialise-on-edit rule (D-22): the first
 * explicit change to an entity type snapshots the whole generated list into
 * `overrides`, after which the generator stops inventing that type.
 * `applyConfig` is the single commit path — it rebuilds the preview
 * institution, recomputes the summary and marks the schedule stale, so no
 * caller can change the configuration and forget one of the three.
 */

export function overlapsSlots(a: Session, b: Session): boolean {
  return a.slot < b.slot + b.length && b.slot < a.slot + a.length
}

export const truncate = (s: string, n = 68) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function withStaff(
  state: AppState,
  fn: (list: StaffRecord[]) => StaffRecord[],
): SetupConfig {
  const current = state.config.overrides?.staff ?? staffRecordsFrom(state.institution)
  return {
    ...state.config,
    overrides: { ...state.config.overrides, staff: fn(current) },
  }
}

export function withCourses(
  state: AppState,
  fn: (list: CourseRecord[]) => CourseRecord[],
): SetupConfig {
  const current = state.config.overrides?.courses ?? courseRecordsFrom(state.institution)
  return {
    ...state.config,
    overrides: { ...state.config.overrides, courses: fn(current) },
  }
}

/**
 * Calendar entries live on the config, not in `overrides` — they describe the
 * term rather than an entity, so there is nothing to materialise and no
 * generated version to take over from.
 */

export function withEvents(
  state: AppState,
  fn: (list: CalendarEvent[]) => CalendarEvent[],
): SetupConfig {
  const events = fn(state.config.calendar.events ?? [])
    .slice()
    .toSorted((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))
  return { ...state.config, calendar: { ...state.config.calendar, events } }
}

export function withRooms(state: AppState, fn: (list: RoomRecord[]) => RoomRecord[]): SetupConfig {
  const current = state.config.overrides?.rooms ?? roomRecordsFrom(state.institution)
  return {
    ...state.config,
    overrides: { ...state.config.overrides, rooms: fn(current) },
  }
}

/**
 * Commit a config change: rebuild the institution preview so the data screens
 * update immediately, recompute the summary, persist, and log it. The schedule
 * is deliberately NOT re-solved — an edit invalidates it, and the user decides
 * when to spend the time. It is flagged stale instead, so no screen presents a
 * schedule as current when the data underneath it has moved.
 */

export function applyConfig(
  set: StoreSet,
  get: StoreGet,
  config: SetupConfig,
  kind: ActivityEntry['kind'],
  message: string,
) {
  const institution = generateInstitution(config)
  set({
    config,
    summary: summarise(config),
    institution,
    metrics: computeMetrics(institution, get().sessions),
    scheduleStale: get().sessions.length > 0,
  })
  persist({ ...get(), config })
  get().log(kind, message)
}
