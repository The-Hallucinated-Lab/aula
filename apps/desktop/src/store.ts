import { create } from 'zustand'
import {
  DEFAULT_CONFIG,
  cloneConfig,
  summarise,
  type ConfigSummary,
  type SetupConfig,
} from '@aula/core/data/config'
import { CATALOGUE } from '@aula/core/data/constraints/catalogue'
import {
  defaultState,
  type ConstraintState,
  type ParamValue,
} from '@aula/core/data/constraints/types'
import { normaliseConfig } from '@aula/core/data/normalise'
import { generateInstitution } from '@aula/core/data/generator'
import type { ImportKind } from '@aula/core/data/importers'
import {
  blankCourse,
  blankRoom,
  courseRecordsFrom,
  staffRecordsFrom,
  roomRecordsFrom,
  type CourseRecord,
  type StaffRecord,
  type RoomRecord,
} from '@aula/core/data/records'
import {
  makeCustom,
  type CustomConstraint,
  type CustomScope,
  type CustomTemplate,
} from '@aula/core/data/constraints/custom'
import { computeMetrics, type Metrics } from '@aula/core/data/metrics'
import { prettyRange } from '@aula/core/data/academicCalendar'
import {
  DAY_NAMES,
  canTeach,
  type ActivityEntry,
  type CalendarEvent,
  type Institution,
  type ScenarioProfile,
  type Session,
  type SolveReport,
} from '@aula/core/data/model'
import { solveInWorker } from './adapters/solver/client'
import { checkMove as engineCheckMove, type MoveCheck } from '@aula/core/engine/solver'

export const SCENARIOS: ScenarioProfile[] = [
  {
    id: 'balanced',
    name: 'Balanced week',
    tagline: 'Even spread across days, fair staff load',
    weights: { gaps: 3, utilization: 2, loadBalance: 5, welfare: 3 },
  },
  {
    id: 'utilization',
    name: 'Peak utilisation',
    tagline: 'Fill every suitable room, minimise idle halls',
    weights: { gaps: 1, utilization: 5, loadBalance: 2, welfare: 1 },
  },
  {
    id: 'compact',
    name: 'Compact mornings',
    tagline: 'Front-load teaching, keep afternoons free',
    weights: { gaps: 5, utilization: 2, loadBalance: 3, welfare: 2 },
  },
  {
    id: 'welfare',
    name: 'Student welfare',
    tagline: 'Protect breaks, cut gaps, avoid dawn starts',
    weights: { gaps: 5, utilization: 1, loadBalance: 3, welfare: 5 },
  },
]

export const STORAGE_KEY = 'aula.project.v1'

/* ------------------------------------------------------------------ *
 * Constraint state
 * ------------------------------------------------------------------ */

export const buildDefaultStates = (): Record<string, ConstraintState> =>
  Object.fromEntries(CATALOGUE.map(c => [c.id, defaultState(c)]))

/** Merge persisted state over defaults so a catalogue change never breaks a save. */
function mergeStates(saved?: Record<string, ConstraintState>): Record<string, ConstraintState> {
  const base = buildDefaultStates()
  if (!saved) return base
  for (const c of CATALOGUE) {
    const s = saved[c.id]
    if (!s) continue
    base[c.id] = {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : base[c.id].enabled,
      weight: typeof s.weight === 'number' ? s.weight : base[c.id].weight,
      values: { ...base[c.id].values, ...(s.values ?? {}) },
    }
  }
  return base
}

/* ------------------------------------------------------------------ *
 * Persistence payload
 * ------------------------------------------------------------------ */

export interface ProjectFile {
  format: 'aula-project'
  version: 1
  savedAt: string
  config: SetupConfig
  states: Record<string, ConstraintState>
  scenario: ScenarioProfile['id']
  setupComplete: boolean
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

interface AppState {
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

let activityId = 1
const now = () => new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

/* --- initial state: config only, no schedule until the user asks --- */

function readPersisted(): Partial<ProjectFile> | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as ProjectFile
    return parsed?.format === 'aula-project' ? parsed : undefined
  } catch {
    return undefined
  }
}

const persisted = typeof localStorage !== 'undefined' ? readPersisted() : undefined
// A project written by an older build can be missing whole sections. Normalise
// before anything reads it, or the first property access takes the app down.
const initialConfig = persisted?.config
  ? normaliseConfig(persisted.config)
  : cloneConfig(DEFAULT_CONFIG)
