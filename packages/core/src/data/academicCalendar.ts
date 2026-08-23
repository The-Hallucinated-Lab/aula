/**
 * Academic calendar — dated events resolved against the repeating week.
 *
 * A timetable is a week that repeats; a calendar is a run of dates. Pretending
 * otherwise is how a planner ends up promising sixteen Fridays and delivering
 * thirteen. This module is the single place the two are reconciled, and it only
 * claims the three effects a weekly grid can honestly carry:
 *
 *   1. ATTRITION — a dated closure removes one occurrence of a weekday. The
 *      grid does not change; how many times a course actually meets does.
 *   2. LOST DAYS — a weekday that loses every one of its dates is not a
 *      teaching day at all, and is dropped from the grid.
 *   3. BLACKOUTS — an event marked as repeating weekly falls in the same place
 *      in every week, so it can be enforced on the grid as blocked cells.
 *
 * Everything is computed in UTC from `yyyy-mm-dd` strings. Local-time parsing
 * silently shifts a date across a day boundary for anyone east of Greenwich,
 * which would move a holiday onto the wrong weekday for this application's
 * entire intended audience.
 */

import type { CalendarConfig } from './config'
import type {
  AcademicCalendar,
  CalendarBlackout,
  CalendarEvent,
  TimeGrid,
  WeekdayImpact,
} from './model'

/* ------------------------------------------------------------------ *
 * Dates
 * ------------------------------------------------------------------ */

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** `yyyy-mm-dd` -> UTC epoch day number, or null if it is not a real date. */
export function parseDate(iso: string): number | null {
  if (typeof iso !== 'string' || !ISO.test(iso)) return null
  const [y, m, d] = iso.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d)
  const back = new Date(t)
  // rejects 2026-02-30 and friends, which Date.UTC silently rolls forward
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d)
    return null
  return Math.floor(t / 86_400_000)
}

export const isValidDate = (iso: string): boolean => parseDate(iso) !== null

/** UTC epoch day number -> `yyyy-mm-dd`. */
export function formatDate(dayNumber: number): string {
  return new Date(dayNumber * 86_400_000).toISOString().slice(0, 10)
}

/** Weekday of an epoch day number as a DAY_NAMES index (0 = Monday). */
export const weekdayOf = (dayNumber: number): number =>
  (new Date(dayNumber * 86_400_000).getUTCDay() + 6) % 7

