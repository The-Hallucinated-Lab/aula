/// <reference lib="webworker" />
/**
 * Solver worker.
 *
 * Generation and solving are CPU-bound and grow with the size of the
 * institution, so neither runs on the UI thread. The window stays at 60fps
 * and Windows never marks it "(Not Responding)".
 */

import type { SetupConfig } from '../data/config'
import type { ConstraintState } from '../data/constraints/types'
import type { CustomConstraint } from '../data/constraints/custom'
import type { Institution, ScenarioProfile, SolveReport } from '../data/model'
import { generateInstitution } from '../data/generator'
import { solve } from './solver'

export interface SolveRequest {
  kind: 'solve'
  requestId: number
  config: SetupConfig
  states: Record<string, ConstraintState>
  custom: CustomConstraint[]
  seed: number
  scenario: ScenarioProfile['id']
  emphasis: ScenarioProfile['weights']
  timeBudgetMs: number
}

export type WorkerRequest = SolveRequest

export type WorkerResponse =
  | { kind: 'progress'; requestId: number; phase: string }
  | { kind: 'done'; requestId: number; institution: Institution; report: SolveReport }
  | { kind: 'error'; requestId: number; message: string }

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  if (msg.kind !== 'solve') return

  try {
    post({ kind: 'progress', requestId: msg.requestId, phase: 'Building institution' })
    const institution = generateInstitution(msg.config)

    post({ kind: 'progress', requestId: msg.requestId, phase: 'Placing sessions' })
    const report = solve({
      institution,
      states: msg.states,
      custom: msg.custom,
      seed: msg.seed,
      emphasis: msg.emphasis,
      timeBudgetMs: msg.timeBudgetMs,
    })

    post({ kind: 'done', requestId: msg.requestId, institution, report })
  } catch (error) {
    post({
      kind: 'error',
      requestId: msg.requestId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
})

function post(message: WorkerResponse) {
  ctx.postMessage(message)
}