const initialStates = mergeStates(persisted?.states)
const initialInstitution = generateInstitution(initialConfig)

function persist(state: Pick<AppState, 'config' | 'states' | 'activeScenario' | 'setupComplete'>) {
  try {
    const payload: ProjectFile = {
      format: 'aula-project',
      version: 1,
      savedAt: new Date().toISOString(),
      config: state.config,
      states: state.states,
      scenario: state.activeScenario,
      setupComplete: state.setupComplete,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // storage full or unavailable — the in-memory session still works
  }
}

/* If the restored project needed repairing, write the repaired version back
   now rather than carrying the broken copy until the first edit. */
if (persisted?.config && JSON.stringify(persisted.config) !== JSON.stringify(initialConfig)) {
  persist({
    config: initialConfig,
    states: initialStates,
    activeScenario: persisted.scenario ?? 'balanced',
    setupComplete: persisted.setupComplete ?? false,
  })
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

  /* ---------------- config ---------------- */

  setConfig(patch) {
    // The wizard's numbers feed the Data screens and the record snapshot taken
    // on first edit, so the preview institution has to move with them. It is a
    // sub-millisecond rebuild even for a large institution.
    const config = { ...get().config, ...patch }
    const institution = generateInstitution(config)
    set({
      config,
      summary: summarise(config),
      institution,
      metrics: computeMetrics(institution, get().sessions),
      scheduleStale: get().sessions.length > 0,
    })
    persist({ ...get(), config })
  },

  editDraft(patch) {
    const base = get().draftConfig ?? get().config
    const draftConfig = { ...base, ...patch }
    const institution = generateInstitution(draftConfig)
    set({
      draftConfig,
      summary: summarise(draftConfig),
      institution,
      metrics: computeMetrics(institution, get().sessions),
      scheduleStale: get().sessions.length > 0,
    })
    // deliberately not persisted — that is what makes it a draft
  },

  commitDraft() {
    const draftConfig = get().draftConfig
    if (!draftConfig) return
    const institution = generateInstitution(draftConfig)
    set({
      config: draftConfig,
      draftConfig: null,
      summary: summarise(draftConfig),
      institution,
      metrics: computeMetrics(institution, get().sessions),
      scheduleStale: get().sessions.length > 0,
    })
    persist({ ...get(), config: draftConfig })
    get().log('setup', 'Institution changes saved')
  },

  discardDraft() {
    if (!get().draftConfig) return
    const config = get().config
    const institution = generateInstitution(config)
    set({
      draftConfig: null,
      summary: summarise(config),
      institution,
      metrics: computeMetrics(institution, get().sessions),
    })
    get().log('setup', 'Institution changes discarded')
  },

  replaceConfig(config) {
    const institution = generateInstitution(config)
    set({
      config,
      // a draft belongs to the project it was started in
      draftConfig: null,
      summary: summarise(config),
      institution,
      metrics: computeMetrics(institution, get().sessions),
      scheduleStale: get().sessions.length > 0,
    })
    persist({ ...get(), config })
  },

  resetConfig() {
    const config = cloneConfig(DEFAULT_CONFIG)
    const institution = generateInstitution(config)
    set({
      config,
      draftConfig: null,
      summary: summarise(config),
      institution,
      metrics: computeMetrics(institution, []),
      sessions: [],
      report: null,
      locked: new Set(),
      absences: new Set(),
      scheduleStale: false,
    })
    persist({ ...get(), config })
    get().log('setup', 'Configuration reset to defaults')
  },

  async completeSetup() {
    set({ setupComplete: true })
    persist({ ...get(), setupComplete: true })
    get().log(
      'setup',
      `Institution configured — ${get().summary.students.toLocaleString()} students, ${get().summary.rooms} rooms`,
    )
    await get().regenerate(get().activeScenario)
  },

  /* ---------------- solving ---------------- */

  async regenerate(scenario) {
    const scenarioId = scenario ?? get().activeScenario
    const profile = SCENARIOS.find(s => s.id === scenarioId) ?? SCENARIOS[0]
    const { config, states } = get()

    if (get().summary.errors.length > 0) {
      set({ lastError: get().summary.errors[0] })
      get().log('reject', `Solve blocked — ${get().summary.errors[0]}`)
      return
    }

    set({ solving: true, phase: 'Starting solver', lastError: null, activeScenario: scenarioId })

    const seed = Math.floor(Math.random() * 1e9)
    try {
      const { institution, report } = await solveInWorker({
        config: { ...config, seed: config.seed },
        states,
        custom: config.customConstraints ?? [],
        seed,
        scenario: scenarioId,
        emphasis: profile.weights,
        timeBudgetMs: 20_000,
        onProgress: phase => set({ phase }),
      })

      set({
        institution,
        sessions: report.sessions,
        report,
        metrics: computeMetrics(institution, report.sessions),
        absences: new Set(),
        locked: new Set(),
        generatedAt: now(),
        solving: false,
        phase: '',
        scheduleStale: false,
        // A completed solve means the institution is described well enough to
        // schedule; the wizard no longer gates the rest of the app.
        setupComplete: true,
      })
      persist({ ...get(), setupComplete: true })

      const unplacedCount = report.unplaced.reduce((a, u) => a + u.missing, 0)
      get().log(
        'generate',
        unplacedCount > 0
          ? `Solved (${profile.name}) — ${report.sessions.length} sessions placed, ${unplacedCount} could not be placed, ${report.elapsedMs} ms`
          : `Solved (${profile.name}) — ${report.sessions.length} sessions, 0 hard violations, ${report.elapsedMs} ms`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      set({ solving: false, phase: '', lastError: message })
      get().log('reject', `Solver failed — ${message}`)
    }
  },

  /* ---------------- editing ---------------- */

  checkMove(sessionId, day, slot) {
    const { institution, states, sessions, locked, config } = get()
    return engineCheckMove(
      institution,
      states,
      sessions,
      sessionId,
      day,
      slot,
      [...locked],
      config.customConstraints ?? [],
    )
  },

  moveSession(sessionId, day, slot) {
    const result = get().checkMove(sessionId, day, slot)
    const { sessions, institution } = get()
    const session = sessions.find(s => s.id === sessionId)
    if (!session) return result
    const course = institution.courses.find(c => c.id === session.courseId)

    if (get().locked.has(sessionId)) {
      get().log('reject', `${course?.code} is pinned — unpin it before moving`)
      return {
        ok: false,
        rejections: [{ code: 'C422', label: 'Manual lock', message: 'Session is pinned' }],
        softDelta: 0,
      }
    }

    if (!result.ok) {
      const first = result.rejections[0]
      get().log(
        'reject',
        `Blocked: ${course?.code} → ${DAY_NAMES[day]} — ${first.code} ${first.message}`,
      )
      return result
    }

    const next = sessions.map(s =>
      s.id === sessionId ? { ...s, day, slot, roomId: result.relocatedRoomId ?? s.roomId } : s,
    )
    set({ sessions: next, metrics: computeMetrics(institution, next) })

    const relocated = result.relocatedRoomId
      ? ` (relocated to ${institution.rooms.find(r => r.id === result.relocatedRoomId)?.name})`
      : ''
    get().log('move', `${course?.code} ${course?.name} moved to ${DAY_NAMES[day]}${relocated}`)
    return result
  },

  toggleLock(sessionId) {
    const locked = new Set(get().locked)
    if (locked.has(sessionId)) locked.delete(sessionId)
    else locked.add(sessionId)
    set({ locked })
  },

  proposeSubstitutes(staffId, day) {
    const { sessions, institution, metrics } = get()
    const affected = sessions.filter(s => s.staffId === staffId && s.day === day)
    const absent = institution.staff.find(f => f.id === staffId)
    if (!absent) return []

    return affected.map(s => {
      const course = institution.courses.find(c => c.id === s.courseId)
      const busy = new Set(
        sessions.filter(x => x.day === day && overlapsSlots(x, s)).map(x => x.staffId),
      )
      const dayHours = new Map<string, number>()
      for (const x of sessions.filter(x => x.day === day)) {
        dayHours.set(x.staffId, (dayHours.get(x.staffId) ?? 0) + x.length)
      }

      // `canTeach` covers sabbatical, expertise and the group-size ceiling, so a
      // substitute is held to exactly the standard the solver applied originally
      const headcount =
        course?.enrolment ?? institution.cohorts.find(g => g.id === s.cohortId)?.size ?? 0
      const candidates = institution.staff
        .filter(
          f =>
            f.id !== staffId &&
            !!course &&
            canTeach(f, course, headcount) &&
            !busy.has(f.id) &&
            !f.blockedDays.includes(day) &&
            (dayHours.get(f.id) ?? 0) + s.length <= f.maxPerDay &&
            (metrics.staffLoad.get(f.id) ?? 0) + s.length <= f.maxPerWeek,
        )
        .sort((a, b) => {
          const deptA = a.deptId === absent.deptId ? 0 : 1
          const deptB = b.deptId === absent.deptId ? 0 : 1
          if (deptA !== deptB) return deptA - deptB
          return (metrics.staffLoad.get(a.id) ?? 0) - (metrics.staffLoad.get(b.id) ?? 0)
        })

      const best = candidates[0] ?? null
      return {
        sessionId: s.id,
        courseId: s.courseId,
        slotLabel: `${institution.grid.labels[s.slot] ?? ''} · ${course?.code ?? ''}`,
        candidateId: best?.id ?? null,
        candidateName: best?.name ?? 'No qualified substitute is free',
        sameDept: best ? best.deptId === absent.deptId : false,
        load: best ? (metrics.staffLoad.get(best.id) ?? 0) : 0,
      }
    })
  },

  applySubstitutions(staffId, day, proposals) {
    const { sessions, institution } = get()
    const byId = new Map(
      proposals.filter(p => p.candidateId).map(p => [p.sessionId, p.candidateId!]),
    )
    const next = sessions.map(s =>
      byId.has(s.id) ? { ...s, staffId: byId.get(s.id)!, substitutedFor: staffId } : s,
    )
    const absent = institution.staff.find(f => f.id === staffId)

    set(state => ({
      sessions: next,
      metrics: computeMetrics(institution, next),
      absences: new Set(state.absences).add(`${staffId}:${day}`),
    }))
    get().log(
      'substitute',
      `${absent?.name} absent ${DAY_NAMES[day]} — ${byId.size} session${byId.size === 1 ? '' : 's'} repaired locally, the rest of the week untouched`,
    )
  },

  /* ---------------- entity editing ---------------- */

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
          ...(state.config.overrides?.sections ?? {}),
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

  /* ---------------- academic calendar ---------------- */

  setTerm(start, end) {
    const state = get()
    const config: SetupConfig = {
      ...state.config,
      calendar: { ...state.config.calendar, termStart: start, termEnd: end },
    }
    applyConfig(set, get, config, 'setup', `Term set to ${prettyRange(start, end)}`)
  },

  addEvent(event) {
    const config = withEvents(get(), list => [...list, event])
    applyConfig(set, get, config, 'setup', `Calendar: added ${event.name}`)
  },

  updateEvent(event) {
    const config = withEvents(get(), list => list.map(e => (e.id === event.id ? event : e)))
    applyConfig(set, get, config, 'setup', `Calendar: updated ${event.name}`)
  },

  removeEvent(id) {
    const state = get()
    const name = state.config.calendar.events.find(e => e.id === id)?.name ?? id
    const config = withEvents(state, list => list.filter(e => e.id !== id))
    applyConfig(set, get, config, 'setup', `Calendar: removed ${name}`)
  },

  /* ---------------- institution-specific rules ---------------- */

  addCustom(template, scope, scopeLabel) {
    const state = get()
    const existing = state.config.customConstraints ?? []
    const rule = makeCustom(template, scope, existing, scopeLabel)
    const config: SetupConfig = { ...state.config, customConstraints: [...existing, rule] }
    applyConfig(set, get, config, 'constraint', `Added rule ${rule.id} — ${rule.text}`)
  },

  updateCustom(rule) {
    const state = get()
    const config: SetupConfig = {
      ...state.config,
      customConstraints: (state.config.customConstraints ?? []).map(c =>
        c.id === rule.id ? rule : c,
      ),
    }
    applyConfig(set, get, config, 'constraint', `Updated rule ${rule.id}`)
  },

  removeCustom(id) {
    const state = get()
    const config: SetupConfig = {
      ...state.config,
      customConstraints: (state.config.customConstraints ?? []).filter(c => c.id !== id),
    }
    applyConfig(set, get, config, 'constraint', `Removed rule ${id}`)
  },

  /* ---------------- constraints ---------------- */

  toggleConstraint(code) {
    const states = { ...get().states }
    const current = states[code]
    if (!current) return
    states[code] = { ...current, enabled: !current.enabled }
    set({ states })
    persist({ ...get(), states })

    const def = CATALOGUE.find(c => c.id === code)
    if (def) {
      get().log(
        'constraint',
        `${states[code].enabled ? 'Enabled' : 'Disabled'} ${code} — ${truncate(def.text)}`,
      )
    }
  },

  setWeight(code, weight) {
    const states = { ...get().states }
    if (!states[code]) return
    states[code] = { ...states[code], weight }
    set({ states })
    persist({ ...get(), states })
  },

  setParam(code, key, value) {
    const states = { ...get().states }
    if (!states[code]) return
    states[code] = { ...states[code], values: { ...states[code].values, [key]: value } }
    set({ states })
    persist({ ...get(), states })
  },

  bulkSet(codes, enabled) {
    const states = { ...get().states }
    for (const code of codes) {
      if (states[code]) states[code] = { ...states[code], enabled }
    }
    set({ states })
    persist({ ...get(), states })
    get().log('constraint', `${enabled ? 'Enabled' : 'Disabled'} ${codes.length} constraints`)
  },

  resetConstraints() {
    const states = buildDefaultStates()
    set({ states })
    persist({ ...get(), states })
    get().log('constraint', 'Constraint catalogue reset to defaults')
  },

  /* ---------------- io ---------------- */

  toProjectFile() {
    const { config, states, activeScenario, setupComplete } = get()
    return {
      format: 'aula-project',
      version: 1,
      savedAt: new Date().toISOString(),
      config,
      states,
      scenario: activeScenario,
      setupComplete,
    }
  },

  async loadProjectFile(file) {
    if (file?.format !== 'aula-project') {
      set({ lastError: 'That file is not an Aula project.' })
      return
    }
    // The file came off disk, so nothing about its shape is guaranteed.
    const config = normaliseConfig(file.config)
    const states = mergeStates(file.states)
    const institution = generateInstitution(config)
    set({
      config,
      // a draft belongs to the project it was started in
      draftConfig: null,
      summary: summarise(config),
      states,
      activeScenario: SCENARIOS.some(s => s.id === file.scenario) ? file.scenario : 'balanced',
      setupComplete: file.setupComplete ?? true,
      institution,
      metrics: computeMetrics(institution, []),
      sessions: [],
      report: null,
      locked: new Set(),
      absences: new Set(),
      scheduleStale: false,
      lastError: null,
    })
    persist({ ...get(), config, states })
    get().log('io', `Project loaded — ${config.institution.name}`)
    await get().regenerate()
  },

  log(kind, text) {
    set(s => ({
      activity: [{ id: activityId++, time: now(), kind, text }, ...s.activity].slice(0, 60),
    }))
  },
}))

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function overlapsSlots(a: Session, b: Session): boolean {
  return a.slot < b.slot + b.length && b.slot < a.slot + a.length
}

const truncate = (s: string, n = 68) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/* ------------------------------------------------------------------ *
 * Editing helpers
 *
 * The first edit to an entity type snapshots the generated list into the
 * project as explicit records. From then on those records are authoritative
 * and the generator stops inventing that type — see data/records.ts.
 * ------------------------------------------------------------------ */

type StoreSet = (partial: Partial<AppState>) => void
type StoreGet = () => AppState

function withStaff(state: AppState, fn: (list: StaffRecord[]) => StaffRecord[]): SetupConfig {
  const current = state.config.overrides?.staff ?? staffRecordsFrom(state.institution)
  return {
    ...state.config,
    overrides: { ...state.config.overrides, staff: fn(current) },
  }
}

function withCourses(state: AppState, fn: (list: CourseRecord[]) => CourseRecord[]): SetupConfig {
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
function withEvents(state: AppState, fn: (list: CalendarEvent[]) => CalendarEvent[]): SetupConfig {
  const events = fn(state.config.calendar.events ?? [])
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))
  return { ...state.config, calendar: { ...state.config.calendar, events } }
}

function withRooms(state: AppState, fn: (list: RoomRecord[]) => RoomRecord[]): SetupConfig {
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
function applyConfig(
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
