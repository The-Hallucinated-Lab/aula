import { useMemo, useState } from 'react'
import { useApp } from '../store'
import { useToast } from '../components/Toast'
import { Callout, Field, Hero, NumberInput, Pill, Section, Switch, TextInput } from '../components/ui'
import { CATALOGUE, COUNTS, DOMAINS, TOPIC_NAME } from '../data/constraints/catalogue'
import type { ConstraintDef, ParamDef } from '../data/constraints/types'
import { isImplemented } from '../engine/rules'
import { CustomRules } from '../components/CustomRules'

type Facet = 'all' | 'hard' | 'soft' | 'enforced' | 'advisory' | 'tuned' | 'off'

const FACETS: { id: Facet; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'hard', label: 'Hard' },
  { id: 'soft', label: 'Soft' },
  { id: 'enforced', label: 'Engine-enforced' },
  { id: 'advisory', label: 'Advisory' },
  { id: 'tuned', label: 'Has settings' },
  { id: 'off', label: 'Disabled' },
]

export function Constraints() {
  const { states, toggleConstraint, setWeight, setParam, bulkSet, resetConstraints, report } = useApp()
  const toast = useToast()

  const [query, setQuery] = useState('')
  const [facet, setFacet] = useState<Facet>('all')
  const [open, setOpen] = useState<Set<string>>(new Set(['universal']))

  const enforcedCount = useMemo(() => CATALOGUE.filter(c => isImplemented(c.rule)).length, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return CATALOGUE.filter(c => {
      const st = states[c.id]
      if (facet === 'hard' && !c.hard) return false
      if (facet === 'soft' && c.hard) return false
      if (facet === 'enforced' && !isImplemented(c.rule)) return false
      if (facet === 'advisory' && isImplemented(c.rule)) return false
      if (facet === 'tuned' && c.params.length === 0) return false
      if (facet === 'off' && st?.enabled !== false) return false
      if (!q) return true
      return c.text.toLowerCase().includes(q)
        || c.id.toLowerCase().includes(q)
        || String(c.n) === q
        || (TOPIC_NAME.get(c.topic) ?? '').toLowerCase().includes(q)
    })
  }, [query, facet, states])

  const byDomain = useMemo(() => {
    const map = new Map<string, ConstraintDef[]>()
    for (const c of matches) {
      const list = map.get(c.domainId)
      if (list) list.push(c); else map.set(c.domainId, [c])
    }
    return map
  }, [matches])

  const activeHard = CATALOGUE.filter(c => c.hard && states[c.id]?.enabled).length
  const activeSoft = CATALOGUE.filter(c => !c.hard && states[c.id]?.enabled).length

  /** constraints that actually blocked placements in the last solve */
  const bottleneckByCode = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of report?.bottlenecks ?? []) m.set(b.code, b.blocked)
    return m
  }, [report])

  const searching = query.trim().length > 0

  return (
    <div className="fade-in">
      <Hero
        eyebrow="Constraint catalogue"
        title={<>All <strong>500 rules</strong>, yours to shape</>}
        desc="Hard constraints are guarantees the solver must honour. Soft constraints are weighted preferences it optimises. Every rule can be switched off, re-weighted, and — where it takes a number — retuned to your institution."
        side={
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Pill tone="hard">{activeHard} hard active</Pill>
            <Pill tone="soft">{activeSoft} soft active</Pill>
            <button className="btn btn-ghost" onClick={() => { resetConstraints(); toast('Catalogue reset to defaults') }}>
              Reset all
            </button>
          </div>
        }
      />

      <main className="page">
        <div className="grid grid-4" style={{ marginBottom: 22 }}>
          <div className="card stat">
            <span className="stat-label">In the catalogue</span>
            <span className="stat-value tnum">{COUNTS.total}</span>
            <span className="stat-note">verbatim, numbered 1–500</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Engine-enforced</span>
            <span className="stat-value tnum">{enforcedCount}</span>
            <span className="stat-note good">checked on every placement</span>
          </div>
          <div className="card stat">
            <span className="stat-label">Advisory</span>
            <span className="stat-value tnum">{COUNTS.total - enforcedCount}</span>
            <span className="stat-note">tracked for human sign-off</span>
          </div>
          <div className="card stat">
            <span className="stat-label">With editable settings</span>
            <span className="stat-value tnum">{COUNTS.parameterised}</span>
            <span className="stat-note">hours, minutes, thresholds</span>
          </div>
        </div>

        <Callout tone="info" title="Enforced versus advisory — the honest split">
          An <b>enforced</b> rule is wired to engine logic: the solver refuses (hard) or pays a
          weighted penalty (soft) on every candidate placement, and rejections are attributed to
          it by number. An <b>advisory</b> rule is one this build cannot decide from the data
          model alone — exam-week seating, hazardous-waste pickup windows, catering rotas. Those
          stay in the catalogue, stay switchable, and are exported for the registrar to sign off.
          Nothing here silently pretends to be checked.
        </Callout>

        <CustomRules />

        <div className="filter-bar">
          <div className="search">
            <span aria-hidden>⌕</span>
            <input
              className="input"
              type="search"
              placeholder="Search 500 constraints — try “lunch”, “travel”, “184”…"
              aria-label="Search constraints"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="tabs" role="radiogroup" aria-label="Filter constraints">
            {FACETS.map(f => (
              <button
                key={f.id}
                role="radio"
                aria-checked={facet === f.id}
                className={facet === f.id ? 'active' : ''}
                onClick={() => setFacet(f.id)}
              >{f.label}</button>
            ))}
          </div>
          <span className="small muted tnum" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {matches.length} shown
          </span>
        </div>

        {matches.length === 0 && (
          <div className="card card-pad" style={{ textAlign: 'center', color: 'var(--ink-2)' }}>
            No constraint matches that filter.
          </div>
        )}

        <div className="stack" style={{ gap: 14 }}>
          {DOMAINS.map(domain => {
            const items = byDomain.get(domain.id) ?? []
            if (items.length === 0) return null
            const expanded = searching || open.has(domain.id)
            const codes = items.map(c => c.id)
            const onCount = items.filter(c => states[c.id]?.enabled).length

            return (
              <div key={domain.id} className="card" style={{ overflow: 'hidden' }}>
                <button
                  className="domain-head"
                  aria-expanded={expanded}
                  onClick={() => {
                    const next = new Set(open)
                    if (next.has(domain.id)) next.delete(domain.id); else next.add(domain.id)
                    setOpen(next)
                  }}
                >
                  <span className="domain-numeral">{domain.numeral}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="domain-name">{domain.name}</span>
                    <span className="domain-blurb">{domain.blurb}</span>
                  </span>
                  <span className="row" style={{ gap: 8, flexShrink: 0 }}>
                    <span className="small muted tnum">{onCount}/{items.length} on</span>
                    <span className={`domain-caret ${expanded ? 'open' : ''}`} aria-hidden>›</span>
                  </span>
                </button>

                {expanded && (
                  <>
                    <div className="domain-bulk">
                      <button className="btn btn-ghost" onClick={() => bulkSet(codes, true)}>Enable all shown</button>
                      <button className="btn btn-ghost" onClick={() => bulkSet(codes, false)}>Disable all shown</button>
                    </div>
                    {items.map((c, idx) => (
                      <ConstraintRow
                        key={c.id}
                        def={c}
                        first={idx === 0}
                        blocked={bottleneckByCode.get(c.id)}
                        onToggle={() => {
                          toggleConstraint(c.id)
                          if (c.hard && states[c.id]?.enabled) {
                            toast(`${c.id} off — the next solve will not guarantee this`, 'danger')
                          }
                        }}
                        onWeight={w => setWeight(c.id, w)}
                        onParam={(k, v) => setParam(c.id, k, v)}
                      />
                    ))}
                  </>
                )}
              </div>
            )
          })}
        </div>

        <Section title="When rules collide" hint="Constraint 499 — clear error logs on an impossible loop">
          <div className="card card-pad" style={{ background: 'linear-gradient(135deg, var(--accent-wash), var(--surface))' }}>
            <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
              <span style={{
                fontSize: 26, width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                background: 'var(--accent-soft)', display: 'grid', placeItems: 'center',
              }} aria-hidden>⚖</span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Infeasibility is explained, not hidden</div>
                <p className="small" style={{ color: 'var(--ink-2)', marginTop: 6, maxWidth: 680, lineHeight: 1.65 }}>
                  When the enabled hard rules cannot all hold, Aula does not show a blank grid. Every
                  rejected placement is attributed to the constraint number that blocked it, the
                  worst offenders are ranked on the Overview, and each unplaced session names the
                  rule to relax. Over-constrain on purpose and watch it tell you exactly where it hurts.
                </p>
              </div>
            </div>
          </div>
        </Section>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ConstraintRow(props: {
  def: ConstraintDef
  first: boolean
  blocked?: number
  onToggle: () => void
  onWeight: (w: number) => void
  onParam: (key: string, value: number | string | boolean) => void
}) {
  const { def } = props
  const state = useApp(s => s.states[def.id])
  const [showParams, setShowParams] = useState(false)
  if (!state) return null

  const enforced = isImplemented(def.rule)

  return (
    <div>
      {!props.first && <div className="divider" style={{ margin: 0 }} />}
      <div className="constraint-row">
        <span className={`chip ${def.hard ? 'chip-hard' : 'chip-soft'} mono`} style={{ flexShrink: 0 }}>
          {def.id}
        </span>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="constraint-text">{def.text}</div>
          <div className="row constraint-meta">
            <span className={`tag ${enforced ? 'tag-on' : ''}`}>
              {enforced ? 'engine-enforced' : 'advisory'}
            </span>
            <span className="tag">{TOPIC_NAME.get(def.topic) ?? def.topic}</span>
            {props.blocked !== undefined && (
              <span className="tag tag-warn">blocked {props.blocked.toLocaleString()} placements last solve</span>
            )}
            {def.params.length > 0 && (
              <button className="tag tag-button" onClick={() => setShowParams(v => !v)}>
                {showParams ? 'hide settings' : `${def.params.length} setting${def.params.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>

          {!def.hard && state.enabled && (
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <span className="small muted">weight</span>
              <div className="row" style={{ gap: 3 }} role="group" aria-label={`Weight for ${def.id}`}>
                {[1, 2, 3, 4, 5].map(w => (
                  <button
                    key={w}
                    className="weight-pip"
                    aria-label={`Set weight ${w}`}
                    aria-pressed={w <= state.weight}
                    onClick={() => props.onWeight(w)}
                    style={{ background: w <= state.weight ? 'var(--accent)' : 'var(--line)' }}
                  />
                ))}
              </div>
            </div>
          )}

          {showParams && def.params.length > 0 && (
            <div className="param-grid">
              {def.params.map(p => (
                <ParamEditor
                  key={p.key}
                  def={p}
                  value={state.values[p.key] ?? p.def}
                  onChange={v => props.onParam(p.key, v)}
                />
              ))}
            </div>
          )}
        </div>

        <Switch on={state.enabled} onChange={props.onToggle} label={`Toggle ${def.id}`} />
      </div>
    </div>
  )
}

function ParamEditor(props: {
  def: ParamDef
  value: number | string | boolean
  onChange: (v: number | string | boolean) => void
}) {
  const { def } = props
  if (def.kind === 'bool') {
    return (
      <div className="param-item spread">
        <span className="field-label">{def.label}</span>
        <Switch on={Boolean(props.value)} onChange={() => props.onChange(!props.value)} label={def.label} />
      </div>
    )
  }
  if (def.kind === 'time') {
    return (
      <div className="param-item">
        <Field label={def.label}>
          <TextInput type="time" value={String(props.value)} onChange={props.onChange} ariaLabel={def.label} />
        </Field>
      </div>
    )
  }
  return (
    <div className="param-item">
      <Field label={def.label}>
        <NumberInput
          value={Number(props.value)}
          min={def.min}
          max={def.max}
          step={def.step}
          suffix={def.unit}
          ariaLabel={def.label}
          onChange={props.onChange}
        />
      </Field>
    </div>
  )
}
