/**
 * The in-app activity log's identity and clock.
 *
 * A module-level counter rather than a field on the store: the id only has to
 * be unique within a session, and keeping it out of the state means appending
 * an entry does not have to read and write a sequence number as well.
 */

let nextId = 1

export const nextActivityId = () => nextId++

/** Wall-clock time as the user's locale writes it, to the minute. */
export const now = () =>
  new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
