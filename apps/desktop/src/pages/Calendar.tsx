import { useMemo, useState } from 'react'
import { useApp } from '../store'
import { useToast } from '../components/Toast'
import {
  Callout,
  Combobox,
  Empty,
  Field,
  Hero,
  Meter,
  NumberInput,
  Pill,
  Section,
  Switch,
  TextInput,
} from '../components/ui'
import { Dialog, DialogSection } from '../components/Dialog'
import { StaleNotice } from '../components/StaleNotice'
import { saveText } from '../platform'
import { calendarCsv } from '@aula/core/data/exporters'
import { HELP } from '../content/help'
import {
  CALENDAR_KINDS,
  DAY_NAMES,
  DAY_SHORT,
  type CalendarEvent,
  type CalendarEventKind,
} from '@aula/core/data/model'
import {
  HOLIDAY_PRESETS,
  blankEvent,
  datesBetween,
  eventsOn,
  formatDate,
  monthName,
  newEventId,
  parseDate,
  prettyDate,
  prettyRange,
  weekdayOf,
} from '@aula/core/data/academicCalendar'

/**
 * The academic calendar.
 *
 * A timetable is a week that repeats; a calendar is a run of dates. This screen
 * is where the two are reconciled, and it is deliberate about which of the
 * three effects each entry has, because conflating them is how a planner ends
 * up promising sixteen Fridays and delivering twelve:
 *
 *   - a dated closure removes one occurrence of a weekday — the grid is
 *     unchanged, the number of meetings is not;
 *   - a weekday that loses every one of its dates stops being a teaching day;
 *   - an entry marked as repeating weekly is blocked out on the grid itself.
 */
