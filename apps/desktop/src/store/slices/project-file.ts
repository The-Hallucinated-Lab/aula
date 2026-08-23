import { summarise } from '@aula/core/data/config'
import { normaliseConfig } from '@aula/core/data/normalise'
import { generateInstitution } from '@aula/core/data/generator'
import { computeMetrics } from '@aula/core/data/metrics'
import type { Slice } from '../types'
import { mergeStates } from '../constraint-state'
import { persist } from '../persistence'
import { SCENARIOS } from '../scenarios'
import { nextActivityId, now } from '../activity'

/**
 * Saving and loading a project.
 *
 * A project file is the configuration and the constraint state — never the
 * solved schedule. Reopening re-solves, which is what keeps a saved file valid
 * after the engine changes.
 */

/** The members of `AppState` this slice is responsible for. */
type Owned = 'loadProjectFile' | 'log' | 'toProjectFile'

export const projectFileActions: Slice<Owned> = (set, get) => ({
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
      activity: [{ id: nextActivityId(), time: now(), kind, text }, ...s.activity].slice(0, 60),
    }))
  },
})
