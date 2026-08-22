import type { ChangeEvent, ReactNode } from 'react'

export const SERIES = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)',
  'var(--series-4)', 'var(--series-5)',
]

/** Wide page banner: eyebrow + light/bold title + optional actions on the right. */
export function Hero(props: {
  eyebrow: string
  title: ReactNode
  desc?: string
  side?: ReactNode
}) {
  return (
    <div className="hero">
      <div className="hero-inner">
        <div>
          <div className="hero-eyebrow">{props.eyebrow}</div>
          <h1>{props.title}</h1>
          {props.desc && <p className="hero-desc">{props.desc}</p>}
        </div>
        {props.side && <div className="hero-side">{props.side}</div>}
      </div>
    </div>
  )
}

export function Section(props: { title: string; hint?: string; children: ReactNode; side?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{props.title}</h2>
        {props.hint && <span className="section-hint">{props.hint}</span>}
        {props.side && <span style={{ marginLeft: 'auto' }}>{props.side}</span>}
      </div>
      {props.children}
    </section>
  )
}

export function Stat(props: { label: string; value: ReactNode; note?: ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="card stat">
      <span className="stat-label">{props.label}</span>
      <span className="stat-value tnum">{props.value}</span>
      {props.note && <span className={`stat-note ${props.tone ?? ''}`}>{props.note}</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Form primitives — used throughout the Setup wizard
 * ------------------------------------------------------------------ */

export function Field(props: {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <label className={`field ${props.wide ? 'field-wide' : ''}`} htmlFor={props.htmlFor}>
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  )
}

export function NumberInput(props: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  id?: string
  ariaLabel?: string
}) {
  const clamp = (n: number) => {
    if (Number.isNaN(n)) return props.min ?? 0
    if (props.min !== undefined && n < props.min) return props.min
    if (props.max !== undefined && n > props.max) return props.max
    return n
  }
  return (
    <span className="input-wrap">
      <input
        id={props.id}
        className="input tnum"
        type="number"
        inputMode="numeric"
        aria-label={props.ariaLabel}
        value={Number.isFinite(props.value) ? props.value : ''}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        onChange={(e: ChangeEvent<HTMLInputElement>) => props.onChange(clamp(Number(e.target.value)))}
      />
      {props.suffix && <span className="input-suffix">{props.suffix}</span>}
    </span>
  )
}

export function TextInput(props: {
  value: string
  onChange: (s: string) => void
  placeholder?: string
  id?: string
  ariaLabel?: string
  type?: 'text' | 'time'
}) {
  return (
    <input
      id={props.id}
      className="input"
      type={props.type ?? 'text'}
      aria-label={props.ariaLabel}
      value={props.value}
      placeholder={props.placeholder}
      onChange={e => props.onChange(e.target.value)}
    />
  )
}

export function Segmented<T extends string>(props: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  ariaLabel?: string
}) {
  return (
    <div className="tabs" role="radiogroup" aria-label={props.ariaLabel}>
      {props.options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          className={props.value === o.value ? 'active' : ''}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch(props: { on: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      className={`switch ${props.on ? 'on' : ''}`}
      onClick={props.onChange}
    />
  )
}

export function Callout(props: {
  tone: 'ok' | 'warn' | 'danger' | 'info'
  title: string
  children?: ReactNode
}) {
  const glyph = props.tone === 'ok' ? '✓' : props.tone === 'danger' ? '⊘' : props.tone === 'warn' ? '!' : 'i'
  return (
    <div className={`callout callout-${props.tone}`} role={props.tone === 'danger' ? 'alert' : 'status'}>
      <span className="callout-mark" aria-hidden>{glyph}</span>
      <div>
        <div className="callout-title">{props.title}</div>
        {props.children && <div className="callout-body">{props.children}</div>}
      </div>
    </div>
  )
}

export function Empty(props: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="card card-pad empty">
      <div className="empty-mark" aria-hidden>◇</div>
      <div className="empty-title">{props.title}</div>
      {props.desc && <p className="empty-desc">{props.desc}</p>}
      {props.action && <div style={{ marginTop: 16 }}>{props.action}</div>}
    </div>
  )
}

export function Meter(props: { value: number; label?: string; tone?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(props.value * 100)))
  return (
    <div>
      {props.label && (
        <div className="spread small" style={{ marginBottom: 6 }}>
          <span className="muted">{props.label}</span>
          <span className="mono tnum" style={{ fontWeight: 600 }}>{pct}%</span>
        </div>
      )}
      <div className="bar-track" style={{ height: 8 }} role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="bar-fill" style={{ width: `${pct}%`, background: props.tone ?? 'var(--accent)' }} />
      </div>
    </div>
  )
}

/** Small labelled pill used for counts across the app. */
export function Pill(props: { tone?: 'hard' | 'soft' | 'accent' | 'ok' | 'warn' | 'danger'; children: ReactNode; mono?: boolean }) {
  return <span className={`chip chip-${props.tone ?? 'soft'} ${props.mono ? 'mono' : ''}`}>{props.children}</span>
}