export function Calendar() {
  const { config, institution, summary, setTerm, addEvent, updateEvent, removeEvent } = useApp()
  const toast = useToast()
  const [editing, setEditing] = useState<{ ev: CalendarEvent; mode: 'add' | 'edit' } | null>(null)

  const cal = institution.calendar
  const events = config.calendar.events ?? []

  const slug = config.institution.name.replace(/[^\w-]+/g, '-').toLowerCase()

  const exportCalendar = async () => {
    const res = await saveText({
      suggestedName: `${slug}-calendar.csv`,
      data: calendarCsv(institution),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
    if (res.ok) toast('Calendar exported', 'ok')
    else if (!res.canceled) toast(res.error ?? 'Export failed', 'danger')
  }

  return (
    <div className="fade-in">
      <Hero
        eyebrow="Academic calendar"
        title={
          <>
            The term, <strong>date by date</strong>
          </>
        }
        desc="Holidays, observances, exam windows and institution events. The timetable is a repeating week, so what the calendar changes is how many times that week actually happens — and, for anything that repeats weekly, which slots it may use at all."
        side={
          <div className="row" style={{ gap: 8 }}>
            <Pill tone={cal.dated ? 'ok' : 'warn'}>
              {cal.dated ? `${cal.teachingDates} teaching dates` : 'Term dates not set'}
            </Pill>
            <button className="btn btn-soft" onClick={exportCalendar}>
              Export calendar
            </button>
            <button
              className="btn btn-primary"
              onClick={() =>
                setEditing({
                  ev: blankEvent(cal.termStart || formatDate(Math.floor(Date.now() / 86_400_000))),
                  mode: 'add',
                })
              }
            >
              + Add entry
            </button>
          </div>
        }
      />

      <main className="page">
        <StaleNotice />

        {/* ---------------- term window ---------------- */}
        <Section title="Term" hint={HELP.termDates}>
          <div className="card card-pad">
            <div className="field-grid">
              <Field label="First teaching date">
                <input
                  className="input"
                  type="date"
                  aria-label="First teaching date"
                  value={config.calendar.termStart}
                  onChange={e => setTerm(e.target.value, config.calendar.termEnd)}
                />
              </Field>
              <Field label="Last teaching date">
                <input
                  className="input"
                  type="date"
                  aria-label="Last teaching date"
                  value={config.calendar.termEnd}
                  onChange={e => setTerm(config.calendar.termStart, e.target.value)}
                />
              </Field>
              <Field label="Term length" hint="Derived from the two dates above.">
                <div className="row" style={{ minHeight: 34 }}>
                  <b className="tnum">{cal.weeks}</b>
                  <span className="small muted">week{cal.weeks === 1 ? '' : 's'}</span>
                </div>
              </Field>
            </div>
          </div>
        </Section>

        {summary.lostDays.length > 0 && (
          <Callout tone="warn" title="A weekday has been removed from the timetable">
            {summary.lostDays.map(d => DAY_NAMES[d]).join(', ')}
            {summary.lostDays.length === 1 ? ' has' : ' have'} no teaching dates left in the term,
            so nothing is scheduled there at all. Everything that weekday used to carry has to fit
            into the rest of the week.
          </Callout>
        )}

        <div className="grid grid-main-side">
          {/* ---------------- month grid ---------------- */}
          <div>
            <Section
              title="Dates"
              hint="Click a date to add an entry; click an existing one to edit it"
            >
              <MonthGrid
                start={cal.termStart}
                end={cal.termEnd}
                workingDays={institution.grid.days}
                events={events}
                onPick={date => {
                  const hit = eventsOn(cal, date).find(e => !e.weekly)
                  setEditing(
                    hit
                      ? { ev: hit, mode: 'edit' }
                      : { ev: { ...blankEvent(date), name: '' }, mode: 'add' },
                  )
                }}
              />

              <div className="cal-legend" style={{ marginTop: 14 }}>
                {CALENDAR_KINDS.map(k => (
                  <span key={k.id} title={k.blurb}>
                    <span className={`cal-swatch cal-day ${k.id}`} />
                    {k.label}
                  </span>
                ))}
                <span>
                  <span className="cal-swatch cal-day teaching" />
                  Teaching day
                </span>
              </div>
            </Section>
          </div>

          {/* ---------------- impact ---------------- */}
          <div className="stack" style={{ gap: 16 }}>
            <div className="card card-pad">
              <div className="card-title" style={{ marginBottom: 4 }}>
                Effect on the week
              </div>
              <p className="field-hint" style={{ marginBottom: 12 }}>
                {HELP.attrition}
              </p>

              {!cal.dated && <p className="small muted">Set the term dates to see this.</p>}
              {cal.dated &&
                cal.impact.map(row => {
                  const best = Math.max(1, ...cal.impact.map(i => i.totalDates))
                  return (
                    <div key={row.day} className="attrition-row" title={row.causes.join(', ')}>
                      <span className="small" style={{ fontWeight: 700 }}>
                        {DAY_SHORT[row.day]}
                      </span>
                      <Meter
                        value={row.teachingDates / best}
                        tone={
                          row.teachingDates === 0
                            ? 'var(--danger)'
                            : row.lostDates > 0
                              ? 'var(--warn)'
                              : 'var(--ok)'
                        }
                      />
                      <span className="small muted tnum" style={{ textAlign: 'right' }}>
                        {row.teachingDates}/{row.totalDates}
                      </span>
                    </div>
                  )
                })}
            </div>

            {cal.blackouts.length > 0 && (
              <div className="card card-pad">
                <div className="card-title" style={{ marginBottom: 4 }}>
                  Slots held every week
                </div>
                <p className="field-hint" style={{ marginBottom: 12 }}>
                  These repeat, so the scheduler can block them on the grid itself.
                </p>
                <div className="stack" style={{ gap: 7 }}>
                  {groupBlackouts(cal.blackouts, institution.grid.labels).map(b => (
                    <div key={b.key} className="panel spread" style={{ padding: '9px 13px' }}>
                      <span className="small">
                        <b>{DAY_SHORT[b.day]}</b> {b.range}
                      </span>
                      <span className="small muted">
                        {b.name}
                        {b.coreOnly && ' · mandatory only'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ---------------- entries ---------------- */}
        <Section title="Entries" hint={`${events.length} in this project`}>
          {events.length === 0 && (
            <Empty
              title="Nothing in the calendar yet"
              desc="Add your institution's holidays, observances, exam windows and events. Anything you add here is counted before the timetable is solved, not after."
              action={
                <button
                  className="btn btn-primary"
                  onClick={() => setEditing({ ev: blankEvent(cal.termStart), mode: 'add' })}
                >
                  + Add the first entry
                </button>
              }
            />
          )}

          {events.length > 0 && (
            <div className="card" style={{ overflow: 'hidden' }}>
              {events.map((e, i) => (
                <div key={e.id}>
                  {i > 0 && <div className="divider" style={{ margin: 0 }} />}
                  <div className="record-row">
                    <button
                      className="record-toggle"
                      onClick={() => setEditing({ ev: e, mode: 'edit' })}
                    >
                      <span className={`dot cal-day ${e.kind}`} style={{ width: 10, height: 10 }} />
                      <span style={{ minWidth: 0, flex: 1 }}>
                        <span className="record-name">{e.name}</span>
                        <span className="record-sub">{describe(e, institution.grid.labels)}</span>
                      </span>
                      <span className="chip chip-soft">
                        {CALENDAR_KINDS.find(k => k.id === e.kind)?.label ?? e.kind}
                      </span>
                    </button>
                    <button
                      className="btn btn-danger-soft"
                      style={{ alignSelf: 'center', marginRight: 16 }}
                      onClick={() => {
                        removeEvent(e.id)
                        toast(`Removed ${e.name}`)
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ---------------- quick add ---------------- */}
        <Section title="Common entries" hint="Adds a one-day entry you can then date">
          <div className="card card-pad">
            <p className="field-hint" style={{ marginBottom: 12 }}>
              Most of these move from year to year, so they are added on the term's first date for
              you to correct. Nothing here asserts when a festival actually falls.
            </p>
            <div className="feature-grid">
              {HOLIDAY_PRESETS.map(preset => (
                <button
                  key={preset.name}
                  type="button"
                  className="feature-chip"
                  onClick={() =>
                    setEditing({
                      ev: {
                        ...blankEvent(cal.termStart || config.calendar.termStart),
                        id: newEventId(),
                        name: preset.name,
                        kind: preset.kind,
                        blocksTeaching: preset.kind !== 'event',
                        weekly: preset.name === 'Weekly assembly',
                      },
                      mode: 'add',
                    })
                  }
                >
                  + {preset.name}
                </button>
              ))}
            </div>
          </div>
        </Section>
      </main>

      {editing && (
        <EventDialog
          initial={editing.ev}
          mode={editing.mode}
          slotLabels={institution.grid.labels}
          onClose={() => setEditing(null)}
          onSave={ev => {
            if (editing.mode === 'add') {
              addEvent(ev)
              toast(`Added ${ev.name}`, 'ok')
            } else {
              updateEvent(ev)
              toast(`Updated ${ev.name}`, 'ok')
            }
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Month grid
 * ------------------------------------------------------------------ */

function MonthGrid(props: {
  start: string
  end: string
  workingDays: number[]
  events: CalendarEvent[]
  onPick: (date: string) => void
}) {
  const months = useMemo(() => {
    const a = parseDate(props.start)
    const b = parseDate(props.end)
    if (a === null || b === null || b < a) return []

    /* One bucket per calendar month the term touches, each padded to whole
       weeks so the columns line up Monday to Sunday. */
    const out: { key: string; year: number; month: number; days: (string | null)[] }[] = []
    let cursor = new Date(a * 86_400_000)
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1))

    while (Math.floor(cursor.getTime() / 86_400_000) <= b) {
      const year = cursor.getUTCFullYear()
      const month = cursor.getUTCMonth()
      const first = Math.floor(Date.UTC(year, month, 1) / 86_400_000)
      const length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
      const lead = weekdayOf(first)

      const days: (string | null)[] = Array.from({ length: lead }, () => null)
      for (let d = 0; d < length; d++) days.push(formatDate(first + d))
      while (days.length % 7 !== 0) days.push(null)

      out.push({ key: `${year}-${month}`, year, month, days })
      cursor = new Date(Date.UTC(year, month + 1, 1))
    }
    return out
  }, [props.start, props.end])

  /* One pass over every event's dates, so rendering a month is a map lookup
     rather than a scan of the whole list per cell. */
  const marks = useMemo(() => {
    const m = new Map<string, { kind: CalendarEventKind; name: string }>()
    for (const e of props.events) {
      if (e.weekly) continue
      for (const date of datesBetween(e.start, e.end || e.start)) {
        if (!m.has(date)) m.set(date, { kind: e.kind, name: e.name })
      }
    }
    return m
  }, [props.events])

  const weeklyByDay = useMemo(() => {
    const m = new Map<number, string>()
    for (const e of props.events) {
      if (!e.weekly) continue
      const n = parseDate(e.start)
      if (n === null) continue
      if (!m.has(weekdayOf(n))) m.set(weekdayOf(n), e.name)
    }
    return m
  }, [props.events])

  if (months.length === 0) {
    return (
      <Callout tone="info" title="Set the term dates to see the calendar">
        The month grid runs between the first and last teaching date.
      </Callout>
    )
  }

  return (
    <div className="cal-months">
      {months.map(m => (
        <div key={m.key} className="cal-month">
          <div className="cal-month-name">
            {monthName(m.month)} {m.year}
          </div>
          <div className="cal-grid">
            {DAY_SHORT.map(d => (
              <span key={d} className="cal-dow">
                {d[0]}
              </span>
            ))}
            {m.days.map((date, i) => {
              // A padding cell is defined by its position and has no other
              // identity; the index is the correct key here.
              // eslint-disable-next-line react/no-array-index-key
              if (!date) return <span key={`pad-${i}`} />
              const inTerm = date >= props.start && date <= props.end
              const day = weekdayOf(parseDate(date) as number)
              const teaching = inTerm && props.workingDays.includes(day)
              const mark = marks.get(date)
              const weekly = weeklyByDay.get(day)

              const title = [
                prettyDate(date),
                mark?.name,
                weekly && `${weekly} (every week)`,
                !teaching && inTerm && 'not a teaching day',
              ]
                .filter(Boolean)
                .join(' · ')

              return (
                <button
                  key={date}
                  type="button"
                  title={title}
                  className={`cal-day ${!inTerm ? 'out' : mark ? mark.kind : teaching ? 'teaching' : ''}`}
                  onClick={() => props.onPick(date)}
                >
                  {Number(date.slice(8))}
                  {weekly && !mark && <span className="cal-dot" aria-hidden />}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Entry dialog
 * ------------------------------------------------------------------ */

function EventDialog(props: {
  initial: CalendarEvent
  mode: 'add' | 'edit'
  slotLabels: string[]
  onSave: (ev: CalendarEvent) => void
  onClose: () => void
}) {
  const [ev, setEv] = useState<CalendarEvent>(props.initial)
  const [touched, setTouched] = useState(false)
  const set = (p: Partial<CalendarEvent>) => setEv(e => ({ ...e, ...p }))

  const partDay = ev.fromSlot >= 0
  const lastSlot = Math.max(0, props.slotLabels.length - 1)

  const error =
    ev.name.trim() === ''
      ? 'Give this entry a name.'
      : parseDate(ev.start) === null
        ? 'Pick a valid start date.'
        : parseDate(ev.end) === null
          ? 'Pick a valid end date.'
          : ev.end < ev.start
            ? 'The entry ends before it begins.'
            : ''

  const save = () => {
    setTouched(true)
    if (error) return
    props.onSave({
      ...ev,
      name: ev.name.trim(),
      // a repeating entry is anchored to one weekday, so its range is one day
      end: ev.weekly ? ev.start : ev.end,
      fromSlot: partDay ? Math.min(ev.fromSlot, lastSlot) : -1,
      toSlot: partDay ? Math.min(Math.max(ev.toSlot, ev.fromSlot), lastSlot) : -1,
    })
  }

  return (
    <Dialog
      title={
        props.mode === 'add' ? 'Add a calendar entry' : `Edit ${props.initial.name || 'entry'}`
      }
      subtitle="Holidays and breaks remove teaching dates. Only an entry that repeats every week can be blocked out on the timetable grid itself."
      size="wide"
      onClose={props.onClose}
      footer={
        <>
          {touched && error && <span className="dialog-error">⊘ {error}</span>}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginLeft: touched && error ? 0 : 'auto' }}
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            {props.mode === 'add' ? 'Add entry' : 'Save changes'}
          </button>
        </>
      }
    >
      <DialogSection title="What it is">
        <div className="field-grid">
          <Field label="Name" wide>
            <TextInput
              value={ev.name}
              ariaLabel="Entry name"
              placeholder="Diwali, Mid-term break, Convocation…"
              onChange={v => set({ name: v })}
            />
          </Field>
          <Field label="Type" hint={HELP.eventKind}>
            <Combobox
              value={ev.kind}
              ariaLabel="Type"
              options={CALENDAR_KINDS.map(k => ({
                value: k.id,
                label: k.label,
                keywords: k.blurb,
              }))}
              onChange={v => set({ kind: v as CalendarEventKind })}
            />
          </Field>
          <Field label="Note" hint="Optional. Appears on the exported calendar.">
            <TextInput value={ev.note} ariaLabel="Note" onChange={v => set({ note: v })} />
          </Field>
        </div>
      </DialogSection>

      <DialogSection title="When">
        <div className="field-grid">
          <Field label={ev.weekly ? 'First occurrence' : 'From'}>
            <input
              className="input"
              type="date"
              aria-label="From"
              value={ev.start}
              onChange={e =>
                set({ start: e.target.value, end: ev.weekly ? e.target.value : ev.end })
              }
            />
          </Field>
          {!ev.weekly && (
            <Field label="To" hint="Same as the start date for a single day.">
              <input
                className="input"
                type="date"
                aria-label="To"
                value={ev.end}
                onChange={e => set({ end: e.target.value })}
              />
            </Field>
          )}
        </div>

        <div className="divider" style={{ margin: '16px 0' }} />

        <label className="row" style={{ gap: 10, marginBottom: 6 }}>
          <Switch
            on={ev.weekly}
            label="Repeats every week"
            onChange={() => set({ weekly: !ev.weekly, end: !ev.weekly ? ev.start : ev.end })}
          />
          <span className="small">
            Repeats every week on{' '}
            {parseDate(ev.start) !== null
              ? DAY_NAMES[weekdayOf(parseDate(ev.start) as number)]
              : 'the chosen weekday'}
          </span>
        </label>
        <p className="field-hint">{HELP.weeklyEvent}</p>
      </DialogSection>

      <DialogSection title="What it does to teaching">
        <label className="row" style={{ gap: 10, marginBottom: 6 }}>
          <Switch
            on={ev.blocksTeaching}
            label="Cancels teaching"
            onChange={() => set({ blocksTeaching: !ev.blocksTeaching })}
          />
          <span className="small">Cancels teaching</span>
        </label>
        <p className="field-hint" style={{ marginBottom: 14 }}>
          {HELP.blocksTeaching}
        </p>

        {ev.blocksTeaching && (
          <>
            <label className="row" style={{ gap: 10, marginBottom: 6 }}>
              <Switch
                on={partDay}
                label="Only part of the day"
                onChange={() =>
                  set(partDay ? { fromSlot: -1, toSlot: -1 } : { fromSlot: 0, toSlot: lastSlot })
                }
              />
              <span className="small">Only part of the day</span>
            </label>
            <p className="field-hint" style={{ marginBottom: partDay ? 12 : 0 }}>
              {HELP.eventSlots}
            </p>

            {partDay && (
              <div className="field-grid">
                <Field label="First period">
                  <NumberInput
                    value={ev.fromSlot + 1}
                    min={1}
                    max={lastSlot + 1}
                    ariaLabel="First period"
                    onChange={n => set({ fromSlot: n - 1, toSlot: Math.max(ev.toSlot, n - 1) })}
                  />
                </Field>
                <Field label="Last period">
                  <NumberInput
                    value={ev.toSlot + 1}
                    min={1}
                    max={lastSlot + 1}
                    ariaLabel="Last period"
                    onChange={n => set({ toSlot: n - 1 })}
                  />
                </Field>
                <Field label="Covers" hint="The periods this entry occupies.">
                  <div className="row small muted" style={{ minHeight: 34 }}>
                    {props.slotLabels[Math.max(0, ev.fromSlot)] ?? '—'}
                    {' – '}
                    {props.slotLabels[Math.min(lastSlot, ev.toSlot)] ?? '—'}
                  </div>
                </Field>
              </div>
            )}
          </>
        )}

        {ev.blocksTeaching && !ev.weekly && (
          <div style={{ marginTop: 14 }}>
            <Callout tone="info" title="This removes dates, not slots">
              A one-off closure cannot be drawn on a repeating week. It reduces how many times each
              affected weekday happens, and the scheduler steers meetings towards the weekdays that
              keep the most dates.
            </Callout>
          </div>
        )}
        {ev.blocksTeaching && ev.weekly && ev.kind === 'observance' && (
          <div style={{ marginTop: 14 }}>
            <Callout tone="info" title="Mandatory teaching only">
              An observance keeps the campus open. Core and lab meetings are kept off these periods;
              electives and seminars may still use them.
            </Callout>
          </div>
        )}
      </DialogSection>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function describe(e: CalendarEvent, slotLabels: string[]): string {
  const when = e.weekly
    ? `Every ${DAY_NAMES[weekdayOf(parseDate(e.start) ?? 0)]}`
    : prettyRange(e.start, e.end || e.start)

  const span =
    e.fromSlot < 0
      ? 'whole day'
      : `${slotLabels[e.fromSlot] ?? e.fromSlot} – ${slotLabels[e.toSlot] ?? e.toSlot}`

  const effect = !e.blocksTeaching
    ? 'recorded only'
    : e.weekly
      ? `blocks ${span}${e.kind === 'observance' ? ' for mandatory classes' : ''}`
      : 'teaching cancelled'

  const days = e.weekly ? '' : ` · ${datesBetween(e.start, e.end || e.start).length} date(s)`
  return `${when} · ${effect}${days}${e.note ? ` · ${e.note}` : ''}`
}

/** Collapse a run of consecutive blocked slots into one readable line. */
function groupBlackouts(
  blackouts: { day: number; slot: number; name: string; coreOnly: boolean }[],
  labels: string[],
): { key: string; day: number; range: string; name: string; coreOnly: boolean }[] {
  const sorted = blackouts.toSorted((a, b) => a.day - b.day || a.slot - b.slot)
  const out: { key: string; day: number; range: string; name: string; coreOnly: boolean }[] = []

  for (const b of sorted) {
    const last = out[out.length - 1]
    const prev = sorted[sorted.indexOf(b) - 1]
    const contiguous =
      last &&
      prev &&
      prev.day === b.day &&
      prev.slot === b.slot - 1 &&
      prev.name === b.name &&
      prev.coreOnly === b.coreOnly
    if (contiguous) {
      last.range = `${last.range.split(' – ')[0]} – ${labels[b.slot] ?? b.slot}`
    } else {
      out.push({
        key: `${b.day}:${b.slot}:${b.name}`,
        day: b.day,
        range: `${labels[b.slot] ?? b.slot} – ${labels[b.slot] ?? b.slot}`,
        name: b.name,
        coreOnly: b.coreOnly,
      })
    }
  }
  return out
}
