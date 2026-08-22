import { CATALOGUE } from '../src/data/constraints/catalogue'
import { defaultState, type ConstraintState } from '../src/data/constraints/types'

export const buildDefaultStates = (): Record<string, ConstraintState> =>
  Object.fromEntries(CATALOGUE.map(c => [c.id, defaultState(c)]))
