import { SCENARIOS, useApp } from '../store'
import { Callout, Hero, Meter, Section, Stat } from '../components/ui'
import { useToast } from '../components/Toast'
import { StaleNotice } from '../components/StaleNotice'

export function Scenarios() {
  const { activeScenario, regenerate, metrics, report, solving, phase, setupComplete } = useApp()
  const toast = useToast()

  const run = async (id: typeof SCENARIOS[number]['id']) => {
    await regenerate(id)
    const s = SCENARIOS.find(x => x.id === id)
    toast(`Re-solved with “${s?.name}”`, 'ok')
  }

  return (
    <div className="fade-in">
      <Hero
        eyebrow="Scenario planning"
        title={<>Same rules, <strong>different priorities</strong></>}
        desc="Hard constraints never move. What changes is how the solver spends its soft budget — whether it protects student breaks, packs rooms, or front-loads the morning."
        side={
          solving
            ? <span className="engine-chip"><span className="engine-dot" />{phase || 'Solving…'}</span>
            : <span className="small muted">{report ? `last solve ${report.elapsedMs} ms` : 'not solved yet'}</span>
        }
      />

      <main className="page">
        <StaleNotice />
        {!setupComplete && (
          <Callout tone="warn" title="Run setup first">
            Scenarios re-solve the timetable, so the institution has to be described before they mean anything.
          </Callout>
        )}

        <div className="grid grid-2">
          {SCENARIOS.map(s => {
            const active = s.id === activeScenario
            return (
              <div key={s.id} className={`card card-pad scenario ${active ? 'active' : ''}`}>
                <div className="spread" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div className="card-title">{s.name}</div>
                    <p className="small muted" style={{ marginTop: 4, maxWidth: 340 }}>{s.tagline}</p>
                  </div>
                  {active && <span className="chip chip-ok">active</span>}
                </div>

                <div className="stack" style={{ gap: 10, margin: '16px 0' }}>
                  <Weight label="Compact days, fewer gaps" value={s.weights.gaps} />
                  <Weight label="Room utilisation" value={s.weights.utilization} />
                  <Weight label="Even staff workload" value={s.weights.loadBalance} />
                  <Weight label="Student welfare" value={s.weights.welfare} />
                </div>

                <button
                  className={`btn ${active ? 'btn-soft' : 'btn-primary'}`}
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={solving || !setupComplete}
                  onClick={() => run(s.id)}
                >
                  {solving ? 'Solving…' : active ? 'Re-solve with this profile' : 'Apply this profile'}
                </button>
              </div>
            )
          })}
        </div>

        {report && (
          <Section title="How the current solve landed" hint="Measured, not predicted">
            <div className="grid grid-4">
              <Stat label="Placed" value={`${report.placed}/${report.requested}`} note="required meetings" />
              <Stat label="Soft penalty" value={report.penalty.toLocaleString()} note="lower is better" />
              <Stat
                label="Morning share"
                value={`${Math.round(metrics.morningShare * 100)}%`}
                note="teaching before midday"
              />
              <Stat
                label="Avg gaps"
                value={metrics.avgGapsPerCohort.toFixed(1)}
                note="free slots per section per week"
                tone={metrics.avgGapsPerCohort < 6 ? 'good' : 'bad'}
              />
            </div>
            <p className="small muted" style={{ marginTop: 14, lineHeight: 1.6, maxWidth: 780 }}>
              Re-solving uses a fresh random seed, so two runs of the same profile can differ
              slightly. Both will satisfy every enabled hard constraint — that part is not
              probabilistic.
            </p>
          </Section>
        )}
      </main>
    </div>
  )
}

function Weight({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="spread small" style={{ marginBottom: 5 }}>
        <span className="muted">{label}</span>
        <span className="mono tnum">{value}/5</span>
      </div>
      <Meter value={value / 5} />
    </div>
  )
}
