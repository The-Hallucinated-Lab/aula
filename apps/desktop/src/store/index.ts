import { create } from 'zustand'
import { DEFAULT_CONFIG, cloneConfig, summarise } from '@aula/core/data/config'
import { normaliseConfig } from '@aula/core/data/normalise'
import { generateInstitution } from '@aula/core/data/generator'
import { computeMetrics } from '@aula/core/data/metrics'
import type { AppState } from './types'
import { buildDefaultStates, mergeStates } from './constraint-state'
import { readPersisted } from './persistence'
import { configActions } from './slices/config'
import { solvingActions } from './slices/solving'
import { scheduleActions } from './slices/schedule'
import { recordsActions } from './slices/records'
import { calendarActions } from './slices/calendar'
import { customRulesActions } from './slices/custom-rules'
import { constraintsActions } from './slices/constraints'
import { projectFileActions } from './slices/project-file'
/* aula:cli:slice-imports */

/**
 * The application store.
 *
 * One Zustand store, assembled from eight slices that each own one subject.
 * This file holds what a fresh store contains and nothing else: every action
 * lives beside the concern it belongs to, under `slices/`.
 *
 * The slices are plain factories rather than Zustand `StateCreator`s. They read
 * whatever they need through `get()`, which is the whole state, so the split is
 * organisational — it changes where an action is written, never what it can
 * reach.
 */

/* The saved project, if there is one. Read once at module load: the store is a
   singleton and re-reading localStorage per field would be three parses. */
const persisted = typeof localStorage === 'undefined' ? undefined : readPersisted()

const initialConfig = persisted?.config
  ? normaliseConfig(persisted.config)
  : cloneConfig(DEFAULT_CONFIG)
const initialStates = mergeStates(persisted?.states)
const initialInstitution = generateInstitution(initialConfig)

export const useApp = create<AppState>((set, get) => ({
  config: initialConfig,
  summary: summarise(initialConfig),
  setupComplete: persisted?.setupComplete ?? false,

  institution: initialInstitution,
  sessions: [],
  report: null,
  metrics: computeMetrics(initialInstitution, []),
  states: initialStates,
  locked: new Set(),

  activity: [],
  activeScenario: persisted?.scenario ?? 'balanced',
  absences: new Set(),
  generatedAt: null,

  solving: false,
  phase: '',
  lastError: null,
  scheduleStale: false,
  draftConfig: null,

  ...configActions(set, get), // config
  ...solvingActions(set, get), // solving
  ...scheduleActions(set, get), // editing
  ...recordsActions(set, get), // entity editing
  ...calendarActions(set, get), // academic calendar
  ...customRulesActions(set, get), // institution-specific rules
  ...constraintsActions(set, get), // constraints
  ...projectFileActions(set, get), // io
  /* aula:cli:slices */
}))

export { buildDefaultStates, mergeStates }
export { SCENARIOS } from './scenarios'
export { STORAGE_KEY } from './persistence'
export type { AppState, ProjectFile, SubstituteProposal } from './types'
