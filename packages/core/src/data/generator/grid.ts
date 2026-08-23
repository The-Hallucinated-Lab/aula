/**
 * Generator — turns a `SetupConfig` into a schedulable `Institution`.
 *
 * Two rules govern this file:
 *  1. Deterministic. The same config and seed always produce the same
 *     institution, so a saved project reopens identically.
 *  2. Never emit a structurally impossible demand. If the configured rooms
 *     have no fume hood, no course is given a fume-hood requirement — the
 *     solver should fail on real scarcity, never on generator fiction.
 */

import type { SetupConfig } from '../config'
import { slotPlan, slotsPerDay } from '../config'
import { lostWeekdays } from '../academicCalendar'
import {
  labelToMinutes,
  minutesToLabel,
  type ShiftWindow,
  type EmploymentType,
  type StaffRank,
  type TimeGrid,
} from '../model'

/**
 * The teaching-day grid.
 *
 * Turns clock times into slot indices once, so nothing downstream has to parse
 * "17:30" again. A weekday every one of whose dates is a holiday is dropped
 * here rather than penalised later — that is what makes `holidayBlackout` a
 * real constraint instead of a tautology.
 */

/**
 * The contract that usually goes with a designation.
 *
 * Rank and employment are different things — a professor can be part-time —
 * so this is a default the record editor can override, not a derivation.
 */
export const employmentFor = (rank: StaffRank): EmploymentType =>
  rank === 'Visiting'
    ? 'Visiting'
    : rank === 'Adjunct'
      ? 'Part-time'
      : rank === 'Teaching Assistant'
        ? 'Contract'
        : 'Full-time'

/** The positions of the entries a predicate accepts, in order. */
function indicesWhere<T>(xs: readonly T[], keep: (value: T) => boolean): number[] {
  const out: number[] = []
  for (const [index, value] of xs.entries()) if (keep(value)) out.push(index)
  return out
}

export function buildGrid(cfg: SetupConfig): TimeGrid {
  const cal = cfg.calendar
  const count = Math.max(0, slotsPerDay(cal))
  /* A weekday every one of whose dates falls in a holiday is not a thin day,
     it is not a teaching day. Dropping it here rather than penalising it later
     is what makes `holidayBlackout` (C010) a real constraint instead of a
     tautology: nothing can be offered on a day the grid does not contain. */
  const lost = lostWeekdays(cal, cal.workingDays, count)

  const { slots } = slotPlan(cal)
  const labels = slots.map(s => minutesToLabel(s.start))

  const lunchFrom = labelToMinutes(cal.lunchStart)
  const lunchTo = lunchFrom + cal.lunchMinutes
  const lunchSlots = indicesWhere(slots, s => s.start < lunchTo && s.end > lunchFrom)

  const eveningMins = labelToMinutes(cal.eveningStart)
  const firstEvening = slots.findIndex(s => s.start >= eveningMins)
  const eveningFrom = firstEvening >= 0 ? firstEvening : count

  const earlyMins = labelToMinutes(cal.earlyMorningUntil)
  const earlyUntil = slots.filter(s => s.start < earlyMins).length

  const primeSlots = indicesWhere(slots, s => s.start >= 10 * 60 && s.end <= 14 * 60)

  /* Never return an empty week: a calendar that cancels everything is a
     configuration error `summarise()` already names, and a grid with no days
     would make every downstream screen divide by zero instead. */
  const surviving = cal.workingDays.filter(d => !lost.includes(d))
  const days = (surviving.length > 0 ? surviving : cal.workingDays)
    .slice()
    .toSorted((a, b) => a - b)

  /* Shift windows, resolved from clock times to slot indices.
     A configuration with no shifts is not "shifts off" — it is one shift that
     happens to span the whole day. Keeping exactly one code path means the
     confinement check in the solver never needs a null case. */
  const shifts: ShiftWindow[] = []
  for (const s of cal.shifts) {
    const from = labelToMinutes(s.start)
    const to = labelToMinutes(s.end)
    const inside = indicesWhere(slots, slot => slot.start >= from && slot.end <= to)
    const fromSlot = inside[0]
    const toSlot = inside.at(-1)
    if (fromSlot !== undefined && toSlot !== undefined) {
      shifts.push({ id: s.id, name: s.name, fromSlot, toSlot })
    }
  }
  if (shifts.length === 0 && count > 0) {
    shifts.push({ id: 'all-day', name: 'Full day', fromSlot: 0, toSlot: count - 1 })
  }

  return {
    days,
    slots: count,
    labels,
    starts: slots.map(s => s.start),
    durations: slots.map(s => s.duration),
    shifts,
    slotMinutes: cal.slotMinutes,
    passingMinutes: cal.passingMinutes,
    lunchSlots,
    eveningFrom,
    earlyUntil,
    /* Every day needs a "prime" band for the rules that prefer it. If the
       configured day is too short to contain 10:00-14:00, fall back to the
       second, third and fourth periods rather than leaving it empty. */
    primeSlots: primeSlots.length > 0 ? primeSlots : slots.map((_, i) => i).slice(1, 4),
  }
}
