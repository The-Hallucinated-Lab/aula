/**
 * Names.
 *
 * A generator's most common failure is producing something that compiles but
 * is named wrongly — `StepstepGrid`, a rule key with a hyphen in it, a page
 * whose route does not match its file. These are the conversions, in one
 * place, with the rules each target actually imposes.
 */

/** A user-supplied name, reduced to words. Accepts kebab, snake, camel or spaced. */
export function words(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .map(w => w.trim())
    .filter(w => w !== '')
}

/** `roomTurnover` — a rule key, a store action, a variable. */
export const camel = (input: string): string =>
  words(input)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0]?.toUpperCase() + w.slice(1).toLowerCase()))
    .join('')

/** `RoomTurnover` — a component, a type, a React file name. */
export const pascal = (input: string): string => {
  const c = camel(input)
  return c[0] ? c[0].toUpperCase() + c.slice(1) : c
}

/** `room-turnover` — a module file name, a route segment. */
export const kebab = (input: string): string =>
  words(input)
    .map(w => w.toLowerCase())
    .join('-')

/** `Room turnover` — a heading, a nav label. */
export const sentence = (input: string): string => {
  const w = words(input)
  const first = w[0]
  if (!first) return ''
  return [
    first[0]?.toUpperCase() + first.slice(1).toLowerCase(),
    ...w.slice(1).map(x => x.toLowerCase()),
  ].join(' ')
}

export class InvalidName extends Error {}

/**
 * Reject a name before anything is written.
 *
 * A generator that half-succeeds leaves a file the developer did not ask for
 * and a registration that points at nothing, and the second is much harder to
 * notice than the first. Everything is validated up front.
 */
export function requireName(input: string | undefined, what: string): string {
  if (input === undefined || input.trim() === '') {
    throw new InvalidName(`a name is required: aula new ${what} <name>`)
  }
  if (!/^[A-Za-z][A-Za-z0-9 _.-]*$/.test(input.trim())) {
    throw new InvalidName(
      `"${input}" is not a usable name — start with a letter, then letters, digits, spaces, hyphens, dots or underscores`,
    )
  }
  if (words(input).length === 0) {
    throw new InvalidName(`"${input}" has no words in it`)
  }
  return input.trim()
}
