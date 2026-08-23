import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store'
import { Callout, Empty, Hero, Meter, Pill, Section, Stat, SERIES } from '../components/ui'
import { CATALOGUE } from '@aula/core/data/constraints/catalogue'
import { isImplemented } from '@aula/core/engine/rules'
import { DAY_SHORT } from '@aula/core/data/model'
import { StaleNotice } from '../components/StaleNotice'

export function Overview() {
  const {
    institution,
    metrics,
    report,
    activity,
    states,
    solving,
    phase,
    config,
    summary,
    lastError,
  } = useApp()
  const navigate = useNavigate()
  const grid = institution.grid

  const enabledEnforced = useMemo(
    () => CATALOGUE.filter(c => isImplemented(c.rule) && states[c.id]?.enabled).length,
    [states],
  )

  const unplacedTotal = report?.unplaced.reduce((a, u) => a + u.missing, 0) ?? 0
  const hardViolations = report?.violations.filter(v => v.hard) ?? []
  const softViolations = report?.violations.filter(v => !v.hard) ?? []

  if (!report) {
    return (
      <div className="fade-in">
        <Hero
          eyebrow={config.institution.name}
          title={
            <>
              A timetable that <strong>explains itself</strong>
            </>
          }
          desc="Enter your real numbers — students, programmes, classrooms, staff — switch on the constraints that apply to you, and generate. Every rejection is traced back to the rule that caused it."
        />
        <main className="page">
          <Empty
            title={solving ? phase || 'Solving…' : 'No timetable generated yet'}
            desc={`Your configuration currently describes ${summary.students.toLocaleString()} students across ${summary.cohorts} cohorts, ${summary.rooms} rooms and ${summary.staffTotal} staff.`}
            action={
              <button className="btn btn-primary" onClick={() => navigate('/setup')}>
                Start setup
              </button>
            }
          />
        </main>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <Hero
        eyebrow={`${config.institution.name} · ${config.institution.academicYear} · ${config.institution.term}`}
        title={
          <>
            Week generated in <strong>{(report.elapsedMs / 1000).toFixed(1)}s</strong>
          </>
        }
        desc={`${report.placed} of ${report.requested} required meetings placed across ${institution.cohorts.length} cohorts, checked against ${enabledEnforced} engine-enforced constraints.`}
        side={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Pill tone={metrics.hardClashes === 0 ? 'ok' : 'danger'}>
              {metrics.hardClashes === 0 ? '0 hard clashes' : `${metrics.hardClashes} hard clashes`}
            </Pill>
            <Pill tone={unplacedTotal === 0 ? 'ok' : 'warn'}>
              {unplacedTotal === 0 ? 'fully placed' : `${unplacedTotal} unplaced`}
            </Pill>
          </div>
        }
      />

      <main className="page">
        <StaleNotice />
        {lastError && (
          <Callout tone="danger" title="Last solve failed">
            {lastError}
          </Callout>
        )}

        <div className="grid grid-4">
          <Stat
            label="Sessions placed"
            value={report.placed}
            note={
              unplacedTotal === 0 ? 'every required meeting' : `${unplacedTotal} still unplaced`
            }
            tone={unplacedTotal === 0 ? 'good' : 'bad'}
          />
          <Stat
            label="Room utilisation"
            value={`${(metrics.utilization * 100).toFixed(1)}%`}
            note={`${metrics.contactHours} of ${institution.rooms.length * grid.days.length * grid.slots} room-slots`}
          />
          <Stat
            label="Load spread"
            value={`±${metrics.loadStdDev.toFixed(1)}`}
            note="hours std-dev across staff"
            tone={metrics.loadStdDev < 3 ? 'good' : undefined}
          />
          <Stat
            label="Protected breaks"
            value={`${Math.round(metrics.lunchProtected * 100)}%`}
            note="section-days keeping a lunch slot"
            tone={metrics.lunchProtected > 0.95 ? 'good' : 'bad'}
          />
        </div>

        {/* --- infeasibility, front and centre --- */}
        {(unplacedTotal > 0 || hardViolations.length > 0) && (
          <Section title="What did not fit" hint="Each row names the constraint to relax">
            <div className="stack" style={{ gap: 10 }}>
              {hardViolations.slice(0, 6).map((v, i) => (
                <Callout key={i} tone="danger" title={`${v.code} — hard violation`}>
                  {v.message}
                </Callout>
              ))}
              {report.unplaced.slice(0, 10).map((u, i) => (
                <div key={i} className="card card-pad">
                  <div className="spread" style={{ alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{u.courseLabel}</div>
                      <div className="small muted" style={{ marginTop: 2 }}>
                        {u.cohortLabel} · {u.missing} meeting{u.missing === 1 ? '' : 's'} unplaced
                      </div>
                      <div className="small" style={{ marginTop: 8, color: 'var(--ink-2)' }}>
                        {u.reason}
                      </div>
                    </div>
                    <div
                      className="row"
                      style={{
                        gap: 6,
                        flexWrap: 'wrap',
                        justifyContent: 'flex-end',
                        flexShrink: 0,
                      }}
                    >
                      {u.blockedBy.map(code => (
                        <button
                          key={code}
                          className="chip chip-danger mono"
                          onClick={() => navigate('/constraints')}
                          title="Open the constraint catalogue"
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {report.unplaced.length > 10 && (
                <p className="small muted">+{report.unplaced.length - 10} more unplaced groups.</p>
              )}
            </div>
          </Section>
        )}

        <div className="grid grid-main-side">
          <div>
            <Section title="Where the week sits" hint="Rooms occupied per slot">
              <div className="card card-pad">
                <div
                  className="heat"
                  style={{ gridTemplateColumns: `48px repeat(${grid.slots}, 1fr)` }}
                >
                  <span />
                  {grid.labels.map(l => (
                    <span key={l} className="heat-time">
                      {l}
                    </span>
                  ))}
                  {grid.days.map((day, di) => (
                    <HeatRow
                      key={day}
                      label={DAY_SHORT[day] ?? ''}
                      row={metrics.heatmap[di] ?? []}
                      peak={Math.max(1, ...metrics.heatmap.flat())}
                      labels={grid.labels}
                    />
                  ))}
                </div>
                <p className="small muted" style={{ marginTop: 12 }}>
                  Darker means more rooms in use. Gaps are the slack constraint 481 asks you to
                  keep.
                </p>
              </div>
            </Section>

            <Section
              title="Constraints that cost the most"
              hint="Placements each rule refused during the solve"
            >
              <div className="card card-pad">
                {report.bottlenecks.length === 0 && (
                  <p className="small muted">Nothing blocked a placement.</p>
                )}
                <div className="stack" style={{ gap: 12 }}>
                  {report.bottlenecks.slice(0, 8).map(b => {
                    const peak = report.bottlenecks[0]?.blocked || 1
                    return (
                      <div key={b.code} className="bar-row">
                        <span className="bar-name">
                          <span className={`chip ${b.hard ? 'chip-hard' : 'chip-soft'} mono`}>
                            {b.code}
                          </span>
                          <span className="small" style={{ marginLeft: 8 }}>
                            {truncate(b.label, 74)}
                          </span>
                        </span>
                        <span className="bar-track">
                          <span
                            className="bar-fill"
                            style={{
                              width: `${(b.blocked / peak) * 100}%`,
                              background: b.hard ? 'var(--accent)' : 'var(--series-3)',
                            }}
                          />
                        </span>
                        <span className="bar-val tnum">{b.blocked.toLocaleString()}</span>
                      </div>
                    )
                  })}
                </div>
                <p className="small muted" style={{ marginTop: 14, lineHeight: 1.6 }}>
                  A high count is not automatically bad — resource-exclusivity rules reject
                  constantly by design. It becomes actionable when a rule you could relax sits at
                  the top and sessions went unplaced.
                </p>
              </div>
            </Section>

            {softViolations.length > 0 && (
              <Section title="Soft findings" hint="Advisory checks that fired after the solve">
                <div className="card" style={{ overflow: 'hidden' }}>
                  {softViolations.slice(0, 12).map((v, i) => (
                    <div key={i}>
                      {i > 0 && <div className="divider" style={{ margin: 0 }} />}
                      <div className="row" style={{ padding: '11px 20px', gap: 12 }}>
                        <span className="chip chip-warn mono">{v.code}</span>
                        <span className="small">{v.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>

          <div className="stack" style={{ gap: 18 }}>
            <Section title="Teaching load by department">
              <div className="card card-pad stack" style={{ gap: 12 }}>
                {institution.departments.map(d => {
                  const load = metrics.deptLoad.find(x => x.deptId === d.id)?.sessions ?? 0
                  const peak = Math.max(1, ...metrics.deptLoad.map(x => x.sessions))
                  return (
                    <div key={d.id}>
                      <div className="spread small" style={{ marginBottom: 5 }}>
                        <span className="row" style={{ gap: 7 }}>
                          <span
                            className="dot"
                            style={{ background: SERIES[d.colorIndex % SERIES.length] }}
                          />
                          <b>{d.code}</b>
                        </span>
                        <span className="mono tnum muted">{load} h</span>
                      </div>
                      <Meter
                        value={load / peak}
                        tone={SERIES[d.colorIndex % SERIES.length] ?? ''}
                      />
                    </div>
                  )
                })}
              </div>
            </Section>

            <Section title="Activity" hint="Every change is logged">
              <div className="card feed">
                {activity.length === 0 && <div className="card-pad small muted">Nothing yet.</div>}
                {activity.slice(0, 12).map(a => (
                  <div key={a.id} className="feed-item">
                    <span className="feed-time">{a.time}</span>
                    <span className="feed-icon" style={{ background: iconBg(a.kind) }}>
                      {icon(a.kind)}
                    </span>
                    <span className="small">{a.text}</span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>
      </main>
    </div>
  )
}

function HeatRow(props: { label: string; row: number[]; peak: number; labels: string[] }) {
  return (
    <>
      <span className="heat-label">{props.label}</span>
      {props.labels.map((l, i) => {
        const v = props.row[i] ?? 0
        const t = v / props.peak
        return (
          <span
            key={l}
            className="heat-cell"
            title={`${props.label} ${l} — ${v} room${v === 1 ? '' : 's'} in use`}
            style={{
              background:
                t === 0
                  ? 'var(--surface-3)'
                  : `color-mix(in srgb, var(--accent) ${Math.round(t * 88)}%, var(--surface-2))`,
            }}
          />
        )
      })}
    </>
  )
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

function icon(kind: string) {
  switch (kind) {
    case 'generate':
      return '✦'
    case 'move':
      return '↔'
    case 'substitute':
      return '⇄'
    case 'constraint':
      return '⚙'
    case 'scenario':
      return '◈'
    case 'reject':
      return '⊘'
    case 'setup':
      return '▤'
    case 'io':
      return '⇩'
    default:
      return '·'
  }
}

function iconBg(kind: string) {
  switch (kind) {
    case 'reject':
      return 'var(--danger-soft)'
    case 'substitute':
      return 'var(--warn-soft)'
    case 'generate':
      return 'var(--accent-soft)'
    default:
      return 'var(--surface-3)'
  }
}
