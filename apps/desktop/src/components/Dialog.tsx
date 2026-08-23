import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders its children at the end of `<body>`.
 *
 * Every page is wrapped in `.fade-in`, which carries a transform. A transform
 * makes the element a containing block for `position: fixed` descendants, so an
 * overlay rendered inside the page resolves against the page box rather than
 * the viewport: on a scrolled page it lands partly or entirely off-screen, with
 * its backdrop stretched over the whole document. Portalling out of the page
 * subtree is the fix, and it holds however the page animation changes later.
 */
export function Portal({ children }: { children: ReactNode }) {
  return typeof document === 'undefined' ? null : createPortal(children, document.body)
}

/**
 * Modal shell.
 *
 * Escape and a backdrop click close it, focus moves inside on open and returns
 * to whatever opened it on close, and Tab is trapped so a keyboard user cannot
 * wander into the page behind a dialog they still have to answer.
 */
export function Dialog(props: {
  title: string
  subtitle?: string | undefined
  /** 'wide' for multi-column forms; the default suits a short confirmation */
  size?: 'default' | 'wide' | undefined
  onClose: () => void
  footer?: ReactNode | undefined
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>(
      'input, select, textarea, button:not([data-dialog-close])',
    )
    first?.focus()
    return () => returnTo.current?.focus?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        props.onClose()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return

      const focusable = [
        ...panel.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(el => el.offsetParent !== null)
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable.at(-1)
      if (first === undefined || last === undefined) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [props])

  /* Close on a click outside the panel.
   *
   * On the document rather than on the backdrop element. Two reasons: a
   * backdrop carrying a mouse handler is an interactive element with no role
   * and no keyboard path, and a handler on the backdrop also fires when a drag
   * begins inside the panel — selecting text and releasing past the edge closed
   * the dialog and discarded the edit. */
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) props.onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [props])

  return (
    <Portal>
      {/* Purely a scrim. Dismissal is Escape and the outside-click listener
          above, both of which work without the backdrop being interactive. */}
      <div className="overlay">
        <div
          ref={panel}
          className={`sheet ${props.size === 'wide' ? 'sheet-wide' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
        >
          <div className="dialog-head">
            <div style={{ minWidth: 0 }}>
              <div className="dialog-title">{props.title}</div>
              {props.subtitle && <div className="dialog-sub">{props.subtitle}</div>}
            </div>
            <button
              type="button"
              className="dialog-x"
              data-dialog-close
              aria-label="Close"
              onClick={props.onClose}
            >
              ×
            </button>
          </div>

          <div className="dialog-body">{props.children}</div>

          {props.footer && <div className="dialog-foot">{props.footer}</div>}
        </div>
      </div>
    </Portal>
  )
}

/** A labelled block inside a dialog — one of the four intake sections. */
export function DialogSection(props: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="dialog-section">
      <div className="dialog-section-head">
        <h3 className="dialog-section-title">{props.title}</h3>
        {props.hint && <p className="dialog-section-hint">{props.hint}</p>}
      </div>
      {props.children}
    </section>
  )
}
