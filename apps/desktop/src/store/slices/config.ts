import { DEFAULT_CONFIG, cloneConfig, summarise } from '@aula/core/data/config'
import { generateInstitution } from '@aula/core/data/generator'
import { computeMetrics } from '@aula/core/data/metrics'
import type { Slice } from '../types'
import { persist } from '../persistence'

/**
 * Configuration and the institution draft.
 *
 * `setConfig` writes straight through; `editDraft` accumulates. Institution-level
 * settings ripple through every course, section, room and person derived from
 * them, so those edits are held as a draft and committed deliberately (D-27).
 */

/** The members of `AppState` this slice is responsible for. */
type Owned =
  | 'commitDraft'
  | 'completeSetup'
  | 'discardDraft'
  | 'editDraft'
  | 'replaceConfig'
  | 'resetConfig'
  | 'setConfig'

export const configActions: Slice<Owned> = (set, get) => ({
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
})
