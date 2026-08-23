import { describe, expect, it } from 'vitest'
import { isValidDate, parseDate, prettyDate } from '../src/data/academicCalendar'

/**
 * Dates.
 *
 * Everything here is UTC epoch-day arithmetic, deliberately: a term that spans
 * a daylight-saving boundary must not gain or lose a teaching date because the
 * machine is in a zone that shifts.
 */

describe('parseDate', () => {
  it('reads an ISO date as a UTC epoch day', () => {
    expect(parseDate('1970-01-01')).toBe(0)
    expect(parseDate('1970-01-02')).toBe(1)
    expect(parseDate('2026-07-20')).toBe(Math.floor(Date.UTC(2026, 6, 20) / 86_400_000))
  })

  it('counts consecutive days as consecutive numbers', () => {
    const a = parseDate('2026-03-28')
    const b = parseDate('2026-03-29')
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    // 29 March 2026 is when most of Europe moves its clocks. Local-time
    // arithmetic would make this difference 0 or 2.
    if (a !== null && b !== null) expect(b - a).toBe(1)
  })

  it('rejects a date that does not exist, which Date.UTC rolls forward silently', () => {
    expect(parseDate('2026-02-30')).toBeNull()
    expect(parseDate('2026-13-01')).toBeNull()
    expect(parseDate('2026-04-31')).toBeNull()
  })

  it('accepts a real leap day and rejects a false one', () => {
    expect(parseDate('2024-02-29')).not.toBeNull()
    expect(parseDate('2026-02-29')).toBeNull()
    expect(parseDate('1900-02-29')).toBeNull()
    expect(parseDate('2000-02-29')).not.toBeNull()
  })

  it.each(['', '2026-7-20', '20-07-2026', '2026/07/20', 'yesterday', '2026-07-20T00:00:00'])(
    'rejects %o as a shape',
    input => {
      expect(parseDate(input)).toBeNull()
    },
  )

  it('rejects a non-string without throwing', () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(parseDate(value as unknown as string)).toBeNull()
    }
  })
})

describe('isValidDate', () => {
  it('agrees with parseDate', () => {
    for (const d of ['2026-07-20', '2026-02-30', 'nonsense', '2024-02-29']) {
      expect(isValidDate(d)).toBe(parseDate(d) !== null)
    }
  })
})

describe('prettyDate', () => {
  it('writes a date the way a person reads it', () => {
    expect(prettyDate('2026-08-19')).toBe('19 Aug 2026')
  })

  it('hands back anything it cannot parse rather than inventing a date', () => {
    expect(prettyDate('not a date')).toBe('not a date')
  })
})
