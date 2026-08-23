import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useApp, type ProjectFile } from '../store'
import { useToast } from './Toast'
import { bridge, openText, saveText } from '../platform'
import { ThemeToggle } from './ThemeToggle'
import { useTranslation } from '../i18n'
import {
  calendarCsv,
  constraintsCsv,
  projectJson,
  timetableCsv,
  workloadCsv,
} from '@aula/core/data/exporters'
import { isImplemented } from '@aula/core/engine/rules'
import type { RuleKey } from '@aula/core/data/constraints/types'

/**
 * The navigation, as translation keys rather than English.
 *
 * The route is the identity; the words on it are content.
 */
const NAV = [
  { to: '/', key: 'nav.overview' },
  { to: '/timetable', key: 'nav.timetable' },
  { to: '/setup', key: 'nav.termSetup' },
  { to: '/institution', key: 'nav.institution' },
  { to: '/data', key: 'nav.data' },
  { to: '/calendar', key: 'nav.calendar' },
  { to: '/scenarios', key: 'nav.scenarios' },
  { to: '/constraints', key: 'nav.constraints' },
  { to: '/assistant', key: 'nav.assistant' },
  /* aula:cli:nav */
] as const

export function TopBar() {
  const { t } = useTranslation()
  const store = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const { regenerate, solving, phase, sessions, institution, report, states, scheduleStale } = store
  const slug = store.config.institution.name.replace(/[^\w-]+/g, '-').toLowerCase()

  /* --- close the export menu on outside click or Escape --- */
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const doSaveProject = async () => {
    const res = await saveText({
      suggestedName: `${slug}.aula.json`,
      data: JSON.stringify(store.toProjectFile(), null, 2),
      filters: [{ name: 'Aula project', extensions: ['json'] }],
    })
    if (res.ok) toast(t('file.saved'), 'ok')
    else if (!res.canceled) toast(res.error ?? t('file.saveFailed'), 'danger')
  }

  const doOpenProject = async () => {
    const res = await openText([{ name: 'Aula project', extensions: ['json'] }])
    if (!res.ok || !res.data) {
      if (!res.canceled) toast(res.error ?? t('file.openFailed'), 'danger')
      return
    }
    try {
      await store.loadProjectFile(JSON.parse(res.data) as ProjectFile)
      toast(t('file.loaded'), 'ok')
      navigate('/')
    } catch {
      toast(t('file.notAProject'), 'danger')
    }
  }

  const exportFile = async (
    kind: 'timetable' | 'workload' | 'constraints' | 'calendar' | 'json',
  ) => {
    setMenuOpen(false)
    if (kind !== 'constraints' && kind !== 'calendar' && sessions.length === 0) {
      toast(t('file.generateFirst'), 'danger')
      return
    }
    const map = {
      timetable: {
        name: `${slug}-timetable.csv`,
        data: () => timetableCsv(institution, sessions),
        ext: 'csv',
      },
      workload: {
        name: `${slug}-workload.csv`,
        data: () => workloadCsv(institution, sessions),
        ext: 'csv',
      },
      constraints: {
        name: `${slug}-constraints.csv`,
        data: () => constraintsCsv(states, r => isImplemented(r as RuleKey | undefined)),
        ext: 'csv',
      },
      calendar: { name: `${slug}-calendar.csv`, data: () => calendarCsv(institution), ext: 'csv' },
      json: {
        name: `${slug}-export.json`,
        data: () => projectJson(institution, sessions, report, states),
        ext: 'json',
      },
    }[kind]

    const res = await saveText({
      suggestedName: map.name,
      data: map.data(),
      filters: [{ name: map.ext.toUpperCase(), extensions: [map.ext] }],
    })
    if (res.ok) toast(`Exported ${map.name}`, 'ok')
    else if (!res.canceled) toast(res.error ?? 'Export failed', 'danger')
  }

  /* --- native menu + keyboard accelerators --- */
  useEffect(() => {
    const api = bridge()
    const handle = (action: string) => {
      switch (action) {
        case 'new':
          navigate('/setup')
          break
        case 'open':
          void doOpenProject()
          break
        case 'save':
          void doSaveProject()
          break
        case 'generate':
          void regenerate()
          break
        case 'export-timetable':
          void exportFile('timetable')
          break
        case 'export-constraints':
          void exportFile('constraints')
          break
        case 'constraints':
          navigate('/constraints')
          break
        case 'setup':
          navigate('/setup')
          break
        case 'calendar':
          navigate('/calendar')
          break
      }
    }
    const off = api?.onMenuAction(handle)

    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 's') {
        e.preventDefault()
        void doSaveProject()
      } else if (k === 'o') {
        e.preventDefault()
        void doOpenProject()
      } else if (k === 'g') {
        e.preventDefault()
        void regenerate()
      } else if (k === ',') {
        e.preventDefault()
        navigate('/setup')
      } else if (k === 'e') {
        e.preventDefault()
        void exportFile('timetable')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off?.()
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, institution, report, states, store.config])

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 16 16">
              <rect x="1" y="1" width="6" height="6" rx="1.6" fill="var(--accent-ink)" />
              <rect
                x="9"
                y="1"
                width="6"
                height="6"
                rx="1.6"
                fill="var(--accent-ink)"
                opacity=".55"
              />
              <rect
                x="1"
                y="9"
                width="6"
                height="6"
                rx="1.6"
                fill="var(--accent-ink)"
                opacity=".55"
              />
              <rect
                x="9"
                y="9"
                width="6"
                height="6"
                rx="1.6"
                fill="var(--accent-ink)"
                opacity=".85"
              />
            </svg>
          </span>
          <span>
            <span className="brand-name">{t('app.name')}</span>
            <br />
            <span className="brand-sub">{t('app.tagline')}</span>
          </span>
        </Link>

        <nav className="topnav" aria-label={t('nav.label')}>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              {t(n.key)}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-right">
          <ThemeToggle />
          <span
            className={`engine-chip ${!solving && scheduleStale ? 'stale' : ''}`}
            title={solving ? phase : t(scheduleStale ? 'engine.staleTitle' : 'engine.idleTitle')}
          >
            <span
              className={`engine-dot ${solving ? 'busy' : ''} ${!solving && scheduleStale ? 'stale' : ''}`}
            />
            {solving
              ? phase || t('engine.solving')
              : t(scheduleStale ? 'engine.stale' : 'engine.ready')}
          </span>

          <div className="menu-wrap" ref={menuRef}>
            <button
              className="btn btn-soft"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(v => !v)}
            >
              {t('file.menu')} ▾
            </button>
            {menuOpen && (
              <div className="menu" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    void doOpenProject()
                  }}
                >
                  {t('file.open')} <kbd>Ctrl O</kbd>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    void doSaveProject()
                  }}
                >
                  {t('file.save')} <kbd>Ctrl S</kbd>
                </button>
                <div className="menu-sep" />
                <button role="menuitem" onClick={() => exportFile('timetable')}>
                  Export timetable (CSV) <kbd>Ctrl E</kbd>
                </button>
                <button role="menuitem" onClick={() => exportFile('workload')}>
                  Export staff workload (CSV)
                </button>
                <button role="menuitem" onClick={() => exportFile('constraints')}>
                  Export constraint register (CSV)
                </button>
                <button role="menuitem" onClick={() => exportFile('calendar')}>
                  Export academic calendar (CSV)
                </button>
                <button role="menuitem" onClick={() => exportFile('json')}>
                  Export everything (JSON)
                </button>
              </div>
            )}
          </div>

          <button
            className="btn btn-primary"
            disabled={solving}
            onClick={async () => {
              await regenerate()
              const s = useApp.getState()
              if (!s.lastError) {
                const missing = s.report?.unplaced.reduce((a, u) => a + u.missing, 0) ?? 0
                toast(
                  missing === 0
                    ? `Solved — ${s.sessions.length} sessions, 0 hard clashes`
                    : `Solved — ${missing} meetings could not be placed`,
                  missing === 0 ? 'ok' : 'danger',
                )
              } else {
                toast(s.lastError, 'danger')
              }
            }}
          >
            {solving ? '· Solving…' : '✦ Generate'}
          </button>
        </div>
      </div>
    </header>
  )
}
