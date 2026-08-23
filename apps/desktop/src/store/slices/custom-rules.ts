import { type SetupConfig } from '@aula/core/data/config'
import { makeCustom } from '@aula/core/data/constraints/custom'
import type { Slice } from '../types'
import { applyConfig } from '../editing'

/**
 * Rules an institution writes for itself.
 *
 * Eight templates, each compiled to the same shape the built-in registry uses,
 * so a custom rule is enforced by the solver rather than merely recorded.
 */

/** The members of `AppState` this slice is responsible for. */
type Owned = 'addCustom' | 'removeCustom' | 'updateCustom'

export const customRulesActions: Slice<Owned> = (set, get) => ({
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
})
