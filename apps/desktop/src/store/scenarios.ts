import type { ScenarioProfile } from '@aula/core/data/model'

/**
 * The optimisation emphases a user can pick between.
 *
 * A scenario is only a set of soft weights — no scenario relaxes a hard
 * constraint, so switching between them cannot make an illegal timetable legal.
 */

export const DEFAULT_SCENARIO: ScenarioProfile = {
  id: 'balanced',
  name: 'Balanced week',
  tagline: 'Even spread across days, fair staff load',
  weights: { gaps: 3, utilization: 2, loadBalance: 5, welfare: 3 },
}

export const SCENARIOS: ScenarioProfile[] = [
  DEFAULT_SCENARIO,
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
