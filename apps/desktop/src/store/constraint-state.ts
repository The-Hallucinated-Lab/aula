import { CATALOGUE } from '@aula/core/data/constraints/catalogue'
import { defaultState, type ConstraintState } from '@aula/core/data/constraints/types'

/**
 * Per-institution state for the 500-row catalogue.
 *
 * A saved project carries only the rows it changed, so loading merges rather
 * than replaces: a catalogue row added since the file was written arrives at
 * its default instead of vanishing.
 */

export const buildDefaultStates = (): Record<string, ConstraintState> =>
  Object.fromEntries(CATALOGUE.map(c => [c.id, defaultState(c)]))

/** Merge persisted state over defaults so a catalogue change never breaks a save. */

export function mergeStates(
  saved?: Record<string, ConstraintState>,
): Record<string, ConstraintState> {
  const base = buildDefaultStates()
  if (!saved) return base
  for (const c of CATALOGUE) {
    const s = saved[c.id]
    const current = base[c.id]
    if (!s || !current) continue
    base[c.id] = {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : current.enabled,
      weight: typeof s.weight === 'number' ? s.weight : current.weight,
      values: { ...current.values, ...s.values },
    }
  }
  return base
}
