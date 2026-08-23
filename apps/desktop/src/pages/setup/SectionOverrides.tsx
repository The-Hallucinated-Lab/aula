import { useApp } from '../../store'
import { NumberInput } from '../../components/ui'
import { type ProgramConfig } from '@aula/core/data/config'

/**
 * Per-year section counts for one programme, where they differ from its default.
 */

export function SectionOverrides({ program }: { program: ProgramConfig }) {
  const { config, setSections } = useApp()
  const overrides = config.overrides?.sections ?? {}

  return (
    <div className="panel" style={{ marginTop: 14, padding: '12px 16px' }}>
      <div className="spread" style={{ marginBottom: 10 }}>
        <span className="field-label">Sections by year</span>
        <span className="small muted">overrides the programme default</span>
      </div>
      <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
        {Array.from({ length: Math.max(1, program.years) }, (_, k) => k + 1).map(year => {
          const key = `${program.id}:${year}`
          const value = overrides[key] ?? program.sectionsPerYear
          return (
            <label key={year} className="row" style={{ gap: 8 }}>
              <span className="small muted" style={{ minWidth: 46 }}>
                Year {year}
              </span>
              <span style={{ width: 92 }}>
                <NumberInput
                  value={value}
                  min={0}
                  max={30}
                  ariaLabel={`Sections in year ${year}`}
                  onChange={n => setSections(program.id, year, n)}
                />
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
