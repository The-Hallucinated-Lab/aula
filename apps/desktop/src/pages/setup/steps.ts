import type { SetupConfig } from '@aula/core/data/config'

/**
 * The wizard's vocabulary.
 *
 * Separated from the shell so a step module can name the step it is without
 * importing the component that renders it — which would be a cycle.
 */

export type StepId =
  | 'identity'
  | 'hierarchy'
  | 'grid'
  | 'rooms'
  | 'profiles'
  | 'programs'
  | 'staff'
  | 'term'
  | 'review'

/**
 * Two setups, not one.
 *
 * The review's first structural point: most of what the old six-step wizard
 * asked for does not change from one term to the next. How many floors a block
 * has, which schools sit under which faculty, when the morning shift ends —
 * these are properties of the institution, entered once. Sections, staffing,
 * curriculum policy and term dates are what a timetable manager actually
 * revisits each session.
 *
 * Mixing them meant re-reading the whole institution every term to change four
 * numbers, and put the settings with the widest blast radius directly in the
 * path of routine work. They are now separate screens, and the constant one is
 * locked by default.
 */
export type SetupMode = 'institution' | 'term'

export const INSTITUTION_STEPS: { id: StepId; name: string; blurb: string }[] = [
  { id: 'identity', name: 'Identity', blurb: 'What the institution is called' },
  { id: 'hierarchy', name: 'Hierarchy', blurb: 'Faculties, schools and departments' },
  { id: 'grid', name: 'Teaching day', blurb: 'Days, hours, shifts and the slot grid' },
  { id: 'rooms', name: 'Rooms', blurb: 'Blocks, floors and specialised labs' },
]

export const TERM_STEPS: { id: StepId; name: string; blurb: string }[] = [
  { id: 'profiles', name: 'Curriculum', blurb: 'Which batch policy this year follows' },
  { id: 'programs', name: 'Programmes', blurb: 'Students, sections and course load' },
  { id: 'staff', name: 'Staff', blurb: 'Headcount, designations and load' },
  { id: 'term', name: 'Term', blurb: 'Dates and the academic calendar' },
  { id: 'review', name: 'Review', blurb: 'Feasibility before you solve' },
]

export const STEPS_FOR: Record<SetupMode, { id: StepId; name: string; blurb: string }[]> = {
  institution: INSTITUTION_STEPS,
  term: TERM_STEPS,
}

/**
 * Where each wizard opens.
 *
 * Named rather than read as `STEPS[0].id` so the entry point is a value that
 * exists by declaration; the step lists are ordinary arrays and the compiler
 * cannot know they are non-empty.
 */
export const FIRST_STEP: Record<SetupMode, StepId> = {
  institution: 'identity',
  term: 'profiles',
}

/**
 * A fresh id for a row the user just added.
 *
 * The timestamp keeps ids unique across sessions and the counter keeps them
 * unique within one, so adding three buildings in the same millisecond still
 * produces three distinct keys.
 */
let uid = 1
export const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${uid++}`

/** Yearly setup — what a timetable manager revisits each session. */

/**
 * What every step receives.
 *
 * `patch` is a partial update rather than a setter for the whole config: a step
 * owns a handful of fields and should not be able to overwrite the rest by
 * spreading a stale copy.
 */
export interface StepProps {
  config: SetupConfig
  patch: (p: Partial<SetupConfig>) => void
}
