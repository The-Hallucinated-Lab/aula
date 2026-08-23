/**
 * Exporters — CSV and JSON views of a solved timetable.
 *
 * The catalogue export carries every constraint's state so the registrar can
 * sign off on advisory rules the engine cannot check (constraint 500).
 */

import { CATALOGUE, DOMAINS } from './constraints/catalogue'
import type { ConstraintState } from './constraints/types'
import { DAY_NAMES, type Institution, type Session, type SolveReport } from './model'
import { CALENDAR_KINDS, sessionMinutes } from './model'
import { meetingsInTerm, prettyRange } from './academicCalendar'

const esc = (v: unknown): string => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const toCsv = (rows: unknown[][]): string =>
  rows.map(r => r.map(esc).join(',')).join('\r\n')

/** One row per scheduled session — the file a registrar actually wants. */
export function timetableCsv(inst: Institution, sessions: Session[]): string {
  const course = new Map(inst.courses.map(c => [c.id, c]))
  const staff = new Map(inst.staff.map(f => [f.id, f]))
  const room = new Map(inst.rooms.map(r => [r.id, r]))
  const building = new Map(inst.buildings.map(b => [b.id, b]))
  const cohort = new Map(inst.cohorts.map(c => [c.id, c]))
  const grid = inst.grid

  const rows: unknown[][] = [[
    'Day', 'Start', 'End', 'Duration (min)', 'Course code', 'Course name', 'Type',
    'Cohort', 'Students', 'Instructor', 'Rank', 'Room', 'Building', 'Room capacity',
    // what the week actually delivers once the academic calendar is applied
    'Meetings this term', 'Substituting for',
  ]]

  const ordered = [...sessions].sort((a, b) =>
    a.day - b.day || a.slot - b.slot || a.cohortId.localeCompare(b.cohortId))

  for (const s of ordered) {
    const c = course.get(s.courseId)
    const f = staff.get(s.staffId)
    const r = room.get(s.roomId)
    const g = cohort.get(s.cohortId)
    const sub = s.substitutedFor ? staff.get(s.substitutedFor) : undefined

    rows.push([
      DAY_NAMES[s.day],
      grid.labels[s.slot] ?? '',
      grid.labels[s.slot + s.length] ?? endLabel(inst, s),
      sessionMinutes(grid, s.slot, s.length),
      c?.code ?? '', c?.name ?? '', c?.kind ?? '',
      g?.name ?? '', g?.size ?? '',
      f?.name ?? '', f?.rank ?? '',
      r?.name ?? '(no room)', r ? building.get(r.buildingId)?.name ?? '' : '', r?.capacity ?? '',
      meetingsInTerm(inst.calendar, s.day),
      sub?.name ?? '',
    ])
  }
  return toCsv(rows)
}

function endLabel(inst: Institution, s: Session): string {
  const grid = inst.grid
  const mins = (grid.starts[s.slot] ?? 0) + sessionMinutes(grid, s.slot, s.length)
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

/** Full catalogue state — including advisory rules awaiting human sign-off. */
export function constraintsCsv(states: Record<string, ConstraintState>, enforced: (rule?: string) => boolean): string {
  const domainName = new Map(DOMAINS.map(d => [d.id, `${d.numeral}. ${d.name}`]))
  const rows: unknown[][] = [[
    'Id', 'Number', 'Domain', 'Topic', 'Class', 'Enforcement', 'Enabled', 'Weight',
    'Settings', 'Constraint text',
  ]]

  for (const c of CATALOGUE) {
    const st = states[c.id]
    const settings = c.params
      .map(p => `${p.label}=${st?.values[p.key] ?? p.def}${p.unit ?? ''}`)
      .join('; ')
    rows.push([
      c.id, c.n, domainName.get(c.domainId) ?? c.domainId, c.topic,
      c.hard ? 'Hard' : 'Soft',
      enforced(c.rule) ? 'Engine-enforced' : 'Advisory — human sign-off',
      st?.enabled ? 'Yes' : 'No',
      c.hard ? '' : st?.weight ?? '',
      settings,
      c.text,
    ])
  }
  return toCsv(rows)
}

/** Staff workload sheet — what a union representative asks for (constraint 492). */
export function workloadCsv(inst: Institution, sessions: Session[]): string {
  const hours = new Map<string, number>()
  const days = new Map<string, Set<number>>()
  for (const s of sessions) {
    hours.set(s.staffId, (hours.get(s.staffId) ?? 0) + s.length)
    const d = days.get(s.staffId) ?? new Set<number>()
    d.add(s.day)
    days.set(s.staffId, d)
  }
  const dept = new Map(inst.departments.map(d => [d.id, d]))

  const rows: unknown[][] = [[
    'Instructor', 'Department', 'Rank', 'Scheduled hours', 'Weekly cap',
    'Utilisation %', 'Teaching days', 'On sabbatical',
  ]]
  for (const f of inst.staff) {
    const h = hours.get(f.id) ?? 0
    rows.push([
      f.name, dept.get(f.deptId)?.name ?? '', f.rank, h, f.maxPerWeek,
      f.maxPerWeek > 0 ? Math.round((h / f.maxPerWeek) * 100) : 0,
      days.get(f.id)?.size ?? 0,
      f.onSabbatical ? 'Yes' : 'No',
    ])
  }
  return toCsv(rows)
}

/** Machine-readable bundle for downstream systems. */
export function projectJson(
  inst: Institution,
  sessions: Session[],
  report: SolveReport | null,
  states: Record<string, ConstraintState>,
): string {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    institution: inst,
    sessions,
    report,
    constraints: states,
  }, null, 2)
}

