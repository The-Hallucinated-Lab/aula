import { Field, NumberInput, Section, TextInput } from '../../components/ui'
import { HELP } from '../../content/help'
import type { StepProps } from './steps'

/**
 * Step 1 of the institution wizard — the name that appears on every export.
 */

export function StepIdentity({ config, patch }: StepProps) {
  const inst = config.institution
  return (
    <Section title="Institution" hint="Appears on every exported timetable">
      <div className="card card-pad">
        <div className="field-grid">
          <Field label="Institution name" wide>
            <TextInput
              value={inst.name}
              onChange={v => patch({ institution: { ...inst, name: v } })}
            />
          </Field>
          <Field label="Academic year">
            <TextInput
              value={inst.academicYear}
              onChange={v => patch({ institution: { ...inst, academicYear: v } })}
            />
          </Field>
          <Field label="Term">
            <TextInput
              value={inst.term}
              onChange={v => patch({ institution: { ...inst, term: v } })}
            />
          </Field>
        </div>

        {/* The seed decides which of several equally valid schedules you get.
            It is worth having — two runs of the same figures reproduce exactly
            — but it is not something a timetable manager sets, and sitting
            beside the institution's name it read like one. */}
        <details className="card-pad advanced">
          <summary className="small muted">Advanced</summary>
          <div className="field-grid" style={{ marginTop: 12 }}>
            <Field label="Generator seed" hint={HELP.seed}>
              <NumberInput value={config.seed} min={1} onChange={n => patch({ seed: n })} />
            </Field>
          </div>
        </details>
      </div>
    </Section>
  )
}
