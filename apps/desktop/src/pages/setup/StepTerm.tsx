import { Link } from 'react-router-dom'
import { Field, NumberInput, Section } from '../../components/ui'
import { HELP } from '../../content/help'
import type { StepProps } from './steps'
import { CalendarImpactStrip } from './CalendarImpactStrip'

/**
 * Term dates, and the academic calendar's effect on the teaching week.
 */

export function StepTerm({ config, patch }: StepProps) {
  const cal = config.calendar
  const set = (p: Partial<typeof cal>) => patch({ calendar: { ...cal, ...p } })

  return (
    <Section title="Term" hint="When this session runs, and what interrupts it">
      <div className="card card-pad">
        <div className="spread" style={{ marginBottom: 4 }}>
          <span className="field-label">Term dates</span>
          <Link className="btn btn-ghost" to="/calendar">
            Open the academic calendar &rarr;
          </Link>
        </div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {HELP.termDates}
        </p>
        <div className="field-grid">
          <Field label="Term starts">
            <input
              className="input"
              type="date"
              aria-label="Term starts"
              value={cal.termStart}
              onChange={e => set({ termStart: e.target.value })}
            />
          </Field>
          <Field label="Term ends">
            <input
              className="input"
              type="date"
              aria-label="Term ends"
              value={cal.termEnd}
              onChange={e => set({ termEnd: e.target.value })}
            />
          </Field>
          <Field label="Weeks in term" hint="Used only when the dates above are not set.">
            <NumberInput
              value={cal.termWeeks}
              min={1}
              max={52}
              onChange={n => set({ termWeeks: n })}
            />
          </Field>
        </div>

        <CalendarImpactStrip />
      </div>
    </Section>
  )
}

/**
 * Which batch's curriculum policy this year follows.
 *
 * Policy changes between intakes and the programme does not, so a profile
 * states only the difference. "Copy from" is the point of the feature: a new
 * batch starts as a clone of the one it resembles.
 */