/**
 * One view's timetable as a grid — the sheet a section, a lecturer or a room
 * custodian actually pins to a wall. Days across, slots down.
 */
export function gridCsv(
  inst: Institution,
  sessions: Session[],
  view: 'cohort' | 'staff' | 'room',
  entityId: string,
): string {
  const grid = inst.grid
  const course = new Map(inst.courses.map(c => [c.id, c]))
  const room = new Map(inst.rooms.map(r => [r.id, r]))
  const staff = new Map(inst.staff.map(f => [f.id, f]))
  const cohort = new Map(inst.cohorts.map(c => [c.id, c]))

  const mine = sessions.filter(s =>
    view === 'cohort' ? s.cohortId === entityId
      : view === 'staff' ? s.staffId === entityId
        : s.roomId === entityId)

  const title = view === 'cohort' ? cohort.get(entityId)?.name
    : view === 'staff' ? staff.get(entityId)?.name
      : room.get(entityId)?.name

  const cell = (day: number, slot: number): string => {
    const s = mine.find(x => x.day === day && slot >= x.slot && slot < x.slot + x.length)
    if (!s) return ''
    const c = course.get(s.courseId)
    const parts = [c?.code ?? '', c?.name ?? '']
    if (view !== 'room') parts.push(room.get(s.roomId)?.name ?? 'no room')
    if (view !== 'staff') parts.push(staff.get(s.staffId)?.name ?? '')
    if (view !== 'cohort') parts.push(cohort.get(s.cohortId)?.name ?? '')
    return parts.filter(Boolean).join(' · ')
  }

  const rows: unknown[][] = []
  rows.push([`${title ?? entityId} — weekly timetable`])
  rows.push([])
  rows.push(['Time', ...grid.days.map(d => DAY_NAMES[d])])
  for (let slot = 0; slot < grid.slots; slot++) {
    rows.push([grid.labels[slot], ...grid.days.map(day => cell(day, slot))])
  }
  return toCsv(rows)
}

/**
 * The academic calendar as a sheet, with what each entry costs the timetable.
 *
 * A registrar signing off a term wants both halves on one page: the dates the
 * institution has declared, and the teaching those dates remove. The second
 * table is the one that is usually missing, and it is the one that explains why
 * a course meeting only on Thursdays finishes the syllabus three sessions
 * short.
 */
export function calendarCsv(inst: Institution): string {
  const cal = inst.calendar
  const kindLabel = new Map(CALENDAR_KINDS.map(k => [k.id, k.label]))
  const rows: unknown[][] = []

  rows.push([`Academic calendar — ${prettyRange(cal.termStart, cal.termEnd) || 'term dates not set'}`])
  rows.push([])
  rows.push(['Entry', 'Type', 'From', 'To', 'Repeats weekly', 'Cancels teaching', 'Periods', 'Note'])

  for (const e of cal.events) {
    const periods = e.fromSlot < 0
      ? 'Whole day'
      : `${inst.grid.labels[e.fromSlot] ?? e.fromSlot} – ${inst.grid.labels[e.toSlot] ?? e.toSlot}`
    rows.push([
      e.name, kindLabel.get(e.kind) ?? e.kind, e.start, e.end,
      e.weekly ? 'Yes' : 'No', e.blocksTeaching ? 'Yes' : 'No',
      periods, e.note,
    ])
  }
  if (cal.events.length === 0) rows.push(['(no entries)'])

  rows.push([])
  rows.push(['Effect on the teaching week'])
  rows.push(['Weekday', 'Dates in term', 'Cancelled', 'Teaching dates', 'Because of'])
  for (const i of cal.impact) {
    rows.push([
      DAY_NAMES[i.day], i.totalDates, i.lostDates, i.teachingDates, i.causes.join('; '),
    ])
  }

  if (cal.blackouts.length > 0) {
    rows.push([])
    rows.push(['Slots held every week'])
    rows.push(['Weekday', 'Period', 'Entry', 'Applies to'])
    for (const b of cal.blackouts) {
      rows.push([
        DAY_NAMES[b.day], inst.grid.labels[b.slot] ?? b.slot, b.name,
        b.coreOnly ? 'Mandatory teaching only' : 'All teaching',
      ])
    }
  }

  return toCsv(rows)
}
