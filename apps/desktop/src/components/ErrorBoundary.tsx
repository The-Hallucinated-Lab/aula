import { Component, type ErrorInfo, type ReactNode } from 'react'
import { STORAGE_KEY } from '../store'

/**
 * Last line of defence.
 *
 * Without this, a single bad value anywhere in a page throws during render and
 * React unmounts the entire tree — the window goes white and the only way out
 * is DevTools. Here the failure is contained to the page, named, and paired
 * with the two recoveries that actually work: reload, or discard the saved
 * project that produced it.
 */

interface Props {
  children: ReactNode
  /** changes to this value clear a previous failure — pass the route path */
  resetKey?: string
}

interface State {
  error: Error | null
  stack: string
  /** the resetKey the current failure belongs to */
  key?: string
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, stack: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  /** Navigating away clears the failure without a second render pass. */
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.error && state.key !== undefined && state.key !== props.resetKey) {
      return { error: null, stack: '', key: props.resetKey }
    }
    if (state.error && state.key === undefined) return { key: props.resetKey }
    return null
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the component stack: it names the page, which the message rarely does.
    this.setState({ stack: info.componentStack ?? '' })
    console.error('[Aula] render failed:', error, info.componentStack)
  }

  private discardProject = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // nothing more we can do; the reload below still gives a clean start
    }
    location.reload()
  }

  override render() {
    const { error, stack } = this.state
    if (!error) return this.props.children

    return (
      <main className="page fade-in">
        <div className="card card-pad" style={{ maxWidth: 780, margin: '48px auto' }}>
          <div className="hero-eyebrow">Something in this screen failed</div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: '6px 0 10px',
            }}
          >
            Aula caught the error instead of closing
          </h2>
          <p className="small muted" style={{ lineHeight: 1.6 }}>
            The rest of the app still works — use the navigation above to move to another screen. If
            this screen keeps failing, the saved project on this machine is probably the cause;
            discarding it returns Aula to its default institution. Nothing else on your computer is
            touched.
          </p>

          <div className="panel" style={{ margin: '16px 0', display: 'block' }}>
            <div className="mono small" style={{ fontWeight: 700, marginBottom: 6 }}>
              {error.name}
            </div>
            <div className="mono small" style={{ wordBreak: 'break-word' }}>
              {error.message}
            </div>
            {stack && (
              <details style={{ marginTop: 10 }}>
                <summary className="small muted" style={{ cursor: 'pointer' }}>
                  Component stack
                </summary>
                <pre className="mono small" style={{ whiteSpace: 'pre-wrap', marginTop: 8 }}>
                  {stack.trim()}
                </pre>
              </details>
            )}
          </div>

          <div className="row" style={{ gap: 10 }}>
            <button className="btn btn-primary" onClick={() => location.reload()}>
              Reload Aula
            </button>
            <button className="btn btn-danger-soft" onClick={this.discardProject}>
              Discard the saved project and restart
            </button>
          </div>
        </div>
      </main>
    )
  }
}
