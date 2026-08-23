import { type ConfigSummary, type SetupConfig } from '@aula/core/data/config'
import { type ConstraintState, type ParamValue } from '@aula/core/data/constraints/types'
import { type CourseRecord, type StaffRecord, type RoomRecord } from '@aula/core/data/records'
import {
  type CustomConstraint,
  type CustomScope,
  type CustomTemplate,
} from '@aula/core/data/constraints/custom'
import type { ImportKind } from '@aula/core/data/importers'
import { type Metrics } from '@aula/core/data/metrics'
import {
  type ActivityEntry,
  type CalendarEvent,
  type Institution,
  type ScenarioProfile,
  type Session,
  type SolveReport,
} from '@aula/core/data/model'
import type { MoveCheck } from '@aula/core/engine/solver'

/**
 * The store's shape, kept apart from its construction.
 *
 * Every slice needs `AppState` to type its `get()`; the assembled store needs
 * every slice. Putting the type here is what stops that being a cycle.
 */

export interface ProjectFile {
  format: 'aula-project'
  version: 1
  savedAt: string
  config: SetupConfig
  states: Record<string, ConstraintState>
  scenario: ScenarioProfile['id']
  setupComplete: boolean
}

export interface SubstituteProposal {
  sessionId: string
  courseId: string
  slotLabel: string
  candidateId: string | null
  candidateName: string
  sameDept: boolean
  load: number
}

export interface AppState {
  config: SetupConfig
  summary: ConfigSummary
  setupComplete: boolean

  institution: Institution
  sessions: Session[]
  report: SolveReport | null
  metrics: Metrics
  states: Record<string, ConstraintState>
  locked: Set<string>

  activity: ActivityEntry[]
  activeScenario: ScenarioProfile['id']
  absences: Set<string>
  generatedAt: string | null

  solving: boolean
  phase: string
  lastError: string | null
  /** the schedule on screen no longer matches the data it was solved from */
  scheduleStale: boolean

  /* config */
  setConfig: (patch: Partial<SetupConfig>) => void
  replaceConfig: (cfg: SetupConfig) => void
  resetConfig: () => void
  /**
   * Institution-level edits held back from storage until confirmed.
   *
   * Changing the shape of the institution ripples through every course,
   * section, room and person derived from it. The review asked for those edits
   * to accumulate as a draft and be committed deliberately rather than the
   * moment a digit changes. The preview still moves as you type — you can see
   * what a change does — but nothing is written until `commitDraft`.
   */
  draftConfig: SetupConfig | null
  editDraft: (patch: Partial<SetupConfig>) => void
  commitDraft: () => void
  discardDraft: () => void
  completeSetup: () => Promise<void>

  /* solving */
  regenerate: (scenario?: ScenarioProfile['id']) => Promise<void>

  /* editing */
  checkMove: (sessionId: string, day: number, slot: number) => MoveCheck
  moveSession: (sessionId: string, day: number, slot: number) => MoveCheck
  toggleLock: (sessionId: string) => void
  proposeSubstitutes: (staffId: string, day: number) => SubstituteProposal[]
  applySubstitutions: (staffId: string, day: number, proposals: SubstituteProposal[]) => void

  /* entity editing — see data/records.ts for the materialise-on-edit rule */
  editStaff: (rec: StaffRecord) => void
  /** takes the finished record from the intake dialog, not just a department */
  addStaff: (rec: StaffRecord) => void
  removeStaff: (id: string) => void
  editCourse: (rec: CourseRecord) => void
  addCourse: (deptCode: string, programId: string, year: number) => void
  removeCourse: (id: string) => void
  editRoom: (rec: RoomRecord) => void
  addRoom: (buildingId: string) => void
  removeRoom: (id: string) => void
  setSections: (programId: string, year: number, count: number) => void
  resetEntity: (kind: 'staff' | 'courses' | 'rooms' | 'sections') => void
  /** Replace an entity type wholesale from an imported file. */
  importEntity: (kind: ImportKind, rows: StaffRecord[] | RoomRecord[] | CourseRecord[]) => void

  /* academic calendar */
  setTerm: (start: string, end: string) => void
  addEvent: (event: CalendarEvent) => void
  updateEvent: (event: CalendarEvent) => void
  removeEvent: (id: string) => void

  /* institution-specific rules */
  addCustom: (template: CustomTemplate, scope: CustomScope, scopeLabel: string) => void
  updateCustom: (rule: CustomConstraint) => void
  removeCustom: (id: string) => void

  /* constraints */
  toggleConstraint: (code: string) => void
  setWeight: (code: string, weight: number) => void
  setParam: (code: string, key: string, value: ParamValue) => void
  bulkSet: (codes: string[], enabled: boolean) => void
  resetConstraints: () => void

  /* io */
  toProjectFile: () => ProjectFile
  loadProjectFile: (file: ProjectFile) => Promise<void>
  log: (kind: ActivityEntry['kind'], text: string) => void
}

/**
 * How a slice is written.
 *
 * Plain factories over Zustand's `StateCreator` generics: a slice returns the
 * actions it owns and reads whatever it needs through `get()`. The state fields
 * themselves are initialised once, in `index.ts`, so there is exactly one place
 * that says what a fresh store contains.
 */
/** What a helper outside the store receives when it needs to write. */
export type StoreSet = (partial: Partial<AppState>) => void
export type StoreGet = () => AppState

export type Slice<K extends keyof AppState> = (
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  get: () => AppState,
) => Pick<AppState, K>
