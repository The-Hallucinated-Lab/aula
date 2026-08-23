import { computeMetrics } from '@aula/core/data/metrics'
import { solveInWorker } from '../../adapters/solver/client'
import type { Slice } from '../types'
import { persist } from '../persistence'
import { DEFAULT_SCENARIO, SCENARIOS } from '../scenarios'
import { now } from '../activity'

/**
 * Running the solver.
 *
 * The work happens in a Web Worker, so the window stays responsive and Windows
 * never marks it "(Not Responding)". This slice owns the phase reporting the
 * worker streams back.
 */

/** The members of `AppState` this slice is responsible for. */
type Owned = 'regenerate'

export const solvingActions: Slice<Owned> = (set, get) => ({
  async regenerate(scenario) {
    const scenarioId = scenario ?? get().activeScenario
    const profile = SCENARIOS.find(s => s.id === scenarioId) ?? DEFAULT_SCENARIO
    const { config, states } = get()

    const blocking = get().summary.errors[0]
    if (blocking !== undefined) {
      set({ lastError: blocking })
      get().log('reject', `Solve blocked — ${blocking}`)
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
})
