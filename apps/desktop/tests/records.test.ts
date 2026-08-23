import { describe, expect, it } from 'vitest'
import { applyPatch, patchAt, type Clearable } from '../src/lib/records'

/**
 * The two immutable-update helpers.
 *
 * Both exist because the obvious spread has a failure mode that is silent
 * rather than loud, so both are tested on that failure specifically.
 */

interface Row {
  id: string
  name: string
  note?: string
}

const rows: Row[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
]

describe('patchAt', () => {
  it('merges a patch into the entry at the index', () => {
    const next = patchAt(rows, 1, { name: 'Bravo' })
    expect(next[1]).toEqual({ id: 'b', name: 'Bravo' })
  })

  it('does not touch the original list', () => {
    patchAt(rows, 0, { name: 'changed' })
    expect(rows[0]).toEqual({ id: 'a', name: 'Alpha' })
  })

  it('returns a new array, so a store update is seen as a change', () => {
    expect(patchAt(rows, 0, { name: 'Alpha' })).not.toBe(rows)
  })

  /**
   * The reason this helper exists. Written out as
   * `next[i] = { ...next[i], ...patch }`, a stale index — a row deleted between
   * render and click — appends an object made only of the patched keys. That
   * object has no `id`, survives as far as validation, and fails there naming
   * the wrong problem.
   */
  it.each([2, 99, -1])('leaves the list unchanged for out-of-range index %i', (index: number) => {
    const next = patchAt<Row>(rows, index, { name: 'ghost' })
    expect(next).toEqual(rows)
    expect(next).toHaveLength(rows.length)
    expect(next.every(r => typeof r.id === 'string')).toBe(true)
  })

  it('handles an empty list', () => {
    expect(patchAt<Row>([], 0, { name: 'x' })).toEqual([])
  })
})

describe('applyPatch', () => {
  it('sets a value', () => {
    expect(applyPatch({ id: 'a', name: 'Alpha' }, { name: 'Alef' })).toEqual({
      id: 'a',
      name: 'Alef',
    })
  })

  /**
   * Under `exactOptionalPropertyTypes` an absent optional field and one set to
   * `undefined` are different states, and only the first is valid. Spreading
   * produces the second; this produces the first, which is what "the user
   * cleared it" actually means — and what survives a save and load round trip.
   */
  it('removes the key entirely when the value is undefined', () => {
    const cleared = applyPatch<Row>({ id: 'a', name: 'Alpha', note: 'hello' }, { note: undefined })
    expect('note' in cleared).toBe(false)
    expect(JSON.stringify(cleared)).not.toContain('note')
  })

  it('is not the same as spreading undefined', () => {
    // `Partial<Row>` cannot even express this under exactOptionalPropertyTypes,
    // which is the point: `Clearable` is what a form needs to clear a field.
    const clearing: Clearable<Row> = { note: undefined }
    const spread = { id: 'a', name: 'Alpha', note: 'hello', ...clearing }
    expect('note' in spread).toBe(true)
    expect(
      'note' in applyPatch<Row>({ id: 'a', name: 'Alpha', note: 'hello' }, { note: undefined }),
    ).toBe(false)
  })

  it('leaves the original untouched', () => {
    const original: Row = { id: 'a', name: 'Alpha', note: 'hello' }
    applyPatch(original, { note: undefined })
    expect(original.note).toBe('hello')
  })

  it('applies several keys at once, setting and clearing together', () => {
    const next = applyPatch<Row>(
      { id: 'a', name: 'Alpha', note: 'hello' },
      {
        name: 'Alef',
        note: undefined,
      },
    )
    expect(next).toEqual({ id: 'a', name: 'Alef' })
  })

  it('is a no-op for an empty patch', () => {
    expect(applyPatch({ id: 'a', name: 'Alpha' }, {})).toEqual({ id: 'a', name: 'Alpha' })
  })
})
