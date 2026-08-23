import { Field, NumberInput, Pill, Section } from '../../components/ui'
import { HELP } from '../../content/help'
import type { StepProps } from './steps'

/**
 * Headcount, the mix of designations, and the load each designation carries.
 */

export function StepStaff({ config, patch }: StepProps) {
  const f = config.staff
  const set = (p: Partial<typeof f>) => patch({ staff: { ...f, ...p } })
  const mixSum = Object.values(f.mix).reduce((a, b) => a + b, 0)

  return (
    <Section title="Staff" hint="Headcount and the legal caps of constraints 11–30">
      <div className="card card-pad">
        <div className="field-grid">
          <Field label="Total teaching staff">
            <NumberInput value={f.total} min={1} max={5000} onChange={n => set({ total: n })} />
          </Field>
          <Field label="Max hours per day" hint={HELP.maxPerDay}>
            <NumberInput
              value={f.maxPerDay}
              min={1}
              max={12}
              suffix="h"
              onChange={n => set({ maxPerDay: n })}
            />
          </Field>
          <Field label="Max hours per week" hint={HELP.maxPerWeek}>
            <NumberInput
              value={f.maxPerWeek}
              min={1}
              max={40}
              suffix="h"
              onChange={n => set({ maxPerWeek: n })}
            />
          </Field>
          <Field label="Adjunct weekly cap" hint={HELP.adjunctMaxPerWeek}>
            <NumberInput
              value={f.adjunctMaxPerWeek}
              min={1}
              max={40}
              suffix="h"
              onChange={n => set({ adjunctMaxPerWeek: n })}
            />
          </Field>
          <Field label="TA weekly cap" hint={HELP.taMaxPerWeek}>
            <NumberInput
              value={f.taMaxPerWeek}
              min={1}
              max={40}
              suffix="h"
              onChange={n => set({ taMaxPerWeek: n })}
            />
          </Field>
          <Field label="Courses each can teach (min)" hint={HELP.qualifications}>
            <NumberInput
              value={f.qualificationsMin}
              min={1}
              max={20}
              onChange={n => set({ qualificationsMin: n })}
            />
          </Field>
          <Field label="Courses each can teach (max)">
            <NumberInput
              value={f.qualificationsMax}
              min={1}
              max={20}
              onChange={n => set({ qualificationsMax: n })}
            />
          </Field>
          <Field label="With a research day" hint={HELP.researchDayShare}>
            <NumberInput
              value={f.researchDayShare}
              min={0}
              max={80}
              suffix="%"
              onChange={n => set({ researchDayShare: n })}
            />
          </Field>
          <Field label="On sabbatical" hint={HELP.sabbaticalShare}>
            <NumberInput
              value={f.sabbaticalShare}
              min={0}
              max={40}
              suffix="%"
              onChange={n => set({ sabbaticalShare: n })}
            />
          </Field>
          <Field label="Needing accessible rooms" hint={HELP.accessibilityShare}>
            <NumberInput
              value={f.accessibilityShare}
              min={0}
              max={50}
              suffix="%"
              onChange={n => set({ accessibilityShare: n })}
            />
          </Field>
        </div>

        <div className="divider" />
        <div className="spread" style={{ marginBottom: 4 }}>
          <span className="field-label">Rank mix</span>
          <Pill tone={mixSum === 100 ? 'ok' : 'warn'}>{mixSum}%</Pill>
        </div>
        <p className="field-hint" style={{ marginBottom: 12 }}>
          {HELP.rankMix}
        </p>
        <div className="field-grid">
          {(
            [
              ['professor', 'Professor'],
              ['associate', 'Associate professor'],
              ['assistant', 'Assistant professor'],
              ['adjunct', 'Adjunct'],
              ['visiting', 'Visiting'],
              ['ta', 'Teaching assistant'],
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <NumberInput
                value={f.mix[k]}
                min={0}
                max={100}
                suffix="%"
                onChange={n => set({ mix: { ...f.mix, [k]: n } })}
              />
            </Field>
          ))}
        </div>
      </div>
    </Section>
  )
}
