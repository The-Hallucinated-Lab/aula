/**
 * Worker client — one long-lived solver worker, promise-shaped API.
 */

import type { SetupConfig } from '@aula/core/data/config'
import type { ConstraintState } from '@aula/core/data/constraints/types'
import type { CustomConstraint } from '@aula/core/data/constraints/custom'
import type { Institution, ScenarioProfile, SolveReport } from '@aula/core/data/model'
import type { WorkerRequest, WorkerResponse } from './worker'

let worker: Worker | null = null
let nextId = 1

function ensureWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

export interface SolveOptions {
  config: SetupConfig
  states: Record<string, ConstraintState>
  custom: CustomConstraint[]
  seed: number
  scenario: ScenarioProfile['id']
  emphasis: ScenarioProfile['weights']
  timeBudgetMs?: number
  onProgress?: (phase: string) => void
}

export interface SolveOutcome {
  institution: Institution
  report: SolveReport
}

export function solveInWorker(opts: SolveOptions): Promise<SolveOutcome> {
  const w = ensureWorker()
  const requestId = nextId++

  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      if (msg.requestId !== requestId) return

      if (msg.kind === 'progress') {
        opts.onProgress?.(msg.phase)
        return
      }
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)

      if (msg.kind === 'done') resolve({ institution: msg.institution, report: msg.report })
      else reject(new Error(msg.message))
    }

    const onError = (event: ErrorEvent) => {
      w.removeEventListener('message', onMessage)
      w.removeEventListener('error', onError)
      reject(new Error(event.message || 'Solver worker crashed'))
    }

    w.addEventListener('message', onMessage)
    w.addEventListener('error', onError)

    const request: WorkerRequest = {
      kind: 'solve',
      requestId,
      config: opts.config,
      states: opts.states,
      custom: opts.custom,
      seed: opts.seed,
      scenario: opts.scenario,
      emphasis: opts.emphasis,
      timeBudgetMs: opts.timeBudgetMs ?? 20_000,
    }
    w.postMessage(request)
  })
}

/** Release the worker — used when the window is closing. */
export function disposeWorker() {
  worker?.terminate()
  worker = null
}
