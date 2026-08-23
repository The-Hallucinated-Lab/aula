import { CATALOGUE } from '@aula/core/data/constraints/catalogue'
import type { Slice } from '../types'
import { truncate } from '../editing'
import { buildDefaultStates } from '../constraint-state'
import { persist } from '../persistence'

/**
 * The 500-row catalogue’s per-institution state.
 *
 * Which rows are on, what weight each soft one carries, and the parameters a
 * parameterised row exposes. Rules read parameters, never prose, which is what
 * lets a threshold be retuned without a code change.
 */

/** The members of `AppState` this slice is responsible for. */
type Owned = 'bulkSet' | 'resetConstraints' | 'setParam' | 'setWeight' | 'toggleConstraint'

export const constraintsActions: Slice<Owned> = (set, get) => ({
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
})
