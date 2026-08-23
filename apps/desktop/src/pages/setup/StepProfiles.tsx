import { Callout, Combobox, Section, TextInput } from '../../components/ui'
import { copyProfile, type SetupConfig } from '@aula/core/data/config'
import { nextId, type StepProps } from './steps'

/**
 * Curriculum profiles — the batch policy a cohort was admitted under.
 *
 * Policies change between intakes (one elective in one year, two in the next),
 * so a profile is versioned by batch and copied forward rather than edited in
 * place. Archiving retires a profile once its cohorts graduate.
 */

export function StepProfiles({ config, patch }: StepProps) {
  const live = config.profiles.filter(p => !p.archived)
  const archived = config.profiles.filter(p => p.archived)
  const assignments = config.overrides?.profiles ?? {}

  const setProfiles = (profiles: SetupConfig['profiles']) => patch({ profiles })
  const assign = (key: string, id: string) =>
    patch({
      overrides: { ...config.overrides, profiles: { ...assignments, [key]: id } },
    })

  return (
    <Section title="Curriculum policy" hint="What each year of each programme actually carries">
      <Callout tone="info" title="Why batches differ">
        Course load changes between intakes &mdash; one year takes a single elective, the next takes
        two &mdash; while the programme itself does not. A profile records only what changed, so
        nothing else has to be restated.
      </Callout>

      <div style={{ height: 16 }} />

      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: 160 }}>Intake</th>
              <th style={{ width: 120 }}>Changes</th>
              <th style={{ width: 190 }}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {live.map(prof => (
              <tr key={prof.id}>
                <td>
                  <TextInput
                    value={prof.name}
                    ariaLabel="Profile name"
                    onChange={v => {
                      const next = [...config.profiles]
                      next[config.profiles.indexOf(prof)] = { ...prof, name: v }
                      setProfiles(next)
                    }}
                  />
                </td>
                <td>
                  <TextInput
                    value={prof.batchLabel}
                    placeholder="2025-2029"
                    ariaLabel="Intake"
                    onChange={v => {
                      const next = [...config.profiles]
                      next[config.profiles.indexOf(prof)] = { ...prof, batchLabel: v }
                      setProfiles(next)
                    }}
                  />
                </td>
                <td className="small muted tnum">{Object.keys(prof.policy).length}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() =>
                      setProfiles([
                        ...config.profiles,
                        copyProfile(prof, `${prof.name} (copy)`, ''),
                      ])
                    }
                  >
                    Copy from
                  </button>
                  <button
                    className="btn btn-danger-soft"
                    style={{ marginLeft: 8 }}
                    disabled={live.length <= 1}
                    title={
                      live.length <= 1
                        ? 'At least one live profile is required'
                        : 'Keeps it for old timetables but stops offering it'
                    }
                    onClick={() => {
                      const next = [...config.profiles]
                      next[config.profiles.indexOf(prof)] = { ...prof, archived: true }
                      setProfiles(next)
                    }}
                  >
                    Archive
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
              setProfiles([
                ...config.profiles,
                {
                  id: nextId('profile'),
                  name: 'New profile',
                  batchLabel: '',
                  archived: false,
                  policy: {},
                },
              ])
            }
          >
            + Add profile
          </button>
        </div>
      </div>

      {archived.length > 0 && (
        <details className="card-pad advanced" style={{ marginTop: 14 }}>
          <summary className="small muted">{archived.length} archived</summary>
          <div style={{ marginTop: 10 }}>
            {archived.map(prof => (
              <div key={prof.id} className="spread small" style={{ padding: '5px 0' }}>
                <span>
                  {prof.name}
                  {prof.batchLabel ? ` · ${prof.batchLabel}` : ''}
                </span>
                <button
                  className="btn btn-ghost"
                  onClick={() =>
                    setProfiles(
                      config.profiles.map(x => (x.id === prof.id ? { ...x, archived: false } : x)),
                    )
                  }
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      <div style={{ height: 20 }} />

      <Section title="Which year follows which" hint="Leave unset to follow the first live profile">
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Programme</th>
                <th style={{ width: 90 }}>Year</th>
                <th style={{ width: 260 }}>Profile</th>
              </tr>
            </thead>
            <tbody>
              {config.programs.flatMap(prog =>
                Array.from({ length: Math.max(1, prog.years) }, (_, y) => {
                  const key = `${prog.id}:${y + 1}`
                  return (
                    <tr key={key}>
                      <td className="small">{prog.code}</td>
                      <td className="small tnum">{y + 1}</td>
                      <td>
                        <Combobox
                          value={assignments[key] ?? ''}
                          ariaLabel={`Profile for ${prog.code} year ${y + 1}`}
                          options={[
                            { value: '', label: 'Default', hint: live[0]?.name ?? '' },
                            ...live.map(prof => ({
                              value: prof.id,
                              label: prof.name,
                              hint: prof.batchLabel,
                            })),
                          ]}
                          onChange={v => assign(key, v)}
                        />
                      </td>
                    </tr>
                  )
                }),
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </Section>
  )
}
