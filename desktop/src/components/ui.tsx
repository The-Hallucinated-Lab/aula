import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent, ReactNode } from 'react'

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

/* ------------------------------------------------------------------ *
 * Combobox — a select you can type into
 *
 * The interface it replaces was a native `<select>`. That is fine for five
 * options and unusable for the real thing: choosing one instructor out of
 * several hundred meant scrolling a list ordered by nothing in particular,
 * several hundred times a semester. Every picker in the app now filters as you
 * type, and `hint` carries the staff code or department that tells two people
 * with the same name apart.
 *
 * Positioned absolutely inside a relative wrapper rather than fixed: every page
 * is wrapped in `.fade-in`, whose transform makes it the containing block for
 * fixed descendants (D-43), and absolute positioning simply does not care.
 * ------------------------------------------------------------------ */

export interface ComboOption {
  value: string
  label: string
  /** shown after the label — a staff code, a department, a course code */
  hint?: string
  /** matched when filtering but never displayed */
  keywords?: string
  disabled?: boolean
}

export function Combobox(props: {
  value: string
  options: ComboOption[]
  onChange: (value: string) => void
  placeholder?: string
  /** shown when there is nothing to choose from, so the reason is visible */
  emptyText?: string
  id?: string
  ariaLabel?: string
  disabled?: boolean
  /** width in px; the wrapper is inline-block so it does not stretch rows */
  width?: number
}) {
  const { options, value, onChange } = props
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = `${props.id ?? 'combo'}-list`

  const selected = options.find(o => o.value === value)
  const selectedLabel = selected ? selected.label : ''

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return options
    return options.filter(o =>
      o.label.toLowerCase().includes(q)
      || (o.hint ?? '').toLowerCase().includes(q)
      || (o.keywords ?? '').toLowerCase().includes(q))
  }, [options, query])

  // Close when focus or a click goes elsewhere.
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return
    const el = document.getElementById(`${listId}-${highlight}`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open, listId])

  const commit = (option: ComboOption | undefined) => {
    if (!option || option.disabled) return
    onChange(option.value)
    setQuery('')
    setOpen(false)
  }

  const openList = () => {
    if (props.disabled) return
    setOpen(true)
    setQuery('')
    setHighlight(Math.max(0, options.findIndex(o => o.value === value)))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { openList(); return }
      const step = e.key === 'ArrowDown' ? 1 : -1
      setHighlight(h => {
        if (matches.length === 0) return 0
        return (h + step + matches.length) % matches.length
      })
      return
    }
    if (e.key === 'Enter') {
      if (open) { e.preventDefault(); commit(matches[highlight]) }
      return
    }
    if (e.key === 'Tab') {
      // Tab completes to what is highlighted rather than abandoning the edit,
      // so a name can be typed part-way and finished with one key.
      if (open && matches.length > 0) commit(matches[highlight])
      return
    }
    if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); setQuery('') }
      return
    }
    if (e.key === 'Home' && open) { e.preventDefault(); setHighlight(0) }
    if (e.key === 'End' && open) { e.preventDefault(); setHighlight(matches.length - 1) }
  }

  return (
    <div
      ref={wrapRef}
      className={`combo ${props.disabled ? 'combo-disabled' : ''}`}
      style={props.width ? { width: props.width } : undefined}
    >
      <input
        ref={inputRef}
        id={props.id}
        className="input combo-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches.length > 0 ? `${listId}-${highlight}` : undefined}
        aria-label={props.ariaLabel}
        autoComplete="off"
        disabled={props.disabled}
        placeholder={props.placeholder}
        value={open ? query : selectedLabel}
        onChange={e => { setQuery(e.target.value); setHighlight(0); if (!open) setOpen(true) }}
        onFocus={openList}
        onClick={openList}
        onKeyDown={onKeyDown}
      />
      <span className="combo-mark" aria-hidden>▾</span>

      {open && (
        <ul className="combo-list" id={listId} role="listbox">
          {matches.length === 0 && (
            <li className="combo-empty" role="presentation">
              {options.length === 0
                ? (props.emptyText ?? 'Nothing to choose from')
                : `No match for “${query}”`}
            </li>
          )}
          {matches.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled}
              className={`combo-option ${i === highlight ? 'active' : ''} ${o.disabled ? 'disabled' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={e => { e.preventDefault(); commit(o) }}
              /* `Field` wraps almost every control in a <label>, and a label
                 forwards clicks to its control as the click's default action.
                 Without this, choosing an option with the mouse reopens the
                 list it just closed and shows an empty box over the value the
                 user picked. Cancelling the default stops the forwarding. */
              onClick={e => { e.preventDefault(); e.stopPropagation() }}
            >
              <span className="combo-label">{o.label}</span>
              {o.hint && <span className="combo-hint">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
