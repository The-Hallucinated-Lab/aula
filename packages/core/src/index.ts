/**
 * `@aula/core` — the domain core.
 *
 * This barrel is the package's front door. Everything re-exported here is
 * stable public API; anything reached through a deeper subpath
 * (`@aula/core/data/…`, `@aula/core/engine/…`) is still importable but may be
 * rearranged by an internal refactor without notice.
 *
 * The package is deliberately host-agnostic — no React, no DOM, no Node
 * built-ins — which is what lets the same code run in the renderer, inside a
 * Web Worker, and headless under Node in the verification harness.
 */

/* ---- Domain model: the vocabulary everything else is expressed in ---- */
export type {
  AcademicCalendar,
  Building,
  CalendarBlackout,
  CalendarEvent,
  CalendarEventKind,
  Campus,
  Cohort,
  Course,
  CourseKind,
  Department,
  EmploymentType,
  EquipmentPool,
  Faculty,
  Institution,
  Program,
  Room,
  RoomFeature,
  RoomKind,
  School,
  ScenarioProfile,
  Session,
  ShiftWindow,
  SolveReport,
  Staff,
  StaffRank,
  TimeGrid,
  Unplaced,
  Violation,
  WeekdayImpact,
} from './data/model'

export {
  CALENDAR_KINDS,
  COURSE_KINDS,
  DAY_NAMES,
  DAY_SHORT,
  EMPLOYMENT_TYPES,
  ROOM_FEATURES,
  ROOM_KINDS,
  SELECTABLE_ROOM_KINDS,
  STAFF_RANKS,
  fitsShift,
  sessionMinutes,
} from './data/model'

/* ---- Configuration: what an administrator actually fills in ---- */
export type { SetupConfig } from './data/config'
export { summarise, slotsPerDay } from './data/config'
export { normaliseConfig } from './data/normalise'

/* ---- Constraint catalogue and per-institution rule state ---- */
export type { ConstraintDef, ConstraintState, ParamValue, RuleKey } from './data/constraints/types'
export { defaultState } from './data/constraints/types'
export { CATALOGUE, COUNTS, auditCatalogue } from './data/constraints/catalogue'
export type { CustomConstraint } from './data/constraints/custom'
export { makeCustom } from './data/constraints/custom'

/* ---- Engine: turn a configuration into a schedule, and explain it ---- */
export { generateInstitution, buildGrid } from './data/generator'
export { solve } from './engine/solver'
export { IMPLEMENTED, isImplemented, unimplementedRules } from './engine/rules'
export { computeMetrics } from './data/metrics'
