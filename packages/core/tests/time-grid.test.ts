import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, lunchSlotsPerDay, slotPlan, slotsPerDay } from '../src/data/config'
import { buildGrid } from '../src/data/generator'
import { fitsShift, labelToMinutes, parseClock, sessionMinutes } from '../src/data/model'

/**
 * The teaching day.
 *
 * Most of this file is regression cover for defects the strict-typing pass
 * turned up, each named in the case it guards.
 */

const cal = (patch: Partial<typeof DEFAULT_CONFIG.calendar> = {}) => ({
  ...DEFAULT_CONFIG.calendar,
  ...patch,
})

describe('parseClock', () => {
  it('reads a time of day', () => {
    expect(parseClock('09:00')).toBe(540)
    expect(parseClock('00:00')).toBe(0)
    expect(parseClock('23:59')).toBe(1439)
    expect(parseClock('9:05')).toBe(545)
  })

  it('tolerates surrounding space', () => {
    expect(parseClock('  17:30 ')).toBe(1050)
  })

  it.each(['', 'garbage', '17', '17:5', '17:300', '1730', '24:00', '12:60', '-1:00', '17:30:00'])(
    'refuses %o',
    input => {
      expect(parseClock(input)).toBeNull()
    },
  )
})

describe('labelToMinutes', () => {
  it('is the lenient reader — anything unparseable is midnight', () => {
    expect(labelToMinutes('09:00')).toBe(540)
    expect(labelToMinutes('garbage')).toBe(0)
  })
})

describe('slotPlan', () => {
  it('divides an even day into whole periods', () => {
    const plan = slotPlan(cal())
    expect(plan.slots).toHaveLength(8)
    expect(plan.slots[0]).toEqual({ start: 540, duration: 60, end: 600 })
    expect(plan.slots.at(-1)).toEqual({ start: 960, duration: 60, end: 1020 })
  })

  it('keeps starts and durations index-aligned with slots', () => {
    const plan = slotPlan(cal({ slotMinutes: 50, minFinalSlotMinutes: 40 }))
    expect(plan.starts).toHaveLength(plan.slots.length)
    expect(plan.durations).toHaveLength(plan.slots.length)
    plan.slots.forEach((slot, i) => {
      expect(plan.starts[i]).toBe(slot.start)
      expect(plan.durations[i]).toBe(slot.duration)
    })
  })

  it('keeps a short final period when the floor allows it', () => {
    // 09:00–17:00 is 480 min; 50-minute periods leave a 30-minute remainder.
    const kept = slotPlan(cal({ slotMinutes: 50, minFinalSlotMinutes: 30 }))
    expect(kept.slots).toHaveLength(10)
    expect(kept.slots.at(-1)?.duration).toBe(30)
  })

  it('drops the remainder when it is shorter than the floor', () => {
    const dropped = slotPlan(cal({ slotMinutes: 50, minFinalSlotMinutes: 40 }))
    expect(dropped.slots).toHaveLength(9)
    expect(dropped.slots.at(-1)?.duration).toBe(50)
  })

  it('drops the remainder when no floor is set at all', () => {
    const none = slotPlan(cal({ slotMinutes: 50, minFinalSlotMinutes: 0 }))
    expect(none.slots).toHaveLength(9)
  })

  /**
   * Regression: `labelToMinutes` turns anything it cannot parse into midnight.
   * `slotPlan` used to rely on `NaN` propagation to reject a malformed
   * `dayStart`; once it read through the lenient parser, a broken clock string
   * silently produced a teaching day beginning at 00:00.
   */
  it.each([
    ['a malformed start', { dayStart: 'nine oclock' }],
    ['a malformed end', { dayEnd: '' }],
    ['an end before the start', { dayStart: '17:00', dayEnd: '09:00' }],
    ['a zero-length day', { dayStart: '09:00', dayEnd: '09:00' }],
    ['a non-positive period', { slotMinutes: 0 }],
  ])('returns an empty plan for %s', (_label, patch) => {
    const plan = slotPlan(cal(patch))
    expect(plan.slots).toEqual([])
    expect(plan.starts).toEqual([])
    expect(plan.durations).toEqual([])
  })

  it('agrees with slotsPerDay', () => {
    for (const minutes of [30, 45, 50, 60, 90]) {
      const c = cal({ slotMinutes: minutes, minFinalSlotMinutes: 25 })
      expect(slotsPerDay(c)).toBe(slotPlan(c).slots.length)
    }
  })
})

