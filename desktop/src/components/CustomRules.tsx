import { useState } from 'react'
import { useApp } from '../store'
import { useToast } from './Toast'
import { Callout, Combobox, Field, NumberInput, Section, Switch, TextInput } from './ui'
import {
  TEMPLATES, TEMPLATE_BY_ID,
  type CustomConstraint, type CustomTemplate, type ScopeKind,
} from '../data/constraints/custom'
import { DAY_NAMES, DAY_SHORT } from '../data/model'

const SCOPE_LABELS: Record<ScopeKind, string> = {
  all: 'Everyone',
  cohort: 'One cohort',
  staff: 'One staff member',
  department: 'One department',
  course: 'One course',
  room: 'One room',
}

/**
 * Institution-specific rules.
 *
 * These sit alongside the 500-rule catalogue and are evaluated by the same
 * engine in the same pass, so a hard custom rule binds exactly as tightly as a
 * hard catalogue rule.
 */
export function CustomRules() {
  const { config, institution, addCustom, updateCustom, removeCustom } = useApp()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [template, setTemplate] = useState<CustomTemplate>('blockSlot')
  const [scopeKind, setScopeKind] = useState<ScopeKind>('all')
  const [scopeId, setScopeId] = useState('')

  const rules = config.customConstraints ?? []
  const meta = TEMPLATE_BY_ID.get(template)!
  const allowedScopes = meta.scopes

  const options = scopeOptions(scopeKind, institution)
  const effectiveScopeId = options.some(o => o.id === scopeId) ? scopeId : options[0]?.id ?? ''
  const scopeLabel = scopeKind === 'all'
    ? 'Everyone'
    : options.find(o => o.id === effectiveScopeId)?.label ?? 'the selected item'

  const create = () => {
    addCustom(template, { kind: scopeKind, id: scopeKind === 'all' ? undefined : effectiveScopeId }, scopeLabel)
    setAdding(false)
    toast('Rule added — regenerate to apply it', 'ok')
  }

  return (
    <Section
      title="Your own rules"
      hint={`${rules.length} institution-specific rule${rules.length === 1 ? '' : 's'} on top of the 500`}
      side={
        <button className="btn btn-soft" onClick={() => setAdding(v => !v)}>
          {adding ? 'Cancel' : '+ Add a rule'}
        </button>
      }
    >
      {adding && (
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="field-grid">
            <Field label="Rule" hint={meta.blurb}>
              <Combobox
                value={template}
                ariaLabel="Rule type"
                options={TEMPLATES.map(t => ({ value: t.id, label: t.name, keywords: t.blurb }))}
                onChange={v => {
                  const next = v as CustomTemplate
                  setTemplate(next)
                  const scopes = TEMPLATE_BY_ID.get(next)!.scopes
                  if (!scopes.includes(scopeKind)) setScopeKind(scopes[0])
                }}
              />
            </Field>

            <Field label="Applies to">
              <Combobox
                value={scopeKind}
                ariaLabel="Scope"
                options={allowedScopes.map(s => ({ value: s, label: SCOPE_LABELS[s] }))}
                onChange={v => setScopeKind(v as ScopeKind)}
              />
            </Field>

            {scopeKind !== 'all' && (
              <Field label="Which one">
                <Combobox
                  value={effectiveScopeId}
                  ariaLabel="Scope target"
                  emptyText="Nothing of that kind exists yet"
                  options={options.map(o => ({ value: o.id, label: o.label }))}
                  onChange={setScopeId}
                />
              </Field>
            )}
          </div>

          <div className="divider" />
          <div className="spread">
            <span className="small muted">
              This will read: “{meta.phrase(scopeLabel, Object.fromEntries(meta.params.map(p => [p.key, p.def])))}”
            </span>
            <button className="btn btn-primary" onClick={create}>Add rule</button>
          </div>
        </div>
      )}

      {rules.length === 0 && !adding && (
        <Callout tone="info" title="No rules of your own yet">
          The catalogue covers the standard 500. Add rules here for the things specific to your
          institution — a protected assembly hour, a department confined to one building, a cap
          one head of school insists on. They are enforced by the same engine, and saved with
          the project.
        </Callout>
      )}

      {rules.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {rules.map((rule, idx) => (
            <div key={rule.id}>
              {idx > 0 && <div className="divider" style={{ margin: 0 }} />}
              <CustomRuleRow
                rule={rule}
                onChange={updateCustom}
                onRemove={() => { removeCustom(rule.id); toast(`Removed ${rule.id}`) }}
              />
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function CustomRuleRow(props: {
  rule: CustomConstraint
  onChange: (r: CustomConstraint) => void
  onRemove: () => void
}) {
  const { institution, config } = useApp()
  const { rule } = props
  const [open, setOpen] = useState(false)
  const meta = TEMPLATE_BY_ID.get(rule.template)
  const set = (p: Partial<CustomConstraint>) => props.onChange({ ...rule, ...p })
  const grid = institution.grid

  return (
    <div>
      <div className="constraint-row">
        <span className={`chip ${rule.hard ? 'chip-hard' : 'chip-soft'} mono`} style={{ flexShrink: 0 }}>
          {rule.id}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="constraint-text">{rule.text}</div>
          <div className="row constraint-meta">
            <span className="tag tag-on">engine-enforced</span>
            <span className="tag">{meta?.name ?? rule.template}</span>
            <span className="tag">{rule.hard ? 'hard' : `soft · weight ${rule.weight}`}</span>
            <button className="tag tag-button" onClick={() => setOpen(v => !v)}>
              {open ? 'hide settings' : 'settings'}
            </button>
          </div>
        </div>
        <Switch on={rule.enabled} label={`Toggle ${rule.id}`} onChange={() => set({ enabled: !rule.enabled })} />
      </div>

      {open && (
        <div className="record-editor">
          <div className="field-grid">
            <Field label="Wording" wide hint="Shown verbatim in reports and exports.">
              <TextInput value={rule.text} ariaLabel="Rule wording" onChange={v => set({ text: v })} />
            </Field>

            {(meta?.params ?? []).map(p => {
              const value = rule.params[p.key]
              if (p.kind === 'day') {
                return (
                  <Field key={p.key} label={p.label}>
                    <Combobox
                      value={String(value ?? 0)}
                      ariaLabel={p.label}
                      options={grid.days.map(d => ({ value: String(d), label: DAY_NAMES[d] }))}
                      onChange={v => set({ params: { ...rule.params, [p.key]: Number(v) } })}
                    />
                  </Field>
                )
              }
              if (p.kind === 'slot') {
                return (
                  <Field key={p.key} label={p.label}>
                    <Combobox
                      value={String(value ?? 0)}
                      ariaLabel={p.label}
                      options={grid.labels.map((l, i) => ({ value: String(i), label: l }))}
                      onChange={v => set({ params: { ...rule.params, [p.key]: Number(v) } })}
                    />
                  </Field>
                )
              }
              if (p.kind === 'building') {
                return (
                  <Field key={p.key} label={p.label}>
                    <Combobox
                      value={String(value ?? '')}
                      ariaLabel={p.label}
                      options={[
                        { value: '', label: '— choose —' },
                        ...config.buildings.map(b => ({ value: b.id, label: b.name })),
                      ]}
                      onChange={v => set({ params: { ...rule.params, [p.key]: v } })}
                    />
                  </Field>
                )
              }
              return (
                <Field key={p.key} label={p.label}>
                  <NumberInput
                    value={Number(value ?? 0)}
                    min={0}
                    max={40}
                    ariaLabel={p.label}
                    onChange={n => set({ params: { ...rule.params, [p.key]: n } })}
                  />
                </Field>
              )
            })}
          </div>

          <div className="divider" />

          <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
            <label className="row" style={{ gap: 10 }}>
              <Switch
                on={rule.hard}
                label="Hard rule"
                onChange={() => set({ hard: !rule.hard })}
              />
              <span className="small">
                Hard — the solver may never break it{rule.hard ? '' : ' (currently soft: it pays a penalty instead)'}
              </span>
            </label>

            {!rule.hard && (
              <label className="row" style={{ gap: 10 }}>
                <span className="small muted">weight</span>
                <div className="row" style={{ gap: 3 }}>
                  {[1, 2, 3, 4, 5].map(w => (
                    <button
                      key={w}
                      className="weight-pip"
                      aria-label={`Weight ${w}`}
                      aria-pressed={w <= rule.weight}
                      onClick={() => set({ weight: w })}
                      style={{ background: w <= rule.weight ? 'var(--accent)' : 'var(--line)' }}
                    />
                  ))}
                </div>
              </label>
            )}

            <button className="btn btn-danger-soft" style={{ marginLeft: 'auto' }} onClick={props.onRemove}>
              Delete rule
            </button>
          </div>

          <p className="field-hint" style={{ marginTop: 12 }}>
            Scope: {describeScope(rule, institution)}. Day indices follow the teaching week —
            {' '}{grid.days.map(d => DAY_SHORT[d]).join(', ')}.
          </p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

type Inst = ReturnType<typeof useApp.getState>['institution']

function scopeOptions(kind: ScopeKind, inst: Inst): { id: string; label: string }[] {
  switch (kind) {
    case 'cohort': return inst.cohorts.map(c => ({ id: c.id, label: c.name }))
    case 'staff': return inst.staff.map(f => ({ id: f.id, label: f.name }))
    case 'department': return inst.departments.map(d => ({ id: d.id, label: `${d.code} — ${d.name}` }))
    case 'course': return inst.courses.map(c => ({ id: c.id, label: `${c.code} ${c.name}` }))
    case 'room': return inst.rooms.map(r => ({ id: r.id, label: r.name }))
    default: return []
  }
}

function describeScope(rule: CustomConstraint, inst: Inst): string {
  if (rule.scope.kind === 'all') return 'everyone'
  const match = scopeOptions(rule.scope.kind, inst).find(o => o.id === rule.scope.id)
  return match ? `${SCOPE_LABELS[rule.scope.kind].toLowerCase()} — ${match.label}` : 'a target that no longer exists'
}
