import { type SetupConfig } from '@aula/core/data/config'
import { prettyRange } from '@aula/core/data/academicCalendar'
import type { Slice } from '../types'
import { applyConfig, withEvents } from '../editing'

/**
 * Term dates and calendar events.
 *
 * Calendar entries live on the config rather than in `overrides` — they describe
 * the year, not a set of records that replaced generated ones.
 */

/** The members of `AppState` this slice is responsible for. */
type Owned = 'addEvent' | 'removeEvent' | 'setTerm' | 'updateEvent'

export const calendarActions: Slice<Owned> = (set, get) => ({
  setTerm(start, end) {
    const state = get()
    const config: SetupConfig = {
      ...state.config,
      calendar: { ...state.config.calendar, termStart: start, termEnd: end },
    }
    applyConfig(set, get, config, 'setup', `Term set to ${prettyRange(start, end)}`)
  },

  addEvent(event) {
    const config = withEvents(get(), list => [...list, event])
    applyConfig(set, get, config, 'setup', `Calendar: added ${event.name}`)
  },

  updateEvent(event) {
    const config = withEvents(get(), list => list.map(e => (e.id === event.id ? event : e)))
    applyConfig(set, get, config, 'setup', `Calendar: updated ${event.name}`)
  },

  removeEvent(id) {
    const state = get()
    const name = state.config.calendar.events.find(e => e.id === id)?.name ?? id
    const config = withEvents(state, list => list.filter(e => e.id !== id))
    applyConfig(set, get, config, 'setup', `Calendar: removed ${name}`)
  },
})
