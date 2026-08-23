import { useApp } from '../../store'
import { Callout, Section } from '../../components/ui'

/**
 * Feasibility before solving.
 *
 * The point of the screen is to refuse early and say why, rather than let the
 * solver spend twenty seconds discovering the same thing.
 */

export function StepReview() {
  const { summary, config } = useApp()
  const capacity = summary.staffTotal * config.staff.maxPerWeek

  return (
    <Section title="Feasibility review" hint="Checked before a single session is placed">
      <div className="stack" style={{ gap: 14 }}>
        {summary.errors.length === 0 && summary.warnings.length === 0 && (
          <Callout tone="ok" title="Nothing structurally blocks this configuration">
            Demand fits the rooms and the staff you have described. Generate to see where the soft
            constraints land.
          </Callout>
        )}
        {summary.errors.map(e => (
          <Callout key={e} tone="danger" title="Blocking">
            {e}
          </Callout>
        ))}
        {summary.warnings.map(w => (
          <Callout key={w} tone="warn" title="Worth knowing">
            {w}
          </Callout>
        ))}

        <div className="grid grid-4">
          <div className="card stat">
            <span className="stat-label">Weekly demand</span>
            <span className="stat-value tnum">{summary.demand}</span>
            <span className="stat-note">sessions to place</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Room supply</span>
            <span className="stat-value tnum">{summary.roomSlotsPerWeek}</span>
            <span className="stat-note">room-slots per week</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Teaching supply</span>
            <span className="stat-value tnum">{capacity}</span>
            <span className="stat-note">staff-hours per week</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Room pressure</span>
            <span className="stat-value tnum">
              {Number.isFinite(summary.pressure) ? `${Math.round(summary.pressure * 100)}%` : '—'}
            </span>
            <span className={`stat-note ${summary.pressure > 0.85 ? 'bad' : 'good'}`}>
              {summary.pressure > 1
                ? 'over capacity'
                : summary.pressure > 0.85
                  ? 'tight'
                  : 'comfortable'}
            </span>
          </div>
        </div>
      </div>
    </Section>
  )
}

/**
 * What the academic calendar has already done to the week being configured.
 *
 * The wizard is where somebody decides the shape of the teaching week, and it
 * is the wrong place to discover afterwards that Friday only happens eleven
 * times. This is a summary, not a second editor — the entries themselves live
 * on the Calendar screen.
 */
