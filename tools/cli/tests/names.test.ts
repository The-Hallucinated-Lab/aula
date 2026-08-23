import { describe, expect, it } from 'vitest'
import {
  InvalidName,
  camel,
  kebab,
  pascal,
  requireName,
  sentence,
  words,
} from '../src/lib/names.ts'

/**
 * Name conversion.
 *
 * A generator's most common failure is producing something that compiles but
 * is named wrongly, and the resulting file looks plausible enough to survive
 * review. The awkward inputs are the point of these cases.
 */

describe('words', () => {
  it.each([
    ['roomTurnover', ['room', 'Turnover']],
    ['room-turnover', ['room', 'turnover']],
    ['room_turnover', ['room', 'turnover']],
    ['Room Turnover', ['Room', 'Turnover']],
    ['RoomTurnover', ['Room', 'Turnover']],
    ['room.turnover', ['room', 'turnover']],
  ])('splits %o', (input, expected) => {
    expect(words(input)).toEqual(expected)
  })

  it('splits a digit boundary the way a reader would', () => {
    expect(words('step2Rooms')).toEqual(['step2', 'Rooms'])
  })

  it('drops empty segments rather than producing blank words', () => {
    expect(words('  a -- b  ')).toEqual(['a', 'b'])
  })
})

describe('camel', () => {
  it.each([
    ['room turnover', 'roomTurnover'],
    ['room-turnover', 'roomTurnover'],
    ['RoomTurnover', 'roomTurnover'],
    ['roomTurnover', 'roomTurnover'],
    ['ROOM TURNOVER', 'roomTurnover'],
  ])('%o -> %o', (input, expected) => {
    expect(camel(input)).toBe(expected)
  })

  it('is idempotent', () => {
    expect(camel(camel('room-turnover'))).toBe('roomTurnover')
  })
})

describe('pascal', () => {
  it.each([
    ['reports', 'Reports'],
    ['data studio', 'DataStudio'],
    ['data-studio', 'DataStudio'],
    ['DataStudio', 'DataStudio'],
  ])('%o -> %o', (input, expected) => {
    expect(pascal(input)).toBe(expected)
  })

  it('never doubles a prefix, which is the classic generator bug', () => {
    // `StepStepGrid` is what naive concatenation produces.
    expect(pascal('StepGrid')).toBe('StepGrid')
  })
})

describe('kebab', () => {
  it.each([
    ['DataStudio', 'data-studio'],
    ['room turnover', 'room-turnover'],
    ['Reports', 'reports'],
  ])('%o -> %o', (input, expected) => {
    expect(kebab(input)).toBe(expected)
  })

  it('produces a route segment with nothing a URL would escape', () => {
    expect(kebab('Term Setup')).toMatch(/^[a-z0-9-]+$/)
  })
})

describe('sentence', () => {
  it('capitalises only the first word, as a label should', () => {
    expect(sentence('roomTurnoverGap')).toBe('Room turnover gap')
    expect(sentence('DATA STUDIO')).toBe('Data studio')
  })
})

describe('requireName', () => {
  it('accepts an ordinary name', () => {
    expect(requireName('Reports', 'page')).toBe('Reports')
  })

  it('trims', () => {
    expect(requireName('  Reports  ', 'page')).toBe('Reports')
  })

  it.each([
    ['nothing', undefined],
    ['an empty string', ''],
    ['only spaces', '   '],
    ['a leading digit', '2Reports'],
    ['a path separator', 'pages/Reports'],
    ['a path traversal', '../Reports'],
    ['a shell metacharacter', 'Reports;rm -rf /'],
    ['a quote', "Reports'"],
    ['an angle bracket', '<Reports>'],
  ])('refuses %s', (_label, input) => {
    expect(() => requireName(input, 'page')).toThrow(InvalidName)
  })

  it('names the command in the refusal, so the message is actionable', () => {
    expect(() => requireName(undefined, 'rule')).toThrow(/aula new rule <name>/)
  })
})
