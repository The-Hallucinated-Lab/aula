import { Combobox, Field, NumberInput, Section, Segmented, TextInput } from '../../components/ui'
import { type ProgramConfig } from '@aula/core/data/config'
import { HELP } from '../../content/help'
import { patchAt } from '../../lib/records'
import { nextId, type StepProps } from './steps'
import { SectionOverrides } from './SectionOverrides'

/**
 * Programmes — students, sections and course load per programme.
 */

export function StepPrograms({ config, patch }: StepProps) {
  const update = (i: number, p: Partial<ProgramConfig>) =>
    patch({ programs: patchAt(config.programs, i, p) })

  return (
    <Section
      title="Programmes"
      hint="Students are taught in sections, which the engine schedules as a unit"
    >
      <div className="stack" style={{ gap: 14 }}>
        {config.programs.map((p, i) => {
          const cohorts = p.years * p.sectionsPerYear
          const students = cohorts * p.studentsPerSection
          const weekly =
            p.coreCourses * p.coreWeekly + p.labCourses * p.labBlock + p.electiveCourses * 2
          return (
            <div key={p.id} className="card">
              <div className="card-head">
                <div className="row" style={{ gap: 10, flex: 1, minWidth: 0 }}>
                  <TextInput
                    value={p.code}
                    ariaLabel="Programme code"
                    onChange={v => update(i, { code: v })}
                  />
                  <TextInput
                    value={p.name}
                    ariaLabel="Programme name"
                    onChange={v => update(i, { name: v })}
                  />
                </div>
                <button
                  className="btn btn-danger-soft"
                  onClick={() => patch({ programs: config.programs.filter((_, x) => x !== i) })}
                >
                  Remove
                </button>
              </div>

              <div className="card-pad">
                <div className="field-grid">
                  <Field label="Department">
                    <Combobox
                      value={p.dept}
                      ariaLabel="Department"
                      options={config.departments.map(d => ({
                        value: d.code,
                        label: d.code,
                        hint: d.name,
                      }))}
                      onChange={v => update(i, { dept: v })}
                    />
                  </Field>
                  <Field label="Mode">
                    <Segmented
                      value={p.mode}
                      ariaLabel="Programme mode"
                      onChange={v => update(i, { mode: v })}
                      options={[
                        { value: 'day', label: 'Day' },
                        { value: 'evening', label: 'Evening' },
                        { value: 'weekend', label: 'Weekend' },
                      ]}
                    />
                  </Field>
                  <Field label="Years">
                    <NumberInput
                      value={p.years}
                      min={1}
                      max={8}
                      onChange={n => update(i, { years: n })}
                    />
                  </Field>
                  <Field label="Sections per year" hint={HELP.sectionsPerYear}>
                    <NumberInput
                      value={p.sectionsPerYear}
                      min={1}
                      max={20}
                      onChange={n => update(i, { sectionsPerYear: n })}
                    />
                  </Field>
                  <Field label="Students per section" hint={HELP.studentsPerSection}>
                    <NumberInput
                      value={p.studentsPerSection}
                      min={1}
                      max={600}
                      onChange={n => update(i, { studentsPerSection: n })}
                    />
                  </Field>
                  <Field label="Core courses / year" hint={HELP.coreCourses}>
                    <NumberInput
                      value={p.coreCourses}
                      min={0}
                      max={12}
                      onChange={n => update(i, { coreCourses: n })}
                    />
                  </Field>
                  <Field label="Meetings per core course" hint={HELP.coreWeekly}>
                    <NumberInput
                      value={p.coreWeekly}
                      min={1}
                      max={6}
                      onChange={n => update(i, { coreWeekly: n })}
                    />
                  </Field>
                  <Field label="Lab courses / year" hint={HELP.labCourses}>
                    <NumberInput
                      value={p.labCourses}
                      min={0}
                      max={8}
                      onChange={n => update(i, { labCourses: n })}
                    />
                  </Field>
                  <Field label="Lab block length" hint={HELP.labBlock}>
                    <NumberInput
                      value={p.labBlock}
                      min={1}
                      max={6}
                      suffix="slots"
                      onChange={n => update(i, { labBlock: n })}
                    />
                  </Field>
                  <Field label="Electives / year" hint={HELP.electiveCourses}>
                    <NumberInput
                      value={p.electiveCourses}
                      min={0}
                      max={8}
                      onChange={n => update(i, { electiveCourses: n })}
                    />
                  </Field>
                </div>

                <SectionOverrides program={p} />

                <div className="panel spread" style={{ marginTop: 14, padding: '11px 16px' }}>
                  <span className="small muted">
                    {cohorts} cohorts · {students.toLocaleString()} students
                  </span>
                  <span className="small">
                    <b className="tnum">{weekly}</b>{' '}
                    <span className="muted">slot-hours per section per week</span>
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 14 }}>
        <button
          className="btn btn-soft"
          onClick={() =>
            patch({
              programs: [
                ...config.programs,
                {
                  id: nextId('p'),
                  code: 'NEW',
                  name: 'New programme',
                  dept: config.departments[0]?.code ?? 'GEN',
                  years: 3,
                  sectionsPerYear: 1,
                  studentsPerSection: 60,
                  mode: 'day',
                  coreCourses: 4,
                  labCourses: 1,
                  electiveCourses: 1,
                  coreWeekly: 3,
                  labBlock: 2,
                },
              ],
            })
          }
        >
          + Add programme
        </button>
      </div>
    </Section>
  )
}

/**
 * Buildings, floor by floor.
 *
 * The earlier version described the estate as a flat list of room groups with a
 * building attached, which cannot say the thing every real block is: halls on
 * the ground, tutorial rooms above, the specialised labs wherever the services
 * run. Rooms are now entered under the storey they occupy, and picking a
 * facility carries the capabilities that facility cannot work without — so an
 * administrator who knows they have two electronics labs on the second floor
 * does not also have to know what that means to the constraint engine.
 */
