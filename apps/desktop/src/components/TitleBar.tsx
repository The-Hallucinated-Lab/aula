import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { bridge, isDesktop } from '../platform'

/**
 * Custom Windows title bar.
 *
 * The window extends content into the non-client area, so this strip provides
 * the drag region and the caption buttons. Per the Windows UI protocol the
 * right-hand 140px is reserved: nothing interactive is placed there.
 */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false)
  const name = useApp(s => s.config.institution.name)
  const term = useApp(s => s.config.institution.term)
  const solving = useApp(s => s.solving)
  const phase = useApp(s => s.phase)

  useEffect(() => {
    const api = bridge()
    if (!api) return
    api.window.isMaximized().then(setMaximized)
    return api.window.onMaximizeChange(setMaximized)
  }, [])

  if (!isDesktop()) return null
  const api = bridge()!

  return (
    <div className="titlebar">
      <div className="titlebar-drag">
        <span className="titlebar-mark" aria-hidden>
          <svg width="12" height="12" viewBox="0 0 16 16">
            <rect x="1" y="1" width="6" height="6" rx="1.6" fill="currentColor" />
            <rect x="9" y="1" width="6" height="6" rx="1.6" fill="currentColor" opacity=".55" />
            <rect x="1" y="9" width="6" height="6" rx="1.6" fill="currentColor" opacity=".55" />
            <rect x="9" y="9" width="6" height="6" rx="1.6" fill="currentColor" opacity=".85" />
          </svg>
        </span>
        <span className="titlebar-text">
          Aula — {name} · {term}
          {solving && <span className="titlebar-busy"> · {phase || 'solving'}…</span>}
        </span>
      </div>

      <div className="caption-buttons">
        <button className="caption-btn" aria-label="Minimise" onClick={() => api.window.minimize()}>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          className="caption-btn"
          aria-label={maximized ? 'Restore' : 'Maximise'}
          onClick={() => api.window.toggleMaximize()}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <path
                d="M2.5 2.5h5v5h-5z M0.5 0.5h7v7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
              <rect
                x="0.5"
                y="0.5"
                width="9"
                height="9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </svg>
          )}
        </button>
        <button
          className="caption-btn caption-close"
          aria-label="Close"
          onClick={() => api.window.close()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  )
}
