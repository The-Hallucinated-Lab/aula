import type { AppState, ProjectFile } from './types'

/**
 * Local persistence.
 *
 * Only the configuration and the constraint state are written — never the
 * solved schedule. Reopening re-solves, so a stored project stays valid across
 * an engine change instead of restoring a timetable the current rules would
 * refuse to produce.
 */

export const STORAGE_KEY = 'aula.project.v1'

export function readPersisted(): Partial<ProjectFile> | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as ProjectFile
    return parsed?.format === 'aula-project' ? parsed : undefined
  } catch {
    return undefined
  }
}

export function persist(
  state: Pick<AppState, 'config' | 'states' | 'activeScenario' | 'setupComplete'>,
) {
  try {
    const payload: ProjectFile = {
      format: 'aula-project',
      version: 1,
      savedAt: new Date().toISOString(),
      config: state.config,
      states: state.states,
      scenario: state.activeScenario,
      setupComplete: state.setupComplete,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // storage full or unavailable — the in-memory session still works
  }
}
