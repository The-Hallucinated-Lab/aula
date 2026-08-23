import { describe, expect, it } from 'vitest'
import { earliestAcross, earliestDay, longestRun } from '../src/engine/rules/kit'
import { IMPLEMENTED, RULES, isImplemented, unimplementedRules } from '../src/engine/rules'
import { CATALOGUE } from '../src/data/constraints/catalogue'

/**
 * The rule registry and the helpers its modules share.
 *
 * The registry moved from one 1,465-line object to twelve modules composed by
 * spread. The composition is only safe if the keys are disjoint, so that is
 * asserted here rather than assumed.
 */

describe('longestRun', () => {
  it('counts the longest stretch of consecutive days', () => {
    expect(longestRun([0, 1, 2, 4])).toBe(3)
    expect(longestRun([0, 2, 4])).toBe(1)
    expect(longestRun([1, 2, 3, 4, 5])).toBe(5)
  })

  it('does not assume the input is sorted', () => {
    // Both callers append today's day to a set, which has no order.
    expect(longestRun([4, 1, 0, 2])).toBe(3)
  })

  it('is zero for nothing and one for a single day', () => {
    expect(longestRun([])).toBe(0)
    expect(longestRun([3])).toBe(1)
  })

  it('does not mutate its input', () => {
    const days = [4, 1, 0]
    longestRun(days)
    expect(days).toEqual([4, 1, 0])
  })

  it('treats a repeated day as one day, not a run', () => {
    expect(longestRun([2, 2, 2])).toBe(1)
  })
})

describe('earliestDay', () => {
  it('finds the minimum', () => {
    expect(earliestDay([4, 1, 3])).toBe(1)
  })

  it('is undefined for nothing, rather than Infinity', () => {
    // `Math.min()` with no arguments is Infinity, which would read as "there is
    // a lecture, infinitely far away" to every caller.
    expect(earliestDay([])).toBeUndefined()
  })
})

describe('earliestAcross', () => {
  it('finds the minimum across several sets without flattening them', () => {
    expect(earliestAcross([new Set([4, 5]), new Set([2, 9])])).toBe(2)
  })

  it('is undefined when every set is empty', () => {
    expect(earliestAcross([new Set(), new Set()])).toBeUndefined()
    expect(earliestAcross([])).toBeUndefined()
  })

  it('agrees with the spread-and-flatten form it replaced', () => {
    const sets = [new Set([3, 7]), new Set<number>(), new Set([1, 9])]
    const flattened = sets.flatMap(s => [...s])
    expect(earliestAcross(sets)).toBe(earliestDay(flattened))
  })
})

describe('the registry', () => {
  it('composes twelve modules without a key collision', () => {
    // A duplicate key would be silently overwritten by spread order, so the
    // count is what proves the modules are disjoint.
    const declared = Object.keys(RULES)
    expect(new Set(declared).size).toBe(declared.length)
  })

  it('has every declared rule marked implemented', () => {
    for (const key of Object.keys(RULES)) {
      expect(IMPLEMENTED.has(key as never), key).toBe(true)
    }
  })

  it('implements every rule the catalogue references', () => {
    expect(unimplementedRules(CATALOGUE.map(c => c.rule))).toEqual([])
  })

  it('treats an absent rule as not implemented', () => {
    expect(isImplemented(undefined)).toBe(false)
    expect(isImplemented('notARule' as never)).toBe(false)
  })

  it('gives every rule exactly one kind of behaviour', () => {
    // `check` gates a hard placement, `cost` scores a soft one, `audit` looks at
    // the whole schedule. A rule doing two of them would be counted twice in
    // every report the app produces.
    for (const [key, impl] of Object.entries(RULES)) {
      if (!impl) continue
      const kinds = [impl.check, impl.cost, impl.audit].filter(Boolean).length
      expect(kinds, key).toBe(1)
    }
  })
})
