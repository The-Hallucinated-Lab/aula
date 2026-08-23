import { useMemo } from 'react'
import { useApp } from '../../store'
import { Callout, NumberInput, Section, SERIES } from '../../components/ui'
import { HELP } from '../../content/help'

/**
 * Sections.
 *
 * Read-only: a section is derived from its programme’s year and section count,
 * so it is changed in Setup rather than here.
 */

export function CohortsTab() {
  const { institution, sessions, config, setSections } = useApp()

  const hoursByCohort = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of sessions) m.set(s.cohortId, (m.get(s.cohortId) ?? 0) + s.length)
    return m
  }, [sessions])

  const totalStudents = institution.cohorts.reduce((a, c) => a + c.size, 0)
  const overrides = config.overrides?.sections ?? {}

  return (
    <>
      <Callout tone="info" title="What a section is">
        {HELP.cohort}
      </Callout>

      <Section
        title="Sections by department and year"
        hint="Add or remove sections without touching the programme defaults"
      >
        <div className="stack" style={{ gap: 12 }}>
          {config.programs.map(program => {
            const dept = institution.departments.find(d => d.code === program.dept)
            return (
              <div key={program.id} className="card card-pad">
                <div className="spread" style={{ marginBottom: 12 }}>
                  <span className="row" style={{ gap: 8 }}>
                    <span
                      className="dot"
                      style={{ background: SERIES[(dept?.colorIndex ?? 0) % SERIES.length] }}
                    />
                    <b>{program.code}</b>
                    <span className="small muted">{program.name}</span>
                  </span>
                  <span className="small muted">
                    {program.studentsPerSection} students per section
                  </span>
                </div>
                <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
                  {Array.from({ length: Math.max(1, program.years) }, (_, k) => k + 1).map(year => (
                    <label key={year} className="row" style={{ gap: 8 }}>
                      <span className="small muted" style={{ minWidth: 46 }}>
                        Year {year}
                      </span>
                      <span style={{ width: 92 }}>
                        <NumberInput
                          value={overrides[`${program.id}:${year}`] ?? program.sectionsPerYear}
                          min={0}
                          max={30}
                          ariaLabel={`${program.code} year ${year} sections`}
                          onChange={n => setSections(program.id, year, n)}
                        />
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      <Section
        title="Sections"
        hint={`${totalStudents.toLocaleString()} students in ${institution.cohorts.length} cohorts`}
      >
        <div className="grid grid-3">
          {institution.departments.map(dept => {
            const rows = institution.cohorts.filter(c => c.deptId === dept.id)
            if (rows.length === 0) return null
            return (
              <div key={dept.id} className="card">
                <div className="card-head">
                  <div>
                    <div className="card-title">{dept.code}</div>
                    <div className="card-sub">{dept.name}</div>
                  </div>
                  <span
                    className="dot"
                    style={{ background: SERIES[dept.colorIndex % SERIES.length] }}
                  />
                </div>
                <div className="card-pad stack" style={{ gap: 8, paddingTop: 12 }}>
                  {rows.map(c => (
                    <div key={c.id} className="panel spread" style={{ padding: '10px 14px' }}>
                      <span>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{c.name}</span>
                        {c.needsAccessibleRooms && (
                          <span className="chip chip-accent" style={{ marginLeft: 8 }}>
                            access needs
                          </span>
                        )}
                      </span>
                      <span className="small muted tnum">
                        {c.size} students · {hoursByCohort.get(c.id) ?? 0} h/wk
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Section>
    </>
  )
}