/** Shift an ISO date by whole days; returns the input if it is not a date. */
export function addDays(iso: string, days: number): string {
  const n = parseDate(iso)
  return n === null ? iso : formatDate(n + days)
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "2026-08-19" -> "19 Aug 2026". Falls back to the raw string. */
export function prettyDate(iso: string): string {
  const n = parseDate(iso)
  if (n === null) return iso
  const d = new Date(n * 86_400_000)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`
}

/** "19 Aug 2026" or "19–23 Aug 2026" for a range. */
export function prettyRange(start: string, end: string): string {
  if (start === end) return prettyDate(start)
  return `${prettyDate(start)} – ${prettyDate(end)}`
}

export const monthName = (month: number): string => MONTHS[month] ?? ''

/** Every `yyyy-mm-dd` in an inclusive range, capped so a typo cannot hang. */
export function datesBetween(start: string, end: string, cap = 800): string[] {
  const a = parseDate(start)
  const b = parseDate(end)
  if (a === null || b === null || b < a) return []
  const out: string[] = []
  for (let d = a; d <= b && out.length < cap; d++) out.push(formatDate(d))
  return out
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

let seq = 0
export const newEventId = () => `ev-${Date.now().toString(36)}${seq++}`

export const blankEvent = (date: string): CalendarEvent => ({
  id: newEventId(),
  name: 'New holiday',
  kind: 'holiday',
  start: date,
  end: date,
  blocksTeaching: true,
  weekly: false,
  fromSlot: -1,
  toSlot: -1,
  note: '',
})

/**
 * Common Indian institutional closures, offered as one-click additions.
 *
 * Dates move year to year (most follow lunar calendars), so these carry no
 * date: the user picks the day. They exist to save typing, not to assert when
 * a festival falls.
 */
export const HOLIDAY_PRESETS: { name: string; kind: CalendarEvent['kind'] }[] = [
  { name: 'Republic Day', kind: 'holiday' },
  { name: 'Holi', kind: 'observance' },
  { name: 'Good Friday', kind: 'observance' },
  { name: 'Eid al-Fitr', kind: 'observance' },
  { name: 'Independence Day', kind: 'holiday' },
  { name: 'Gandhi Jayanti', kind: 'holiday' },
  { name: 'Dussehra', kind: 'observance' },
  { name: 'Diwali', kind: 'observance' },
  { name: 'Guru Nanak Jayanti', kind: 'observance' },
  { name: 'Christmas', kind: 'observance' },
  { name: 'Mid-term break', kind: 'break' },
  { name: 'Internal assessment week', kind: 'exam' },
  { name: 'Annual convocation', kind: 'event' },
  { name: 'Cultural fest', kind: 'event' },
  { name: 'Weekly assembly', kind: 'event' },
]

/** Does this event stop teaching outright, rather than merely discouraging it? */
export const cancelsTeaching = (e: CalendarEvent): boolean =>
  e.blocksTeaching && e.kind !== 'observance'

/* ------------------------------------------------------------------ *
 * Resolution
 * ------------------------------------------------------------------ */

/**
 * Weekly blackout cells for a set of teaching days and a slot count.
 *
 * Only events flagged `weekly` reach the repeating grid — a one-off closure on
 * the 14th cannot be expressed as "every Tuesday", and pretending it can would
 * delete three weeks of teaching to model one lost afternoon.
 */
export function weeklyBlackoutCells(
  events: CalendarEvent[],
  days: number[],
  slots: number,
): CalendarBlackout[] {
  const out: CalendarBlackout[] = []
  const claimed = new Set<string>()
  if (slots <= 0) return out

  for (const e of events) {
    if (!e.weekly || !e.blocksTeaching) continue
    const start = parseDate(e.start)
    if (start === null) continue
    const day = weekdayOf(start)
    if (!days.includes(day)) continue

    const from = e.fromSlot < 0 ? 0 : Math.min(Math.max(0, e.fromSlot), slots - 1)
    const to = e.toSlot < 0 ? slots - 1 : Math.min(Math.max(e.toSlot, from), slots - 1)
    // an observance discourages mandatory teaching; it does not shut the campus
    const coreOnly = e.kind === 'observance'

    for (let slot = from; slot <= to; slot++) {
      // first event to claim a cell owns it, so the reason shown stays stable
      const dedupe = `${day}:${slot}:${coreOnly}`
      if (claimed.has(dedupe)) continue
      claimed.add(dedupe)
      out.push({
        key: `${day}:${slot}`,
        day,
        slot,
        eventId: e.id,
        name: e.name,
        kind: e.kind,
        coreOnly,
      })
    }
  }
  return out
}

/**
 * How many dates each teaching weekday keeps once dated closures are removed.
 *
 * Returns one row per entry of `days`, in the order given. Without usable term
 * dates every row reads zero and `dated` is false at the call site — the caller
 * falls back to the configured week count rather than claiming a term with no
 * teaching in it.
 */
export function weekdayAttrition(
  cal: CalendarConfig,
  days: number[],
  slots: number,
): WeekdayImpact[] {
  const rows: WeekdayImpact[] = days.map(day => ({
    day,
    totalDates: 0,
    lostDates: 0,
    teachingDates: 0,
    causes: [],
  }))
  const startN = parseDate(cal.termStart)
  const endN = parseDate(cal.termEnd)
  if (startN === null || endN === null || endN < startN) return rows

  const cancelled = new Map<string, string>() // iso date -> event name
  for (const e of cal.events ?? []) {
    if (!e || e.weekly || !cancelsTeaching(e) || !isValidDate(e.start)) continue
    // a part-day event costs slots, not the whole date
    const wholeDay = e.fromSlot < 0 || (e.fromSlot === 0 && (e.toSlot < 0 || e.toSlot >= slots - 1))
    if (!wholeDay) continue
    for (const date of datesBetween(e.start, e.end || e.start)) {
      const n = parseDate(date) as number
      if (n < startN || n > endN) continue
      if (!cancelled.has(date)) cancelled.set(date, e.name)
    }
  }

  const byDay = new Map(rows.map(r => [r.day, r]))
  for (let n = startN; n <= endN; n++) {
    const row = byDay.get(weekdayOf(n))
    if (!row) continue
    row.totalDates++
    const cause = cancelled.get(formatDate(n))
    if (cause === undefined) {
      row.teachingDates++
    } else {
      row.lostDates++
      if (!row.causes.includes(cause)) row.causes.push(cause)
    }
  }
  return rows
}

/** Teaching weekdays the calendar wipes out completely. */
export function lostWeekdays(cal: CalendarConfig, days: number[], slots: number): number[] {
  return weekdayAttrition(cal, days, slots)
    .filter(i => i.totalDates > 0 && i.teachingDates === 0)
    .map(i => i.day)
}

/**
 * Resolve the configured calendar against a time grid.
 *
 * `grid.days` is the teaching week the calendar is measured against; this
 * function reports which of those days survive, it never mutates the grid.
 */
export function buildAcademicCalendar(cal: CalendarConfig, grid: TimeGrid): AcademicCalendar {
  const startN = parseDate(cal.termStart)
  const endN = parseDate(cal.termEnd)
  const dated = startN !== null && endN !== null && endN >= startN

  const events = [...(cal.events ?? [])]
    .filter(e => e && typeof e.id === 'string' && isValidDate(e.start))
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))

  const blackouts = weeklyBlackoutCells(events, grid.days, grid.slots)
  const impact = weekdayAttrition(cal, grid.days, grid.slots)

  return {
    termStart: cal.termStart,
    termEnd: cal.termEnd,
    events,
    blackouts,
    impact,
    lostDays: dated
      ? impact.filter(i => i.totalDates > 0 && i.teachingDates === 0).map(i => i.day)
      : [],
    teachingDates: dated ? impact.reduce((a, i) => a + i.teachingDates, 0) : 0,
    weeks: dated
      ? Math.max(1, Math.ceil(((endN as number) - (startN as number) + 1) / 7))
      : Math.max(0, cal.termWeeks),
    dated,
  }
}

/* ------------------------------------------------------------------ *
 * Reading the resolved calendar
 * ------------------------------------------------------------------ */

/** How many times a weekly meeting on this day actually happens in the term. */
export function meetingsInTerm(calendar: AcademicCalendar, day: number): number {
  const row = calendar.impact.find(i => i.day === day)
  if (!row) return calendar.dated ? 0 : Math.max(0, calendar.weeks)
  return calendar.dated ? row.teachingDates : Math.max(0, calendar.weeks)
}

/** Blackouts covering any slot of `[slot, slot + length)` on `day`. */
export function blackoutsCovering(
  calendar: AcademicCalendar,
  day: number,
  slot: number,
  length: number,
): CalendarBlackout[] {
  if (calendar.blackouts.length === 0) return []
  return calendar.blackouts.filter(b => b.day === day && b.slot >= slot && b.slot < slot + length)
}

/** Events that touch a given date, in calendar order. */
export function eventsOn(calendar: AcademicCalendar, iso: string): CalendarEvent[] {
  return calendar.events.filter(e => {
    if (e.weekly) {
      const n = parseDate(iso)
      const s = parseDate(e.start)
      return n !== null && s !== null && n >= s && weekdayOf(n) === weekdayOf(s)
    }
    return iso >= e.start && iso <= (e.end || e.start)
  })
}