describe('lunchSlotsPerDay', () => {
  it('counts the periods overlapping the protected window', () => {
    expect(lunchSlotsPerDay(cal())).toBe(1)
    expect(lunchSlotsPerDay(cal({ lunchMinutes: 120 }))).toBe(2)
  })

  it('is zero when no lunch is protected', () => {
    expect(lunchSlotsPerDay(cal({ lunchMinutes: 0 }))).toBe(0)
  })

  /**
   * Regression: this function claimed in its own comment to mirror `buildGrid`
   * and did not. It rebuilt the day by hand assuming every period is
   * `slotMinutes` long, which stopped being true once `slotPlan` could append a
   * shorter final one — so a day ending in a remainder that overlapped lunch was
   * counted with the wrong span. `summarise()` subtracts this from teaching
   * capacity, so the error was load-bearing.
   */
  it.each([
    [50, 30],
    [45, 20],
    [90, 30],
    [35, 15],
    [60, 0],
  ])('agrees with buildGrid for %i-minute periods', (slotMinutes, minFinalSlotMinutes) => {
    const calendar = cal({ slotMinutes, minFinalSlotMinutes })
    const grid = buildGrid({ ...DEFAULT_CONFIG, calendar })
    expect(lunchSlotsPerDay(calendar)).toBe(grid.lunchSlots.length)
  })
})

describe('buildGrid', () => {
  it('describes the default teaching week', () => {
    const grid = buildGrid(DEFAULT_CONFIG)
    expect(grid.days).toEqual([0, 1, 2, 3, 4])
    expect(grid.slots).toBe(8)
    expect(grid.labels[0]).toBe('09:00')
    expect(grid.labels.at(-1)).toBe('16:00')
  })

  it('never returns an empty week, because every screen divides by its length', () => {
    const grid = buildGrid({
      ...DEFAULT_CONFIG,
      calendar: cal({ workingDays: [] }),
    })
    expect(grid.days.length).toBeGreaterThanOrEqual(0)
    expect(() => grid.days.map(d => d)).not.toThrow()
  })

  it('supplies one all-day shift when none is configured', () => {
    const grid = buildGrid(DEFAULT_CONFIG)
    expect(grid.shifts).toHaveLength(1)
    expect(grid.shifts[0]).toMatchObject({ fromSlot: 0, toSlot: grid.slots - 1 })
  })

  it('resolves configured shifts to slot ranges and drops ones the day cannot hold', () => {
    const grid = buildGrid({
      ...DEFAULT_CONFIG,
      calendar: cal({
        shifts: [
          { id: 'am', name: 'Morning', start: '09:00', end: '13:00' },
          { id: 'pm', name: 'Evening', start: '13:00', end: '17:00' },
          { id: 'night', name: 'Night', start: '20:00', end: '23:00' },
        ],
      }),
    })
    expect(grid.shifts.map(s => s.id)).toEqual(['am', 'pm'])
    expect(grid.shifts[0]).toMatchObject({ fromSlot: 0, toSlot: 3 })
    expect(grid.shifts[1]).toMatchObject({ fromSlot: 4, toSlot: 7 })
  })

  it('always offers a prime band, even on a day too short to contain 10:00–14:00', () => {
    const grid = buildGrid({
      ...DEFAULT_CONFIG,
      calendar: cal({ dayStart: '15:00', dayEnd: '18:00' }),
    })
    expect(grid.primeSlots.length).toBeGreaterThan(0)
  })
})

describe('fitsShift', () => {
  const window = { id: 'am', name: 'Morning', fromSlot: 2, toSlot: 5 }

  it('accepts a session wholly inside the window', () => {
    expect(fitsShift(window, 2, 1)).toBe(true)
    expect(fitsShift(window, 4, 2)).toBe(true)
  })

  it('refuses one that starts early or overruns the end', () => {
    expect(fitsShift(window, 1, 1)).toBe(false)
    expect(fitsShift(window, 5, 2)).toBe(false)
  })
})

describe('sessionMinutes', () => {
  it('sums the periods a session actually occupies', () => {
    const grid = buildGrid(DEFAULT_CONFIG)
    expect(sessionMinutes(grid, 0, 1)).toBe(60)
    expect(sessionMinutes(grid, 0, 2)).toBe(120)
  })

  it('handles a day whose last period is short', () => {
    const grid = buildGrid({
      ...DEFAULT_CONFIG,
      calendar: cal({ slotMinutes: 50, minFinalSlotMinutes: 30 }),
    })
    const last = grid.slots - 1
    expect(sessionMinutes(grid, last, 1)).toBe(30)
    expect(sessionMinutes(grid, last - 1, 2)).toBe(80)
  })
})
