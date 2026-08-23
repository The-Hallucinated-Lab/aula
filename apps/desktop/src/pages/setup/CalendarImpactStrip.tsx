import { useApp } from '../../store'
import { Callout, Meter } from '../../components/ui'
import { DAY_NAMES } from '@aula/core/data/model'
import { prettyRange } from '@aula/core/data/academicCalendar'

/**
 * What the academic calendar costs the teaching week, per weekday.
 */

export function CalendarImpactStrip() {
  const { institution, config, summary } = useApp()
  const cal = institution.calendar
  const events = config.calendar.events ?? []

  if (!cal.dated) {
    return (
      <div style={{ marginTop: 16 }}>
        <Callout tone="info" title="No term dates set">
          Set a start and end date to see how many times each weekday actually occurs. Until then
          the schedule is counted in whole weeks.
        </Callout>
      </div>
    )
  }

  const best = Math.max(1, ...cal.impact.map(i => i.totalDates))

  return (
    <div className="panel" style={{ marginTop: 18, padding: '14px 16px' }}>
      <div className="spread" style={{ marginBottom: 10 }}>
        <span className="field-label">
          Teaching dates in {prettyRange(cal.termStart, cal.termEnd)}
        </span>
        <span className="small muted tnum">
          {cal.teachingDates} dates · {events.length} calendar entr
          {events.length === 1 ? 'y' : 'ies'}
        </span>
      </div>

      {cal.impact.map(row => (
        <div key={row.day} className="attrition-row">
          <span className="small" style={{ fontWeight: 700 }}>
            {DAY_NAMES[row.day]}
          </span>
          <Meter
            value={row.totalDates > 0 ? row.teachingDates / best : 0}
            tone={row.lostDates > 0 ? 'var(--warn)' : 'var(--ok)'}
          />
          <span className="small muted tnum" style={{ textAlign: 'right' }}>
            {row.teachingDates} of {row.totalDates}
            {row.lostDates > 0 && ` · −${row.lostDates}`}
          </span>
        </div>
      ))}

      {summary.blackoutSlots > 0 && (
        <p className="field-hint" style={{ marginTop: 10 }}>
          A further {summary.blackoutSlots} slot{summary.blackoutSlots === 1 ? '' : 's'} a week{' '}
          {summary.blackoutSlots === 1 ? 'is' : 'are'} held by repeating institution events.
        </p>
      )}
    </div>
  )
}

/**
 * Per-year section control.
 *
 * The programme carries a default number of sections, but real intakes are
 * uneven — a department can run three first-year sections and one final-year.
 * Setting a year here overrides the default for that year only.
 */
