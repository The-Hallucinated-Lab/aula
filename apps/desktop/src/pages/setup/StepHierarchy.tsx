import { Callout, Combobox, Section, TextInput } from '../../components/ui'
import { type SetupConfig } from '@aula/core/data/config'
import { nextId, type StepProps } from './steps'

/**
 * Faculties, schools and departments.
 *
 * The review that produced this screen was explicit that the software's old flat
 * grouping was wrong: a real institution is Faculty -> School -> Department ->
 * Programme -> Section, and the database has to mirror that or nothing further
 * up the chain can be addressed by name.
 */

export function StepHierarchy({ config, patch }: StepProps) {
  const setFaculties = (faculties: SetupConfig['faculties']) => patch({ faculties })
  const setSchools = (schools: SetupConfig['schools']) => patch({ schools })

  return (
    <Section
      title="Academic hierarchy"
      hint="Faculty, then school, then department. Programmes attach to departments."
    >
      <Callout tone="info" title="Why this shape">
        Every picker in the app scopes itself by this tree. Getting it right is what stops a
        seventh-semester CSE screen offering first-year sections and the whole university&rsquo;s
        staff.
      </Callout>

      <div style={{ height: 16 }} />

      <Section title="Faculties" hint="The top-level divisions, e.g. FOSTA">
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Code</th>
                <th>Name</th>
                <th style={{ width: 70 }}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {config.faculties.map((f, i) => (
                <tr key={f.id}>
                  <td>
                    <TextInput
                      value={f.code}
                      ariaLabel="Faculty code"
                      onChange={v => {
                        const next = [...config.faculties]
                        next[i] = { ...f, code: v.toUpperCase() }
                        setFaculties(next)
                      }}
                    />
                  </td>
                  <td>
                    <TextInput
                      value={f.name}
                      ariaLabel="Faculty name"
                      onChange={v => {
                        const next = [...config.faculties]
                        next[i] = { ...f, name: v }
                        setFaculties(next)
                      }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-danger-soft"
                      disabled={config.faculties.length <= 1}
                      title={
                        config.faculties.length <= 1
                          ? 'At least one faculty is required'
                          : undefined
                      }
                      onClick={() => setFaculties(config.faculties.filter((_, x) => x !== i))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-pad">
            <button
              className="btn btn-soft"
              onClick={() =>
                setFaculties([
                  ...config.faculties,
                  {
                    id: nextId('fac'),
                    code: 'NEW',
                    name: 'New faculty',
                  },
                ])
              }
            >
              + Add faculty
            </button>
          </div>
        </div>
      </Section>

      <div style={{ height: 20 }} />

      <Section title="Schools" hint="Each sits under a faculty">
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Code</th>
                <th>Name</th>
                <th style={{ width: 220 }}>Faculty</th>
                <th style={{ width: 70 }}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {config.schools.map((s, i) => (
                <tr key={s.id}>
                  <td>
                    <TextInput
                      value={s.code}
                      ariaLabel="School code"
                      onChange={v => {
                        const next = [...config.schools]
                        next[i] = { ...s, code: v.toUpperCase() }
                        setSchools(next)
                      }}
                    />
                  </td>
                  <td>
                    <TextInput
                      value={s.name}
                      ariaLabel="School name"
                      onChange={v => {
                        const next = [...config.schools]
                        next[i] = { ...s, name: v }
                        setSchools(next)
                      }}
                    />
                  </td>
                  <td>
                    <Combobox
                      value={s.faculty}
                      ariaLabel="Faculty"
                      options={config.faculties.map(f => ({
                        value: f.id,
                        label: f.name,
                        hint: f.code,
                      }))}
                      onChange={v => {
                        const next = [...config.schools]
                        next[i] = { ...s, faculty: v }
                        setSchools(next)
                      }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-danger-soft"
                      disabled={config.schools.length <= 1}
                      title={
                        config.schools.length <= 1 ? 'At least one school is required' : undefined
                      }
                      onClick={() => setSchools(config.schools.filter((_, x) => x !== i))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-pad">
            <button
              className="btn btn-soft"
              onClick={() =>
                setSchools([
                  ...config.schools,
                  {
                    id: nextId('sch'),
                    code: 'NEW',
                    name: 'New school',
                    faculty: config.faculties[0]?.id ?? '',
                  },
                ])
              }
            >
              + Add school
            </button>
          </div>
        </div>
      </Section>

      <div style={{ height: 20 }} />

      <Section title="Departments" hint="Programmes attach to these">
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Code</th>
                <th>Name</th>
                <th style={{ width: 220 }}>School</th>
                <th style={{ width: 70 }}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {/* `DeptConfig` is identified by its `code`, which is editable in this
                  very table — keying by it would remount the row on every keystroke
                  and take the caret with it. Index is the least-bad key until the
                  type gains a stable id, which is a schema change reaching
                  normalisation, the generator and saved-project migration.
                  Recorded in docs/CONTEXT.md as GAP-08. */}
              {config.departments.map((d, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={i}>
                  <td>
                    <TextInput
                      value={d.code}
                      ariaLabel="Department code"
                      onChange={v => {
                        const next = [...config.departments]
                        next[i] = { ...d, code: v.toUpperCase() }
                        patch({ departments: next })
                      }}
                    />
                  </td>
                  <td>
                    <TextInput
                      value={d.name}
                      ariaLabel="Department name"
                      onChange={v => {
                        const next = [...config.departments]
                        next[i] = { ...d, name: v }
                        patch({ departments: next })
                      }}
                    />
                  </td>
                  <td>
                    <Combobox
                      value={d.school}
                      ariaLabel="School"
                      emptyText="Add a school first"
                      options={config.schools.map(s => ({
                        value: s.id,
                        label: s.name,
                        hint: s.code,
                      }))}
                      onChange={v => {
                        const next = [...config.departments]
                        next[i] = { ...d, school: v }
                        patch({ departments: next })
                      }}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-danger-soft"
                      onClick={() =>
                        patch({ departments: config.departments.filter((_, x) => x !== i) })
                      }
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="card-pad">
            <button
              className="btn btn-soft"
              onClick={() =>
                patch({
                  departments: [
                    ...config.departments,
                    { code: 'NEW', name: 'New department', school: config.schools[0]?.id ?? '' },
                  ],
                })
              }
            >
              + Add department
            </button>
          </div>
        </div>
      </Section>
    </Section>
  )
}

/**
 * The shape of the teaching day.
 *
 * Constant for the institution: when the day starts and ends, how long a period
 * is, where the shifts divide it. Split out of the old combined calendar step
 * because term dates change every session and none of this does.
 */
